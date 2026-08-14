import { createServer, type Server } from 'node:net';
import { Aedes } from 'aedes';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, mqttTopics, type Answer, type Settings } from '../src/shared/types';
import { IPC } from '../src/shared/ipc';

/**
 * The MQTT bridge, against a real broker.
 *
 * An in-process broker is brought up instead of mocking the client: what has to
 * be checked isn't that we call `publish`, it's **what the subscriber
 * receives**. A test with a mocked client would pass just as well publishing to
 * the wrong topic, with the wrong payload, or publishing the forty streaming
 * ticks instead of the final answer — which are exactly the three failures that
 * matter here.
 */

// The bridge reads the password from the encrypted store, which needs Electron.
vi.mock('electron', () => ({
  app: { getPath: () => process.cwd() },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (v: string) => Buffer.from(v),
    decryptString: (b: Buffer) => b.toString('utf-8'),
  },
}));

// Aedes 1.x removed the default export: the broker is created asynchronously.
let broker: Awaited<ReturnType<typeof Aedes.createBroker>>;
let server: Server;
let port = 0;

beforeEach(async () => {
  broker = await Aedes.createBroker();
  server = createServer(broker.handle as never);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  port = typeof address === 'object' && address ? address.port : 0;
  vi.resetModules();
});

afterEach(async () => {
  const { mqttBridge } = await import('../src/main/bridge/mqtt');
  mqttBridge.stop();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await new Promise<void>((resolve) => broker.close(resolve));
});

function settings(patch: Partial<Settings> = {}): Settings {
  return {
    ...DEFAULT_SETTINGS,
    mqttEnabled: true,
    mqttUrl: `mqtt://127.0.0.1:${port}`,
    mqttTopic: 'pruebas/respuesta',
    mqttUsername: '',
    ...patch,
  };
}

function answer(patch: Partial<Answer> = {}): Answer {
  return {
    id: 'a1',
    status: 'done',
    trigger: 'quiz',
    question: 'Resuelve el test de la pantalla',
    text: '1. B) El índice se recalcula\n2. C) O(n log n)',
    providerId: 'ollama',
    model: 'qwen3-vl:8b-thinking',
    createdAt: 1_730_000_000_000,
    ...patch,
  };
}

/** Waits for the bridge to say it's connected. */
async function connect(config: Settings): Promise<typeof import('../src/main/bridge/mqtt')> {
  const mod = await import('../src/main/bridge/mqtt');
  const connected = new Promise<void>((resolve) => {
    const onStatus = (status: { state: string }): void => {
      if (status.state === 'connected') {
        mod.mqttBridge.off('status', onStatus);
        resolve();
      }
    };
    mod.mqttBridge.on('status', onStatus);
  });
  mod.mqttBridge.apply(config);
  await connected;
  return mod;
}

/** Collects the messages the bridge publishes, as the ESP32 would. */
function collect(): { seen: { topic: string; payload: string }[] } {
  const seen: { topic: string; payload: string }[] = [];
  broker.on('publish', (packet, client) => {
    // Aedes also emits the internal messages ($SYS) and with no client.
    if (!client || !packet.topic.startsWith('pruebas/')) return;
    seen.push({ topic: packet.topic, payload: packet.payload.toString('utf-8') });
  });
  return { seen };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 250));

describe('the MQTT bridge', () => {
  it('publishes the finished answer to the two topics', async () => {
    const { seen } = collect();
    const { mqttBridge } = await connect(settings());

    mqttBridge.publish(IPC.onAnswer, answer());
    await settle();

    const topics = mqttTopics('pruebas/respuesta');
    expect(seen.map((m) => m.topic).sort()).toEqual([topics.json, topics.text].sort());

    // The text topic carries the answer RAW: it's what lets a board use it
    // without a JSON parser.
    const plain = seen.find((m) => m.topic === topics.text);
    expect(plain?.payload).toBe('1. B) El índice se recalcula\n2. C) O(n log n)');

    const json = JSON.parse(seen.find((m) => m.topic === topics.json)!.payload) as {
      answer: string;
      trigger: string;
      model: string;
      id: string;
    };
    expect(json).toMatchObject({ id: 'a1', trigger: 'quiz', model: 'qwen3-vl:8b-thinking' });
    expect(json.answer).toContain('1. B)');
  });

  it('does NOT publish the streaming ticks, only the final', async () => {
    const { seen } = collect();
    const { mqttBridge } = await connect(settings());

    // This is how it actually arrives: the same id, growing, and `done` only at the end.
    mqttBridge.publish(IPC.onAnswer, answer({ status: 'thinking', text: '' }));
    mqttBridge.publish(IPC.onAnswer, answer({ status: 'streaming', text: '1. B' }));
    mqttBridge.publish(IPC.onAnswer, answer({ status: 'streaming', text: '1. B) El índ' }));
    mqttBridge.publish(IPC.onAnswer, answer());
    await settle();

    // Two messages: the JSON and the text of ONE single answer.
    expect(seen).toHaveLength(2);
  });

  it("doesn't publish errors or aborted answers", async () => {
    const { seen } = collect();
    const { mqttBridge } = await connect(settings());

    mqttBridge.publish(IPC.onAnswer, answer({ id: 'e1', status: 'error', text: '' }));
    mqttBridge.publish(IPC.onAnswer, answer({ id: 'e2', status: 'aborted', text: 'a medias' }));
    await settle();

    // A device that acts on a quiz's answer can't distinguish an error from an
    // answer if they arrive over the same topic.
    expect(seen).toHaveLength(0);
  });

  it("ignores everything that isn't an answer", async () => {
    const { seen } = collect();
    const { mqttBridge } = await connect(settings());

    mqttBridge.publish(IPC.onTranscript, { text: 'esto es voz de alguien' });
    mqttBridge.publish(IPC.onCaptureStatus, { state: 'listening' });
    await settle();

    // The transcription is what the other person said: it doesn't leave from here.
    expect(seen).toHaveLength(0);
  });

  it('publishes nothing while off', async () => {
    const { seen } = collect();
    const { mqttBridge } = await import('../src/main/bridge/mqtt');

    mqttBridge.apply(settings({ mqttEnabled: false }));
    mqttBridge.publish(IPC.onAnswer, answer());
    await settle();

    expect(seen).toHaveLength(0);
    expect(mqttBridge.getStatus().state).toBe('off');
  });

  it('counts what was published, which is the only confirmation that it works', async () => {
    const { mqttBridge } = await connect(settings());
    expect(mqttBridge.getStatus().published).toBe(0);

    mqttBridge.publish(IPC.onAnswer, answer({ id: 'x1' }));
    await settle();
    mqttBridge.publish(IPC.onAnswer, answer({ id: 'x2' }));
    await settle();

    expect(mqttBridge.getStatus().published).toBe(2);
  });
});

describe('the topics derived from the base topic', () => {
  it('adds «/text» to the configured topic', () => {
    expect(mqttTopics('casa/quiz')).toEqual({ json: 'casa/quiz', text: 'casa/quiz/text' });
  });

  it('removes the trailing slash so as not to create an empty level', () => {
    // "a//text" is a legal and DIFFERENT topic in MQTT: the subscriber wouldn't see it.
    expect(mqttTopics('casa/quiz/')).toEqual({ json: 'casa/quiz', text: 'casa/quiz/text' });
  });

  it('falls back to a default topic if left empty', () => {
    expect(mqttTopics('   ').json).toBe('tayori/answer');
  });
});

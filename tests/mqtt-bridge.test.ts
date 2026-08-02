import { createServer, type Server } from 'node:net';
import { Aedes } from 'aedes';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, mqttTopics, type Answer, type Settings } from '../src/shared/types';
import { IPC } from '../src/shared/ipc';

/**
 * El puente MQTT, contra un broker de verdad.
 *
 * Se levanta un broker en proceso en lugar de simular el cliente: lo que hay
 * que comprobar no es que llamemos a `publish`, es **qué recibe el que está
 * suscrito**. Un test con el cliente mockeado pasaría igual publicando en el
 * tema equivocado, con el payload equivocado, o publicando los cuarenta ticks
 * del streaming en lugar de la respuesta final — que son justo los tres fallos
 * que importan aquí.
 */

// El puente lee la contraseña del almacén cifrado, que necesita Electron.
vi.mock('electron', () => ({
  app: { getPath: () => process.cwd() },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (v: string) => Buffer.from(v),
    decryptString: (b: Buffer) => b.toString('utf-8'),
  },
}));

// Aedes 1.x quitó el export por defecto: el broker se crea de forma asíncrona.
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

/** Espera a que el puente diga que está conectado. */
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

/** Recoge los mensajes que publique el puente, como haría el ESP32. */
function collect(): { seen: { topic: string; payload: string }[] } {
  const seen: { topic: string; payload: string }[] = [];
  broker.on('publish', (packet, client) => {
    // Aedes emite también los mensajes internos ($SYS) y sin cliente.
    if (!client || !packet.topic.startsWith('pruebas/')) return;
    seen.push({ topic: packet.topic, payload: packet.payload.toString('utf-8') });
  });
  return { seen };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 250));

describe('el puente MQTT', () => {
  it('publica la respuesta terminada en los dos temas', async () => {
    const { seen } = collect();
    const { mqttBridge } = await connect(settings());

    mqttBridge.publish(IPC.onAnswer, answer());
    await settle();

    const topics = mqttTopics('pruebas/respuesta');
    expect(seen.map((m) => m.topic).sort()).toEqual([topics.json, topics.text].sort());

    // El tema de texto lleva la respuesta EN CRUDO: es lo que permite que una
    // placa la use sin un parser de JSON.
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

  it('NO publica los ticks del streaming, sólo el final', async () => {
    const { seen } = collect();
    const { mqttBridge } = await connect(settings());

    // Así llega de verdad: el mismo id, creciendo, y `done` sólo al final.
    mqttBridge.publish(IPC.onAnswer, answer({ status: 'thinking', text: '' }));
    mqttBridge.publish(IPC.onAnswer, answer({ status: 'streaming', text: '1. B' }));
    mqttBridge.publish(IPC.onAnswer, answer({ status: 'streaming', text: '1. B) El índ' }));
    mqttBridge.publish(IPC.onAnswer, answer());
    await settle();

    // Dos mensajes: el JSON y el texto de UNA sola respuesta.
    expect(seen).toHaveLength(2);
  });

  it('no publica errores ni respuestas abortadas', async () => {
    const { seen } = collect();
    const { mqttBridge } = await connect(settings());

    mqttBridge.publish(IPC.onAnswer, answer({ id: 'e1', status: 'error', text: '' }));
    mqttBridge.publish(IPC.onAnswer, answer({ id: 'e2', status: 'aborted', text: 'a medias' }));
    await settle();

    // Un dispositivo que actúa sobre la respuesta de un test no puede
    // distinguir un error de una respuesta si le llegan por el mismo tema.
    expect(seen).toHaveLength(0);
  });

  it('ignora todo lo que no sean respuestas', async () => {
    const { seen } = collect();
    const { mqttBridge } = await connect(settings());

    mqttBridge.publish(IPC.onTranscript, { text: 'esto es voz de alguien' });
    mqttBridge.publish(IPC.onCaptureStatus, { state: 'listening' });
    await settle();

    // La transcripción es lo que dijo la otra persona: no sale de aquí.
    expect(seen).toHaveLength(0);
  });

  it('no publica nada mientras está apagado', async () => {
    const { seen } = collect();
    const { mqttBridge } = await import('../src/main/bridge/mqtt');

    mqttBridge.apply(settings({ mqttEnabled: false }));
    mqttBridge.publish(IPC.onAnswer, answer());
    await settle();

    expect(seen).toHaveLength(0);
    expect(mqttBridge.getStatus().state).toBe('off');
  });

  it('cuenta lo publicado, que es la única confirmación de que funciona', async () => {
    const { mqttBridge } = await connect(settings());
    expect(mqttBridge.getStatus().published).toBe(0);

    mqttBridge.publish(IPC.onAnswer, answer({ id: 'x1' }));
    await settle();
    mqttBridge.publish(IPC.onAnswer, answer({ id: 'x2' }));
    await settle();

    expect(mqttBridge.getStatus().published).toBe(2);
  });
});

describe('los temas que se derivan del tema base', () => {
  it('añade «/text» al tema configurado', () => {
    expect(mqttTopics('casa/quiz')).toEqual({ json: 'casa/quiz', text: 'casa/quiz/text' });
  });

  it('quita la barra final para no crear un nivel vacío', () => {
    // "a//text" es un tema legal y DISTINTO en MQTT: el suscriptor no lo vería.
    expect(mqttTopics('casa/quiz/')).toEqual({ json: 'casa/quiz', text: 'casa/quiz/text' });
  });

  it('cae a un tema por defecto si lo dejan vacío', () => {
    expect(mqttTopics('   ').json).toBe('tayori/answer');
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import { GeminiLiveSTT, stripRestated } from '../src/main/stt/gemini-live';
import type { TranscriptEvent } from '../src/main/stt/types';

/**
 * The Gemini Live engine, against a **real WebSocket server**.
 *
 * Same reason as `openai-live.test.ts`: what can go wrong lives in what goes
 * over the wire —a setup field the model rejects, a message field read from the
 * wrong place— and a mocked SDK would take exactly that for granted.
 */

/** Setup messages the client sent, already parsed. */
let setups: Array<Record<string, unknown>> = [];
let sockets: WebSocket[] = [];
let server: Server;
let wss: WebSocketServer;
let baseUrl = '';

beforeEach(async () => {
  setups = [];
  sockets = [];

  server = createServer();
  wss = new WebSocketServer({ server });

  wss.on('connection', (socket) => {
    sockets.push(socket);
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString()) as { setup?: Record<string, unknown> };
      if (message.setup) {
        setups.push(message.setup);
        socket.send(JSON.stringify({ setupComplete: {} }));
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  for (const socket of sockets) socket.close();
  wss.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** Starts listening to one speaker and collects what the engine emits. */
async function start(model: string): Promise<{ stt: GeminiLiveSTT; events: TranscriptEvent[] }> {
  const stt = new GeminiLiveSTT('test-key', model, baseUrl);
  const events: TranscriptEvent[] = [];
  stt.events.on('segment', (event: TranscriptEvent) => events.push(event));
  await stt.start({ sampleRate: 16_000, language: 'auto', speakers: ['them'] });
  return { stt, events };
}

/** The lane's socket: the last one opened (the first is the model probe). */
function send(serverContent: Record<string, unknown>): void {
  sockets[sockets.length - 1]!.send(JSON.stringify({ serverContent }));
}

async function until(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('GeminiLiveSTT with the dedicated transcriber', () => {
  it('does not send the silence instruction', async () => {
    const { stt } = await start('gemini-3.5-transcribe-live');
    await stt.stop();

    expect(setups.length).toBeGreaterThan(0);
    for (const setup of setups) {
      expect(setup.model).toBe('models/gemini-3.5-transcribe-live');
      expect(setup.systemInstruction).toBeUndefined();
    }
  });

  it('emits the interim as the open turn and the final as the whole turn', async () => {
    const { stt, events } = await start('gemini-3.5-transcribe-live');

    send({ interimInputTranscription: { text: 'Tell me' } });
    send({ interimInputTranscription: { text: 'Tell me about yourself' } });
    send({ inputTranscription: { text: 'Tell me about yourself.' } });
    await until(() => events.length === 3);
    await stt.stop();

    expect(events).toEqual([
      { speaker: 'them', text: 'Tell me', isFinal: false, cumulative: true },
      { speaker: 'them', text: 'Tell me about yourself', isFinal: false, cumulative: true },
      { speaker: 'them', text: 'Tell me about yourself.', isFinal: true, cumulative: true },
    ]);
  });

  it('strips an interim that restates the finalized turns', async () => {
    const { stt, events } = await start('gemini-3.5-transcribe-live');

    send({ inputTranscription: { text: 'It was in October.' } });
    send({ interimInputTranscription: { text: 'It was in October.Before then' } });
    await until(() => events.length === 2);
    await stt.stop();

    expect(events[1]).toEqual({
      speaker: 'them',
      text: 'Before then',
      isFinal: false,
      cumulative: true,
    });
  });
});

describe('GeminiLiveSTT with a conversational model', () => {
  it('still asks it to stay silent and concatenates its fragments', async () => {
    const { stt, events } = await start('gemini-3.1-flash-live-preview');

    send({ inputTranscription: { text: 'Hello' } });
    send({ inputTranscription: { text: ' there', finished: true } });
    await until(() => events.length === 2);
    await stt.stop();

    for (const setup of setups) {
      expect(setup.systemInstruction).toBeDefined();
    }
    expect(events).toEqual([
      { speaker: 'them', text: 'Hello', isFinal: false },
      { speaker: 'them', text: ' there', isFinal: true },
    ]);
  });
});

describe('stripRestated', () => {
  it('leaves the text alone when nothing was finalized', () => {
    expect(stripRestated('Hello', [])).toBe('Hello');
  });

  it('removes the finalized turns glued at the start, in order', () => {
    expect(stripRestated('One.Two.Three', ['One.', 'Two.'])).toBe('Three');
  });

  it('removes a restatement that starts at a later turn', () => {
    expect(stripRestated('Two.Three', ['One.', 'Two.'])).toBe('Three');
  });

  it('does not touch a sentence that only shares words', () => {
    expect(stripRestated('One more thing', ['One.'])).toBe('One more thing');
  });
});

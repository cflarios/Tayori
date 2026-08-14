import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import { OpenAILiveSTT } from '../src/main/stt/openai-live';
import type { TranscriptEvent } from '../src/main/stt/types';

/**
 * The live engine, against a **real WebSocket server**.
 *
 * This file exists because of a concrete failure: the first version sent
 * `turn_detection: { type: 'semantic_vad' }` because it seemed reasonable, and the
 * API rejected it with *"Turn detection is not supported for this transcription
 * model"*. The reference said `null` and it wasn't copied. A test with a mocked
 * client would have passed just as happily.
 *
 * And the second failure was worse because it gives no error: without
 * `input_audio_buffer.commit` the model emits partials forever and **a final
 * segment never arrives**. The transcription shows on screen, everything seems to
 * work, and the auto-trigger —which only evaluates finals— doesn't fire once.
 */

/** Everything the client sent, already parsed. */
let received: Array<Record<string, unknown>> = [];
let sockets: WebSocket[] = [];
let server: Server;
let wss: WebSocketServer;
let baseUrl = '';

beforeEach(async () => {
  received = [];
  sockets = [];

  server = createServer();
  wss = new WebSocketServer({ server });

  wss.on('connection', (socket) => {
    sockets.push(socket);
    socket.on('message', (raw) => {
      received.push(JSON.parse(raw.toString()) as Record<string, unknown>);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `ws://127.0.0.1:${port}`;
});

afterEach(async () => {
  for (const socket of sockets) socket.close();
  wss.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** A tone the VAD takes for voice. */
function tono(ms: number, sampleRate = 16_000): Buffer {
  const n = Math.round((sampleRate * ms) / 1000);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i += 1) {
    pcm[i] = Math.round(Math.sin((i * 2 * Math.PI * 220) / sampleRate) * 8_000);
  }
  return Buffer.from(pcm.buffer, pcm.byteOffset, n * 2);
}

const silencio = (ms: number, sampleRate = 16_000): Buffer =>
  Buffer.alloc(Math.round((sampleRate * ms) / 1000) * 2);

const esperar = (ms = 60): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Starts the engine against the local server. */
async function arrancar(vocabulary?: string[]): Promise<OpenAILiveSTT> {
  const stt = new OpenAILiveSTT('sk-test', 'gpt-live-transcribe', baseUrl);
  await stt.start({
    sampleRate: 16_000,
    language: 'es',
    speakers: ['them'],
    ...(vocabulary ? { vocabulary } : {}),
  });
  await esperar();
  return stt;
}

const primero = (type: string): Record<string, unknown> | undefined =>
  received.find((event) => event.type === type);

describe('OpenAILiveSTT · the session', () => {
  it('turns off turn detection, which is what this model requires', async () => {
    /*
     * The real failure: with anything else here, the API replies "Turn detection
     * is not supported for this transcription model" and the session doesn't
     * start. The exact value is pinned because it's a copy of the reference and
     * not a preference.
     */
    const stt = await arrancar();
    await stt.stop();

    const update = primero('session.update') as
      | { session?: { audio?: { input?: Record<string, unknown> } } }
      | undefined;

    expect(update?.session?.audio?.input?.turn_detection).toBeNull();
  });

  it('asks for PCM at 24 kHz, which is the only thing it accepts', async () => {
    const stt = await arrancar();
    await stt.stop();

    const update = primero('session.update') as
      | { session?: { audio?: { input?: { format?: Record<string, unknown> } } } }
      | undefined;

    expect(update?.session?.audio?.input?.format).toEqual({ type: 'audio/pcm', rate: 24_000 });
  });

  it('passes the model, the language and the vocabulary', async () => {
    const stt = await arrancar(['Kubernetes', 'Tayori']);
    await stt.stop();

    const update = primero('session.update') as
      | { session?: { audio?: { input?: { transcription?: Record<string, unknown> } } } }
      | undefined;
    const transcription = update?.session?.audio?.input?.transcription;

    expect(transcription?.model).toBe('gpt-live-transcribe');
    expect(transcription?.languages).toEqual(['es']);
    expect(String(transcription?.prompt)).toContain('Kubernetes, Tayori');
  });

  it('with automatic language it sends none', async () => {
    // Forcing the wrong language is the failure that produced that "Are y'all
    // gonna eat?" from a Spanish sentence.
    const stt = new OpenAILiveSTT('sk-test', 'gpt-live-transcribe', baseUrl);
    await stt.start({ sampleRate: 16_000, language: 'auto', speakers: ['them'] });
    await esperar();
    await stt.stop();

    const update = primero('session.update') as
      | { session?: { audio?: { input?: { transcription?: Record<string, unknown> } } } }
      | undefined;

    expect(update?.session?.audio?.input?.transcription?.languages).toBeUndefined();
  });
});

describe('OpenAILiveSTT · the audio and the turn', () => {
  it('sends the audio resampled to 24 kHz', async () => {
    const stt = await arrancar();
    stt.push('them', tono(100));
    await esperar();
    await stt.stop();

    const append = primero('input_audio_buffer.append');
    expect(append).toBeDefined();

    // 100 ms at 16 kHz is 1,600 samples; at 24 kHz it's 2,400, i.e. 4,800 bytes.
    // It's the check that the resampling actually happens and the original PCM
    // isn't sent, which the API would accept interpreting it faster.
    const bytes = Buffer.from(String(append!.audio), 'base64').length;
    expect(Math.abs(bytes - 4_800)).toBeLessThanOrEqual(4);
  });

  it('closes the turn with a commit when the speaker goes quiet', async () => {
    /*
     * THIS is the test that matters. Without the commit a final segment never
     * arrives: the transcription shows, everything seems fine, and the
     * auto-trigger never fires because it only evaluates finals. A failure with
     * no error at all.
     */
    const stt = await arrancar();

    stt.push('them', tono(1_200));
    stt.push('them', silencio(1_000)); // more than the VAD's 700 ms
    await esperar(120);
    await stt.stop();

    expect(received.some((event) => event.type === 'input_audio_buffer.commit')).toBe(true);
  });

  it("doesn't commit while still speaking", async () => {
    // A commit per chunk would split each sentence into 100 ms pieces and the
    // model would return stray words with no context.
    const stt = await arrancar();

    for (let i = 0; i < 8; i += 1) stt.push('them', tono(100));
    await esperar(120);

    const commits = received.filter((e) => e.type === 'input_audio_buffer.commit').length;
    await stt.stop();

    expect(commits).toBe(0);
  });

  it("doesn't commit over an almost-empty buffer", async () => {
    // The API rejects a commit with less than ~100 ms of audio, so a lone throat
    // clear would produce a session error for each one.
    const stt = await arrancar();

    stt.push('them', tono(30));
    stt.push('them', silencio(1_000));
    await esperar(120);

    const commits = received.filter((e) => e.type === 'input_audio_buffer.commit').length;
    await stt.stop();

    expect(commits).toBe(0);
  });
});

describe('OpenAILiveSTT · what comes back', () => {
  it('emits the partials and the final separately', async () => {
    const stt = await arrancar();
    const segments: TranscriptEvent[] = [];
    stt.events.on('segment', (event: TranscriptEvent) => segments.push(event));

    sockets[0]!.send(
      JSON.stringify({
        type: 'conversation.item.input_audio_transcription.delta',
        delta: 'hola ',
      })
    );
    sockets[0]!.send(
      JSON.stringify({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'hola qué tal',
      })
    );
    await esperar();
    await stt.stop();

    // Both are marked cumulative: the partial because the lane itself accumulates
    // it, and the final because the API sends the whole turn.
    expect(segments).toEqual([
      // It's accumulated as it arrives, trailing space included: trimming here
      // would split a token that can still continue. The buffer handles cleaning
      // it up when saving it.
      { speaker: 'them', text: 'hola ', isFinal: false, cumulative: true },
      { speaker: 'them', text: 'hola qué tal', isFinal: true, cumulative: true },
    ]);
  });

  it("a session error doesn't stay silent", async () => {
    // It arrives inside a socket that stays open: without looking at it, the
    // session would stay alive and mute — audio coming in and not a word out.
    const stt = await arrancar();
    const errors: Error[] = [];
    stt.events.on('error', (err: Error) => errors.push(err));

    sockets[0]!.send(
      JSON.stringify({ type: 'error', error: { message: 'algo se rompió' } })
    );
    await esperar();
    await stt.stop();

    expect(errors[0]?.message).toContain('algo se rompió');
  });

  it('if it rejects the prompt, it reconnects without it instead of dying', async () => {
    /*
     * Losing the vocabulary bias is losing quality on proper names. Losing the
     * session is losing the whole transcription. When in doubt about what each
     * model accepts, it degrades.
     */
    const stt = await arrancar(['Kubernetes']);

    sockets[0]!.send(
      JSON.stringify({ type: 'error', error: { message: 'Unknown parameter: prompt' } })
    );
    // The shortest backoff is 500 ms.
    await esperar(900);

    const updates = received.filter((e) => e.type === 'session.update');
    await stt.stop();

    expect(updates.length).toBeGreaterThanOrEqual(2);
    const ultimo = updates.at(-1) as {
      session?: { audio?: { input?: { transcription?: Record<string, unknown> } } };
    };
    expect(ultimo.session?.audio?.input?.transcription?.prompt).toBeUndefined();
  });
});

/**
 * The duplication, seen on screen before in any test.
 *
 * The `delta`s are incremental and the `completed` brings the WHOLE turn. The
 * first version emitted them as-is and the buffer concatenated them, so the
 * sentence appeared twice — and the first copy with the words split, because
 * gluing token pieces with the buffer's space heuristic inserts separators where
 * they don't go ("conoz ca", "ingen ieros").
 */
describe("OpenAILiveSTT · the text isn't duplicated", () => {
  it('accumulates the deltas raw and marks them as cumulative', async () => {
    const stt = await arrancar();
    const segments: TranscriptEvent[] = [];
    stt.events.on('segment', (event: TranscriptEvent) => segments.push(event));

    // Token pieces, just as they arrive: no spaces between "conoz" and "ca".
    for (const delta of ['Una persona que ', 'conoz', 'ca de DevOps']) {
      sockets[0]!.send(
        JSON.stringify({ type: 'conversation.item.input_audio_transcription.delta', delta })
      );
    }
    await esperar();
    await stt.stop();

    // No invented spaces: the word isn't split.
    expect(segments.at(-1)?.text).toBe('Una persona que conozca de DevOps');
    expect(segments.every((s) => s.cumulative)).toBe(true);
  });

  it('the final replaces the partials, it does not add', async () => {
    const stt = await arrancar();
    const segments: TranscriptEvent[] = [];
    stt.events.on('segment', (event: TranscriptEvent) => segments.push(event));

    sockets[0]!.send(
      JSON.stringify({
        type: 'conversation.item.input_audio_transcription.delta',
        delta: 'Una persona que conozca de DevOps',
      })
    );
    sockets[0]!.send(
      JSON.stringify({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'Una persona que conozca de DevOps debería saber de seguridad.',
      })
    );
    await esperar();
    await stt.stop();

    const final = segments.at(-1)!;
    expect(final.isFinal).toBe(true);
    expect(final.cumulative).toBe(true);
    expect(final.text).toBe('Una persona que conozca de DevOps debería saber de seguridad.');
  });

  it('the next turn starts from scratch', async () => {
    // If `turnText` weren't cleared on close, the second sentence would come out
    // glued to the first and the transcript would grow endlessly inside a single
    // segment.
    const stt = await arrancar();
    const segments: TranscriptEvent[] = [];
    stt.events.on('segment', (event: TranscriptEvent) => segments.push(event));

    sockets[0]!.send(
      JSON.stringify({ type: 'conversation.item.input_audio_transcription.delta', delta: 'primera' })
    );
    sockets[0]!.send(
      JSON.stringify({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'primera frase',
      })
    );
    sockets[0]!.send(
      JSON.stringify({ type: 'conversation.item.input_audio_transcription.delta', delta: 'segunda' })
    );
    await esperar();
    await stt.stop();

    expect(segments.at(-1)?.text).toBe('segunda');
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { OpenAITranscribeSTT } from '../src/main/stt/openai-transcribe';
import type { TranscriptEvent } from '../src/main/stt/types';

/**
 * The per-turn engine, against a **real** server.
 *
 * Same criterion as with the answer provider and the MQTT broker: with a mocked
 * client, sending the wrong model or losing the vocabulary bias would pass the
 * test just the same. What's checked is what reaches the other side and what's
 * done with what comes back.
 */

/** Multipart bodies received, raw. */
let received: string[] = [];
let reply = 'lo que se entendió';
let server: Server;

beforeEach(async () => {
  received = [];
  reply = 'lo que se entendió';

  server = createServer((req, res) => {
    let raw = '';
    req.setEncoding('latin1');
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      received.push(raw);
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(reply);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${port}/v1`;
});

afterEach(async () => {
  delete process.env.OPENAI_BASE_URL;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** One second of tone: enough for the VAD to take it for voice and close it. */
function tono(ms: number, sampleRate = 16_000): Buffer {
  const n = Math.round((sampleRate * ms) / 1000);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i += 1) pcm[i] = Math.round(Math.sin((i * 2 * Math.PI * 220) / sampleRate) * 8_000);
  return Buffer.from(pcm.buffer, pcm.byteOffset, n * 2);
}

const silencio = (ms: number, sampleRate = 16_000): Buffer =>
  Buffer.alloc(Math.round((sampleRate * ms) / 1000) * 2);

/** Speaks, goes quiet, and waits for the closed turn to reach the server. */
async function hablar(stt: OpenAITranscribeSTT): Promise<TranscriptEvent[]> {
  const segments: TranscriptEvent[] = [];
  stt.events.on('segment', (event: TranscriptEvent) => segments.push(event));

  stt.push('them', tono(1_200));
  // More silence than the VAD's `silenceMs` (700 ms) so it closes the turn.
  stt.push('them', silencio(1_000));

  // The transcription is queued: wait for the server to have answered.
  for (let i = 0; i < 50 && received.length === 0; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
  return segments;
}

describe('OpenAITranscribeSTT', () => {
  it('sends the turn as WAV and emits what comes back', async () => {
    const stt = new OpenAITranscribeSTT('sk-test');
    await stt.start({ sampleRate: 16_000, language: 'es', speakers: ['them'] });

    const segments = await hablar(stt);
    await stt.stop();

    expect(received).toHaveLength(1);
    // The RIFF header travels inside the multipart: it's what distinguishes
    // sending a WAV from sending raw PCM, which the API rejects.
    expect(received[0]).toContain('RIFF');
    expect(received[0]).toContain('gpt-transcribe');
    expect(segments).toEqual([
      { speaker: 'them', text: 'lo que se entendió', isFinal: true },
    ]);
  });

  it('a turn always arrives closed', async () => {
    // This engine has no partials: the turn is transcribed whole at once. If it
    // emitted `isFinal: false`, the question detector would evaluate half-finished
    // sentences and answer hesitations.
    const stt = new OpenAITranscribeSTT('sk-test');
    await stt.start({ sampleRate: 16_000, language: 'es', speakers: ['them'] });

    const segments = await hablar(stt);
    await stt.stop();

    expect(segments.every((s) => s.isFinal)).toBe(true);
  });

  it("passes the vocabulary as the recognizer's bias", async () => {
    // It's the cheapest quality lever the app has: the proper names and acronyms
    // of the CV are exactly what a general-purpose ASR fails.
    const stt = new OpenAITranscribeSTT('sk-test');
    await stt.start({
      sampleRate: 16_000,
      language: 'es',
      speakers: ['them'],
      vocabulary: ['Kubernetes', 'Tayori', 'PostgreSQL'],
    });

    await hablar(stt);
    await stt.stop();

    expect(received[0]).toContain('Kubernetes, Tayori, PostgreSQL');
  });

  it("with automatic language it forces none", async () => {
    /*
     * Forcing the wrong language is the failure that produced that
     * "Are y'all gonna eat?" from a Spanish sentence, with the model answering
     * impeccably to something nobody said. Sending `language: auto` as if it were
     * a code would reproduce it.
     */
    const stt = new OpenAITranscribeSTT('sk-test');
    await stt.start({ sampleRate: 16_000, language: 'auto', speakers: ['them'] });

    await hablar(stt);
    await stt.stop();

    expect(received[0]).not.toContain('name="language"');
  });

  it("an empty response doesn't emit a blank segment", async () => {
    // An empty segment would take up room in the transcript and could fire the
    // detector with nothing inside.
    reply = '   ';
    const stt = new OpenAITranscribeSTT('sk-test');
    await stt.start({ sampleRate: 16_000, language: 'es', speakers: ['them'] });

    const segments = await hablar(stt);
    await stt.stop();

    expect(received).toHaveLength(1);
    expect(segments).toHaveLength(0);
  });

  it('only opens a lane for the speakers being listened to', async () => {
    // If `audioSources` is only the system, the microphone's audio shouldn't
    // produce any request — you'd pay to transcribe what nobody asked for.
    const stt = new OpenAITranscribeSTT('sk-test');
    await stt.start({ sampleRate: 16_000, language: 'es', speakers: ['them'] });

    stt.push('me', tono(1_200));
    stt.push('me', silencio(1_000));
    await new Promise((resolve) => setTimeout(resolve, 120));
    await stt.stop();

    expect(received).toHaveLength(0);
  });
});

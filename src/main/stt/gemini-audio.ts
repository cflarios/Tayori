import { EventEmitter } from 'node:events';
import { GoogleGenAI, Type } from '@google/genai';
import type { Speaker, STTProviderId } from '@shared/types';
import { EnergyVAD, type Utterance } from '../core/vad';
import { m } from '../i18n';
import { toWav } from './wav';
import type { STTProvider, STTStartOptions } from './types';

/**
 * Audio straight to the model: no transcription layer in between.
 *
 * The other engines do `audio → text → model`, and that first jump is where
 * everything broke: if the recognizer hears "Are y'all gonna eat?" out of a
 * Spanish sentence, the model answers impeccably to something no one said. Here
 * the turn's WAV goes **to the language model itself**, which hears the accent,
 * the intonation and the half-pronounced words, and returns transcription and
 * answer in the same call.
 *
 * Consequences worth keeping in mind:
 *
 * - **There are no longer two chances to fail.** A bad transcription is still
 *   possible, but it stops contaminating the answer: the model doesn't read it,
 *   it writes it.
 * - **The VAD is still needed.** Someone has to decide when the turn ends; this
 *   isn't streaming. That's what Gemini Live is for.
 * - **The audio leaves the machine.** That's the price, and it's the same one
 *   already paid with Gemini Live.
 *
 * Structured output is requested instead of parsing free text: with
 * `responseSchema` the separation between what was heard and what's answered is
 * guaranteed by the API, not by a regular expression that breaks the day the
 * model decides to embellish the answer.
 */

/** What the model is asked for on each audio turn. */
const INSTRUCTION = [
  'Escucha el audio adjunto.',
  '',
  '1. Transcríbelo literalmente en el campo "transcripcion", en el idioma en que',
  '   se habla. Si no se entiende nada inteligible, deja el campo vacío.',
  '2. Si el audio contiene una pregunta o petición dirigida a la persona a la que',
  '   ayudas, respóndela en "respuesta" siguiendo tus instrucciones de formato.',
  '   Si es un saludo, una prueba de sonido o un comentario que no pide nada,',
  '   deja "respuesta" vacía.',
].join('\n');

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    transcripcion: { type: Type.STRING },
    respuesta: { type: Type.STRING },
  },
  required: ['transcripcion', 'respuesta'],
};

/** What the orchestrator provides on each turn: prompt and memory. */
export interface AudioAnswerContext {
  systemPrompt: string;
  history: { question: string; answer: string }[];
}

/**
 * Reads the structured response, tolerating that it comes cut off.
 *
 * `responseSchema` guarantees the shape when the model reaches the end, but not
 * that it reaches it: if `maxOutputTokens` runs out the JSON comes truncated and
 * `JSON.parse` throws. It shouldn't happen anymore with reasoning off, but a long
 * answer can always graze the cap, and losing the whole turn over a missing
 * quote is a bad deal: at least the transcript is salvaged.
 */
export function parseAudioResponse(raw: string): { transcript: string; answer: string } | null {
  try {
    const parsed = JSON.parse(raw) as { transcripcion?: string; respuesta?: string };
    return {
      transcript: (parsed.transcripcion ?? '').trim(),
      answer: (parsed.respuesta ?? '').trim(),
    };
  } catch {
    // Salvage: the `transcripcion` field goes first in the schema, so it's
    // usually complete even if `respuesta` was left half-done.
    const salvaged = /"transcripcion"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(raw);
    if (!salvaged?.[1]) return null;
    try {
      return { transcript: (JSON.parse(`"${salvaged[1]}"`) as string).trim(), answer: '' };
    } catch {
      return null;
    }
  }
}

/** Per-speaker lane: its VAD and its serial queue. */
class Lane {
  private readonly vad: EnergyVAD;
  /** Serial: two calls at once would scramble the conversation. */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly speaker: Speaker,
    private readonly run: (utterance: Utterance) => Promise<void>,
    sampleRate: number
  ) {
    this.vad = new EnergyVAD({ sampleRate, silenceMs: 700, maxUtteranceMs: 20_000 });
  }

  push(pcm: Int16Array): void {
    for (const utterance of this.vad.push(pcm)) {
      if (utterance.forced) {
        console.warn(
          `[gemini-audio:${this.speaker}] corte forzado a ` +
            `${Math.round(utterance.durationMs / 1000)}s (suelo ${this.vad.currentNoiseFloor.toFixed(4)})`
        );
      }
      this.queue = this.queue.then(() => this.run(utterance));
    }
  }

  reset(): void {
    this.vad.reset();
  }
}

export class GeminiAudioSTT implements STTProvider {
  readonly id: STTProviderId = 'gemini-audio';
  readonly answersDirectly = true;
  readonly events = new EventEmitter();

  private lanes = new Map<Speaker, Lane>();
  private client: GoogleGenAI | null = null;
  private stopped = false;

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    /** Queried on each turn, not at startup: the prompt and the memory change. */
    private readonly context: () => AudioAnswerContext
  ) {}

  async start(options: STTStartOptions): Promise<void> {
    await this.stop();
    this.stopped = false;
    this.client = new GoogleGenAI({ apiKey: this.apiKey });

    for (const speaker of options.speakers) {
      this.lanes.set(
        speaker,
        new Lane(speaker, (utterance) => this.handle(speaker, utterance, options), options.sampleRate)
      );
    }
    console.log(`[gemini-audio] audio directo con "${this.model}" · sin capa de transcripción`);
  }

  push(speaker: Speaker, pcm: Buffer): void {
    if (this.stopped) return;
    const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
    this.lanes.get(speaker)?.push(samples);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    for (const lane of this.lanes.values()) lane.reset();
    this.lanes.clear();
    this.client = null;
    return Promise.resolve();
  }

  private async handle(
    speaker: Speaker,
    utterance: Utterance,
    options: STTStartOptions
  ): Promise<void> {
    const client = this.client;
    if (!client || this.stopped) return;

    const wav = toWav(utterance.pcm, options.sampleRate);
    const { systemPrompt, history } = this.context();
    const startedAt = Date.now();

    try {
      const response = await client.models.generateContent({
        model: this.model,
        contents: [
          // Memory goes as real turns, same as in the text provider.
          ...history
            .filter((turn) => turn.question.trim() && turn.answer.trim())
            .flatMap((turn) => [
              { role: 'user', parts: [{ text: turn.question }] },
              { role: 'model', parts: [{ text: turn.answer }] },
            ]),
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'audio/wav', data: wav.toString('base64') } },
              { text: INSTRUCTION },
            ],
          },
        ],
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          /*
           * Without this, JSON came cut off mid-string ("Unterminated string in
           * JSON at position 59"). Gemini 2.5 reasons by default, and **the
           * reasoning tokens are deducted from `maxOutputTokens`**: they were
           * spent thinking and the answer was cut before closing the quotes.
           * Here reasoning adds nothing —you have to transcribe and answer
           * briefly— and on top of that it's pure latency.
           */
          thinkingConfig: { thinkingBudget: 0 },
          maxOutputTokens: 1_200,
        },
      });

      if (this.stopped) return;

      const raw = response.text;
      if (!raw) {
        console.warn(`[gemini-audio:${speaker}] respuesta vacía del modelo`);
        return;
      }

      const parsed = parseAudioResponse(raw);
      if (!parsed) {
        // A broken JSON can't take down the turn: the trimmed raw is logged so it
        // can be diagnosed and listening continues.
        console.warn(
          `[gemini-audio:${speaker}] respuesta no parseable, se descarta el turno: ` +
            JSON.stringify(raw.slice(0, 200))
        );
        return;
      }
      const { transcript, answer } = parsed;
      const tookMs = Date.now() - startedAt;

      console.log(
        `[gemini-audio:${speaker}] ${tookMs}ms · "${transcript.slice(0, 60)}" · ` +
          `${answer ? `respuesta de ${answer.length} car.` : 'sin respuesta (no pedía nada)'}`
      );

      // The transcript is always emitted: the overlay and the history need it
      // even if the model decides there was nothing to answer.
      if (transcript) {
        this.events.emit('segment', { speaker, text: transcript, isFinal: true });
      }
      if (answer) {
        this.events.emit('answer', { speaker, question: transcript, answer, model: this.model });
      }
    } catch (err) {
      if (this.stopped) return;
      this.events.emit(
        'error',
        new Error(
          `[gemini-audio:${speaker}] ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
  }

  /** A minimal call for the dashboard's test button. */
  async testConnection(): Promise<{ ok: boolean; detail: string }> {
    try {
      const client = new GoogleGenAI({ apiKey: this.apiKey });
      await client.models.generateContent({
        model: this.model,
        contents: 'Di OK.',
        config: { maxOutputTokens: 8 },
      });
      return { ok: true, detail: m('diag.geminiAudioOk', { model: this.model }) };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }
}

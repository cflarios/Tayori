import { EventEmitter } from 'node:events';
import { m } from '../i18n';
import OpenAI, { toFile } from 'openai';
import type { Speaker, STTProviderId } from '@shared/types';
import { EnergyVAD, type Utterance } from '../core/vad';
import { toWav } from './wav';
import { pcmToInt16 } from './resample';
import type { STTProvider, STTStartOptions } from './types';

/**
 * Turn-based transcription with OpenAI's audio API.
 *
 * It's the same path as `whisper-local` —VAD, WAV, one request per turn— with
 * the model in the cloud instead of on the machine. There's no WebSocket, no
 * resampling and no session to reconnect: a 16 kHz WAV is sent and text comes
 * back.
 *
 * **The model is `gpt-transcribe`, and it's OpenAI's recommendation** for
 * transcribing recorded speech, which is exactly what a VAD produces:
 * already-closed chunks. For live audio its recommendation is another one
 * —`gpt-live-transcribe`, see `openai-live.ts`— and the difference between the
 * two engines is exactly that:
 *
 * | | Latency | What it sends |
 * |---|---|---|
 * | `openai-live` | ~300 ms, with partials | Continuous streaming |
 * | `openai-transcribe` | ~1 s per turn | The whole turn at once |
 *
 * This one **hears the complete sentence before deciding**, so it does better on
 * proper nouns and word endings; the other starts writing sooner. Which suits
 * you depends on whether what hurts is the latency or the errors.
 *
 * **And here the recognizer can be biased.** `prompt` accepts free text, so the
 * vocabulary that comes from the context packs —company names, acronyms,
 * technologies— goes in just as it does in Whisper via `--prompt` and in Gemini
 * via `customVocabulary`. It's the cheapest quality lever this app has and the
 * reason `gpt-4o-transcribe-diarize` isn't here: that model **doesn't accept a
 * prompt**, and in exchange it offers speaker separation, which is a datum this
 * app already has by construction (microphone versus system output).
 */

/** OpenAI's recommendation for already-recorded speech, which is what a VAD gives. */
export const OPENAI_TRANSCRIBE_MODEL = 'gpt-transcribe';

/**
 * Cap on bias terms.
 *
 * The `prompt` spends the recognizer's own context, and a whole CV put in there
 * stops being a hint and becomes noise that competes with the audio. It's the
 * same number passed to Whisper.
 */
const MAX_VOCABULARY_TERMS = 60;

/** Per-speaker lane: its VAD and its serial queue. */
class Lane {
  private readonly vad: EnergyVAD;
  /**
   * Serial and not parallel. Two turns from the same speaker at once can come
   * back out of order, and a transcript with the sentences swapped around is
   * worse than a slow one: the question detector sees a different conversation.
   */
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;

  constructor(
    private readonly speaker: Speaker,
    private readonly transcribe: (utterance: Utterance) => Promise<string>,
    private readonly emitter: EventEmitter,
    sampleRate: number
  ) {
    this.vad = new EnergyVAD({ sampleRate, silenceMs: 700, maxUtteranceMs: 20_000 });
  }

  push(pcm: Int16Array): void {
    for (const utterance of this.vad.push(pcm)) {
      if (utterance.forced) {
        console.warn(
          `[vad:${this.speaker}] corte FORZADO a ${Math.round(utterance.durationMs / 1000)}s ` +
            `(suelo de ruido ${this.vad.currentNoiseFloor.toFixed(4)}).`
        );
      }
      this.enqueue(utterance);
    }
  }

  flush(): void {
    const remaining = this.vad.flush();
    if (remaining) this.enqueue(remaining);
  }

  private enqueue(utterance: Utterance): void {
    this.pending += 1;
    this.queue = this.queue.then(async () => {
      const startedAt = Date.now();
      try {
        const text = await this.transcribe(utterance);
        const tookMs = Date.now() - startedAt;

        if (!text) {
          console.log(`[openai-transcribe:${this.speaker}] sin texto (${tookMs}ms)`);
        } else {
          console.log(`[openai-transcribe:${this.speaker}] "${text}" (${tookMs}ms)`);
          this.emitter.emit('segment', { speaker: this.speaker, text, isFinal: true });
        }
      } catch (err) {
        this.emitter.emit(
          'error',
          new Error(
            `[openai-transcribe:${this.speaker}] ${err instanceof Error ? err.message : String(err)}`
          )
        );
      } finally {
        this.pending -= 1;
      }
    });
  }

  reset(): void {
    this.vad.reset();
  }
}

export class OpenAITranscribeSTT implements STTProvider {
  readonly id: STTProviderId = 'openai-transcribe';
  readonly events = new EventEmitter();

  private client: OpenAI;
  private lanes = new Map<Speaker, Lane>();
  private options: STTStartOptions | null = null;
  private stopped = false;

  constructor(
    apiKey: string,
    private readonly model: string = OPENAI_TRANSCRIBE_MODEL
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async start(options: STTStartOptions): Promise<void> {
    await this.stop();
    this.stopped = false;
    this.options = options;

    for (const speaker of options.speakers) {
      this.lanes.set(
        speaker,
        new Lane(
          speaker,
          (utterance) => this.transcribe(utterance),
          this.events,
          options.sampleRate
        )
      );
    }
  }

  push(speaker: Speaker, pcm: Buffer): void {
    if (this.stopped) return;
    this.lanes.get(speaker)?.push(pcmToInt16(pcm));
  }

  async stop(): Promise<void> {
    this.stopped = true;
    // Close whatever turn was open: if someone stops right after speaking, that
    // last sentence still counts.
    for (const lane of this.lanes.values()) {
      lane.flush();
      lane.reset();
    }
    this.lanes.clear();
  }

  private async transcribe(utterance: Utterance): Promise<string> {
    const options = this.options;
    if (!options) return '';

    const wav = toWav(utterance.pcm, options.sampleRate);
    const file = await toFile(wav, 'turn.wav', { type: 'audio/wav' });

    // `unknown` on purpose: the SDK types this as `string` with
    // `response_format: 'text'`, and the check below would stop compiling as
    // "impossible". It's a cheap check over what a server returns, which is
    // exactly where you shouldn't trust the type.
    const result: unknown = await this.client.audio.transcriptions.create({
      file,
      model: this.model,
      // `auto` is omitted: the model detects the language, and forcing the wrong
      // one is the bug that produced that "Are y'all gonna eat?" out of a Spanish
      // sentence (see CONTEXT §4).
      ...(options.language && options.language !== 'auto' ? { language: options.language } : {}),
      ...(options.vocabulary?.length
        ? { prompt: options.vocabulary.slice(0, MAX_VOCABULARY_TERMS).join(', ') }
        : {}),
      // Plain text: neither timestamps nor segments are used, and asking for
      // verbose JSON would be paying for fields no one reads.
      response_format: 'text',
    });

    // With `response_format: 'text'` the API returns the bare string, but the
    // SDK types it as the JSON-format object. Either of the two shapes is
    // accepted instead of trusting one.
    const text =
      typeof result === 'string' ? result : ((result as { text?: string }).text ?? '');
    return text.trim();
  }

  /** What's behind "Test transcription" in the dashboard. */
  async testConnection(): Promise<{ ok: boolean; detail: string }> {
    try {
      /*
       * Half a second of real silence is sent. Checking only that the key exists
       * wouldn't have caught any of the failures that have happened in this
       * project: an account without access to the model answers just as well to
       * "do you have a key?" and fails on the first sentence.
       */
      const silence = new Int16Array(8_000);
      const file = await toFile(toWav(silence, 16_000), 'probe.wav', { type: 'audio/wav' });
      await this.client.audio.transcriptions.create({
        file,
        model: this.model,
        response_format: 'text',
      });
      return { ok: true, detail: m('diag.openaiTranscribeOk', { model: this.model }) };
    } catch (err) {
      return { ok: false, detail: toDetail(err) };
    }
  }
}

/** Actionable messages, with the SDK's typed classes. */
export function toDetail(err: unknown): string {
  if (err instanceof OpenAI.AuthenticationError) return m('err.openaiBadKeyStt');
  if (err instanceof OpenAI.PermissionDeniedError) {
    return m('err.openaiNoAccessStt');
  }
  if (err instanceof OpenAI.RateLimitError) {
    return m('err.rateOpenai');
  }
  if (err instanceof OpenAI.NotFoundError) {
    return m('err.openaiNoModelStt');
  }
  if (err instanceof OpenAI.APIConnectionError) return m('err.offlineOpenai');
  return err instanceof Error ? err.message : String(err);
}

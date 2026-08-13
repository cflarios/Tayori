import type { EventEmitter } from 'node:events';
import type { Speaker, STTProviderId } from '@shared/types';

/**
 * Contract every transcription engine must implement.
 *
 * The abstraction exists so that Gemini Live (cloud, low latency) and
 * whisper.cpp (local, offline) are interchangeable from the dashboard without
 * the orchestrator knowing which one is active. Adding Deepgram or Soniox later
 * is a new file plus an entry in the factory.
 */

export interface TranscriptEvent {
  speaker: Speaker;
  text: string;
  /** `false` while the engine can still revise the text. */
  isFinal: boolean;
  /**
   * `true` if `text` is the **whole turn so far**, not just what's new.
   *
   * The engines don't agree on this and the difference isn't cosmetic: Gemini
   * Live sends incremental fragments that have to be concatenated, and OpenAI's
   * real-time API sends increments **and also** the full turn when it closes.
   * Treating the latter as incremental writes the sentence twice — it happened,
   * it showed on screen, and the first copy came out on top with split words
   * because joining token fragments inserts spaces where they don't belong.
   *
   * Without this field the only alternative was for the buffer to guess by
   * comparing prefixes, which is exactly the kind of heuristic that fails the
   * day someone repeats a sentence on purpose.
   */
  cumulative?: boolean;
}

export interface STTStartOptions {
  /** Always 16000: the worklet already normalizes to that rate. */
  sampleRate: number;
  /** BCP-47, or `'auto'` for automatic detection. */
  language: string;
  /**
   * Speakers that are actually going to be listened to.
   *
   * It matters because Gemini Live opens one WebSocket session per speaker:
   * creating the mic one when the user chose to listen to the system only would
   * waste a connection that never receives audio.
   */
  speakers: Speaker[];
  /**
   * Terms that bias the recognizer. In an interview they're gold: company
   * names, acronyms and technologies are exactly what a generalist ASR botches.
   */
  vocabulary?: string[];
}

/** Answer produced on its own by a direct-audio engine. */
export interface DirectAnswerEvent {
  speaker: Speaker;
  /** What was understood, so the overlay keeps showing a transcript. */
  question: string;
  answer: string;
  model: string;
}

/**
 * A provider emits:
 *   - `segment` → TranscriptEvent
 *   - `error`   → Error (non-fatal; the orchestrator decides what to do)
 *   - `answer`  → DirectAnswerEvent, only if `answersDirectly`
 */
export interface STTProvider {
  readonly id: STTProviderId;
  readonly events: EventEmitter;

  /**
   * `true` if the engine **also answers**, because the audio reaches the
   * language model itself and it returns transcription and answer in one call.
   *
   * The orchestrator needs this so it doesn't fire a second answer on its own:
   * the question detector is redundant when the one deciding is the model that's
   * hearing the audio.
   */
  readonly answersDirectly?: boolean;

  start(options: STTStartOptions): Promise<void>;
  /** PCM16 little-endian mono at `sampleRate`. */
  push(speaker: Speaker, pcm: Buffer): void;
  stop(): Promise<void>;
}

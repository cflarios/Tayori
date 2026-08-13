/**
 * Energy-based speech segmenter.
 *
 * Whisper doesn't transcribe in streaming: it has to be given complete chunks.
 * This VAD decides where to cut, detecting when someone starts and stops
 * speaking.
 *
 * It's an RMS-energy detector with an adaptive noise floor, not Silero. The
 * alternative (`@ricky0123/vad-web` + `onnxruntime-node`) is more accurate at
 * rejecting non-voice noise, but drags in a native module that would have to be
 * recompiled against Electron's ABI. For the only thing we need here —knowing
 * where a turn ends— energy is enough, and Whisper itself filters out what isn't
 * speech afterwards.
 */

export interface VADOptions {
  sampleRate: number;
  /** Silence required to close an utterance. */
  silenceMs?: number;
  /** Audio kept before the detected start, so as not to clip syllables. */
  prefixPaddingMs?: number;
  /** Minimum duration to consider it was speech and not a thump. */
  minSpeechMs?: number;
  /** Forced cut: without it, someone talking with no pauses would never be transcribed. */
  maxUtteranceMs?: number;
}

/** A closed speech turn, ready to transcribe. */
export interface Utterance {
  pcm: Int16Array;
  durationMs: number;
  /** `true` if it was cut by max length instead of by silence. */
  forced: boolean;
}

const FRAME_MS = 20;

export class EnergyVAD {
  private readonly frameSize: number;
  private readonly silenceFrames: number;
  private readonly prefixFrames: number;
  private readonly minSpeechFrames: number;
  private readonly maxFrames: number;

  /** Frames before speech, for the initial padding. */
  private preRoll: Int16Array[] = [];
  /** Frames of the current turn. */
  private active: Int16Array[] = [];
  private speaking = false;
  private silenceRun = 0;
  private speechFrames = 0;
  /** Leftover samples that didn't complete a frame. */
  private carry: Int16Array = new Int16Array(0);

  /**
   * Estimated noise floor. It starts high on purpose and drops: starting low
   * would make ambient noise be taken for voice during the first few seconds.
   */
  private noiseFloor = 0.02;

  /** Consecutive frames classified as speech. See the latch rescue. */
  private speechRun = 0;

  /**
   * Past this point we stop believing it's real speech. 30 s: long enough that
   * a normal monologue doesn't hit it, short enough that the latch corrects
   * itself within the same conversation and not the next day.
   */
  private static readonly LATCH_FRAMES = Math.round(30_000 / FRAME_MS);

  constructor(options: VADOptions) {
    const rate = options.sampleRate;
    this.frameSize = Math.round((rate * FRAME_MS) / 1000);
    this.silenceFrames = Math.round((options.silenceMs ?? 700) / FRAME_MS);
    this.prefixFrames = Math.round((options.prefixPaddingMs ?? 300) / FRAME_MS);
    this.minSpeechFrames = Math.round((options.minSpeechMs ?? 250) / FRAME_MS);
    this.maxFrames = Math.round((options.maxUtteranceMs ?? 20_000) / FRAME_MS);
  }

  /**
   * Feeds PCM and returns the turns that have closed.
   *
   * Returns an array because a large push can close more than one.
   */
  push(pcm: Int16Array): Utterance[] {
    const closed: Utterance[] = [];

    // Join the previous leftover with the new data and process by full frames.
    const joined = new Int16Array(this.carry.length + pcm.length);
    joined.set(this.carry, 0);
    joined.set(pcm, this.carry.length);

    let offset = 0;
    while (offset + this.frameSize <= joined.length) {
      const frame = joined.subarray(offset, offset + this.frameSize);
      offset += this.frameSize;

      const utterance = this.processFrame(frame);
      if (utterance) closed.push(utterance);
    }

    this.carry = joined.slice(offset);
    return closed;
  }

  private processFrame(frame: Int16Array): Utterance | null {
    const energy = rms(frame);
    // Threshold relative to the noise: a fixed margin would fail between a
    // laptop mic and a headset one, which differ by an order of magnitude.
    const isSpeech = energy > this.noiseFloor * 2.5 && energy > 0.006;

    if (!isSpeech) {
      // The floor is only updated during silence, or the voice itself would
      // drag it up until it stops being detected.
      this.noiseFloor = this.noiseFloor * 0.95 + energy * 0.05;
      this.speechRun = 0;
    } else {
      this.speechRun += 1;
      /*
       * Latch rescue.
       *
       * Updating the floor ONLY during silence has a bug that shows up after a
       * while: if the background noise rises above 2.5× the learned floor —the
       * fan spinning up because Whisper and the LLM are eating CPU, or the mic's
       * AGC raising gain— every frame starts counting as speech. Then the floor
       * never updates again, because it only updated during silence, and the VAD
       * stays latched: everything comes out as a forced 20 s cut and the
       * transcript becomes useless. From the outside: "it stops responding".
       *
       * Nobody talks nonstop for `LATCH_FRAMES` in a row. Past that, what we're
       * measuring is noise, so we let the floor learn it.
       */
      if (this.speechRun > EnergyVAD.LATCH_FRAMES) {
        this.noiseFloor = this.noiseFloor * 0.98 + energy * 0.02;
      }
    }

    if (!this.speaking) {
      if (isSpeech) {
        this.speaking = true;
        this.speechFrames = 1;
        this.silenceRun = 0;
        // The pre-roll avoids eating the first syllable, which is exactly the
        // one that disambiguates many questions.
        this.active = [...this.preRoll, copy(frame)];
        this.preRoll = [];
      } else {
        this.preRoll.push(copy(frame));
        if (this.preRoll.length > this.prefixFrames) this.preRoll.shift();
      }
      return null;
    }

    this.active.push(copy(frame));

    if (isSpeech) {
      this.speechFrames += 1;
      this.silenceRun = 0;
    } else {
      this.silenceRun += 1;
    }

    if (this.silenceRun >= this.silenceFrames) return this.close(false);
    if (this.active.length >= this.maxFrames) return this.close(true);
    return null;
  }

  private close(forced: boolean): Utterance | null {
    const frames = this.active;
    const speechFrames = this.speechFrames;

    this.active = [];
    this.speaking = false;
    this.silenceRun = 0;
    this.speechFrames = 0;

    // A thump on the desk clears the threshold for an instant; without this
    // filter it would be sent to Whisper and come back as garbage or
    // hallucinations.
    if (speechFrames < this.minSpeechFrames) return null;

    return { pcm: concat(frames), durationMs: frames.length * FRAME_MS, forced };
  }

  /**
   * Closes the current turn, if it clears the minimum. Used when stopping
   * capture so the last sentence isn't lost.
   */
  flush(): Utterance | null {
    if (!this.speaking) return null;
    return this.close(true);
  }

  reset(): void {
    this.preRoll = [];
    this.active = [];
    this.carry = new Int16Array(0);
    this.speaking = false;
    this.silenceRun = 0;
    this.speechFrames = 0;
    this.speechRun = 0;
    this.noiseFloor = 0.02;
  }

  /** Current noise floor. For diagnostics only. */
  get currentNoiseFloor(): number {
    return this.noiseFloor;
  }
}

/** RMS energy normalized to [0,1]. */
function rms(frame: Int16Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) {
    const sample = (frame[i] ?? 0) / 32768;
    sum += sample * sample;
  }
  return Math.sqrt(sum / frame.length);
}

function copy(frame: Int16Array): Int16Array {
  return Int16Array.from(frame);
}

function concat(frames: Int16Array[]): Int16Array {
  let total = 0;
  for (const frame of frames) total += frame.length;

  const out = new Int16Array(total);
  let offset = 0;
  for (const frame of frames) {
    out.set(frame, offset);
    offset += frame.length;
  }
  return out;
}

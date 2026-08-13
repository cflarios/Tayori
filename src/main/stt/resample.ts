/**
 * From 16 kHz to 24 kHz, streaming.
 *
 * It exists because of a constraint in OpenAI's real-time API, not by choice:
 * its PCM format **only accepts 24000 Hz**. The installed SDK's types say so
 * plainly —`rate?: 24000`, "Only a 24kHz sample rate is supported"— and the
 * whole pipeline of this app is normalized to 16 kHz because that's what Whisper
 * and Gemini Live want. Raising the worklet to 24 kHz to please one engine would
 * have hurt the other three, so the conversion lives here, contained in the only
 * place that needs it.
 *
 * **Why linear interpolation is enough here, when in the worklet it wasn't.**
 * That case was decimating 48 → 16 kHz, and when decimating, whatever is above
 * the new Nyquist frequency **folds** into the voice band: the sibilants ended
 * up on top of the vowels, and that's why an 8th-order Butterworth had to go in.
 * Here it's the opposite. When interpolating nothing folds, because there's no
 * content above 8 kHz to fold: what appears are spectral **images** above 8 kHz,
 * and linear interpolation already acts as a gentle low-pass filter over them.
 * For a speech recognizer —whose information lives below those 8 kHz— it's a
 * non-problem. Upsampling doesn't invent detail: it just gets the audio through
 * the door.
 *
 * **What IS mandatory is the state between blocks.** The audio arrives in ~100 ms
 * chunks, ten per second per speaker. A memoryless resampler starts each block
 * from scratch and leaves a jump at the join: ten discontinuities per second,
 * which are ten clicks the recognizer hears as consonants no one said. Hence
 * `prev` and `posNum`, which are all the state of this class and the reason it's
 * a class and not a function.
 */

/** 16000/24000 = 2/3. Kept as an integer fraction so it doesn't drift. */
const STEP_NUM = 2;
const STEP_DEN = 3;

export class Upsampler16to24 {
  /** Last sample of the previous block; the one that joins with the next. */
  private prev = 0;
  /**
   * Position of the next output sample, in thirds of an input sample and counted
   * from `prev`. Integer on purpose: with a `float` accumulating 2/3 per sample,
   * the error shows after a few minutes of meeting.
   */
  private posNum = STEP_DEN;

  /** Converts a block. Returns PCM16 at 24 kHz. */
  process(input: Int16Array): Int16Array {
    if (input.length === 0) return new Int16Array(0);

    // The work block carries the previous one's last sample up front, so the
    // join's interpolation has both of its real endpoints.
    const work = new Int16Array(input.length + 1);
    work[0] = this.prev;
    work.set(input, 1);

    const last = (work.length - 1) * STEP_DEN;
    // How many outputs fit before running out of a sample pair to interpolate.
    const count = this.posNum > last ? 0 : Math.floor((last - this.posNum) / STEP_NUM) + 1;
    const out = new Int16Array(count);

    let posNum = this.posNum;
    for (let j = 0; j < count; j += 1) {
      const index = Math.floor(posNum / STEP_DEN);
      const frac = (posNum % STEP_DEN) / STEP_DEN;
      const a = work[index] ?? 0;
      // With `frac` at 0 the second term cancels out, so reading one extra
      // sample at the exact edge can't overflow.
      const b = work[index + 1] ?? a;
      out[j] = Math.round(a + (b - a) * frac);
      posNum += STEP_NUM;
    }

    // What's left over carries to the next block, measured from its new
    // reference: without this the phase would reset and the click would return.
    this.posNum = posNum - (work.length - 1) * STEP_DEN;
    this.prev = input[input.length - 1] ?? this.prev;

    return out;
  }

  /** Returns to the initial state. The engine calls it when opening a new session. */
  reset(): void {
    this.prev = 0;
    this.posNum = STEP_DEN;
  }
}

/** PCM16 little-endian to `Int16Array`, without copying if the alignment allows. */
export function pcmToInt16(buffer: Buffer): Int16Array {
  if (buffer.byteOffset % 2 === 0) {
    return new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);
  }
  // A Buffer with an odd offset can't be viewed as an Int16Array: it must be copied.
  const copy = Buffer.from(buffer);
  return new Int16Array(copy.buffer, copy.byteOffset, copy.length / 2);
}

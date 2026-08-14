import { describe, expect, it } from 'vitest';
import { pcmToInt16, Upsampler16to24 } from '../src/main/stt/resample';

/**
 * From 16 kHz to 24 kHz, which is what OpenAI's real-time API requires.
 *
 * The bug these tests avoid gives no error: a resampler with no memory between
 * blocks leaves a discontinuity at every join —ten per second and per speaker,
 * because the audio arrives in 100 ms chunks— and the recognizer hears them as
 * consonants nobody said. The transcription comes out worse and there's
 * absolutely nothing in the log to hint at it.
 */
describe('Upsampler16to24', () => {
  it('produces 3 samples for every 2 of input', () => {
    const up = new Upsampler16to24();
    const out = up.process(new Int16Array(1_600)); // 100 ms at 16 kHz

    // 100 ms at 24 kHz is 2,400 samples. ±1 is allowed for phase rounding.
    expect(Math.abs(out.length - 2_400)).toBeLessThanOrEqual(1);
  });

  it('keeps the ratio over many blocks', () => {
    // Here you see if the phase drifts: with a `float` accumulating 2/3, the error
    // shows after a few minutes of meeting, and that's minutes of shifted audio.
    const up = new Upsampler16to24();
    let total = 0;
    for (let i = 0; i < 600; i += 1) total += up.process(new Int16Array(1_600)).length;

    // 60 s of audio → 1,440,000 samples at 24 kHz.
    expect(Math.abs(total - 1_440_000)).toBeLessThanOrEqual(2);
  });

  it("doesn't leave a jump at the join between blocks", () => {
    /*
     * The test that really matters. A continuous ramp is split into two blocks:
     * if the resampler carries the last sample of the previous one, the output
     * stays monotonic; if it starts from zero on each block, a step backward
     * appears right at the seam.
     */
    const rampa = (desde: number, n: number): Int16Array =>
      Int16Array.from({ length: n }, (_, i) => desde + i * 10);

    const up = new Upsampler16to24();
    const a = up.process(rampa(0, 100));
    const b = up.process(rampa(1_000, 100));

    const junto = [...a, ...b];
    for (let i = 1; i < junto.length; i += 1) {
      expect(junto[i]!, `jump at sample ${i}`).toBeGreaterThanOrEqual(junto[i - 1]!);
    }
  });

  it('interpolates instead of repeating samples', () => {
    // Repeating the previous sample (nearest neighbor) would be simpler and puts
    // steps into the signal; it's checked that intermediate values appear that
    // weren't in the input.
    const up = new Upsampler16to24();
    const out = up.process(Int16Array.from([0, 300, 600, 900, 1_200]));

    const entrada = new Set([0, 300, 600, 900, 1_200]);
    expect([...out].some((v) => !entrada.has(v))).toBe(true);
  });

  it('reset starts over from zero', () => {
    // Every new session calls it: carrying the phase of a previous meeting would
    // be starting the next one with a splice against silence.
    const up = new Upsampler16to24();
    const primero = up.process(new Int16Array(1_600)).length;
    up.process(new Int16Array(1_600));
    up.reset();

    expect(up.process(new Int16Array(1_600)).length).toBe(primero);
  });

  it("an empty block doesn't break anything", () => {
    expect(new Upsampler16to24().process(new Int16Array(0))).toHaveLength(0);
  });
});

describe('pcmToInt16', () => {
  it('reads little-endian PCM16', () => {
    const buffer = Buffer.alloc(4);
    buffer.writeInt16LE(-1_234, 0);
    buffer.writeInt16LE(5_678, 2);

    expect([...pcmToInt16(buffer)]).toEqual([-1_234, 5_678]);
  });

  it('survives a Buffer with an odd offset', () => {
    // `Buffer.subarray` can return a view with an odd `byteOffset`, and an
    // `Int16Array` over it throws. It happens with the chunks that arrive over IPC.
    const base = Buffer.alloc(5);
    base.writeInt16LE(4_321, 1);
    const impar = base.subarray(1);

    expect(impar.byteOffset % 2).toBe(1);
    expect(pcmToInt16(impar)[0]).toBe(4_321);
  });
});

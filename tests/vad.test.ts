import { describe, expect, it } from 'vitest';
import { EnergyVAD } from '../src/main/core/vad';

const RATE = 16_000;

/** Generates a sine tone of the given amplitude and duration. */
function tone(ms: number, amplitude = 0.4, freq = 220): Int16Array {
  const samples = Math.round((RATE * ms) / 1000);
  const out = new Int16Array(samples);
  for (let i = 0; i < samples; i++) {
    out[i] = Math.round(Math.sin((2 * Math.PI * freq * i) / RATE) * 32767 * amplitude);
  }
  return out;
}

function silence(ms: number): Int16Array {
  return new Int16Array(Math.round((RATE * ms) / 1000));
}

function concat(...parts: Int16Array[]): Int16Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Int16Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

describe('EnergyVAD', () => {
  it('closes a turn after the configured silence', () => {
    const vad = new EnergyVAD({ sampleRate: RATE, silenceMs: 300 });

    // Initial silence so the noise floor converges before the speech.
    const utterances = vad.push(concat(silence(500), tone(800), silence(500)));

    expect(utterances).toHaveLength(1);
    expect(utterances[0]?.forced).toBe(false);
    // It includes the leading padding, so it lasts longer than the speech itself.
    expect(utterances[0]?.durationMs).toBeGreaterThanOrEqual(800);
  });

  it('emits nothing while the speech continues', () => {
    const vad = new EnergyVAD({ sampleRate: RATE, silenceMs: 700 });

    const utterances = vad.push(concat(silence(400), tone(1500)));

    expect(utterances).toHaveLength(0);
  });

  it('discards a peak too short to be speech', () => {
    const vad = new EnergyVAD({ sampleRate: RATE, silenceMs: 300, minSpeechMs: 250 });

    // A bang: loud but 60 ms. Without this filter it would go to Whisper and
    // return a hallucination.
    const utterances = vad.push(concat(silence(500), tone(60, 0.9), silence(500)));

    expect(utterances).toHaveLength(0);
  });

  it('forces the cut if nobody pauses', () => {
    const vad = new EnergyVAD({ sampleRate: RATE, silenceMs: 700, maxUtteranceMs: 1000 });

    // Without a forced cut, whoever talks without pauses would never be transcribed.
    const utterances = vad.push(concat(silence(400), tone(3000)));

    expect(utterances.length).toBeGreaterThanOrEqual(2);
    expect(utterances.every((u) => u.forced)).toBe(true);
  });

  it('separates two distinct turns with a pause in between', () => {
    const vad = new EnergyVAD({ sampleRate: RATE, silenceMs: 300 });

    const utterances = vad.push(
      concat(silence(400), tone(600), silence(600), tone(600), silence(500))
    );

    expect(utterances).toHaveLength(2);
  });

  it('ignores pure silence', () => {
    const vad = new EnergyVAD({ sampleRate: RATE });
    expect(vad.push(silence(3000))).toHaveLength(0);
  });

  it('reconstructs frames across several pushes', () => {
    const vad = new EnergyVAD({ sampleRate: RATE, silenceMs: 300 });
    const audio = concat(silence(500), tone(800), silence(500));

    // Arbitrary-size chunks that don't land on a frame boundary: the remainder
    // must be carried between calls or samples would be lost.
    const utterances: ReturnType<typeof vad.push> = [];
    const chunkSize = 777;
    for (let i = 0; i < audio.length; i += chunkSize) {
      utterances.push(...vad.push(audio.subarray(i, Math.min(i + chunkSize, audio.length))));
    }

    expect(utterances).toHaveLength(1);
  });

  it('flush recovers the last sentence when stopping capture', () => {
    const vad = new EnergyVAD({ sampleRate: RATE, silenceMs: 700 });

    vad.push(concat(silence(400), tone(900)));
    const flushed = vad.flush();

    expect(flushed).not.toBeNull();
    expect(flushed?.forced).toBe(true);
  });

  it('flush returns nothing if there was no active speech', () => {
    const vad = new EnergyVAD({ sampleRate: RATE });
    vad.push(silence(1000));
    expect(vad.flush()).toBeNull();
  });

  it('reset clears the internal state', () => {
    const vad = new EnergyVAD({ sampleRate: RATE, silenceMs: 300 });

    vad.push(concat(silence(400), tone(600)));
    vad.reset();

    // After the reset no half-finished speech should remain that closes by itself.
    expect(vad.flush()).toBeNull();
  });
});

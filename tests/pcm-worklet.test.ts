import { describe, expect, it } from 'vitest';
import { PCM_WORKLET_SOURCE } from '../src/renderer/audio-worker/pcm-worklet';

/**
 * Runs the REAL worklet in a sandbox.
 *
 * The code lives in a string because it's compiled from a Blob URL (see the
 * module's comment), so it can't be imported. It's evaluated with the three
 * things the AudioWorklet environment gives it as globals —`sampleRate`,
 * `AudioWorkletProcessor` and `registerProcessor`— and fed audio by hand.
 *
 * The setup is worth it: it's the only way to check the antialiasing against the
 * code that actually runs, instead of against a copy of the algorithm that could
 * diverge.
 */
interface WorkletProcessor {
  process(inputs: Float32Array[][]): boolean;
}
type WorkletCtor = new (options: {
  processorOptions: { targetRate: number };
}) => WorkletProcessor;

function runWorklet(options: {
  sampleRate: number;
  targetRate: number;
  samples: Float32Array;
}): Int16Array {
  const blocks: Int16Array[] = [];

  class FakeProcessor {
    port = {
      postMessage: (message: { pcm?: ArrayBuffer }): void => {
        if (message.pcm) blocks.push(new Int16Array(message.pcm));
      },
    };
  }

  let registered: WorkletCtor | undefined;

  const factory = new Function(
    'sampleRate',
    'AudioWorkletProcessor',
    'registerProcessor',
    PCM_WORKLET_SOURCE
  );
  factory(options.sampleRate, FakeProcessor, (_name: string, cls: WorkletCtor) => {
    registered = cls;
  });

  // To a const before checking: otherwise TypeScript's flow analysis doesn't see
  // the assignment inside the callback and narrows the type to `never`.
  const Ctor = registered;
  if (!Ctor) throw new Error('el worklet no registró ningún procesador');
  const processor = new Ctor({ processorOptions: { targetRate: options.targetRate } });

  // 128 frames per call, which is what Chromium actually does.
  for (let offset = 0; offset + 128 <= options.samples.length; offset += 128) {
    processor.process([[options.samples.subarray(offset, offset + 128)]]);
  }

  const total = blocks.reduce((sum, b) => sum + b.length, 0);
  const out = new Int16Array(total);
  let at = 0;
  for (const block of blocks) {
    out.set(block, at);
    at += block.length;
  }
  return out;
}

function tone(frequency: number, sampleRate: number, seconds: number, amplitude = 0.5): Float32Array {
  const samples = new Float32Array(Math.round(sampleRate * seconds));
  for (let i = 0; i < samples.length; i++) {
    samples[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return samples;
}

/** RMS normalized to [0,1], discarding the filter's startup. */
function rms(pcm: Int16Array, skip = 1_600): number {
  let sum = 0;
  let count = 0;
  for (let i = skip; i < pcm.length; i++) {
    const s = (pcm[i] ?? 0) / 32768;
    sum += s * s;
    count += 1;
  }
  return count ? Math.sqrt(sum / count) : 0;
}

const IN_RATE = 48_000;
const TARGET = 16_000;

describe('PCM worklet', () => {
  it('resamples to the requested frequency', () => {
    const out = runWorklet({
      sampleRate: IN_RATE,
      targetRate: TARGET,
      samples: tone(440, IN_RATE, 1),
    });
    // One second of input should give ~16000 samples, minus the last incomplete
    // block that hasn't been emitted yet.
    expect(out.length).toBeGreaterThan(TARGET * 0.9);
    expect(out.length).toBeLessThanOrEqual(TARGET);
  });

  it('lets the voice band through untouched', () => {
    // 1 kHz is in the middle of the useful speech band: it has to come out intact.
    const out = runWorklet({
      sampleRate: IN_RATE,
      targetRate: TARGET,
      samples: tone(1_000, IN_RATE, 1),
    });
    // RMS of a 0.5-amplitude sine is 0.5/√2 ≈ 0.354.
    expect(rms(out)).toBeGreaterThan(0.3);
  });

  it('removes the aliasing that ruined the transcription', () => {
    // 12 kHz doesn't fit at 16 kHz: without a filter it folds to |12 − 16| = 4 kHz,
    // right on top of the formants. Since the input is a pure tone inaudible after
    // resampling, ALL the output energy would be alias.
    const out = runWorklet({
      sampleRate: IN_RATE,
      targetRate: TARGET,
      samples: tone(12_000, IN_RATE, 1),
    });

    const passband = rms(
      runWorklet({ sampleRate: IN_RATE, targetRate: TARGET, samples: tone(1_000, IN_RATE, 1) })
    );

    // At least 40 dB below what passes in-band. Without the filter this ratio was
    // ~1: the 12 kHz tone came out with its full amplitude, turned into a 4 kHz
    // that was never said.
    expect(rms(out)).toBeLessThan(passband / 100);
  });

  it('attenuates more the deeper into the voice band the fold would land', () => {
    const passband = rms(
      runWorklet({ sampleRate: IN_RATE, targetRate: TARGET, samples: tone(1_000, IN_RATE, 1) })
    );
    const level = (frequency: number): number =>
      rms(runWorklet({ sampleRate: IN_RATE, targetRate: TARGET, samples: tone(frequency, IN_RATE, 1) })) /
      passband;

    // 8 kHz is the exact fold point: it maps onto itself, so it doesn't dirty
    // anything and it's enough for it to be clearly attenuated.
    expect(level(8_000)).toBeLessThan(0.5);
    // 10 kHz would land on 6 kHz and 12 kHz on 4 kHz — right on top of the
    // formants. The deeper it lands, the more sunk it has to be.
    expect(level(10_000)).toBeLessThan(level(8_000) / 4);
    expect(level(12_000)).toBeLessThan(level(10_000) / 4);
  });

  it('works with the other common card frequency', () => {
    // 44.1 kHz gives a non-integer ratio (2.75625): the resampler has to carry
    // the fractional part without drifting.
    const out = runWorklet({
      sampleRate: 44_100,
      targetRate: TARGET,
      samples: tone(1_000, 44_100, 1),
    });
    // The bound is loose on purpose: only complete blocks of 1600 samples are
    // emitted, so the tail always stays inside the worklet.
    expect(out.length).toBeGreaterThan(TARGET * 0.85);
    expect(rms(out)).toBeGreaterThan(0.3);
  });
});

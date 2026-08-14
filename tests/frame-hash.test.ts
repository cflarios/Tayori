import { describe, expect, it } from 'vitest';
import { aHashFromBitmap, hamming } from '../src/main/capture/frame-hash';

/**
 * The perceptual hash deduplicates near-identical frames in automatic mode. It's
 * exercised against what matters: two identical captures give distance 0, and two
 * clearly different ones give a large distance, which is what separates "the
 * scroll hasn't moved" from "there's a new chunk".
 */

/** Builds a BGRA bitmap from grayscale levels (0-255), one per pixel. */
function bmp(grays: number[]): Buffer {
  const buf = Buffer.alloc(grays.length * 4);
  grays.forEach((g, i) => {
    buf[i * 4] = g; // B
    buf[i * 4 + 1] = g; // G
    buf[i * 4 + 2] = g; // R
    buf[i * 4 + 3] = 255; // A
  });
  return buf;
}

// 4×4 = 16 pixels: half dark, half light.
const HALF = [0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255];

describe('aHashFromBitmap + hamming', () => {
  it('two identical frames give distance 0', () => {
    const a = aHashFromBitmap(bmp(HALF), 4, 4);
    const b = aHashFromBitmap(bmp(HALF), 4, 4);
    expect(hamming(a, b)).toBe(0);
  });

  it('a small change (one pixel crosses the mean) moves few bits', () => {
    const base = HALF.slice();
    const nudged = HALF.slice();
    nudged[0] = 255; // a dark pixel turns light
    const d = hamming(aHashFromBitmap(bmp(base), 4, 4), aHashFromBitmap(bmp(nudged), 4, 4));
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThanOrEqual(2);
  });

  it('an inverted frame ends up far (almost all bits differ)', () => {
    const inverted = HALF.map((g) => 255 - g);
    const d = hamming(aHashFromBitmap(bmp(HALF), 4, 4), aHashFromBitmap(bmp(inverted), 4, 4));
    expect(d).toBeGreaterThanOrEqual(12);
  });

  it('hamming counts the bits that differ', () => {
    // 1010 ^ 0011 = 1001 → 2 bits.
    expect(hamming(0b1010n, 0b0011n)).toBe(2);
    expect(hamming(0n, 0n)).toBe(0);
    expect(hamming(0xffn, 0n)).toBe(8);
  });
});

/**
 * Perceptual hash (average hash) of a frame, to deduplicate near-identical
 * captures in the automatic mode of "chunk capture".
 *
 * It's not cryptographic and doesn't pretend to be: it reduces the frame to a
 * `width * height`-bit fingerprint —one bit per pixel: 1 if it's brighter than
 * the average— that changes little between two near-equal captures and a lot
 * between two different ones. They're compared by Hamming distance; below a
 * threshold, they're taken as the same chunk and the second isn't stacked.
 *
 * It's pure logic and has its own test: a badly deduplicated frame isn't visible
 * —a duplicate gets stacked or a chunk of the prompt is lost—, so it's worth
 * pinning.
 */

/**
 * Average hash of a BGRA bitmap (the format `nativeImage.toBitmap` returns, 4
 * bytes per pixel: B, G, R, A). Returns `width * height` bits in a bigint.
 */
export function aHashFromBitmap(bitmap: Buffer, width: number, height: number): bigint {
  const count = width * height;

  // Approximate luminance of a pixel. `readUInt8` returns `number` (not
  // `number | undefined` like indexing), which keeps the arithmetic clean.
  const lumAt = (i: number): number => {
    const o = i * 4;
    return (
      0.114 * bitmap.readUInt8(o) +
      0.587 * bitmap.readUInt8(o + 1) +
      0.299 * bitmap.readUInt8(o + 2)
    );
  };

  let sum = 0;
  for (let i = 0; i < count; i++) sum += lumAt(i);
  const avg = sum / count;

  let hash = 0n;
  for (let i = 0; i < count; i++) {
    hash <<= 1n;
    if (lumAt(i) >= avg) hash |= 1n;
  }
  return hash;
}

/** Hamming distance: how many bits differ between two fingerprints. */
export function hamming(a: bigint, b: bigint): number {
  let x = a ^ b;
  let bits = 0;
  while (x > 0n) {
    bits += Number(x & 1n);
    x >>= 1n;
  }
  return bits;
}

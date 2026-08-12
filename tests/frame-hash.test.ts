import { describe, expect, it } from 'vitest';
import { aHashFromBitmap, hamming } from '../src/main/capture/frame-hash';

/**
 * El hash perceptual deduplica frames casi idénticos en el modo automático. Se
 * ejercita contra lo que importa: dos capturas iguales dan distancia 0, y dos
 * bien distintas dan una distancia grande, que es lo que separa "el scroll no
 * se ha movido" de "hay un trozo nuevo".
 */

/** Construye un bitmap BGRA a partir de niveles de gris (0-255), uno por píxel. */
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

// 4×4 = 16 píxeles: mitad oscura, mitad clara.
const HALF = [0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255];

describe('aHashFromBitmap + hamming', () => {
  it('dos frames idénticos dan distancia 0', () => {
    const a = aHashFromBitmap(bmp(HALF), 4, 4);
    const b = aHashFromBitmap(bmp(HALF), 4, 4);
    expect(hamming(a, b)).toBe(0);
  });

  it('un cambio pequeño (un píxel cruza la media) mueve pocos bits', () => {
    const base = HALF.slice();
    const nudged = HALF.slice();
    nudged[0] = 255; // un píxel oscuro pasa a claro
    const d = hamming(aHashFromBitmap(bmp(base), 4, 4), aHashFromBitmap(bmp(nudged), 4, 4));
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThanOrEqual(2);
  });

  it('un frame invertido queda lejos (casi todos los bits difieren)', () => {
    const inverted = HALF.map((g) => 255 - g);
    const d = hamming(aHashFromBitmap(bmp(HALF), 4, 4), aHashFromBitmap(bmp(inverted), 4, 4));
    expect(d).toBeGreaterThanOrEqual(12);
  });

  it('hamming cuenta los bits que difieren', () => {
    // 1010 ^ 0011 = 1001 → 2 bits.
    expect(hamming(0b1010n, 0b0011n)).toBe(2);
    expect(hamming(0n, 0n)).toBe(0);
    expect(hamming(0xffn, 0n)).toBe(8);
  });
});

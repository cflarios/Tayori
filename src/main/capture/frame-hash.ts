/**
 * Hash perceptual (average hash) de un frame, para deduplicar capturas casi
 * idénticas en el modo automático de "captura por trozos".
 *
 * No es criptográfico ni pretende serlo: reduce el frame a una huella de
 * `width * height` bits —un bit por píxel: 1 si es más claro que la media— que
 * cambia poco entre dos capturas casi iguales y mucho entre dos distintas. Se
 * comparan por distancia de Hamming; por debajo de un umbral, se toman como el
 * mismo trozo y no se apila el segundo.
 *
 * Es lógica pura y con test aparte: un frame mal deduplicado no se ve —se apila
 * un duplicado o se pierde un trozo del enunciado—, así que conviene fijarlo.
 */

/**
 * Average hash de un bitmap BGRA (el formato que devuelve `nativeImage.toBitmap`,
 * 4 bytes por píxel: B, G, R, A). Devuelve `width * height` bits en un bigint.
 */
export function aHashFromBitmap(bitmap: Buffer, width: number, height: number): bigint {
  const count = width * height;

  // Luminancia aproximada de un píxel. `readUInt8` devuelve `number` (no
  // `number | undefined` como el indexado), lo que mantiene la aritmética limpia.
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

/** Distancia de Hamming: cuántos bits difieren entre dos huellas. */
export function hamming(a: bigint, b: bigint): number {
  let x = a ^ b;
  let bits = 0;
  while (x > 0n) {
    bits += Number(x & 1n);
    x >>= 1n;
  }
  return bits;
}

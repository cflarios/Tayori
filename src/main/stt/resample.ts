/**
 * De 16 kHz a 24 kHz, en streaming.
 *
 * Existe por una restricción de la API en tiempo real de OpenAI, no por gusto:
 * su formato PCM **sólo admite 24000 Hz**. Los tipos del SDK instalado lo dicen
 * sin matices —`rate?: 24000`, "Only a 24kHz sample rate is supported"— y todo
 * el pipeline de esta app está normalizado a 16 kHz porque es lo que quieren
 * Whisper y Gemini Live. Subir el worklet a 24 kHz para contentar a un motor
 * habría empeorado a los otros tres, así que la conversión vive aquí, contenida
 * en el único sitio que la necesita.
 *
 * **Por qué basta con interpolación lineal, cuando en el worklet no bastó.**
 * Aquel caso era decimar 48 → 16 kHz, y al decimar lo que hay por encima de la
 * nueva frecuencia de Nyquist **se pliega** dentro de la banda de la voz: las
 * sibilantes acababan encima de las vocales, y por eso hubo que meter un
 * Butterworth de 8º orden. Aquí se hace lo contrario. Al interpolar no se pliega
 * nada, porque no hay contenido por encima de 8 kHz que plegar: lo que aparece
 * son **imágenes** espectrales por encima de 8 kHz, y la interpolación lineal ya
 * actúa como un filtro paso bajo suave sobre ellas. Para un reconocedor de voz
 * —cuya información vive por debajo de esos 8 kHz— es un no-problema. Subir de
 * frecuencia no inventa detalle: sólo hace que el audio entre por la puerta.
 *
 * **Lo que sí es obligatorio es el estado entre bloques.** El audio llega en
 * trozos de ~100 ms, diez por segundo y por hablante. Un remuestreador sin
 * memoria empieza cada bloque desde cero y deja un salto en la unión: diez
 * discontinuidades por segundo, que son diez chasquidos que el reconocedor oye
 * como consonantes que nadie dijo. De ahí `prev` y `posNum`, que son todo el
 * estado de esta clase y la razón de que sea una clase y no una función.
 */

/** 16000/24000 = 2/3. Se lleva como fracción entera para que no derive. */
const STEP_NUM = 2;
const STEP_DEN = 3;

export class Upsampler16to24 {
  /** Última muestra del bloque anterior; es la que empalma con el siguiente. */
  private prev = 0;
  /**
   * Posición de la próxima muestra de salida, en tercios de muestra de entrada
   * y contada desde `prev`. Entera a propósito: con un `float` acumulando
   * 2/3 por muestra, el error se nota tras unos minutos de reunión.
   */
  private posNum = STEP_DEN;

  /** Convierte un bloque. Devuelve PCM16 a 24 kHz. */
  process(input: Int16Array): Int16Array {
    if (input.length === 0) return new Int16Array(0);

    // El bloque de trabajo lleva delante la última muestra del anterior, así
    // que la interpolación de la unión tiene sus dos extremos de verdad.
    const work = new Int16Array(input.length + 1);
    work[0] = this.prev;
    work.set(input, 1);

    const last = (work.length - 1) * STEP_DEN;
    // Cuántas salidas caben antes de quedarse sin par de muestras que interpolar.
    const count = this.posNum > last ? 0 : Math.floor((last - this.posNum) / STEP_NUM) + 1;
    const out = new Int16Array(count);

    let posNum = this.posNum;
    for (let j = 0; j < count; j += 1) {
      const index = Math.floor(posNum / STEP_DEN);
      const frac = (posNum % STEP_DEN) / STEP_DEN;
      const a = work[index] ?? 0;
      // Con `frac` a 0 el segundo término se anula, así que leer una muestra de
      // más en el borde exacto no puede desbordar.
      const b = work[index + 1] ?? a;
      out[j] = Math.round(a + (b - a) * frac);
      posNum += STEP_NUM;
    }

    // Lo que sobra se arrastra al siguiente bloque, medido desde su nueva
    // referencia: sin esto la fase se reiniciaría y volvería el chasquido.
    this.posNum = posNum - (work.length - 1) * STEP_DEN;
    this.prev = input[input.length - 1] ?? this.prev;

    return out;
  }

  /** Vuelve al estado inicial. Lo llama el motor al abrir una sesión nueva. */
  reset(): void {
    this.prev = 0;
    this.posNum = STEP_DEN;
  }
}

/** PCM16 little-endian a `Int16Array`, sin copiar si la alineación lo permite. */
export function pcmToInt16(buffer: Buffer): Int16Array {
  if (buffer.byteOffset % 2 === 0) {
    return new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);
  }
  // Un Buffer con offset impar no se puede ver como Int16Array: hay que copiar.
  const copy = Buffer.from(buffer);
  return new Int16Array(copy.buffer, copy.byteOffset, copy.length / 2);
}

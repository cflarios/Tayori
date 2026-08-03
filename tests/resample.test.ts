import { describe, expect, it } from 'vitest';
import { pcmToInt16, Upsampler16to24 } from '../src/main/stt/resample';

/**
 * De 16 kHz a 24 kHz, que es lo que exige la API en tiempo real de OpenAI.
 *
 * El fallo que estas pruebas evitan no da ningún error: un remuestreador sin
 * memoria entre bloques deja una discontinuidad en cada unión —diez por segundo
 * y por hablante, porque el audio llega en trozos de 100 ms— y el reconocedor
 * las oye como consonantes que nadie dijo. La transcripción sale peor y no hay
 * absolutamente nada en el log que lo insinúe.
 */
describe('Upsampler16to24', () => {
  it('produce 3 muestras por cada 2 de entrada', () => {
    const up = new Upsampler16to24();
    const out = up.process(new Int16Array(1_600)); // 100 ms a 16 kHz

    // 100 ms a 24 kHz son 2.400 muestras. Se admite ±1 por el redondeo de fase.
    expect(Math.abs(out.length - 2_400)).toBeLessThanOrEqual(1);
  });

  it('mantiene la proporción a lo largo de muchos bloques', () => {
    // Aquí se ve si la fase deriva: con un `float` acumulando 2/3, el error se
    // nota tras unos minutos de reunión, y son minutos de audio desplazado.
    const up = new Upsampler16to24();
    let total = 0;
    for (let i = 0; i < 600; i += 1) total += up.process(new Int16Array(1_600)).length;

    // 60 s de audio → 1.440.000 muestras a 24 kHz.
    expect(Math.abs(total - 1_440_000)).toBeLessThanOrEqual(2);
  });

  it('no deja un salto en la unión entre bloques', () => {
    /*
     * El test que de verdad importa. Se parte una rampa continua en dos bloques:
     * si el remuestreador arrastra la última muestra del anterior, la salida
     * sigue siendo monótona; si empieza de cero en cada bloque, aparece un
     * escalón hacia atrás justo en la costura.
     */
    const rampa = (desde: number, n: number): Int16Array =>
      Int16Array.from({ length: n }, (_, i) => desde + i * 10);

    const up = new Upsampler16to24();
    const a = up.process(rampa(0, 100));
    const b = up.process(rampa(1_000, 100));

    const junto = [...a, ...b];
    for (let i = 1; i < junto.length; i += 1) {
      expect(junto[i]!, `salto en la muestra ${i}`).toBeGreaterThanOrEqual(junto[i - 1]!);
    }
  });

  it('interpola en lugar de repetir muestras', () => {
    // Repetir la muestra anterior (vecino más cercano) sería más simple y mete
    // escalones en la señal; se comprueba que aparecen valores intermedios que
    // no estaban en la entrada.
    const up = new Upsampler16to24();
    const out = up.process(Int16Array.from([0, 300, 600, 900, 1_200]));

    const entrada = new Set([0, 300, 600, 900, 1_200]);
    expect([...out].some((v) => !entrada.has(v))).toBe(true);
  });

  it('reset vuelve a empezar de cero', () => {
    // Lo llama cada sesión nueva: arrastrar la fase de una reunión anterior
    // sería empezar la siguiente con un empalme contra silencio.
    const up = new Upsampler16to24();
    const primero = up.process(new Int16Array(1_600)).length;
    up.process(new Int16Array(1_600));
    up.reset();

    expect(up.process(new Int16Array(1_600)).length).toBe(primero);
  });

  it('un bloque vacío no rompe nada', () => {
    expect(new Upsampler16to24().process(new Int16Array(0))).toHaveLength(0);
  });
});

describe('pcmToInt16', () => {
  it('lee PCM16 little-endian', () => {
    const buffer = Buffer.alloc(4);
    buffer.writeInt16LE(-1_234, 0);
    buffer.writeInt16LE(5_678, 2);

    expect([...pcmToInt16(buffer)]).toEqual([-1_234, 5_678]);
  });

  it('sobrevive a un Buffer con desplazamiento impar', () => {
    // `Buffer.subarray` puede devolver una vista con `byteOffset` impar, y un
    // `Int16Array` sobre ella lanza. Pasa con los chunks que llegan por IPC.
    const base = Buffer.alloc(5);
    base.writeInt16LE(4_321, 1);
    const impar = base.subarray(1);

    expect(impar.byteOffset % 2).toBe(1);
    expect(pcmToInt16(impar)[0]).toBe(4_321);
  });
});

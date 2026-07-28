import { describe, expect, it } from 'vitest';
import { PCM_WORKLET_SOURCE } from '../src/renderer/audio-worker/pcm-worklet';

/**
 * Ejecuta el worklet REAL en un sandbox.
 *
 * El código vive en un string porque se compila desde un Blob URL (ver el
 * comentario del módulo), así que no se puede importar. Se evalúa con las tres
 * cosas que el entorno de AudioWorklet le da como globales —`sampleRate`,
 * `AudioWorkletProcessor` y `registerProcessor`— y se le mete audio a mano.
 *
 * Merece la pena el montaje: es la única forma de comprobar el antialiasing
 * sobre el código que de verdad corre, en lugar de sobre una copia del
 * algoritmo que podría divergir.
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

  // A una const antes de comprobar: si no, el análisis de flujo de TypeScript
  // no ve la asignación de dentro del callback y estrecha el tipo a `never`.
  const Ctor = registered;
  if (!Ctor) throw new Error('el worklet no registró ningún procesador');
  const processor = new Ctor({ processorOptions: { targetRate: options.targetRate } });

  // 128 frames por llamada, que es lo que hace Chromium de verdad.
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

/** RMS normalizado a [0,1], descartando el arranque del filtro. */
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

describe('worklet de PCM', () => {
  it('remuestrea a la frecuencia pedida', () => {
    const out = runWorklet({
      sampleRate: IN_RATE,
      targetRate: TARGET,
      samples: tone(440, IN_RATE, 1),
    });
    // Un segundo de entrada debe dar ~16000 muestras, menos el último bloque
    // incompleto que todavía no se ha emitido.
    expect(out.length).toBeGreaterThan(TARGET * 0.9);
    expect(out.length).toBeLessThanOrEqual(TARGET);
  });

  it('deja pasar la banda de la voz sin tocarla', () => {
    // 1 kHz está en mitad de la banda útil del habla: tiene que salir intacto.
    const out = runWorklet({
      sampleRate: IN_RATE,
      targetRate: TARGET,
      samples: tone(1_000, IN_RATE, 1),
    });
    // RMS de una senoidal de amplitud 0,5 es 0,5/√2 ≈ 0,354.
    expect(rms(out)).toBeGreaterThan(0.3);
  });

  it('elimina el aliasing que arruinaba la transcripción', () => {
    // 12 kHz no cabe a 16 kHz: sin filtro se pliega a |12 − 16| = 4 kHz, justo
    // encima de los formantes. Como la entrada es un tono puro inaudible tras
    // el remuestreo, TODA la energía de salida sería alias.
    const out = runWorklet({
      sampleRate: IN_RATE,
      targetRate: TARGET,
      samples: tone(12_000, IN_RATE, 1),
    });

    const passband = rms(
      runWorklet({ sampleRate: IN_RATE, targetRate: TARGET, samples: tone(1_000, IN_RATE, 1) })
    );

    // Al menos 40 dB por debajo de lo que pasa en banda. Sin el filtro esta
    // relación era ~1: el tono de 12 kHz salía con toda su amplitud, convertido
    // en un 4 kHz que nunca se dijo.
    expect(rms(out)).toBeLessThan(passband / 100);
  });

  it('atenúa más cuanto más adentro de la banda de voz caería el pliegue', () => {
    const passband = rms(
      runWorklet({ sampleRate: IN_RATE, targetRate: TARGET, samples: tone(1_000, IN_RATE, 1) })
    );
    const level = (frequency: number): number =>
      rms(runWorklet({ sampleRate: IN_RATE, targetRate: TARGET, samples: tone(frequency, IN_RATE, 1) })) /
      passband;

    // 8 kHz es el punto de pliegue exacto: se mapea sobre sí mismo, así que no
    // llega a ensuciar nada y basta con que esté claramente atenuado.
    expect(level(8_000)).toBeLessThan(0.5);
    // 10 kHz caería sobre 6 kHz y 12 kHz sobre 4 kHz — justo encima de los
    // formantes. Cuanto más adentro aterriza, más hundido tiene que estar.
    expect(level(10_000)).toBeLessThan(level(8_000) / 4);
    expect(level(12_000)).toBeLessThan(level(10_000) / 4);
  });

  it('funciona con la otra frecuencia habitual de tarjeta', () => {
    // 44,1 kHz da una relación no entera (2,75625): el resampleador tiene que
    // arrastrar la parte fraccionaria sin desfasarse.
    const out = runWorklet({
      sampleRate: 44_100,
      targetRate: TARGET,
      samples: tone(1_000, 44_100, 1),
    });
    // El límite es holgado a propósito: sólo se emiten bloques completos de
    // 1600 muestras, así que la cola siempre se queda dentro del worklet.
    expect(out.length).toBeGreaterThan(TARGET * 0.85);
    expect(rms(out)).toBeGreaterThan(0.3);
  });
});

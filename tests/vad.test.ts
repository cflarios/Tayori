import { describe, expect, it } from 'vitest';
import { EnergyVAD } from '../src/main/core/vad';

const RATE = 16_000;

/** Genera un tono senoidal de la amplitud y duración indicadas. */
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
  it('cierra un turno tras el silencio configurado', () => {
    const vad = new EnergyVAD({ sampleRate: RATE, silenceMs: 300 });

    // Silencio inicial para que el suelo de ruido converja antes del habla.
    const utterances = vad.push(concat(silence(500), tone(800), silence(500)));

    expect(utterances).toHaveLength(1);
    expect(utterances[0]?.forced).toBe(false);
    // Incluye el padding previo, así que dura más que el habla en sí.
    expect(utterances[0]?.durationMs).toBeGreaterThanOrEqual(800);
  });

  it('no emite nada mientras el habla continúa', () => {
    const vad = new EnergyVAD({ sampleRate: RATE, silenceMs: 700 });

    const utterances = vad.push(concat(silence(400), tone(1500)));

    expect(utterances).toHaveLength(0);
  });

  it('descarta un pico demasiado corto para ser habla', () => {
    const vad = new EnergyVAD({ sampleRate: RATE, silenceMs: 300, minSpeechMs: 250 });

    // Un golpe: fuerte pero de 60 ms. Sin este filtro iría a Whisper y
    // devolvería una alucinación.
    const utterances = vad.push(concat(silence(500), tone(60, 0.9), silence(500)));

    expect(utterances).toHaveLength(0);
  });

  it('fuerza el corte si nadie hace una pausa', () => {
    const vad = new EnergyVAD({ sampleRate: RATE, silenceMs: 700, maxUtteranceMs: 1000 });

    // Sin corte forzado, quien habla sin pausas nunca se transcribiría.
    const utterances = vad.push(concat(silence(400), tone(3000)));

    expect(utterances.length).toBeGreaterThanOrEqual(2);
    expect(utterances.every((u) => u.forced)).toBe(true);
  });

  it('separa dos turnos distintos con una pausa en medio', () => {
    const vad = new EnergyVAD({ sampleRate: RATE, silenceMs: 300 });

    const utterances = vad.push(
      concat(silence(400), tone(600), silence(600), tone(600), silence(500))
    );

    expect(utterances).toHaveLength(2);
  });

  it('ignora el silencio puro', () => {
    const vad = new EnergyVAD({ sampleRate: RATE });
    expect(vad.push(silence(3000))).toHaveLength(0);
  });

  it('reconstruye frames a través de varios push', () => {
    const vad = new EnergyVAD({ sampleRate: RATE, silenceMs: 300 });
    const audio = concat(silence(500), tone(800), silence(500));

    // Trozos de tamaño arbitrario que no caen en frontera de frame: el resto
    // debe arrastrarse entre llamadas o se perderían muestras.
    const utterances: ReturnType<typeof vad.push> = [];
    const chunkSize = 777;
    for (let i = 0; i < audio.length; i += chunkSize) {
      utterances.push(...vad.push(audio.subarray(i, Math.min(i + chunkSize, audio.length))));
    }

    expect(utterances).toHaveLength(1);
  });

  it('flush recupera la última frase al parar la captura', () => {
    const vad = new EnergyVAD({ sampleRate: RATE, silenceMs: 700 });

    vad.push(concat(silence(400), tone(900)));
    const flushed = vad.flush();

    expect(flushed).not.toBeNull();
    expect(flushed?.forced).toBe(true);
  });

  it('flush no devuelve nada si no había habla activa', () => {
    const vad = new EnergyVAD({ sampleRate: RATE });
    vad.push(silence(1000));
    expect(vad.flush()).toBeNull();
  });

  it('reset limpia el estado interno', () => {
    const vad = new EnergyVAD({ sampleRate: RATE, silenceMs: 300 });

    vad.push(concat(silence(400), tone(600)));
    vad.reset();

    // Tras el reset no debe quedar habla a medias que se cierre sola.
    expect(vad.flush()).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { OpenAITranscribeSTT } from '../src/main/stt/openai-transcribe';
import type { TranscriptEvent } from '../src/main/stt/types';

/**
 * El motor por turnos, contra un servidor **de verdad**.
 *
 * Mismo criterio que con el proveedor de respuestas y con el broker de MQTT:
 * con un cliente simulado, mandar el modelo equivocado o perder el sesgo de
 * vocabulario pasaría el test igual. Lo que se comprueba es qué llega al otro
 * lado y qué se hace con lo que vuelve.
 */

/** Cuerpos multipart recibidos, en crudo. */
let received: string[] = [];
let reply = 'lo que se entendió';
let server: Server;

beforeEach(async () => {
  received = [];
  reply = 'lo que se entendió';

  server = createServer((req, res) => {
    let raw = '';
    req.setEncoding('latin1');
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      received.push(raw);
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(reply);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${port}/v1`;
});

afterEach(async () => {
  delete process.env.OPENAI_BASE_URL;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** Un segundo de tono: suficiente para que el VAD lo tome por voz y lo cierre. */
function tono(ms: number, sampleRate = 16_000): Buffer {
  const n = Math.round((sampleRate * ms) / 1000);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i += 1) pcm[i] = Math.round(Math.sin((i * 2 * Math.PI * 220) / sampleRate) * 8_000);
  return Buffer.from(pcm.buffer, pcm.byteOffset, n * 2);
}

const silencio = (ms: number, sampleRate = 16_000): Buffer =>
  Buffer.alloc(Math.round((sampleRate * ms) / 1000) * 2);

/** Habla, calla, y espera a que el turno cerrado llegue al servidor. */
async function hablar(stt: OpenAITranscribeSTT): Promise<TranscriptEvent[]> {
  const segments: TranscriptEvent[] = [];
  stt.events.on('segment', (event: TranscriptEvent) => segments.push(event));

  stt.push('them', tono(1_200));
  // Más silencio que el `silenceMs` del VAD (700 ms) para que cierre el turno.
  stt.push('them', silencio(1_000));

  // La transcripción va en cola: se espera a que el servidor haya contestado.
  for (let i = 0; i < 50 && received.length === 0; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
  return segments;
}

describe('OpenAITranscribeSTT', () => {
  it('manda el turno como WAV y emite lo que vuelve', async () => {
    const stt = new OpenAITranscribeSTT('sk-test');
    await stt.start({ sampleRate: 16_000, language: 'es', speakers: ['them'] });

    const segments = await hablar(stt);
    await stt.stop();

    expect(received).toHaveLength(1);
    // La cabecera RIFF viaja dentro del multipart: es lo que distingue mandar
    // un WAV de mandar PCM crudo, que la API rechaza.
    expect(received[0]).toContain('RIFF');
    expect(received[0]).toContain('gpt-transcribe');
    expect(segments).toEqual([
      { speaker: 'them', text: 'lo que se entendió', isFinal: true },
    ]);
  });

  it('un turno siempre llega cerrado', async () => {
    // Este motor no tiene parciales: el turno se transcribe entero de una vez.
    // Si emitiera `isFinal: false`, el detector de preguntas evaluaría frases a
    // medias y respondería a titubeos.
    const stt = new OpenAITranscribeSTT('sk-test');
    await stt.start({ sampleRate: 16_000, language: 'es', speakers: ['them'] });

    const segments = await hablar(stt);
    await stt.stop();

    expect(segments.every((s) => s.isFinal)).toBe(true);
  });

  it('pasa el vocabulario como sesgo del reconocedor', async () => {
    // Es la palanca de calidad más barata que tiene la app: los nombres propios
    // y las siglas del CV son justo lo que un ASR generalista falla.
    const stt = new OpenAITranscribeSTT('sk-test');
    await stt.start({
      sampleRate: 16_000,
      language: 'es',
      speakers: ['them'],
      vocabulary: ['Kubernetes', 'Tayori', 'PostgreSQL'],
    });

    await hablar(stt);
    await stt.stop();

    expect(received[0]).toContain('Kubernetes, Tayori, PostgreSQL');
  });

  it('con idioma automático no fuerza ninguno', async () => {
    /*
     * Forzar el idioma equivocado es el fallo que produjo aquel
     * "Are y'all gonna eat?" a partir de una frase en español, con el modelo
     * respondiendo impecablemente a algo que nadie dijo. Mandar `language: auto`
     * como si fuera un código sería reproducirlo.
     */
    const stt = new OpenAITranscribeSTT('sk-test');
    await stt.start({ sampleRate: 16_000, language: 'auto', speakers: ['them'] });

    await hablar(stt);
    await stt.stop();

    expect(received[0]).not.toContain('name="language"');
  });

  it('una respuesta vacía no emite un segmento en blanco', async () => {
    // Un segmento vacío ocuparía sitio en el transcript y podría disparar al
    // detector con nada dentro.
    reply = '   ';
    const stt = new OpenAITranscribeSTT('sk-test');
    await stt.start({ sampleRate: 16_000, language: 'es', speakers: ['them'] });

    const segments = await hablar(stt);
    await stt.stop();

    expect(received).toHaveLength(1);
    expect(segments).toHaveLength(0);
  });

  it('sólo abre carril para los hablantes que se escuchan', async () => {
    // Si `audioSources` es sólo el sistema, el audio del micrófono no debería
    // producir ninguna petición — se pagaría por transcribir lo que nadie pidió.
    const stt = new OpenAITranscribeSTT('sk-test');
    await stt.start({ sampleRate: 16_000, language: 'es', speakers: ['them'] });

    stt.push('me', tono(1_200));
    stt.push('me', silencio(1_000));
    await new Promise((resolve) => setTimeout(resolve, 120));
    await stt.stop();

    expect(received).toHaveLength(0);
  });
});

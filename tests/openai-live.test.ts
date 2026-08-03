import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import { OpenAILiveSTT } from '../src/main/stt/openai-live';
import type { TranscriptEvent } from '../src/main/stt/types';

/**
 * El motor en directo, contra un **servidor WebSocket real**.
 *
 * Este archivo existe por un fallo concreto: la primera versión mandaba
 * `turn_detection: { type: 'semantic_vad' }` porque parecía razonable, y la API
 * lo rechazó con *"Turn detection is not supported for this transcription
 * model"*. La referencia decía `null` y no se copió. Un test con el cliente
 * simulado habría pasado igual de contento.
 *
 * Y el segundo fallo era peor porque no da ningún error: sin
 * `input_audio_buffer.commit` el modelo emite parciales para siempre y **nunca
 * llega un segmento final**. La transcripción se ve en pantalla, todo parece
 * funcionar, y el auto-disparo —que sólo evalúa finales— no salta ni una vez.
 */

/** Todo lo que el cliente mandó, ya parseado. */
let received: Array<Record<string, unknown>> = [];
let sockets: WebSocket[] = [];
let server: Server;
let wss: WebSocketServer;
let baseUrl = '';

beforeEach(async () => {
  received = [];
  sockets = [];

  server = createServer();
  wss = new WebSocketServer({ server });

  wss.on('connection', (socket) => {
    sockets.push(socket);
    socket.on('message', (raw) => {
      received.push(JSON.parse(raw.toString()) as Record<string, unknown>);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `ws://127.0.0.1:${port}`;
});

afterEach(async () => {
  for (const socket of sockets) socket.close();
  wss.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** Un tono que el VAD toma por voz. */
function tono(ms: number, sampleRate = 16_000): Buffer {
  const n = Math.round((sampleRate * ms) / 1000);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i += 1) {
    pcm[i] = Math.round(Math.sin((i * 2 * Math.PI * 220) / sampleRate) * 8_000);
  }
  return Buffer.from(pcm.buffer, pcm.byteOffset, n * 2);
}

const silencio = (ms: number, sampleRate = 16_000): Buffer =>
  Buffer.alloc(Math.round((sampleRate * ms) / 1000) * 2);

const esperar = (ms = 60): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Arranca el motor contra el servidor local. */
async function arrancar(vocabulary?: string[]): Promise<OpenAILiveSTT> {
  const stt = new OpenAILiveSTT('sk-test', 'gpt-live-transcribe', baseUrl);
  await stt.start({
    sampleRate: 16_000,
    language: 'es',
    speakers: ['them'],
    ...(vocabulary ? { vocabulary } : {}),
  });
  await esperar();
  return stt;
}

const primero = (type: string): Record<string, unknown> | undefined =>
  received.find((event) => event.type === type);

describe('OpenAILiveSTT · la sesión', () => {
  it('apaga la detección de turnos, que es lo que este modelo exige', async () => {
    /*
     * El fallo real: con cualquier otra cosa aquí, la API contesta "Turn
     * detection is not supported for this transcription model" y la sesión no
     * arranca. Se fija el valor exacto porque es una copia de la referencia y
     * no una preferencia.
     */
    const stt = await arrancar();
    await stt.stop();

    const update = primero('session.update') as
      | { session?: { audio?: { input?: Record<string, unknown> } } }
      | undefined;

    expect(update?.session?.audio?.input?.turn_detection).toBeNull();
  });

  it('pide PCM a 24 kHz, que es lo único que acepta', async () => {
    const stt = await arrancar();
    await stt.stop();

    const update = primero('session.update') as
      | { session?: { audio?: { input?: { format?: Record<string, unknown> } } } }
      | undefined;

    expect(update?.session?.audio?.input?.format).toEqual({ type: 'audio/pcm', rate: 24_000 });
  });

  it('pasa el modelo, el idioma y el vocabulario', async () => {
    const stt = await arrancar(['Kubernetes', 'Tayori']);
    await stt.stop();

    const update = primero('session.update') as
      | { session?: { audio?: { input?: { transcription?: Record<string, unknown> } } } }
      | undefined;
    const transcription = update?.session?.audio?.input?.transcription;

    expect(transcription?.model).toBe('gpt-live-transcribe');
    expect(transcription?.languages).toEqual(['es']);
    expect(String(transcription?.prompt)).toContain('Kubernetes, Tayori');
  });

  it('con idioma automático no manda ninguno', async () => {
    // Forzar el idioma equivocado es el fallo que produjo aquel "Are y'all
    // gonna eat?" a partir de una frase en español.
    const stt = new OpenAILiveSTT('sk-test', 'gpt-live-transcribe', baseUrl);
    await stt.start({ sampleRate: 16_000, language: 'auto', speakers: ['them'] });
    await esperar();
    await stt.stop();

    const update = primero('session.update') as
      | { session?: { audio?: { input?: { transcription?: Record<string, unknown> } } } }
      | undefined;

    expect(update?.session?.audio?.input?.transcription?.languages).toBeUndefined();
  });
});

describe('OpenAILiveSTT · el audio y el turno', () => {
  it('manda el audio remuestreado a 24 kHz', async () => {
    const stt = await arrancar();
    stt.push('them', tono(100));
    await esperar();
    await stt.stop();

    const append = primero('input_audio_buffer.append');
    expect(append).toBeDefined();

    // 100 ms a 16 kHz son 1.600 muestras; a 24 kHz son 2.400, o sea 4.800
    // bytes. Es la comprobación de que el remuestreo ocurre de verdad y no se
    // manda el PCM original, que la API aceptaría interpretándolo más rápido.
    const bytes = Buffer.from(String(append!.audio), 'base64').length;
    expect(Math.abs(bytes - 4_800)).toBeLessThanOrEqual(4);
  });

  it('cierra el turno con un commit cuando el hablante calla', async () => {
    /*
     * ESTE es el test que importa. Sin el commit no llega nunca un segmento
     * final: la transcripción se ve, parece que todo va bien, y el auto-disparo
     * no salta jamás porque sólo evalúa finales. Un fallo sin ningún error.
     */
    const stt = await arrancar();

    stt.push('them', tono(1_200));
    stt.push('them', silencio(1_000)); // más que los 700 ms del VAD
    await esperar(120);
    await stt.stop();

    expect(received.some((event) => event.type === 'input_audio_buffer.commit')).toBe(true);
  });

  it('no hace commit mientras se sigue hablando', async () => {
    // Un commit por chunk partiría cada frase en trozos de 100 ms y el modelo
    // devolvería palabras sueltas sin contexto.
    const stt = await arrancar();

    for (let i = 0; i < 8; i += 1) stt.push('them', tono(100));
    await esperar(120);

    const commits = received.filter((e) => e.type === 'input_audio_buffer.commit').length;
    await stt.stop();

    expect(commits).toBe(0);
  });

  it('no hace commit sobre un buffer casi vacío', async () => {
    // La API rechaza un commit con menos de ~100 ms de audio, así que un
    // carraspeo suelto produciría un error de sesión por cada uno.
    const stt = await arrancar();

    stt.push('them', tono(30));
    stt.push('them', silencio(1_000));
    await esperar(120);

    const commits = received.filter((e) => e.type === 'input_audio_buffer.commit').length;
    await stt.stop();

    expect(commits).toBe(0);
  });
});

describe('OpenAILiveSTT · lo que vuelve', () => {
  it('emite los parciales y el final por separado', async () => {
    const stt = await arrancar();
    const segments: TranscriptEvent[] = [];
    stt.events.on('segment', (event: TranscriptEvent) => segments.push(event));

    sockets[0]!.send(
      JSON.stringify({
        type: 'conversation.item.input_audio_transcription.delta',
        delta: 'hola ',
      })
    );
    sockets[0]!.send(
      JSON.stringify({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'hola qué tal',
      })
    );
    await esperar();
    await stt.stop();

    // Los dos van marcados como acumulativos: el parcial porque lo acumula el
    // propio carril, y el final porque la API manda el turno entero.
    expect(segments).toEqual([
      // Se acumula tal cual llega, espacio final incluido: recortar aquí
      // partiría un token que todavía puede continuar. De limpiarlo se encarga
      // el buffer al guardarlo.
      { speaker: 'them', text: 'hola ', isFinal: false, cumulative: true },
      { speaker: 'them', text: 'hola qué tal', isFinal: true, cumulative: true },
    ]);
  });

  it('un error de la sesión no se queda callado', async () => {
    // Llega dentro de un socket que sigue abierto: sin mirarlo, la sesión se
    // quedaría viva y muda — audio entrando y ni una palabra saliendo.
    const stt = await arrancar();
    const errors: Error[] = [];
    stt.events.on('error', (err: Error) => errors.push(err));

    sockets[0]!.send(
      JSON.stringify({ type: 'error', error: { message: 'algo se rompió' } })
    );
    await esperar();
    await stt.stop();

    expect(errors[0]?.message).toContain('algo se rompió');
  });

  it('si rechaza el prompt, se reconecta sin él en vez de morir', async () => {
    /*
     * Perder el sesgo de vocabulario es perder calidad en los nombres propios.
     * Perder la sesión es perder la transcripción entera. Ante la duda sobre
     * qué acepta cada modelo, se degrada.
     */
    const stt = await arrancar(['Kubernetes']);

    sockets[0]!.send(
      JSON.stringify({ type: 'error', error: { message: 'Unknown parameter: prompt' } })
    );
    // El backoff más corto son 500 ms.
    await esperar(900);

    const updates = received.filter((e) => e.type === 'session.update');
    await stt.stop();

    expect(updates.length).toBeGreaterThanOrEqual(2);
    const ultimo = updates.at(-1) as {
      session?: { audio?: { input?: { transcription?: Record<string, unknown> } } };
    };
    expect(ultimo.session?.audio?.input?.transcription?.prompt).toBeUndefined();
  });
});

/**
 * La duplicación, que se vio en pantalla antes que en ningún test.
 *
 * Los `delta` son incrementales y el `completed` trae el turno ENTERO. La
 * primera versión los emitía tal cual y el buffer los concatenaba, así que la
 * frase aparecía dos veces — y la primera copia con las palabras partidas,
 * porque pegar trozos de token con la heurística de espacios del buffer mete
 * separadores donde no van ("conoz ca", "ingen ieros").
 */
describe('OpenAILiveSTT · el texto no se duplica', () => {
  it('acumula los deltas en crudo y los marca como acumulativos', async () => {
    const stt = await arrancar();
    const segments: TranscriptEvent[] = [];
    stt.events.on('segment', (event: TranscriptEvent) => segments.push(event));

    // Trozos de token, tal y como llegan: sin espacios entre "conoz" y "ca".
    for (const delta of ['Una persona que ', 'conoz', 'ca de DevOps']) {
      sockets[0]!.send(
        JSON.stringify({ type: 'conversation.item.input_audio_transcription.delta', delta })
      );
    }
    await esperar();
    await stt.stop();

    // Sin espacios inventados: la palabra no se parte.
    expect(segments.at(-1)?.text).toBe('Una persona que conozca de DevOps');
    expect(segments.every((s) => s.cumulative)).toBe(true);
  });

  it('el final reemplaza a los parciales, no se suma', async () => {
    const stt = await arrancar();
    const segments: TranscriptEvent[] = [];
    stt.events.on('segment', (event: TranscriptEvent) => segments.push(event));

    sockets[0]!.send(
      JSON.stringify({
        type: 'conversation.item.input_audio_transcription.delta',
        delta: 'Una persona que conozca de DevOps',
      })
    );
    sockets[0]!.send(
      JSON.stringify({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'Una persona que conozca de DevOps debería saber de seguridad.',
      })
    );
    await esperar();
    await stt.stop();

    const final = segments.at(-1)!;
    expect(final.isFinal).toBe(true);
    expect(final.cumulative).toBe(true);
    expect(final.text).toBe('Una persona que conozca de DevOps debería saber de seguridad.');
  });

  it('el turno siguiente empieza de cero', async () => {
    // Si `turnText` no se vaciara al cerrar, la segunda frase saldría pegada a
    // la primera y el transcript crecería sin parar dentro de un solo segmento.
    const stt = await arrancar();
    const segments: TranscriptEvent[] = [];
    stt.events.on('segment', (event: TranscriptEvent) => segments.push(event));

    sockets[0]!.send(
      JSON.stringify({ type: 'conversation.item.input_audio_transcription.delta', delta: 'primera' })
    );
    sockets[0]!.send(
      JSON.stringify({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'primera frase',
      })
    );
    sockets[0]!.send(
      JSON.stringify({ type: 'conversation.item.input_audio_transcription.delta', delta: 'segunda' })
    );
    await esperar();
    await stt.stop();

    expect(segments.at(-1)?.text).toBe('segunda');
  });
});

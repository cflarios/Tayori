import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';
import type { Speaker, STTProviderId } from '@shared/types';
import { pcmToInt16, Upsampler16to24 } from './resample';
import type { STTProvider, STTStartOptions } from './types';

/**
 * Transcripción en vivo con la API en tiempo real de OpenAI.
 *
 * Misma forma que `gemini-live` y por el mismo motivo: **una sesión por
 * hablante**. Cuesta una conexión más que mezclar los dos streams, y es lo que
 * mantiene exacta la atribución de quién dijo qué — con el audio mezclado el
 * transcript sale indistinguible.
 *
 * Tiene, además, una ventaja que Gemini Live no tiene: se abre con
 * `intent=transcription`, así que la sesión **es** un transcriptor. Gemini
 * obliga a pelear con un modelo conversacional que intenta responder —de ahí su
 * instrucción de silencio y el `modelTurn` que se tira— y aquí eso no existe:
 * no hay salida generada que pagar ni que descartar.
 *
 * Dos cosas de esta API que condicionan el archivo entero:
 *
 *  - **Sólo acepta PCM a 24 kHz.** Los tipos del SDK lo dicen sin matices y
 *    todo el pipeline de la app va a 16 kHz, así que hay que subir de
 *    frecuencia en el camino. Ver `resample.ts`, que explica por qué aquí la
 *    interpolación lineal basta y por qué el estado entre bloques no es
 *    opcional.
 *  - **El turno lo decide el servidor.** Con `turn_detection` de tipo VAD
 *    semántico, la API corta las frases sola: no se usa el `EnergyVAD` de la
 *    app. Es lo mismo que ya pasa con Gemini Live.
 */

/**
 * El modelo, y por qué éste.
 *
 * Es la recomendación de OpenAI para audio en directo —micrófonos, llamadas,
 * streams—, que es literalmente el caso de esta app. Los otros dos que se
 * barajaron no encajan, y conviene dejarlo escrito para que nadie los "añada"
 * más adelante creyendo que mejoran algo:
 *
 *  - `gpt-transcribe` es el recomendado para voz **grabada**. No es peor: es
 *    para otra cosa. Está disponible en el motor `openai-transcribe`, que
 *    trabaja por turnos ya cerrados y ahí sí es el bueno.
 *  - `gpt-4o-transcribe-diarize` separa hablantes. **Esta app ya sabe quién
 *    habla** —el micrófono es "yo" y el loopback son "ellos"— y esa decisión
 *    está tomada a conciencia desde el principio: el origen del stream es más
 *    exacto que cualquier diarización. Encima no admite `prompt`, así que
 *    costaría el sesgo de vocabulario, que es la palanca de calidad más barata
 *    que hay aquí. Lo único que aportaría es distinguir a varias personas
 *    **dentro** de "ellos" en una reunión de cuatro, que es una función
 *    distinta y no una mejora de ésta.
 */
export const OPENAI_LIVE_MODEL = 'gpt-live-transcribe';

/** La API en tiempo real, en modo transcripción. */
const REALTIME_URL = 'wss://api.openai.com/v1/realtime?intent=transcription';

/** Lo que la API exige. Ver `resample.ts`. */
const REALTIME_SAMPLE_RATE = 24_000;

/** Backoff de reconexión: una sesión larga se cierra por diseño, como en Gemini. */
const RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 5_000, 10_000];

/**
 * Tope del handshake.
 *
 * Mismo motivo que en `gemini-live`, donde costó una tarde: si el socket no
 * llega a establecerse, la promesa no resuelve ni rechaza y `startTranscription`
 * se queda colgado para siempre — la captura anunciando "Escuchando", el audio
 * entrando, y ni transcripción ni error por ninguna parte.
 */
const CONNECT_TIMEOUT_MS = 15_000;

/** Un carril = un WebSocket dedicado a un hablante. */
class Lane {
  private socket: WebSocket | null = null;
  private closed = false;
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private readonly upsampler = new Upsampler16to24();

  /**
   * Audio que llega mientras la sesión se reconecta. Acotado: preferimos perder
   * audio viejo a crecer sin techo durante un corte largo.
   */
  private pending: Buffer[] = [];
  private static readonly MAX_PENDING_CHUNKS = 50; // ~5 s a 100 ms/chunk

  constructor(
    private readonly speaker: Speaker,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly options: STTStartOptions,
    private readonly emitter: EventEmitter
  ) {}

  connect(): Promise<void> {
    this.closed = false;

    return new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(REALTIME_URL, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      this.socket = socket;

      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.close();
        reject(new Error(`[openai-live:${this.speaker}] handshake sin respuesta en 15s`));
      }, CONNECT_TIMEOUT_MS);

      const settle = (err?: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) reject(err);
        else resolve();
      };

      socket.on('open', () => {
        socket.send(JSON.stringify(this.sessionConfig()));
        this.reconnectAttempt = 0;
        this.upsampler.reset();
        this.flushPending();
        settle();
      });

      socket.on('message', (raw) => this.handleMessage(raw.toString()));

      socket.on('error', (err: Error) => {
        // Durante el handshake es la causa real —401, red caída— y hay que
        // devolverla en lugar de dejar que venza el reloj y decir "sin
        // respuesta", que manda a mirar donde no es.
        if (!settled) {
          settle(new Error(`[openai-live:${this.speaker}] ${err.message}`));
          return;
        }
        this.emitter.emit('error', new Error(`[openai-live:${this.speaker}] ${err.message}`));
      });

      socket.on('close', (code: number, reason: Buffer) => {
        this.socket = null;
        if (!settled) {
          const detail = reason.toString().trim();
          settle(
            new Error(
              `[openai-live:${this.speaker}] cerrado durante el handshake` +
                (detail ? `: ${detail} (código ${code})` : ` con código ${code}`)
            )
          );
          return;
        }
        // Un cierre después de estar en marcha es normal: la sesión tiene
        // límite de duración. Se reconecta salvo que hayamos parado a propósito.
        if (!this.closed) this.scheduleReconnect();
      });
    });
  }

  /**
   * La configuración de la sesión.
   *
   * `turn_detection` en `semantic_vad` y no en el VAD de energía de la app: es
   * el servidor quien decide dónde termina una frase, igual que en Gemini Live,
   * y hacerlo por semántica corta por final de idea en lugar de por silencio.
   */
  private sessionConfig(): unknown {
    const languages =
      this.options.language && this.options.language !== 'auto'
        ? { languages: [this.options.language] }
        : {};

    return {
      type: 'session.update',
      session: {
        type: 'transcription',
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: REALTIME_SAMPLE_RATE },
            transcription: {
              model: this.model,
              ...languages,
              // El sesgo de vocabulario, que en una entrevista es oro: nombres
              // de empresa y siglas son justo lo que un ASR generalista falla.
              ...(this.options.vocabulary?.length
                ? {
                    prompt: `Expect these terms: ${this.options.vocabulary.slice(0, 60).join(', ')}`,
                  }
                : {}),
            },
            turn_detection: { type: 'semantic_vad' },
          },
        },
      },
    };
  }

  private handleMessage(raw: string): void {
    let event: { type?: string; delta?: string; transcript?: string; error?: { message?: string } };
    try {
      event = JSON.parse(raw) as typeof event;
    } catch {
      return; // Un mensaje que no es JSON no es asunto nuestro.
    }

    switch (event.type) {
      /*
       * Los parciales llegan por `delta` y el cierre por `completed`. Se emiten
       * los dos: el overlay pinta el parcial para que se vea que la cosa está
       * viva, y `isFinal` es lo que deja al detector de preguntas evaluar el
       * turno una sola vez, cuando ya no va a cambiar.
       */
      case 'conversation.item.input_audio_transcription.delta':
        if (event.delta) {
          this.emitter.emit('segment', {
            speaker: this.speaker,
            text: event.delta,
            isFinal: false,
          });
        }
        return;

      case 'conversation.item.input_audio_transcription.completed':
        if (event.transcript) {
          this.emitter.emit('segment', {
            speaker: this.speaker,
            text: event.transcript,
            isFinal: true,
          });
        }
        return;

      /*
       * Un `error` llega **dentro** de un socket que sigue abierto, así que sin
       * mirarlo la sesión se quedaría viva y muda: audio entrando, ni una
       * palabra saliendo y ningún fallo a la vista. Es el patrón que este
       * proyecto persigue en todas partes.
       */
      case 'error':
        this.emitter.emit(
          'error',
          new Error(`[openai-live:${this.speaker}] ${event.error?.message ?? 'error de la sesión'}`)
        );
        return;

      default:
        return;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    const delay =
      RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)] ?? 10_000;
    this.reconnectAttempt += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.closed) return;
      this.connect().catch((err: unknown) => {
        this.emitter.emit(
          'error',
          new Error(
            `[openai-live:${this.speaker}] falló la reconexión: ${
              err instanceof Error ? err.message : String(err)
            }`
          )
        );
        this.scheduleReconnect();
      });
    }, delay);
  }

  private flushPending(): void {
    const queued = this.pending;
    this.pending = [];
    for (const chunk of queued) this.send(chunk);
  }

  push(pcm: Buffer): void {
    if (this.closed) return;
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.pending.push(pcm);
      if (this.pending.length > Lane.MAX_PENDING_CHUNKS) this.pending.shift();
      return;
    }
    this.send(pcm);
  }

  private send(pcm: Buffer): void {
    /*
     * El remuestreo va aquí y no en quien llama porque el upsampler **tiene
     * estado**: es por carril, y compartir uno entre los dos hablantes mezclaría
     * la fase de dos audios distintos.
     */
    const up = this.upsampler.process(pcmToInt16(pcm));
    if (up.length === 0) return;

    const audio = Buffer.from(up.buffer, up.byteOffset, up.length * 2).toString('base64');
    try {
      this.socket?.send(JSON.stringify({ type: 'input_audio_buffer.append', audio }));
    } catch {
      // Un envío que falla casi siempre es un socket muerto: se deja que el
      // `close` dispare la reconexión en vez de gritar por cada chunk.
      this.socket = null;
      this.pending.push(pcm);
      if (this.pending.length > Lane.MAX_PENDING_CHUNKS) this.pending.shift();
    }
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.pending = [];
    try {
      this.socket?.close();
    } catch {
      // Cerrar un socket ya caído lanza; da igual, es el estado que queríamos.
    }
    this.socket = null;
  }
}

export class OpenAILiveSTT implements STTProvider {
  readonly id: STTProviderId = 'openai-live';
  readonly events = new EventEmitter();

  private lanes = new Map<Speaker, Lane>();

  constructor(
    private readonly apiKey: string,
    private readonly model: string = OPENAI_LIVE_MODEL
  ) {}

  async start(options: STTStartOptions): Promise<void> {
    await this.stop();

    for (const speaker of options.speakers) {
      this.lanes.set(speaker, new Lane(speaker, this.apiKey, this.model, options, this.events));
    }

    // En paralelo: en serie se sumarían los handshakes y el primer segundo de
    // la reunión entraría sin transcribir.
    await Promise.all([...this.lanes.values()].map((lane) => lane.connect()));
  }

  push(speaker: Speaker, pcm: Buffer): void {
    this.lanes.get(speaker)?.push(pcm);
  }

  async stop(): Promise<void> {
    for (const lane of this.lanes.values()) lane.close();
    this.lanes.clear();
  }

  /**
   * Abre una sesión de verdad y la cierra. Es lo que hay detrás de «Probar
   * transcripción»: comprobar que existe la clave no habría detectado ninguno
   * de los fallos reales de este proyecto.
   */
  async testConnection(language: string): Promise<{ ok: boolean; detail: string }> {
    const probe = new Lane(
      'them',
      this.apiKey,
      this.model,
      { sampleRate: 16_000, language, speakers: ['them'] },
      new EventEmitter()
    );
    try {
      await probe.connect();
      return { ok: true, detail: `Sesión abierta con "${this.model}".` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    } finally {
      probe.close();
    }
  }
}

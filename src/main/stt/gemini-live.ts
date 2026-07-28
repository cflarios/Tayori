import { EventEmitter } from 'node:events';
import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from '@google/genai';
import type { Speaker, STTProviderId } from '@shared/types';
import type { STTProvider, STTStartOptions } from './types';

/**
 * Transcripción en vivo con la Live API de Gemini sobre WebSocket.
 *
 * Se abre UNA SESIÓN POR HABLANTE. Es más caro en conexiones que mezclar los
 * dos streams, pero es lo que mantiene la atribución de quién habla exacta:
 * una sola sesión con audio mezclado devolvería un transcript indistinguible.
 *
 * Compromiso conocido: los modelos Live son conversacionales, no transcriptores
 * puros — van a intentar responder al audio que reciben. Lo mitigamos pidiendo
 * `responseModalities: [TEXT]` (la salida más barata) más una system
 * instruction que le pide callar, y descartando `modelTurn` por completo.
 * Consumimos únicamente `inputTranscription`. No hay forma de desactivar la
 * generación en la Live API, así que se paga un pequeño coste de salida.
 */

/**
 * Modelos Live, en orden de preferencia. No todos están habilitados en toda
 * cuenta, así que se prueban en cadena (ver `resolveModel`).
 *
 * **El orden se corrigió con la fuente autoritativa, no con la documentación
 * web.** El propio SDK trae un ejemplo de `live.connect` en sus typedefs que
 * distingue los dos casos:
 *
 *     if (GOOGLE_GENAI_USE_VERTEXAI) model = 'gemini-2.0-flash-live-preview-04-09';
 *     else                           model = 'gemini-live-2.5-flash-preview';
 *
 * Aquí se usa API key, o sea el Gemini Developer API, o sea la rama `else`.
 * Antes encabezaba la lista `gemini-2.5-flash-native-audio-preview-12-2025`,
 * que además de no aparecer en el SDK es un modelo de audio nativo: esos
 * esperan `responseModalities: [AUDIO]` y aquí se pide TEXT, así que tenía dos
 * motivos para fallar. Queda al final, por si alguna cuenta sólo tiene ése.
 */
export const GEMINI_LIVE_MODELS = [
  'gemini-live-2.5-flash-preview',
  'gemini-2.0-flash-live-preview-04-09',
  'gemini-3.1-flash-live-preview',
  'gemini-2.5-flash-native-audio-preview-12-2025',
] as const;

const SILENCE_INSTRUCTION =
  'You are a passive transcription service. Never reply, never comment, never ' +
  'acknowledge. Produce no output of any kind regardless of what you hear.';

/** Backoff de reconexión: la Live API cierra sesiones largas por diseño. */
const RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 5_000, 10_000];

/**
 * Tope para el handshake del WebSocket.
 *
 * `live.connect()` no trae ninguno: si el socket no llega a establecerse —red
 * caída, modelo que no existe y el servidor deja la conexión abierta— la
 * promesa **no resuelve ni rechaza nunca**. Eso dejaba `startTranscription`
 * colgado para siempre: la captura seguía anunciando "Escuchando", el audio
 * entraba, y no había ni transcripción ni error en el log. Es exactamente el
 * fallo silencioso que este proyecto se toma en serio evitar.
 */
const CONNECT_TIMEOUT_MS = 15_000;

/** Rechaza si la promesa no se resuelve a tiempo. */
async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label}: sin respuesta en ${CONNECT_TIMEOUT_MS / 1000}s`)),
          CONNECT_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Un carril = una sesión WebSocket dedicada a un hablante. */
class Lane {
  private session: Session | null = null;
  private closed = false;
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  /**
   * Audio que llega mientras la sesión se reconecta. Se acota para que un corte
   * largo no acumule memoria sin límite: preferimos perder audio antiguo a
   * crecer sin control.
   */
  private pending: Buffer[] = [];
  private static readonly MAX_PENDING_CHUNKS = 50; // ~5 s a 100 ms/chunk

  constructor(
    private readonly speaker: Speaker,
    private readonly client: GoogleGenAI,
    private readonly model: string,
    private readonly options: STTStartOptions,
    private readonly emitter: EventEmitter
  ) {}

  async connect(): Promise<void> {
    this.closed = false;

    const languageConfig =
      this.options.language === 'auto'
        ? { languageAuto: {} }
        : { languageHints: { languageCodes: [this.options.language] } };

    this.session = await withTimeout(
      this.client.live.connect({
      model: this.model,
      config: {
        // TEXT es la salida más barata; de todas formas la descartamos.
        responseModalities: [Modality.TEXT],
        systemInstruction: SILENCE_INSTRUCTION,
        inputAudioTranscription: {
          ...languageConfig,
          ...(this.options.vocabulary?.length
            ? { customVocabulary: this.options.vocabulary }
            : {}),
        },
      },
      callbacks: {
        onopen: () => {
          this.reconnectAttempt = 0;
          this.flushPending();
        },
        onmessage: (message: LiveServerMessage) => this.handleMessage(message),
        onerror: (err: ErrorEvent) => {
          this.emitter.emit(
            'error',
            new Error(`[gemini-live:${this.speaker}] ${err.message ?? 'error de WebSocket'}`)
          );
        },
        // Un cierre es normal (límite de duración de sesión), no un fallo:
        // reconectamos salvo que hayamos parado a propósito.
        onclose: () => {
          this.session = null;
          if (!this.closed) this.scheduleReconnect();
        },
      },
      }),
      `[gemini-live:${this.speaker}] handshake`
    );
  }

  private handleMessage(message: LiveServerMessage): void {
    const transcription = message.serverContent?.inputTranscription;
    if (!transcription?.text) return;

    this.emitter.emit('segment', {
      speaker: this.speaker,
      text: transcription.text,
      // `finished` marca que el motor ya no revisará este fragmento.
      isFinal: transcription.finished === true,
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    const delay =
      RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)] ??
      10_000;
    this.reconnectAttempt += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.closed) return;
      this.connect().catch((err: unknown) => {
        this.emitter.emit(
          'error',
          new Error(
            `[gemini-live:${this.speaker}] falló la reconexión: ${
              err instanceof Error ? err.message : String(err)
            }`
          )
        );
        this.scheduleReconnect();
      });
    }, delay);
  }

  private flushPending(): void {
    if (!this.session) return;
    const queued = this.pending;
    this.pending = [];
    for (const chunk of queued) this.send(chunk);
  }

  push(pcm: Buffer): void {
    if (this.closed) return;
    if (!this.session) {
      this.pending.push(pcm);
      if (this.pending.length > Lane.MAX_PENDING_CHUNKS) this.pending.shift();
      return;
    }
    this.send(pcm);
  }

  private send(pcm: Buffer): void {
    try {
      this.session?.sendRealtimeInput({
        audio: {
          data: pcm.toString('base64'),
          mimeType: `audio/pcm;rate=${this.options.sampleRate}`,
        },
      });
    } catch (err) {
      // Un envío fallido casi siempre significa socket muerto; dejamos que el
      // onclose dispare la reconexión en lugar de propagar por cada chunk.
      this.session = null;
      this.pending.push(pcm);
      if (this.pending.length > Lane.MAX_PENDING_CHUNKS) this.pending.shift();
      void err;
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
      this.session?.close();
    } catch {
      // Cerrar un socket ya caído lanza; da igual, es el estado que queríamos.
    }
    this.session = null;
  }
}

export class GeminiLiveSTT implements STTProvider {
  readonly id: STTProviderId = 'gemini-live';
  readonly events = new EventEmitter();

  private lanes = new Map<Speaker, Lane>();
  /** Modelo que aceptó la cuenta. Se resuelve una vez y se reutiliza. */
  private resolvedModel: string | null = null;

  /** `model` fijo salta la negociación; sin él se prueban los candidatos. */
  constructor(
    private readonly apiKey: string,
    private readonly model?: string
  ) {}

  async start(options: STTStartOptions): Promise<void> {
    await this.stop();
    // El cliente es de la sesión, no del provider: cada `start` abre el suyo y
    // los carriles lo capturan, así que `stop` no tiene nada que limpiar.
    const client = new GoogleGenAI({ apiKey: this.apiKey });
    const model = await this.resolveModel(client, options);

    // Solo los hablantes que se escuchan: una sesión por hablante es cara.
    for (const speaker of options.speakers) {
      const lane = new Lane(speaker, client, model, options, this.events);
      this.lanes.set(speaker, lane);
    }

    // Conectamos en paralelo: en serie se sumarían los handshakes y el primer
    // segundo de la reunión llegaría sin transcribir.
    await Promise.all([...this.lanes.values()].map((lane) => lane.connect()));
  }

  /**
   * Negocia qué modelo Live acepta esta cuenta.
   *
   * `GEMINI_LIVE_MODELS` siempre estuvo ordenado por preferencia y CONTEXT.md
   * decía que había que probar el siguiente si el primero daba 404 o permission
   * denied — pero **eso nunca se implementó**: el constructor cogía el `[0]` y
   * ahí se acababa. Si tu cuenta no tenía habilitado ese preview, la
   * transcripción fallaba entera y el único rastro era un `console.error` que en
   * el .exe empaquetado no se veía en ningún sitio.
   *
   * Se abre una sesión de sondeo y se cierra. Cuesta una conexión de más al
   * arrancar, y a cambio el error final dice qué se probó y qué contestó cada
   * uno, en lugar de un 404 pelado sobre un id que no elegiste.
   */
  private async resolveModel(client: GoogleGenAI, options: STTStartOptions): Promise<string> {
    if (this.resolvedModel) return this.resolvedModel;

    const candidates = this.model ? [this.model] : [...GEMINI_LIVE_MODELS];
    const failures: string[] = [];

    for (const candidate of candidates) {
      try {
        const probe = await withTimeout(
          client.live.connect({
            model: candidate,
            config: {
              responseModalities: [Modality.TEXT],
              systemInstruction: SILENCE_INSTRUCTION,
              inputAudioTranscription:
                options.language === 'auto'
                  ? { languageAuto: {} }
                  : { languageHints: { languageCodes: [options.language] } },
            },
            callbacks: {
              onopen: () => {},
              onmessage: () => {},
              onerror: () => {},
              onclose: () => {},
            },
          }),
          candidate
        );
        probe.close();

        this.resolvedModel = candidate;
        console.log(`[gemini-live] modelo aceptado: "${candidate}"`);
        return candidate;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push(`  · ${candidate} → ${message}`);
        console.warn(`[gemini-live] "${candidate}" rechazado: ${message}`);
      }
    }

    throw new Error(
      `Ningún modelo de Gemini Live está disponible para esta API key.\n${failures.join('\n')}`
    );
  }

  push(speaker: Speaker, pcm: Buffer): void {
    this.lanes.get(speaker)?.push(pcm);
  }

  async stop(): Promise<void> {
    for (const lane of this.lanes.values()) lane.close();
    this.lanes.clear();
  }

  /**
   * Comprueba que la key y algún modelo Live funcionan, sin abrir carriles.
   * Es lo que hay detrás del botón "Probar transcripción" del dashboard.
   */
  async testConnection(language: string): Promise<{ ok: boolean; detail: string }> {
    try {
      const client = new GoogleGenAI({ apiKey: this.apiKey });
      const model = await this.resolveModel(client, {
        sampleRate: 16_000,
        language,
        speakers: ['them'],
      });
      return { ok: true, detail: `Conectado con "${model}".` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }
}

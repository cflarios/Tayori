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
 * Modelos Live disponibles. La documentación de Google lista varios y no todos
 * están habilitados en toda cuenta, así que el orden es de preferencia y el
 * primero es el default. Si uno da 404/permission denied, probar el siguiente.
 */
export const GEMINI_LIVE_MODELS = [
  'gemini-2.5-flash-native-audio-preview-12-2025',
  'gemini-live-2.5-flash-preview',
  'gemini-3.1-flash-live-preview',
] as const;

const SILENCE_INSTRUCTION =
  'You are a passive transcription service. Never reply, never comment, never ' +
  'acknowledge. Produce no output of any kind regardless of what you hear.';

/** Backoff de reconexión: la Live API cierra sesiones largas por diseño. */
const RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 5_000, 10_000];

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

    this.session = await this.client.live.connect({
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
    });
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
  private client: GoogleGenAI | null = null;

  constructor(
    private readonly apiKey: string,
    private readonly model: string = GEMINI_LIVE_MODELS[0]
  ) {}

  async start(options: STTStartOptions): Promise<void> {
    await this.stop();
    this.client = new GoogleGenAI({ apiKey: this.apiKey });

    for (const speaker of ['me', 'them'] as const) {
      const lane = new Lane(speaker, this.client, this.model, options, this.events);
      this.lanes.set(speaker, lane);
    }

    // Conectamos en paralelo: en serie se sumarían los handshakes y el primer
    // segundo de la reunión llegaría sin transcribir.
    await Promise.all([...this.lanes.values()].map((lane) => lane.connect()));
  }

  push(speaker: Speaker, pcm: Buffer): void {
    this.lanes.get(speaker)?.push(pcm);
  }

  async stop(): Promise<void> {
    for (const lane of this.lanes.values()) lane.close();
    this.lanes.clear();
    this.client = null;
  }
}

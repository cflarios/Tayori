import { EventEmitter } from 'node:events';
import OpenAI, { toFile } from 'openai';
import type { Speaker, STTProviderId } from '@shared/types';
import { EnergyVAD, type Utterance } from '../core/vad';
import { toWav } from './wav';
import { pcmToInt16 } from './resample';
import type { STTProvider, STTStartOptions } from './types';

/**
 * Transcripción por turnos con la API de audio de OpenAI.
 *
 * Es el mismo camino que `whisper-local` —VAD, WAV, una petición por turno— con
 * el modelo en la nube en lugar de en la máquina. No hay WebSocket, no hay
 * remuestreo y no hay sesión que reconectar: se manda un WAV de 16 kHz y vuelve
 * texto.
 *
 * **El modelo es `gpt-transcribe`, y es la recomendación de OpenAI** para
 * transcribir voz grabada, que es exactamente lo que produce un VAD: trozos ya
 * cerrados. Para audio en directo su recomendación es otra —`gpt-live-transcribe`,
 * ver `openai-live.ts`— y la diferencia entre los dos motores es justo ésa:
 *
 * | | Latencia | Qué manda |
 * |---|---|---|
 * | `openai-live` | ~300 ms, con parciales | Streaming continuo |
 * | `openai-transcribe` | ~1 s por turno | El turno entero de una vez |
 *
 * Este de aquí **oye la frase completa antes de decidir**, así que acierta más
 * en nombres propios y en finales de palabra; el otro empieza a escribir antes.
 * Cuál conviene depende de si lo que duele es la latencia o los errores.
 *
 * **Y aquí sí se puede sesgar el reconocedor.** `prompt` acepta texto libre, así
 * que el vocabulario que sale de los context packs —nombres de empresa, siglas,
 * tecnologías— entra igual que entra en Whisper por `--prompt` y en Gemini por
 * `customVocabulary`. Es la palanca de calidad más barata que tiene esta app y
 * la razón de que `gpt-4o-transcribe-diarize` no esté aquí: ese modelo **no
 * admite prompt**, y a cambio ofrece separar hablantes, que es un dato que esta
 * app ya tiene por construcción (micrófono contra salida del sistema).
 */

/** El recomendado por OpenAI para voz ya grabada, que es lo que da un VAD. */
export const OPENAI_TRANSCRIBE_MODEL = 'gpt-transcribe';

/**
 * Tope de términos del sesgo.
 *
 * El `prompt` gasta contexto del propio reconocedor, y un CV entero metido ahí
 * deja de ser una pista para convertirse en ruido que compite con el audio. Es
 * el mismo número que se le pasa a Whisper.
 */
const MAX_VOCABULARY_TERMS = 60;

/** Carril por hablante: su VAD y su cola en serie. */
class Lane {
  private readonly vad: EnergyVAD;
  /**
   * En serie y no en paralelo. Dos turnos del mismo hablante a la vez pueden
   * volver desordenados, y una transcripción con las frases cambiadas de sitio
   * es peor que una lenta: el detector de preguntas ve otra conversación.
   */
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;

  constructor(
    private readonly speaker: Speaker,
    private readonly transcribe: (utterance: Utterance) => Promise<string>,
    private readonly emitter: EventEmitter,
    sampleRate: number
  ) {
    this.vad = new EnergyVAD({ sampleRate, silenceMs: 700, maxUtteranceMs: 20_000 });
  }

  push(pcm: Int16Array): void {
    for (const utterance of this.vad.push(pcm)) {
      if (utterance.forced) {
        console.warn(
          `[vad:${this.speaker}] corte FORZADO a ${Math.round(utterance.durationMs / 1000)}s ` +
            `(suelo de ruido ${this.vad.currentNoiseFloor.toFixed(4)}).`
        );
      }
      this.enqueue(utterance);
    }
  }

  flush(): void {
    const remaining = this.vad.flush();
    if (remaining) this.enqueue(remaining);
  }

  private enqueue(utterance: Utterance): void {
    this.pending += 1;
    this.queue = this.queue.then(async () => {
      const startedAt = Date.now();
      try {
        const text = await this.transcribe(utterance);
        const tookMs = Date.now() - startedAt;

        if (!text) {
          console.log(`[openai-transcribe:${this.speaker}] sin texto (${tookMs}ms)`);
        } else {
          console.log(`[openai-transcribe:${this.speaker}] "${text}" (${tookMs}ms)`);
          this.emitter.emit('segment', { speaker: this.speaker, text, isFinal: true });
        }
      } catch (err) {
        this.emitter.emit(
          'error',
          new Error(
            `[openai-transcribe:${this.speaker}] ${err instanceof Error ? err.message : String(err)}`
          )
        );
      } finally {
        this.pending -= 1;
      }
    });
  }

  reset(): void {
    this.vad.reset();
  }
}

export class OpenAITranscribeSTT implements STTProvider {
  readonly id: STTProviderId = 'openai-transcribe';
  readonly events = new EventEmitter();

  private client: OpenAI;
  private lanes = new Map<Speaker, Lane>();
  private options: STTStartOptions | null = null;
  private stopped = false;

  constructor(
    apiKey: string,
    private readonly model: string = OPENAI_TRANSCRIBE_MODEL
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async start(options: STTStartOptions): Promise<void> {
    await this.stop();
    this.stopped = false;
    this.options = options;

    for (const speaker of options.speakers) {
      this.lanes.set(
        speaker,
        new Lane(
          speaker,
          (utterance) => this.transcribe(utterance),
          this.events,
          options.sampleRate
        )
      );
    }
  }

  push(speaker: Speaker, pcm: Buffer): void {
    if (this.stopped) return;
    this.lanes.get(speaker)?.push(pcmToInt16(pcm));
  }

  async stop(): Promise<void> {
    this.stopped = true;
    // Cerrar el turno que estuviera abierto: si alguien para justo después de
    // hablar, esa última frase todavía vale.
    for (const lane of this.lanes.values()) {
      lane.flush();
      lane.reset();
    }
    this.lanes.clear();
  }

  private async transcribe(utterance: Utterance): Promise<string> {
    const options = this.options;
    if (!options) return '';

    const wav = toWav(utterance.pcm, options.sampleRate);
    const file = await toFile(wav, 'turn.wav', { type: 'audio/wav' });

    // `unknown` a propósito: el SDK tipa esto como `string` con
    // `response_format: 'text'`, y la comprobación de abajo dejaría de
    // compilar por "imposible". Es una comprobación barata sobre lo que
    // devuelve un servidor, que es justo donde no conviene fiarse del tipo.
    const result: unknown = await this.client.audio.transcriptions.create({
      file,
      model: this.model,
      // `auto` se omite: el modelo detecta el idioma, y forzar el equivocado es
      // el fallo que produjo aquel "Are y'all gonna eat?" a partir de una frase
      // en español (ver CONTEXT §4).
      ...(options.language && options.language !== 'auto' ? { language: options.language } : {}),
      ...(options.vocabulary?.length
        ? { prompt: options.vocabulary.slice(0, MAX_VOCABULARY_TERMS).join(', ') }
        : {}),
      // Texto plano: no se usan ni marcas de tiempo ni segmentos, y pedir JSON
      // verboso sería pagar por campos que nadie lee.
      response_format: 'text',
    });

    // Con `response_format: 'text'` la API devuelve la cadena pelada, pero el
    // SDK la tipa como el objeto del formato JSON. Se acepta cualquiera de las
    // dos formas en lugar de confiar en una.
    const text =
      typeof result === 'string' ? result : ((result as { text?: string }).text ?? '');
    return text.trim();
  }

  /** Lo que hay detrás de «Probar transcripción» en el dashboard. */
  async testConnection(): Promise<{ ok: boolean; detail: string }> {
    try {
      /*
       * Se manda medio segundo de silencio de verdad. Comprobar sólo que la
       * clave existe no habría detectado ninguno de los fallos que se han dado
       * en este proyecto: una cuenta sin acceso al modelo contesta igual de
       * bien a "¿tienes clave?" y falla en la primera frase.
       */
      const silence = new Int16Array(8_000);
      const file = await toFile(toWav(silence, 16_000), 'probe.wav', { type: 'audio/wav' });
      await this.client.audio.transcriptions.create({
        file,
        model: this.model,
        response_format: 'text',
      });
      return { ok: true, detail: `Conectado con "${this.model}".` };
    } catch (err) {
      return { ok: false, detail: toDetail(err) };
    }
  }
}

/** Mensajes accionables, con las clases tipadas del SDK. */
export function toDetail(err: unknown): string {
  if (err instanceof OpenAI.AuthenticationError) return 'La API key de OpenAI no es válida.';
  if (err instanceof OpenAI.PermissionDeniedError) {
    return 'Tu cuenta de OpenAI no tiene acceso a este modelo de transcripción.';
  }
  if (err instanceof OpenAI.RateLimitError) {
    return 'Límite de peticiones de OpenAI alcanzado, o la cuenta se ha quedado sin saldo.';
  }
  if (err instanceof OpenAI.NotFoundError) {
    return 'El modelo de transcripción no existe o tu cuenta no tiene acceso.';
  }
  if (err instanceof OpenAI.APIConnectionError) return 'Sin conexión con la API de OpenAI.';
  return err instanceof Error ? err.message : String(err);
}

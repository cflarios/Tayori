import type { EventEmitter } from 'node:events';
import type { Speaker, STTProviderId } from '@shared/types';

/**
 * Contrato que debe cumplir todo motor de transcripción.
 *
 * La abstracción existe para que Gemini Live (nube, baja latencia) y
 * whisper.cpp (local, offline) sean intercambiables desde el dashboard sin que
 * el orquestador sepa cuál está activo. Añadir Deepgram o Soniox después es
 * un archivo nuevo más una entrada en el factory.
 */

export interface TranscriptEvent {
  speaker: Speaker;
  text: string;
  /** `false` mientras el motor aún puede revisar el texto. */
  isFinal: boolean;
}

export interface STTStartOptions {
  /** Siempre 16000: el worklet ya normaliza a esa frecuencia. */
  sampleRate: number;
  /** BCP-47, o `'auto'` para detección automática. */
  language: string;
  /**
   * Hablantes que se van a escuchar realmente.
   *
   * Importa porque Gemini Live abre una sesión WebSocket por hablante: crear la
   * del micrófono cuando el usuario eligió escuchar solo el sistema gastaría una
   * conexión que nunca recibe audio.
   */
  speakers: Speaker[];
  /**
   * Términos que sesgan el reconocedor. En una entrevista son oro: nombres de
   * empresa, siglas y tecnologías son justo lo que un ASR generalista falla.
   */
  vocabulary?: string[];
}

/**
 * Un provider emite:
 *   - `segment` → TranscriptEvent
 *   - `error`   → Error (no fatal; el orquestador decide qué hacer)
 */
export interface STTProvider {
  readonly id: STTProviderId;
  readonly events: EventEmitter;

  start(options: STTStartOptions): Promise<void>;
  /** PCM16 little-endian mono a `sampleRate`. */
  push(speaker: Speaker, pcm: Buffer): void;
  stop(): Promise<void>;
}

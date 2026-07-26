import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { Answer, AnswerTrigger, ImageAttachment, Settings } from '@shared/types';
import { settingsStore } from '../config/store';
import { createLLMProvider, LLMError } from '../llm';
import { buildSystemPrompt } from './prompt';
import type { TranscriptBuffer } from './transcript-buffer';

/**
 * Genera respuestas y las va emitiendo mientras llegan.
 *
 * Regla central: SOLO UNA respuesta en vuelo. Si llega una pregunta nueva, se
 * aborta la anterior. En una conversación en directo una respuesta obsoleta es
 * peor que ninguna: el usuario la lee y contesta a algo que ya pasó.
 *
 * Emite `answer` con el estado completo en cada actualización, en lugar de sólo
 * el delta, para que el renderer no tenga que reconstruir el estado.
 */

/** Tope de salida. Corto a propósito: hay que poder leerlo de un vistazo. */
const MAX_ANSWER_TOKENS = 700;

/** Cada cuántos ms se difunde el texto acumulado durante el streaming. */
const FLUSH_INTERVAL_MS = 60;

export class AnswerEngine extends EventEmitter {
  private current: Answer | null = null;
  private controller: AbortController | null = null;
  /** Capturas pendientes de adjuntar a la siguiente consulta. */
  private pendingImages: ImageAttachment[] = [];

  constructor(private readonly transcript: TranscriptBuffer) {
    super();
  }

  /** Adjunta una captura a la siguiente pregunta. */
  attachImage(image: ImageAttachment): void {
    this.pendingImages.push(image);
  }

  get hasPendingImages(): boolean {
    return this.pendingImages.length > 0;
  }

  /** Cancela la generación en curso, si hay alguna. */
  abort(): void {
    this.controller?.abort();
    this.controller = null;
    if (this.current && (this.current.status === 'thinking' || this.current.status === 'streaming')) {
      this.update({ status: 'aborted' });
    }
  }

  /**
   * Lanza una respuesta.
   *
   * @param question Pregunta concreta si se pudo aislar; si no, el modelo la
   *                 deduce de la transcripción.
   */
  async ask(trigger: AnswerTrigger, question?: string): Promise<void> {
    // Abortar antes de arrancar es lo que garantiza la invariante de "una sola
    // en vuelo" sin importar desde dónde se llame.
    this.abort();

    const settings = settingsStore.get();
    const controller = new AbortController();
    this.controller = controller;

    const images = this.pendingImages;
    this.pendingImages = [];

    this.current = {
      id: randomUUID(),
      status: 'thinking',
      trigger,
      question: question ?? '',
      text: '',
      providerId: settings.llmProviderId,
      model: settings.llmModels[settings.llmProviderId],
      createdAt: Date.now(),
    };
    this.emitCurrent();

    try {
      const provider = createLLMProvider(settings);
      const stream = provider.streamAnswer(
        {
          systemPrompt: buildSystemPrompt(settings),
          transcript: this.transcript.format(
            this.transcript.recent(settings.manualContextSeconds)
          ),
          ...(question ? { question } : {}),
          // Un modelo sin visión ignoraría las imágenes silenciosamente; mejor
          // no enviarlas y ahorrar el ancho de banda.
          ...(provider.supportsVision && images.length ? { images } : {}),
          maxTokens: MAX_ANSWER_TOKENS,
        },
        controller.signal
      );

      await this.consume(stream, controller, settings);
    } catch (err) {
      if (controller.signal.aborted) return;
      this.update({
        status: 'error',
        error: err instanceof LLMError ? err.message : String(err),
      });
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }

  /**
   * Consume el stream acumulando texto y difundiendo con throttle.
   *
   * Sin throttle, cada token dispararía un mensaje IPC y un re-render de React:
   * cientos por respuesta, con el overlay dando tirones.
   */
  private async consume(
    stream: AsyncIterable<string>,
    controller: AbortController,
    settings: Settings
  ): Promise<void> {
    void settings;
    let buffer = '';
    let lastFlush = 0;

    const flush = (): void => {
      if (!buffer) return;
      this.update({ status: 'streaming', text: (this.current?.text ?? '') + buffer });
      buffer = '';
      lastFlush = Date.now();
    };

    for await (const chunk of stream) {
      if (controller.signal.aborted) return;
      buffer += chunk;
      if (Date.now() - lastFlush >= FLUSH_INTERVAL_MS) flush();
    }

    if (controller.signal.aborted) return;
    flush();

    this.update({
      status: 'done',
      // Un stream que termina sin texto casi siempre significa que el modelo
      // rechazó o se quedó sin tokens; decirlo es mejor que un panel vacío.
      ...(this.current?.text ? {} : { status: 'error', error: 'El modelo no devolvió texto.' }),
    });
  }

  private update(patch: Partial<Answer>): void {
    if (!this.current) return;
    this.current = { ...this.current, ...patch };
    this.emitCurrent();
  }

  private emitCurrent(): void {
    if (this.current) this.emit('answer', { ...this.current });
  }
}

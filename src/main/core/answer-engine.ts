import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type {
  Answer,
  AnswerTrigger,
  ImageAttachment,
  LLMProviderId,
  Settings,
} from '@shared/types';
import { settingsStore } from '../config/store';
import { createLLMProvider, LLMError } from '../llm';
import type { ConversationExchange } from '../llm/types';
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

/**
 * Tope de tiempo para una respuesta completa.
 *
 * Sin esto, un proveedor que se queda colgado deja la respuesta en "Pensando…"
 * **para siempre**: no hay error, no hay reintento, y como el overlay se ve
 * exactamente igual que mientras piensa de verdad, desde fuera es "la app dejó
 * de responder". Pasa de verdad con Ollama en CPU: si el modelo se descargó por
 * inactividad y hay que recargarlo mientras Whisper está usando la máquina, la
 * primera petición puede tardar minutos o no volver.
 *
 * 2 minutos es largo de sobra para cualquier generación legítima de 700 tokens,
 * incluso en CPU, y corto para que el fallo se vea dentro de la conversación.
 */
const GENERATION_TIMEOUT_MS = 120_000;

/** Sin un solo token en este tiempo, el proveedor no va a arrancar. */
const FIRST_TOKEN_TIMEOUT_MS = 45_000;

export class AnswerEngine extends EventEmitter {
  private current: Answer | null = null;
  private controller: AbortController | null = null;
  /** Capturas pendientes de adjuntar a la siguiente consulta. */
  private pendingImages: ImageAttachment[] = [];

  /**
   * Turnos ya cerrados de esta conversación, del más antiguo al más reciente.
   *
   * Sin esto el asistente no tenía ninguna memoria de lo que él mismo había
   * dicho: cada pregunta era una conversación nueva de un solo turno. El
   * transcript no lo suplía, porque sólo contiene voz —lo que dice el
   * micrófono y el sistema—, nunca las respuestas generadas.
   */
  private history: ConversationExchange[] = [];

  /**
   * Cuántos intercambios se reenvían. Ocho cubre de sobra una conversación de
   * varios minutos sin que el prompt crezca hasta doler; los más antiguos se
   * caen por el principio.
   */
  private static readonly MAX_HISTORY = 8;

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

  /** Copia de la memoria, para quien tenga que componer la petición por su cuenta. */
  historySnapshot(): ConversationExchange[] {
    return [...this.history];
  }

  /**
   * Muestra una respuesta que generó otro (el motor de audio directo).
   *
   * No pasa por `ask()` porque no hay nada que pedir: cuando el WAV va al propio
   * modelo, la respuesta llega junto con la transcripción en la misma llamada.
   * Lo que sí comparte es todo lo de después —difusión al overlay, memoria,
   * historial en disco—, y por eso vive aquí y no suelta por el orquestador.
   */
  present(question: string, text: string, providerId: LLMProviderId, model: string): void {
    // Si había una generación en vuelo, esta respuesta la sustituye.
    this.abort();

    this.current = {
      id: randomUUID(),
      status: 'done',
      trigger: 'auto',
      question,
      text,
      providerId,
      model,
      createdAt: Date.now(),
    };
    this.emitCurrent();
    this.remember();
  }

  /**
   * Olvida los turnos anteriores. Lo llama "nueva conversación": si no, la
   * memoria del asistente sobreviviría a un reinicio que existe justamente para
   * cortar con lo anterior.
   */
  resetHistory(): void {
    this.history = [];
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

    /*
     * Dos relojes, no uno. El primero cubre "el proveedor no arranca" —modelo
     * descargándose, servidor atascado— y el segundo "arrancó pero no termina".
     * Distinguirlos importa porque el mensaje al usuario es distinto, y porque
     * una respuesta a medias es mejor que ninguna: al vencer el largo se
     * conserva lo que ya se había escrito.
     */
    let gotFirstToken = false;
    const firstTokenTimer = setTimeout(() => {
      if (!gotFirstToken && !controller.signal.aborted) {
        console.error(
          `[answer] ${this.current?.id.slice(0, 8)} sin respuesta de ` +
            `${settings.llmProviderId} tras ${FIRST_TOKEN_TIMEOUT_MS / 1000}s: se cancela.`
        );
        controller.abort();
        this.update({
          status: 'error',
          error: `${settings.llmProviderId} no respondió en ${FIRST_TOKEN_TIMEOUT_MS / 1000}s. Si es Ollama, comprueba que el servidor sigue vivo (ollama ps).`,
        });
      }
    }, FIRST_TOKEN_TIMEOUT_MS);

    const totalTimer = setTimeout(() => {
      if (!controller.signal.aborted) {
        console.error(`[answer] ${this.current?.id.slice(0, 8)} excedió el tiempo total.`);
        controller.abort();
        this.update(
          this.current?.text
            ? { status: 'done' }
            : { status: 'error', error: 'La generación excedió el tiempo límite.' }
        );
      }
    }, GENERATION_TIMEOUT_MS);

    try {
      const provider = createLLMProvider(settings);
      const stream = provider.streamAnswer(
        {
          systemPrompt: buildSystemPrompt(settings),
          transcript: this.transcript.format(
            this.transcript.recent(settings.manualContextSeconds)
          ),
          ...(question ? { question } : {}),
          // Se pasa una copia: la generación es asíncrona y `history` puede
          // recibir un turno nuevo mientras ésta sigue en vuelo.
          ...(this.history.length ? { history: [...this.history] } : {}),
          // Un modelo sin visión ignoraría las imágenes silenciosamente; mejor
          // no enviarlas y ahorrar el ancho de banda.
          ...(provider.supportsVision && images.length ? { images } : {}),
          maxTokens: MAX_ANSWER_TOKENS,
        },
        controller.signal
      );

      await this.consume(stream, controller, settings, () => {
        gotFirstToken = true;
        clearTimeout(firstTokenTimer);
      });
      this.remember();
    } catch (err) {
      if (controller.signal.aborted) return;
      this.update({
        status: 'error',
        error: err instanceof LLMError ? err.message : String(err),
      });
    } finally {
      clearTimeout(firstTokenTimer);
      clearTimeout(totalTimer);
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
    settings: Settings,
    onFirstChunk: () => void
  ): Promise<void> {
    void settings;
    let buffer = '';
    let lastFlush = 0;
    let first = true;

    const flush = (): void => {
      if (!buffer) return;
      this.update({ status: 'streaming', text: (this.current?.text ?? '') + buffer });
      buffer = '';
      lastFlush = Date.now();
    };

    for await (const chunk of stream) {
      if (controller.signal.aborted) return;
      if (first) {
        first = false;
        onFirstChunk();
      }
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

  /**
   * Archiva el turno recién terminado para las siguientes consultas.
   *
   * Sólo se guardan las completadas con texto: una abortada o fallida no es
   * algo que el modelo "dijo", y meterla le haría creer que sí. Si no hubo
   * pregunta aislada se guarda una marca, porque la API exige contenido no
   * vacío en cada mensaje.
   */
  private remember(): void {
    const answer = this.current;
    if (!answer || answer.status !== 'done' || !answer.text.trim()) return;

    this.history.push({
      question: answer.question.trim() || '(pregunta deducida de la transcripción)',
      answer: answer.text.trim(),
    });
    if (this.history.length > AnswerEngine.MAX_HISTORY) this.history.shift();
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

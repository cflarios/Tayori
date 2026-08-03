import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  isScreenTrigger,
  screenModelFor,
  type Answer,
  type AnswerTrigger,
  type ImageAttachment,
  type LLMProviderId,
  type PromptProfileId,
  type Settings,
} from '@shared/types';
import { settingsStore } from '../config/store';
import { m } from '../i18n';
import { createLLMProvider, LLMError } from '../llm';
import type { ConversationExchange } from '../llm/types';
import { getSkill } from '../skills';
import { buildSystemPrompt } from './prompt';
import { neutralize } from './untrusted';
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

/**
 * Tope del modo código.
 *
 * Con 700 la solución sale cortada a media función, y una implementación
 * truncada no vale para nada: no se puede pegar ni razonar sobre ella. 2200
 * cubre un algoritmo completo con su explicación en cualquier lenguaje verboso
 * (Java, C++) sin llegar a permitir un ensayo.
 */
const MAX_CODE_TOKENS = 2_200;

/**
 * Qué perfil impone cada disparo, si impone alguno.
 *
 * Los botones de pantalla resuelven en su modo **sin cambiar los ajustes**: se
 * usa el de código en mitad de una entrevista y la siguiente pregunta hablada
 * sigue saliendo en viñetas.
 */
const PROFILE_BY_TRIGGER: Partial<Record<AnswerTrigger, PromptProfileId>> = {
  code: 'coding',
  quiz: 'quiz',
};

/**
 * Tope de salida por perfil. El que no aparece usa `MAX_ANSWER_TOKENS`.
 *
 * Sólo el de código lo sube: una respuesta de test cabe de sobra en el tope
 * normal —es una línea y dos viñetas— y subírselo sólo invita a divagar.
 */
const TOKENS_BY_PROFILE: Partial<Record<PromptProfileId, number>> = {
  coding: MAX_CODE_TOKENS,
};

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

  /**
   * Cuántos intercambios lleva el modelo en la cabeza, y cuántos caben.
   *
   * Se enseña porque es lo único del coste de una consulta que el usuario puede
   * controlar, y no había forma de saberlo: cada turno guardado se reenvía
   * entero en la siguiente pregunta. Con Ollama eso además choca contra
   * `num_ctx`, y lo que no cabe se descarta **sin ningún error** — el síntoma es
   * que el modelo "olvida" algo que le acabas de decir.
   */
  get memory(): { turns: number; max: number } {
    return { turns: this.history.length, max: AnswerEngine.MAX_HISTORY };
  }

  /**
   * Olvida la memoria de la conversación SIN tocar nada más.
   *
   * Es más fino que "nueva conversación", y por eso existe: aquélla aborta la
   * respuesta en vuelo, vacía la transcripción, cierra la conversación en disco
   * y empieza otra. Aquí se tira sólo lo que se reenvía al modelo en cada
   * consulta, que es lo que hincha el prompt y lo que hace que un modelo local
   * con la ventana pequeña empiece a perder el principio.
   */
  forgetContext(): void {
    const had = this.history.length;
    this.history = [];
    console.log(`[answer] contexto olvidado a petición: ${had} intercambios fuera.`);
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
   *
   * El disparo `code` no es sólo una etiqueta para el log: cambia el perfil y el
   * tope de tokens de ESTA consulta sin tocar los ajustes. Es lo que permite
   * resolver lo que hay en pantalla en mitad de una entrevista y que la
   * siguiente pregunta hablada siga saliendo en cuatro viñetas.
   *
   * @param skillId Skill sólo para esta consulta, del prefijo `/skill` de la
   *        pestaña de escritura. Sin él manda `settings.activeSkillId`, que es
   *        la que está puesta en el overlay.
   */
  async ask(trigger: AnswerTrigger, question?: string, skillId?: string): Promise<void> {
    // Abortar antes de arrancar es lo que garantiza la invariante de "una sola
    // en vuelo" sin importar desde dónde se llame.
    this.abort();

    const settings = settingsStore.get();

    /*
     * Dos caminos llevan a un perfil especial: el botón de pantalla, que lo
     * impone sólo para esta consulta, y el chip del overlay, que lo deja puesto.
     * Los dos tienen que llegar al mismo sitio — cuando sólo se miraba el
     * disparo, elegir "Código" a mano dejaba el tope en 700 tokens y la solución
     * salía cortada a media función.
     */
    const forced = PROFILE_BY_TRIGGER[trigger];
    const profile = forced ?? settings.promptProfileId;
    const onScreen = isScreenTrigger(trigger);

    // Las acciones de pantalla pueden tener su propio modelo: lo hablado pide
    // latencia y lo de la pantalla pide vista. Ver `screenModelFor`.
    const target = onScreen
      ? screenModelFor(settings)
      : { providerId: settings.llmProviderId, model: settings.llmModels[settings.llmProviderId] };
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
      providerId: target.providerId,
      model: target.model,
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
            `${target.providerId} tras ${FIRST_TOKEN_TIMEOUT_MS / 1000}s: se cancela.`
        );
        controller.abort();
        this.update({
          status: 'error',
          error: m('err.noFirstToken', {
            provider: target.providerId,
            seconds: FIRST_TOKEN_TIMEOUT_MS / 1000,
          }),
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
            : { status: 'error', error: m('err.generationTimeout') }
        );
      }
    }, GENERATION_TIMEOUT_MS);

    try {
      const provider = createLLMProvider(settings, onScreen);

      /*
       * Con un modelo sin visión, una captura se descarta en silencio. Para una
       * pregunta hablada eso degrada y ya está —la pregunta sigue en el audio—,
       * pero en las acciones de pantalla la captura ES el enunciado: sin ella el
       * modelo se inventaría el ejercicio entero y la respuesta parecería
       * perfecta. Es mejor gastar la pulsación en decir qué falta.
       */
      if (onScreen && images.length && !provider.supportsVision) {
        this.update({
          status: 'error',
          error: m('err.noVision', { model: provider.model }),
        });
        return;
      }

      /*
       * La skill se resuelve aquí y no en quien llama para que las tres vías
       * —el prefijo escrito, el chip del overlay y el disparo automático—
       * pasen por la misma puerta. `getSkill` devuelve `undefined` si está rota
       * o si el id ya no existe, que es lo que hace que una carpeta borrada no
       * deje la app mandando un prompt a medias.
       */
      const skill = getSkill(skillId ?? settings.activeSkillId);

      const stream = provider.streamAnswer(
        {
          systemPrompt: buildSystemPrompt(settings, forced, skill),
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
          maxTokens: TOKENS_BY_PROFILE[profile] ?? MAX_ANSWER_TOKENS,
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
      ...(this.current?.text ? {} : { status: 'error', error: m('err.emptyAnswer') }),
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

    /*
     * La pregunta se desarma al guardarla, no al enviarla.
     *
     * Viaja como un mensaje `user` de verdad —es lo que hace que el modelo trate
     * sus respuestas anteriores como cosas que dijo él— y por tanto **fuera de
     * todo sobre**. Sin esto, una orden que se hubiera frenado en
     * `<transcripcion>` volvería en la consulta siguiente sin nada alrededor.
     *
     * Aquí y no en cada proveedor porque ésta es la única puerta a la memoria;
     * el historial que se guarda en disco es otro camino y conserva el texto
     * literal, que es lo que hay que poder releer.
     */
    this.history.push({
      question: neutralize(answer.question.trim()) || m('hist.inferredQuestion'),
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

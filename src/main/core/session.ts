import { randomUUID } from 'node:crypto';
import { BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc';
import {
  autoTriggerIsInert,
  conversationTitle,
  speakersFor,
  type Answer,
  type AnswerTrigger,
  type Conversation,
  type ImageAttachment,
  type Speaker,
  type TranscriptSegment,
} from '@shared/types';
import { saveConversation } from '../config/history';
import { settingsStore } from '../config/store';
import { audioCapture } from '../capture/audio';
import { createSTTProvider, type STTProvider, type TranscriptEvent } from '../stt';
import { TranscriptBuffer } from './transcript-buffer';
import { AnswerEngine } from './answer-engine';
import { looksLikeQuestion } from './question-detector';
import { getAudioWorker } from '../windows/audio-worker';

/**
 * Une captura de audio, transcripción y (desde la fase 4) generación de
 * respuestas.
 *
 * Es el único sitio que conoce a la vez el pipeline de audio y el motor de STT;
 * ni el controlador de captura ni los providers se conocen entre sí.
 */
class SessionOrchestrator {
  private stt: STTProvider | null = null;
  readonly transcript = new TranscriptBuffer(settingsStore.get().transcriptWindowSize);
  readonly answers = new AnswerEngine(this.transcript);

  /**
   * Temporizador por hablante para cerrar segmentos que el motor dejó abiertos.
   * Gemini no siempre marca `finished` cuando alguien simplemente se calla, y
   * un segmento eternamente abierto impediría detectar el fin de la pregunta.
   */
  private silenceTimers = new Map<Speaker, NodeJS.Timeout>();
  private static readonly SILENCE_MS = 900;

  /** Momento del último auto-disparo, para el debounce. */
  private lastAutoTrigger = 0;
  private static readonly AUTO_DEBOUNCE_MS = 2_500;

  /**
   * Conversación en curso. Se crea perezosamente al primer contenido: arrancar
   * la app y no decir nada no debe dejar una conversación vacía en el historial.
   */
  private conversation: Conversation | null = null;
  /** Ids de respuestas ya archivadas: `answer` se emite en cada actualización. */
  private recordedAnswers = new Set<string>();
  private saveTimer: NodeJS.Timeout | null = null;
  /** Volcado diferido: un turno largo dispara muchos cambios seguidos. */
  private static readonly SAVE_DEBOUNCE_MS = 800;

  /**
   * Vigilancia del recorrido audio → transcripción → respuesta.
   *
   * Cada escalón puede pararse en silencio y desde fuera los tres se ven igual:
   * "la app dejó de responder". Estas marcas son lo que permite decir en cuál
   * se paró sin tener que reproducirlo a ciegas.
   */
  private lastChunkAt = 0;
  private lastSegmentAt = 0;
  private watchdog: NodeJS.Timeout | null = null;
  private static readonly WATCHDOG_MS = 15_000;
  /** Sin transcripción durante este tiempo, habiendo audio, es un atasco. */
  private static readonly STALL_MS = 30_000;

  /** Último estado difundido por respuesta, para registrar sólo los cambios. */
  private answerStage = new Map<string, string>();

  /** Conecta el flujo de audio al STT. Llamar una vez al arrancar la app. */
  bind(): void {
    audioCapture.on('chunk', (speaker: Speaker, pcm: Buffer) => {
      this.lastChunkAt = Date.now();
      this.stt?.push(speaker, pcm);
    });

    audioCapture.on('status', (status: { state: string }) => {
      if (status.state === 'listening') void this.startTranscription();
      if (status.state === 'idle' || status.state === 'error') void this.stopTranscription();
    });

    this.answers.on('answer', (answer: Answer) => {
      this.broadcast(IPC.onAnswer, answer);
      this.recordAnswer(answer);
      this.logAnswerStage(answer);
    });
  }

  /**
   * Registra el ciclo de vida de cada respuesta, una línea por cambio de estado.
   *
   * La duración es lo importante: distingue "el modelo no arrancó" de "el modelo
   * tardó 40 segundos", que producen la misma pantalla en blanco.
   */
  private logAnswerStage(answer: Answer): void {
    if (this.answerStage.get(answer.id) === answer.status) return;
    this.answerStage.set(answer.id, answer.status);

    const took = Date.now() - answer.createdAt;
    if (answer.status === 'thinking') {
      console.log(
        `[answer] ${answer.id.slice(0, 8)} pidiendo a ${answer.providerId}/${answer.model} ` +
          `(${answer.trigger}): "${answer.question.slice(0, 60)}"`
      );
    } else if (answer.status === 'streaming') {
      // Sólo la primera vez que se pasa a streaming: es el tiempo hasta el
      // primer token, que es lo que de verdad se percibe como latencia.
      console.log(`[answer] ${answer.id.slice(0, 8)} primer texto tras ${took}ms`);
    } else if (answer.status === 'done') {
      console.log(
        `[answer] ${answer.id.slice(0, 8)} completada en ${took}ms (${answer.text.length} car.)`
      );
    } else if (answer.status === 'error') {
      console.error(`[answer] ${answer.id.slice(0, 8)} falló tras ${took}ms: ${answer.error}`);
    } else if (answer.status === 'aborted') {
      console.log(`[answer] ${answer.id.slice(0, 8)} abortada tras ${took}ms`);
    }

    // El mapa no puede crecer para siempre en una sesión larga.
    if (this.answerStage.size > 50) {
      for (const key of [...this.answerStage.keys()].slice(0, 25)) this.answerStage.delete(key);
    }
  }

  /**
   * Avisa cuando llega audio pero no sale transcripción.
   *
   * Es la comprobación que faltaba: sin ella, un motor muerto y una sala en
   * silencio producen exactamente el mismo overlay, con el punto verde de
   * "Escuchando" encendido en los dos casos.
   */
  private startWatchdog(): void {
    this.stopWatchdog();
    this.watchdog = setInterval(() => {
      const now = Date.now();
      const audioFresh = now - this.lastChunkAt < SessionOrchestrator.WATCHDOG_MS;
      const silentFor = now - this.lastSegmentAt;

      if (!audioFresh) {
        console.warn(
          '[watchdog] no llega audio del worker. La captura está anunciada como activa pero ' +
            'no entran chunks: revisa el dispositivo de entrada.'
        );
        return;
      }
      if (this.lastSegmentAt > 0 && silentFor > SessionOrchestrator.STALL_MS) {
        console.warn(
          `[watchdog] entra audio pero el motor "${this.stt?.id}" no devuelve texto desde hace ` +
            `${Math.round(silentFor / 1000)}s.`
        );
      }
    }, SessionOrchestrator.WATCHDOG_MS);
  }

  private stopWatchdog(): void {
    if (this.watchdog) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
  }

  // ── Historial ──

  /**
   * Cierra la conversación actual y empieza otra en limpio.
   *
   * Limpia también el `TranscriptBuffer` y aborta la respuesta en vuelo: el
   * sentido de "nueva conversación" es que lo anterior deje de contaminar el
   * contexto que se manda al modelo, y dejar el buffer con la charla vieja lo
   * haría inútil.
   */
  newConversation(): void {
    this.answers.abort();
    this.flush();
    this.conversation = null;
    this.recordedAnswers.clear();
    this.transcript.clear();
    this.broadcast(IPC.onConversationReset, null);
  }

  /** Vuelca ya lo pendiente. Se llama al cerrar y al cambiar de conversación. */
  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.conversation && settingsStore.get().historyEnabled) {
      saveConversation({ ...this.conversation, endedAt: Date.now() });
    }
  }

  /**
   * La conversación sólo existe si el historial está activo. Devolver `null`
   * con el interruptor apagado es lo que garantiza que no se escriba nada:
   * el resto del código no tiene que acordarse de comprobarlo.
   */
  private ensureConversation(seedTitle?: string): Conversation | null {
    if (!settingsStore.get().historyEnabled) return null;

    if (!this.conversation) {
      this.conversation = {
        id: randomUUID(),
        title: seedTitle ? conversationTitle(seedTitle) : 'Conversación sin título',
        startedAt: Date.now(),
        profileId: settingsStore.get().promptProfileId,
        segments: [],
        turns: [],
      };
    } else if (this.conversation.title === 'Conversación sin título' && seedTitle) {
      // El título se fija con el primer contenido útil, venga de la voz o del
      // teclado; hasta entonces la conversación existe pero no tiene nombre.
      this.conversation.title = conversationTitle(seedTitle);
    }
    return this.conversation;
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      const current = this.conversation;
      if (current && settingsStore.get().historyEnabled) saveConversation(current);
    }, SessionOrchestrator.SAVE_DEBOUNCE_MS);
  }

  /**
   * Archiva una respuesta cuando llega a un estado terminal.
   *
   * `answer` se emite en CADA actualización del streaming, así que sin el set de
   * ids ya archivados el mismo turno entraría decenas de veces. Las abortadas no
   * se guardan: una respuesta que se cortó porque llegó otra pregunta es ruido,
   * no historial.
   */
  private recordAnswer(answer: Answer): void {
    if (answer.status !== 'done' && answer.status !== 'error') return;
    if (this.recordedAnswers.has(answer.id)) return;

    const conversation = this.ensureConversation(answer.question);
    if (!conversation) return;

    this.recordedAnswers.add(answer.id);
    conversation.turns.push({
      id: answer.id,
      question: answer.question,
      answer: answer.text,
      trigger: answer.trigger,
      providerId: answer.providerId,
      model: answer.model,
      createdAt: answer.createdAt,
      ...(answer.error ? { error: answer.error } : {}),
    });
    this.scheduleSave();
  }

  // ── API que consumen los hotkeys y el IPC ──

  /** Responde usando la última intervención cerrada relevante, si la hay. */
  ask(trigger: AnswerTrigger): Promise<void> {
    const lastQuestion = this.lastRelevantSegment();
    return this.answers.ask(trigger, lastQuestion?.text.trim() || undefined);
  }

  /**
   * Qué intervención se toma como "la pregunta" con el hotkey manual.
   *
   * Se prefiere el hablante configurado para el auto-disparo. Sólo se cae a
   * otro si ése **ni siquiera se está escuchando** (disparo en `them` con
   * `audioSources: 'mic'`, por ejemplo): ahí `lastFrom` devolvería siempre null
   * y el hotkey mandaría la pregunta vacía. Si sí se escucha pero todavía no ha
   * dicho nada, no hay fallback: mandar la última línea de otro como si fuera la
   * pregunta es peor que dejar que el modelo la deduzca del transcript.
   */
  private lastRelevantSegment(): TranscriptSegment | null {
    const settings = settingsStore.get();
    const wanted = settings.autoTriggerSpeaker;
    const heard = speakersFor(settings.audioSources);
    const order: Speaker[] = wanted !== 'any' && heard.includes(wanted) ? [wanted] : ['them', 'me'];

    for (const speaker of order) {
      const segment = this.transcript.lastFrom(speaker);
      if (segment) return segment;
    }
    return null;
  }

  /** Responde a un texto escrito a mano en el overlay. */
  askWithText(text: string): Promise<void> {
    return this.answers.ask('manual-input', text);
  }

  abortAnswer(): void {
    this.answers.abort();
  }

  attachImage(image: ImageAttachment): void {
    this.answers.attachImage(image);
  }

  private async startTranscription(): Promise<void> {
    if (this.stt) return;

    const settings = settingsStore.get();
    try {
      const provider = createSTTProvider(settings);

      provider.events.on('segment', (event: TranscriptEvent) => this.onSegment(event));
      provider.events.on('error', (err: Error) => {
        console.error('[stt]', err.message);
        // Un error de STT no detiene la captura: el audio sigue llegando y la
        // reconexión puede recuperar la sesión. Pero SÍ se enseña: antes sólo
        // iba a `console.error`, así que una sesión que fallaba carril a carril
        // se veía igual que una sala en silencio.
        this.broadcast(IPC.onSTTError, err.message);
      });

      await provider.start({
        sampleRate: 16_000,
        language: settings.language,
        speakers: speakersFor(settings.audioSources),
        vocabulary: collectVocabulary(settings.contextPacks),
      });

      this.stt = provider;
      this.lastSegmentAt = Date.now();
      this.startWatchdog();
      console.log(
        `[stt] transcripción iniciada con "${provider.id}" · idioma ${settings.language} · ` +
          `hablantes [${speakersFor(settings.audioSources).join(', ')}] · ` +
          `disparo ${settings.autoTriggerMode}/${settings.autoTriggerSpeaker}/` +
          `${settings.autoTriggerSensitivity}`
      );

      // Aviso explícito de una combinación que no da ningún síntoma: el audio
      // llega, se transcribe, y el auto-disparo descarta todos los segmentos
      // porque el hablante que debería dispararlo ni siquiera se escucha. Sin
      // esta línea, desde fuera se ve igual que "el modelo no responde".
      if (autoTriggerIsInert(settings)) {
        console.warn(
          `[auto] inerte: se dispara con "${settings.autoTriggerSpeaker}" pero ` +
            `audioSources="${settings.audioSources}" solo escucha ` +
            `[${speakersFor(settings.audioSources).join(', ')}]. ` +
            'No saltará ninguna respuesta automática; usa el hotkey manual o ' +
            'cambia los ajustes en el dashboard.'
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[stt] no se pudo iniciar:', message);
      this.broadcast(IPC.onSTTError, message);
      this.broadcast(IPC.onCaptureStatus, {
        ...audioCapture.getStatus(),
        state: 'error',
        error: message,
      });
    }
  }

  private async stopTranscription(): Promise<void> {
    this.stopWatchdog();
    for (const timer of this.silenceTimers.values()) clearTimeout(timer);
    this.silenceTimers.clear();

    // Parar de escuchar es el momento natural para consolidar: si la app se
    // cierra después, lo pendiente del debounce ya está en disco.
    this.flush();

    const provider = this.stt;
    this.stt = null;
    await provider?.stop();
  }

  private onSegment(event: TranscriptEvent): void {
    this.lastSegmentAt = Date.now();
    const segment = this.transcript.ingest(event.speaker, event.text, event.isFinal);
    this.broadcast(IPC.onTranscript, segment);

    if (event.isFinal) {
      this.clearSilenceTimer(event.speaker);
      this.archiveSegment(segment);
      this.onFinalSegment(segment);
    } else {
      this.armSilenceTimer(event.speaker);
    }
  }

  /**
   * Guarda un segmento cerrado en la conversación.
   *
   * Va aparte de `onFinalSegment` porque ese método sale antes por razones del
   * auto-disparo (hablante que no toca, modo apagado) y un segmento debe
   * archivarse igual: el historial no depende de que la respuesta se dispare.
   * Se guarda una copia porque el `TranscriptBuffer` recicla los objetos de los
   * parciales, y se comprueba el id porque un segmento puede cerrarse tanto por
   * el motor como por el temporizador de silencio.
   */
  private archiveSegment(segment: TranscriptSegment): void {
    if (!segment.text.trim()) return;
    const conversation = this.ensureConversation(
      segment.speaker === 'them' ? segment.text : undefined
    );
    if (!conversation) return;
    if (conversation.segments.some((s) => s.id === segment.id)) return;

    conversation.segments.push({ ...segment });
    this.scheduleSave();
  }

  /**
   * Auto-disparo. Sólo se evalúan intervenciones cerradas del hablante elegido;
   * el default es el interlocutor porque responder a lo que dice el propio
   * usuario no tiene sentido en una entrevista.
   */
  private onFinalSegment(segment: TranscriptSegment): void {
    const settings = settingsStore.get();
    if (settings.autoTriggerMode === 'off') return;

    const wanted = settings.autoTriggerSpeaker;
    if (wanted !== 'any' && segment.speaker !== wanted) return;

    const verdict = looksLikeQuestion(segment.text, settings.autoTriggerSensitivity);
    if (!verdict.isQuestion) {
      // Se registra el descarte: es la única forma de saber por qué la app "no
      // responde" sin ponerse a adivinar. Una prueba real gastó cinco frases
      // seguidas para descubrir que el detector las estaba tirando en silencio.
      console.log(`[auto] descartado (${verdict.reason}): "${segment.text.slice(0, 60)}"`);
      return;
    }

    // Debounce: una pregunta larga puede cerrarse en varios segmentos seguidos.
    // Sin esto se dispararían dos o tres respuestas para la misma pregunta, y
    // cada una abortaría la anterior a media generación.
    const now = Date.now();
    if (now - this.lastAutoTrigger < SessionOrchestrator.AUTO_DEBOUNCE_MS) return;
    this.lastAutoTrigger = now;

    console.log(`[auto] disparando (${verdict.reason}): "${segment.text.slice(0, 60)}"`);
    void this.answers.ask('auto', segment.text.trim());
  }

  private armSilenceTimer(speaker: Speaker): void {
    this.clearSilenceTimer(speaker);
    this.silenceTimers.set(
      speaker,
      setTimeout(() => {
        this.silenceTimers.delete(speaker);
        const closed = this.transcript.finalizeOpen(speaker);
        if (closed) {
          this.broadcast(IPC.onTranscript, closed);
          this.archiveSegment(closed);
          this.onFinalSegment(closed);
        }
      }, SessionOrchestrator.SILENCE_MS)
    );
  }

  private clearSilenceTimer(speaker: Speaker): void {
    const timer = this.silenceTimers.get(speaker);
    if (timer) {
      clearTimeout(timer);
      this.silenceTimers.delete(speaker);
    }
  }

  private broadcast(channel: string, payload: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed() && win !== getAudioWorker()) {
        win.webContents.send(channel, payload);
      }
    }
  }
}

/**
 * Extrae términos de los context packs para sesgar el reconocedor.
 *
 * Un CV y una descripción de puesto están llenos de nombres propios, siglas y
 * tecnologías: justo lo que un ASR generalista transcribe mal. Nos quedamos con
 * los tokens capitalizados o en mayúsculas, que es donde están esos términos.
 */
function collectVocabulary(packs: { content: string; enabled: boolean }[]): string[] {
  const terms = new Set<string>();

  for (const pack of packs) {
    if (!pack.enabled) continue;
    const matches = pack.content.match(/\b[A-Z][A-Za-z0-9+#.]{1,20}\b/g) ?? [];
    for (const term of matches) {
      if (term.length > 1) terms.add(term);
    }
  }

  // La API acota el vocabulario personalizado; mandar cientos de términos lo
  // empeora en lugar de mejorarlo, así que nos quedamos con los primeros.
  return [...terms].slice(0, 100);
}

export const session = new SessionOrchestrator();

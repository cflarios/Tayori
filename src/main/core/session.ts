import { randomUUID } from 'node:crypto';
import { BrowserWindow } from 'electron';
import { IPC, type ScrollCaptureState } from '@shared/ipc';
import { parseSkillInvocation } from '@shared/skills';
import {
  autoTriggerIsInert,
  conversationTitle,
  idleShutoffDue,
  packsForProfile,
  speakersFor,
  type Answer,
  type AnswerTrigger,
  type ContextPack,
  type Conversation,
  type ImageAttachment,
  type PromptProfileId,
  type ScreenTask,
  type Settings,
  type Speaker,
  type TranscriptSegment,
} from '@shared/types';
import { mqttBridge } from '../bridge/mqtt';
import { phoneBridge } from '../bridge/phone';
import { saveConversation } from '../config/history';
import { settingsStore } from '../config/store';
import { m } from '../i18n';
import { audioCapture } from '../capture/audio';
import { captureScreen, captureScreenFrame } from '../capture/screenshot';
import { hamming } from '../capture/frame-hash';
import {
  createSTTProvider,
  type DirectAnswerEvent,
  type STTProvider,
  type TranscriptEvent,
} from '../stt';
import { getSkill, listSkills } from '../skills';
import { classifyQuestion, worthClassifying } from './question-classifier';
import { buildSystemPrompt } from './prompt';
import { TranscriptBuffer } from './transcript-buffer';
import { AnswerEngine } from './answer-engine';
import { looksLikeQuestion } from './question-detector';
import { getAudioWorker } from '../windows/audio-worker';

/**
 * The "question" for code mode.
 *
 * It goes as a question and not inside the system prompt because the system
 * prefix is what's cached between calls (see `claude.ts`) and must stay stable.
 * The text is explicit about what to look at: the capture arrives with the whole
 * screen, browser and editor included, and without this line the model
 * sometimes comments on the interface instead of solving the exercise.
 */
const SOLVE_INSTRUCTION: Record<ScreenTask, string> = {
  code:
    'Resuelve el problema de programación que se ve en la captura de mi pantalla. ' +
    'Si hay varias cosas visibles, quédate con el ejercicio, el error o el test que ' +
    'está en primer plano.',
  quiz:
    'Responde TODAS las preguntas de test que se vean en la captura de mi pantalla, ' +
    'una línea por pregunta y en el orden en que aparecen. Lee el enunciado y todas ' +
    'las opciones antes de decidir cada una, incluidas las que queden a media altura, ' +
    'y respeta lo que pida cada pregunta (una sola opción, varias, la falsa…). ' +
    'Sólo las respuestas: sin explicaciones.',
};

/**
 * The "question" for chunk capture.
 *
 * Unlike `SOLVE_INSTRUCTION.code`, here it's not a single capture but SEVERAL:
 * consecutive fragments of the same prompt, as the interviewer revealed it by
 * scrolling their shared screen. The model has to stitch them before solving.
 * It's solved with the usual `coding` profile; only this instruction changes.
 */
const SCROLL_SOLVE_INSTRUCTION =
  'Las imágenes adjuntas son fragmentos CONSECUTIVOS de una misma pantalla, en ' +
  'orden de arriba abajo, capturados mientras se hacía scroll: se solapan entre ' +
  'sí. Reconstruye el enunciado completo en ese orden, uniendo los solapes y sin ' +
  'repetir las líneas que salgan en dos fragmentos. Si aun así parece incompleto ' +
  '—falta el principio, el final o un ejemplo—, dilo en la primera línea y ' +
  'resuelve con lo que haya. Después resuelve el problema de programación como en ' +
  'el modo código.';

/** What's logged for each screen action. */
const TASK_LABEL: Record<ScreenTask, string> = { code: 'código', quiz: 'test' };

/**
 * Joins audio capture, transcription and (since phase 4) answer generation.
 *
 * It's the only place that knows both the audio pipeline and the STT engine at
 * once; neither the capture controller nor the providers know each other.
 */
class SessionOrchestrator {
  private stt: STTProvider | null = null;
  readonly transcript = new TranscriptBuffer(settingsStore.get().transcriptWindowSize);
  readonly answers = new AnswerEngine(this.transcript);

  /**
   * Per-speaker timer to close segments the engine left open. Gemini doesn't
   * always mark `finished` when someone simply goes quiet, and an eternally open
   * segment would prevent detecting the end of the question.
   */
  private silenceTimers = new Map<Speaker, NodeJS.Timeout>();
  private static readonly SILENCE_MS = 900;

  /** Time of the last auto-trigger, for the debounce. */
  private lastAutoTrigger = 0;
  private static readonly AUTO_DEBOUNCE_MS = 2_500;

  /**
   * Closed fragments that can still be part of the same question.
   *
   * The VAD closes the turn after 700 ms of silence, and someone who hesitates
   * pauses longer than that mid-sentence: "entonces… eh… lo que quería
   * preguntarte es… ¿cómo lo harías?". That arrives as three segments.
   */
  private pendingTrigger = new Map<
    Speaker,
    { parts: string[]; timer: NodeJS.Timeout; startedAt: number }
  >();

  /**
   * How long to wait, after a turn closes, in case the sentence continues.
   *
   * It adds to the 700 ms the VAD already required, so in total ~1.6 s of
   * silence is needed to consider the utterance finished. A pause of doubt
   * rarely reaches there; the end of a question, almost always.
   */
  private static readonly AUTO_SETTLE_MS = 900;

  /** Cap for whoever chains nonstop: whatever there is gets answered. */
  private static readonly AUTO_MAX_ACCUMULATE_MS = 15_000;

  /**
   * Conversation in progress. Created lazily on the first content: launching the
   * app and saying nothing must not leave an empty conversation in the history.
   */
  private conversation: Conversation | null = null;
  /** Ids of already-archived answers: `answer` is emitted on every update. */
  private recordedAnswers = new Set<string>();
  private saveTimer: NodeJS.Timeout | null = null;
  /** Deferred write: a long turn fires many changes in a row. */
  private static readonly SAVE_DEBOUNCE_MS = 800;

  /**
   * Watching the audio → transcription → answer path.
   *
   * Each step can stop silently and from the outside all three look the same:
   * "the app stopped responding". These marks are what let us say which one
   * stopped without having to reproduce it blind.
   */
  private lastChunkAt = 0;
  private lastSegmentAt = 0;
  private watchdog: NodeJS.Timeout | null = null;
  private static readonly WATCHDOG_MS = 15_000;
  /** No transcription for this long, with audio coming in, is a stall. */
  private static readonly STALL_MS = 30_000;

  /** Last state broadcast per answer, to log only the changes. */
  private answerStage = new Map<string, string>();

  /**
   * Chunk capture: accumulated fragments of a screen revealed by scrolling, to
   * reconstruct a prompt that doesn't fit in a single capture.
   */
  private captureStack: ImageAttachment[] = [];
  /** Hash of the last stacked frame, to deduplicate in automatic mode. */
  private lastFrameHash: bigint | null = null;
  /** Automatic-mode loop; `null` when not recording. */
  private autoCaptureTimer: NodeJS.Timeout | null = null;
  private static readonly SCROLL_MAX_FRAMES = 15;
  private static readonly SCROLL_INTERVAL_MS = 2_500;
  /** Hamming distance below which two frames are the same chunk. */
  private static readonly SCROLL_DEDUP_THRESHOLD = 5;

  /** Connects the audio stream to the STT. Call once when the app starts. */
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
      // Memory only changes when a turn closes with text, so it's broadcast
      // there and not on every streaming tick.
      if (answer.status === 'done') this.broadcast(IPC.onMemory, this.answers.memory);
    });
  }

  /**
   * Logs the lifecycle of each answer, one line per state change.
   *
   * The duration is what matters: it tells "the model didn't start" apart from
   * "the model took 40 seconds", which produce the same blank screen.
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
      // Only the first time it goes to streaming: it's the time to the first
      // token, which is what's actually perceived as latency.
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

    // The map can't grow forever in a long session.
    if (this.answerStage.size > 50) {
      for (const key of [...this.answerStage.keys()].slice(0, 25)) this.answerStage.delete(key);
    }
  }

  /**
   * Warns when audio comes in but no transcription comes out.
   *
   * It's the check that was missing: without it, a dead engine and a silent room
   * produce exactly the same overlay, with the green "Listening" dot on in both
   * cases.
   */
  private startWatchdog(): void {
    this.stopWatchdog();
    this.watchdog = setInterval(() => {
      const now = Date.now();
      const silentFor = now - this.lastSegmentAt;

      // Idle shutoff: if no one has spoken in the configured minutes, it stops
      // listening on its own. It goes before the audio checks because it's
      // decided by SILENCE, not by whether chunks come in: a meeting that ended
      // stops sending voice even if the mic stays open. `audioCapture.stop()`
      // emits the `idle` state, which fires `stopTranscription` and stops this
      // very watchdog, so it doesn't fire again.
      if (idleShutoffDue(settingsStore.get(), silentFor)) {
        console.log(
          `[idle] ${Math.round(silentFor / 60_000)} min sin voz; se deja de escuchar.`
        );
        this.broadcast(IPC.onNotice, m('notice.idleStop'));
        void audioCapture.stop();
        return;
      }

      const audioFresh = now - this.lastChunkAt < SessionOrchestrator.WATCHDOG_MS;

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

  // ── History ──

  /**
   * Closes the current conversation and starts a fresh one.
   *
   * It also clears the `TranscriptBuffer` and aborts the in-flight answer: the
   * point of "new conversation" is that the previous stuff stops contaminating
   * the context sent to the model, and leaving the buffer with the old chat
   * would make it useless.
   */
  newConversation(): void {
    this.answers.abort();
    this.answers.resetHistory();
    this.clearPendingTriggers();
    this.clearCaptureStack();
    this.flush();
    this.conversation = null;
    this.recordedAnswers.clear();
    this.transcript.clear();
    this.broadcast(IPC.onConversationReset, null);
    this.broadcast(IPC.onMemory, this.answers.memory);
  }

  /** Flushes what's pending now. Called on close and on switching conversation. */
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
   * The conversation only exists if history is on. Returning `null` with the
   * switch off is what guarantees nothing is written: the rest of the code
   * doesn't have to remember to check it.
   */
  private ensureConversation(seedTitle?: string): Conversation | null {
    if (!settingsStore.get().historyEnabled) return null;

    if (!this.conversation) {
      this.conversation = {
        id: randomUUID(),
        // With nothing usable it stays empty: the label is set by the
        // dashboard, the only one that knows which language is being looked at.
        title: seedTitle ? conversationTitle(seedTitle) : '',
        startedAt: Date.now(),
        profileId: settingsStore.get().promptProfileId,
        segments: [],
        turns: [],
      };
    } else if (!this.conversation.title && seedTitle) {
      // The title is set with the first useful content, whether from voice or
      // keyboard; until then the conversation exists but has no name.
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
   * Archives an answer when it reaches a terminal state.
   *
   * `answer` is emitted on EVERY streaming update, so without the set of
   * already-archived ids the same turn would enter dozens of times. Aborted ones
   * aren't saved: an answer cut off because another question arrived is noise,
   * not history.
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

  // ── API consumed by the hotkeys and the IPC ──

  /** Answers using the last relevant closed utterance, if there is one. */
  ask(trigger: AnswerTrigger): Promise<void> {
    const lastQuestion = this.lastRelevantSegment();
    return this.answers.ask(trigger, lastQuestion?.text.trim() || undefined);
  }

  /**
   * Which utterance is taken as "the question" with the manual hotkey.
   *
   * The speaker configured for auto-trigger is preferred. It only falls back to
   * another if that one **isn't even being listened to** (trigger on `them` with
   * `audioSources: 'mic'`, for example): there `lastFrom` would always return
   * null and the hotkey would send an empty question. If it is heard but hasn't
   * said anything yet, there's no fallback: sending someone else's last line as
   * if it were the question is worse than letting the model infer it from the
   * transcript.
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

  /**
   * Answers text typed by hand in the overlay.
   *
   * It's the only path that accepts the `/skill` prefix, and not by chance: it's
   * the only one where someone is typing. A `/humanizar` said out loud would
   * arrive from the recognizer as "humanizar" or as "barra humanizar", depending
   * on the engine, so recognizing it there would be guessing.
   *
   * It's resolved against the real skill list: whatever matches none stays as
   * text. Without that check, typing "/etc está lleno de configuración" would
   * lose the first word and the model would answer a different question with
   * nothing to say so.
   */
  askWithText(text: string): Promise<void> {
    const { skillId, text: question } = parseSkillInvocation(text, listSkills());
    return this.answers.ask('manual-input', question, skillId);
  }

  /**
   * Captures the screen and solves whatever is on it: a programming exercise or
   * a quiz question.
   *
   * It doesn't go through `ask('hotkey')` on purpose, for two reasons:
   *
   *  - **The question isn't in the audio.** The prompt is on the screen, and
   *    taking the last utterance as the question would put a stray sentence from
   *    the call ("vale, dime cuando lo tengas") competing with the prompt.
   *  - **It works with listening stopped.** That's the normal case: someone with
   *    a LeetCode or a form in front of them and no call open. The transcript is
   *    sent anyway if it exists, because sometimes the important clarification
   *    was said out loud, but it doesn't have to exist.
   *
   * The two tasks share the whole path and split only in the prompt: what
   * changes between solving an algorithm and marking the right option is how it's
   * answered, not how you get there.
   */
  async solveOnScreen(task: ScreenTask = 'code'): Promise<void> {
    const image = await captureScreen({ forCode: true });

    if (!image) {
      // With no capture there's no prompt: the normal hotkey's "answer anyway"
      // doesn't apply here, because the model would have absolutely nothing to read.
      console.error(
        `[${task}] no se pudo capturar la pantalla; no hay ningún ${TASK_LABEL[task]} que resolver.`
      );
      this.broadcast(IPC.onNotice, m('err.noScreenshot'));
      return;
    }

    this.answers.attachImage(image);
    this.broadcast(IPC.onScreenshot, image);

    await this.answers.ask(task, SOLVE_INSTRUCTION[task]);
  }

  /**
   * The "chunk capture" shortcut. In manual mode it stacks a frame; in automatic
   * mode it starts or stops the capture loop. See `Settings.scrollCaptureMode`.
   */
  onCaptureHotkey(): void {
    if (settingsStore.get().scrollCaptureMode === 'auto') {
      if (this.autoCaptureTimer) {
        this.clearAutoTimer();
        this.emitScrollState();
      } else {
        this.startAutoCapture();
      }
      return;
    }
    void this.addFrame();
  }

  private startAutoCapture(): void {
    this.autoCaptureTimer = setInterval(
      () => void this.addFrame(),
      SessionOrchestrator.SCROLL_INTERVAL_MS
    );
    // The first frame right away, without waiting for the first interval.
    void this.addFrame();
    this.emitScrollState();
  }

  private clearAutoTimer(): void {
    if (this.autoCaptureTimer) {
      clearInterval(this.autoCaptureTimer);
      this.autoCaptureTimer = null;
    }
  }

  /** Captures a frame and stacks it. In automatic mode it dedups near-identical ones. */
  private async addFrame(): Promise<void> {
    if (this.captureStack.length >= SessionOrchestrator.SCROLL_MAX_FRAMES) {
      // Stack full: stop the loop if it was recording and warn just once.
      if (this.autoCaptureTimer) {
        this.clearAutoTimer();
        this.broadcast(IPC.onNotice, m('notice.scrollFull'));
        this.emitScrollState();
      }
      return;
    }

    const frame = await captureScreenFrame({ forCode: true });
    if (!frame) {
      this.broadcast(IPC.onNotice, m('err.noScreenshot'));
      return;
    }

    // Dedup only in automatic: in manual the user picks the chunk on purpose.
    const auto = settingsStore.get().scrollCaptureMode === 'auto';
    if (
      auto &&
      this.lastFrameHash !== null &&
      hamming(frame.hash, this.lastFrameHash) <= SessionOrchestrator.SCROLL_DEDUP_THRESHOLD
    ) {
      return; // the scroll hasn't moved: it's the same chunk
    }

    this.captureStack.push(frame.image);
    this.lastFrameHash = frame.hash;
    this.emitScrollState();
  }

  /** Reconstructs and solves the chunk stack. Empties it before asking. */
  async solveCaptureStack(): Promise<void> {
    this.clearAutoTimer();
    if (this.captureStack.length === 0) {
      this.broadcast(IPC.onNotice, m('err.noFrames'));
      this.emitScrollState();
      return;
    }

    const frames = this.captureStack;
    const last = frames[frames.length - 1];
    this.captureStack = [];
    this.lastFrameHash = null;

    for (const image of frames) this.answers.attachImage(image);
    // The last chunk serves as a thumbnail while the answer arrives.
    if (last) this.broadcast(IPC.onScreenshot, last);
    this.emitScrollState();

    await this.answers.ask('code', SCROLL_SOLVE_INSTRUCTION);
  }

  /** Empties the stack without solving (chip's ✕ button, or new conversation). */
  clearCaptureStack(): void {
    this.clearAutoTimer();
    this.captureStack = [];
    this.lastFrameHash = null;
    this.emitScrollState();
  }

  private emitScrollState(): void {
    this.broadcast(IPC.onScrollCapture, {
      frames: this.captureStack.length,
      capturing: this.autoCaptureTimer !== null,
      mode: settingsStore.get().scrollCaptureMode,
    } satisfies ScrollCaptureState);
  }

  /**
   * Forgets the assistant's memory without touching the conversation.
   *
   * It's separate from `newConversation` because they're different things: that
   * one cuts with everything —transcript, on-disk history, in-flight answer—,
   * and this only empties what's resent to the model on each query. It's what's
   * needed when the context window fills up mid-session in a session you want to
   * keep.
   */
  forgetContext(): { turns: number; max: number } {
    this.answers.forgetContext();
    this.broadcast(IPC.onMemory, this.answers.memory);
    return this.answers.memory;
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
      /*
       * The context is passed as a function and not as a value: the direct-audio
       * engine queries it on every turn, and by then the profile, the skill or
       * the memory may have changed.
       *
       * The skill comes in here too. With `gemini-audio` the answer is written
       * by the transcription engine, so if this were left out there'd be an
       * engine where turning on a skill did nothing — and from the screen the two
       * cases look identical.
       */
      const provider = createSTTProvider(settings, () => {
        const current = settingsStore.get();
        return {
          systemPrompt: buildSystemPrompt(current, undefined, getSkill(current.activeSkillId)),
          history: this.answers.historySnapshot(),
        };
      });

      provider.events.on('segment', (event: TranscriptEvent) => this.onSegment(event));

      // When the engine answers on its own, the question detector is redundant:
      // the one deciding if something deserved an answer is the model that heard
      // the audio.
      if (provider.answersDirectly) {
        provider.events.on('answer', (event: DirectAnswerEvent) => {
          this.answers.present(event.question, event.answer, 'gemini', event.model);
        });
      }
      provider.events.on('error', (err: Error) => {
        console.error('[stt]', err.message);
        // An STT error doesn't stop capture: audio keeps coming and the
        // reconnection can recover the session. But it IS shown: it used to go
        // only to `console.error`, so a session failing lane by lane looked just
        // like a silent room.
        this.broadcast(IPC.onSTTError, err.message);
      });

      await provider.start({
        sampleRate: 16_000,
        language: settings.language,
        speakers: speakersFor(settings.audioSources),
        vocabulary: collectVocabulary(settings.contextPacks, settings.promptProfileId),
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

      // Explicit warning about a combination that gives no symptom: audio comes
      // in, gets transcribed, and auto-trigger discards every segment because
      // the speaker that should fire it isn't even being listened to. Without
      // this line, from the outside it looks just like "the model doesn't answer".
      if (!provider.answersDirectly && autoTriggerIsInert(settings)) {
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
    this.clearPendingTriggers();
    for (const timer of this.silenceTimers.values()) clearTimeout(timer);
    this.silenceTimers.clear();

    // Stopping listening is the natural moment to consolidate: if the app closes
    // afterwards, what's pending from the debounce is already on disk.
    this.flush();

    const provider = this.stt;
    this.stt = null;
    await provider?.stop();
  }

  private onSegment(event: TranscriptEvent): void {
    this.lastSegmentAt = Date.now();
    const segment = this.transcript.ingest(
      event.speaker,
      event.text,
      event.isFinal,
      event.cumulative
    );
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
   * Saves a closed segment into the conversation.
   *
   * It's separate from `onFinalSegment` because that method returns early for
   * auto-trigger reasons (wrong speaker, mode off) and a segment should be
   * archived anyway: the history doesn't depend on the answer firing. A copy is
   * saved because the `TranscriptBuffer` recycles the partials' objects, and the
   * id is checked because a segment can be closed both by the engine and by the
   * silence timer.
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
   * Auto-trigger. Only closed utterances from the chosen speaker are evaluated;
   * the default is the other party because answering what the user themselves
   * says makes no sense in an interview.
   */
  private onFinalSegment(segment: TranscriptSegment): void {
    // With direct audio the answer already came with the transcription; firing
    // here would generate a second one, this time reading the text instead of
    // hearing it.
    if (this.stt?.answersDirectly) return;

    const settings = settingsStore.get();
    if (settings.autoTriggerMode === 'off') return;

    // In interpreter mode BOTH lanes are translated, so the speaker filter
    // doesn't apply: every utterance, whoever it comes from, is translated.
    const interpreting = settings.promptProfileId === 'interpreter';
    const wanted = settings.autoTriggerSpeaker;
    if (!interpreting && wanted !== 'any' && segment.speaker !== wanted) return;

    const text = segment.text.trim();
    if (!text) return;

    /*
     * It is NOT evaluated here, and that's the fix.
     *
     * Before, it fired on the first fragment and silenced the next ones for
     * 2.5 s. The comment said "a long question can close across several
     * segments", which is true, but the conclusion was the opposite of the right
     * one: it answered the hesitation and discarded the question.
     *
     * Now it accumulates and decides when the person really finishes talking.
     * Each new fragment resets the wait.
     */
    const pending = this.pendingTrigger.get(segment.speaker);
    if (pending) {
      clearTimeout(pending.timer);
      pending.parts.push(text);
      // A cap for whoever chains with no pauses: at some point you have to
      // answer whatever there is instead of waiting indefinitely.
      if (Date.now() - pending.startedAt >= SessionOrchestrator.AUTO_MAX_ACCUMULATE_MS) {
        this.pendingTrigger.delete(segment.speaker);
        this.evaluateTrigger(segment.speaker, pending.parts);
        return;
      }
      pending.timer = this.armSettleTimer(segment.speaker);
      return;
    }

    this.pendingTrigger.set(segment.speaker, {
      parts: [text],
      startedAt: Date.now(),
      timer: this.armSettleTimer(segment.speaker),
    });
  }

  /** Discards what's accumulated without answering it. On stop or topic change. */
  private clearPendingTriggers(): void {
    for (const pending of this.pendingTrigger.values()) clearTimeout(pending.timer);
    this.pendingTrigger.clear();
  }

  private armSettleTimer(speaker: Speaker): NodeJS.Timeout {
    return setTimeout(() => {
      const pending = this.pendingTrigger.get(speaker);
      if (!pending) return;
      this.pendingTrigger.delete(speaker);
      this.evaluateTrigger(speaker, pending.parts);
    }, SessionOrchestrator.AUTO_SETTLE_MS);
  }

  /**
   * Decides on the COMPLETE utterance, already joined.
   *
   * Judging the whole instead of each chunk also improves detection: a stray
   * "entonces… eh…" has no question marker, but joined to what comes after it
   * does.
   */
  private evaluateTrigger(speaker: Speaker, parts: string[]): void {
    const settings = settingsStore.get();
    const full = joinUtterance(parts);
    if (!full) return;

    // The interpreter doesn't detect questions: it translates everything said
    // and goes straight to firing, without the classifier or the discard.
    if (settings.promptProfileId === 'interpreter') {
      this.fire(speaker, full, 'interpreter', parts.length);
      return;
    }

    const verdict = looksLikeQuestion(full, settings.autoTriggerSensitivity);

    /*
     * Second step: what the heuristic couldn't decide is asked to the model.
     *
     * It only escalates the "no markers" discards, which are the genuinely
     * ambiguous ones. A filler or a two-word phrase is still discarded for free
     * — paying for a query to confirm that "vale, perfecto" isn't a question
     * would be throwing money away.
     *
     * It goes through a separate, async branch because it can't delay the normal
     * path: whoever has the mode on `heuristic` doesn't wait a single extra
     * millisecond for code they don't use.
     */
    if (
      !verdict.isQuestion &&
      settings.autoTriggerMode === 'heuristic+classifier' &&
      worthClassifying(verdict)
    ) {
      void this.classifyAndMaybeAsk(speaker, full, settings);
      return;
    }

    if (!verdict.isQuestion) {
      // The discard is logged: it's the only way to know why the app "doesn't
      // answer" without guessing. A real test spent five sentences in a row to
      // find out the detector was dropping them silently.
      console.log(`[auto] descartado (${verdict.reason}): "${full.slice(0, 80)}"`);
      // And it's also shown. The log is for debugging; the overlay, so whoever's
      // speaking understands why nothing happened.
      this.broadcast(IPC.onAutoSkip, { text: full, reason: verdict.reason });
      return;
    }

    this.fire(speaker, full, verdict.reason, parts.length);
  }

  /**
   * Asks the model and fires if it says yes.
   *
   * The discard is announced **after** the query, not before: showing "it wasn't
   * a question" and answering it two seconds later would be worse than staying
   * quiet.
   */
  private async classifyAndMaybeAsk(
    speaker: Speaker,
    full: string,
    settings: Settings
  ): Promise<void> {
    console.log(`[auto] sin marcadores; preguntando al clasificador: "${full.slice(0, 60)}"`);
    const verdict = await classifyQuestion(full, settings);

    if (!verdict.isQuestion) {
      console.log(`[auto] descartado (${verdict.reason}): "${full.slice(0, 80)}"`);
      this.broadcast(IPC.onAutoSkip, { text: full, reason: verdict.reason });
      return;
    }

    this.fire(speaker, full, verdict.reason, 1);
  }

  /** The firing itself, common to both steps. */
  private fire(speaker: Speaker, full: string, reason: string, partCount: number): void {
    // Safety net against double fires from different paths (the engine's close
    // and the silence timer can coincide).
    const now = Date.now();
    // The interpreter translates EVERY utterance; the debounce —meant against
    // double fires of the same question— would eat a quick back-and-forth.
    if (
      reason !== 'interpreter' &&
      now - this.lastAutoTrigger < SessionOrchestrator.AUTO_DEBOUNCE_MS
    ) {
      console.log(`[auto] ignorado por debounce: "${full.slice(0, 60)}"`);
      return;
    }
    this.lastAutoTrigger = now;

    const fragmentos = partCount > 1 ? ` [${partCount} fragmentos unidos]` : '';
    console.log(`[auto:${speaker}] disparando (${reason})${fragmentos}: "${full.slice(0, 80)}"`);
    void this.answers.ask('auto', full);
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
    // Same hook as in `index.ts`: the phone mirror receives what the windows
    // receive and decides for itself what's useful. The answers pass through
    // here, which are the reason the mirror exists.
    phoneBridge.publish(channel, payload);
    // And to the broker, which filters on its own: it only cares about finished
    // answers. See `bridge/mqtt.ts`.
    mqttBridge.publish(channel, payload);
  }
}

/**
 * Joins fragments of a single utterance into a readable sentence.
 *
 * The chunks come from the recognizer already punctuated, so gluing them with a
 * space produces things like "Entonces. ¿Cómo lo harías?" — correct. What has to
 * be avoided is duplicated punctuation and chunks that end in a comma, where an
 * extra period would break the sentence.
 */
function joinUtterance(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts terms from the context packs to bias the recognizer.
 *
 * A CV and a job description are full of proper nouns, acronyms and
 * technologies: exactly what a generalist ASR transcribes badly. We keep the
 * capitalized or uppercase tokens, which is where those terms are.
 */
function collectVocabulary(packs: ContextPack[], profile: PromptProfileId): string[] {
  const terms = new Set<string>();
  const active = packsForProfile(packs, profile);

  /*
   * The declared terms go FIRST and whole.
   *
   * Before, all the vocabulary was guessed with a regex of capitalized words
   * over the packs' text. That pulls out "Python" and "AWS", yes, but also every
   * word that opens a sentence, and it loses exactly what fails most: the
   * interviewer's surname, the internal product name, an acronym that isn't
   * uppercase. With a `vocabulary`-kind pack those terms are written by hand and
   * arrive as-is.
   *
   * It matters more than before because this vocabulary no longer goes only to
   * Gemini Live: it also feeds Whisper's `--prompt`.
   */
  for (const pack of active) {
    if (pack.kind !== 'vocabulary') continue;
    for (const term of pack.content.split(/[,\n]/)) {
      const clean = term.trim();
      if (clean) terms.add(clean);
    }
  }

  // The rest is still inferred: a pasted CV brings dozens of technologies no one
  // is going to copy by hand into a list.
  for (const pack of active) {
    if (pack.kind === 'vocabulary') continue;
    const matches = pack.content.match(/\b[A-Z][A-Za-z0-9+#.]{1,20}\b/g) ?? [];
    for (const term of matches) {
      if (term.length > 1) terms.add(term);
    }
  }

  // The API caps custom vocabulary; sending hundreds of terms makes it worse
  // rather than better, so we keep the first ones. The declared ones go up
  // front, so they're the ones that survive the trim.
  return [...terms].slice(0, 100);
}

export const session = new SessionOrchestrator();

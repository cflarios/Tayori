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
import { answerLanguageDirective, buildSystemPrompt } from './prompt';
import { neutralize } from './untrusted';
import type { TranscriptBuffer } from './transcript-buffer';

/**
 * Generates answers and emits them as they arrive.
 *
 * Central rule: ONLY ONE answer in flight. If a new question arrives, the
 * previous one is aborted. In a live conversation a stale answer is worse than
 * none: the user reads it and answers something that already passed.
 *
 * It emits `answer` with the full state on each update, instead of just the
 * delta, so the renderer doesn't have to rebuild the state.
 */

/** Output cap. Short on purpose: you have to be able to read it at a glance. */
const MAX_ANSWER_TOKENS = 700;

/**
 * Code-mode cap.
 *
 * With 700 the solution comes out cut off mid-function, and a truncated
 * implementation is worthless. 4096 covers large solutions —a technical test
 * with several parts, not just a stray algorithm— in any verbose language. What
 * still doesn't fit is extended with `continueAnswer()`, which adds to the same
 * answer instead of raising the cap enough to allow an essay.
 */
const MAX_CODE_TOKENS = 4_096;

/**
 * Which profile each trigger imposes, if any.
 *
 * The screen buttons solve in their mode **without changing the settings**: code
 * mode is used mid-interview and the next spoken question still comes out in
 * bullets.
 */
const PROFILE_BY_TRIGGER: Partial<Record<AnswerTrigger, PromptProfileId>> = {
  code: 'coding',
  quiz: 'quiz',
  general: 'general',
};

/**
 * General screen-help cap.
 *
 * Between the quiz's 700 (a line and two bullets) and code's 4096: enough that
 * reading logs, explaining a diagram or listing the steps from A to B doesn't get
 * cut off, without inviting an essay in a panel read out of the corner of the eye.
 */
const MAX_GENERAL_TOKENS = 1_200;

/**
 * Output cap per profile. Whatever isn't listed uses `MAX_ANSWER_TOKENS`.
 *
 * Only code raises it: a quiz answer fits easily in the normal cap —it's one
 * line and two bullets— and raising it only invites rambling.
 */
const TOKENS_BY_PROFILE: Partial<Record<PromptProfileId, number>> = {
  coding: MAX_CODE_TOKENS,
  general: MAX_GENERAL_TOKENS,
};

/**
 * The "question" for "Continue".
 *
 * The model already has its partial as the assistant's last turn —`remember`
 * put it there when closing the answer— so here all it takes is asking it to
 * keep going from where it was cut off, without repeating. It's what allows a
 * solution longer than a single call's cap.
 */
const CONTINUE_INSTRUCTION =
  'Tu respuesta anterior se cortó por longitud. Continúa EXACTAMENTE desde donde ' +
  'te quedaste, por el siguiente carácter, sin repetir ni reintroducir nada de lo ' +
  'ya escrito. Si el bloque de código seguía abierto, sigue dentro de él sin ' +
  'volver a abrir la valla. Nada de saludos ni resúmenes: sólo la continuación.';

/** How often, in ms, the accumulated text is broadcast during streaming. */
const FLUSH_INTERVAL_MS = 60;

/**
 * Time cap for a complete answer.
 *
 * Without it, a provider that hangs leaves the answer on "Thinking…" **forever**:
 * no error, no retry, and since the overlay looks exactly the same as while it's
 * genuinely thinking, from the outside it's "the app stopped responding". It
 * really happens with Ollama on CPU: if the model was unloaded for inactivity
 * and has to be reloaded while Whisper is using the machine, the first request
 * can take minutes or never come back.
 *
 * 2 minutes is more than long enough for any legitimate 700-token generation,
 * even on CPU, and short enough that the failure shows within the conversation.
 */
const GENERATION_TIMEOUT_MS = 120_000;

/** With not a single token in this time, the provider isn't going to start. */
const FIRST_TOKEN_TIMEOUT_MS = 45_000;

export class AnswerEngine extends EventEmitter {
  private current: Answer | null = null;
  private controller: AbortController | null = null;
  /** Captures pending attachment to the next query. */
  private pendingImages: ImageAttachment[] = [];

  /**
   * Already-closed turns of this conversation, oldest to newest.
   *
   * Without this the assistant had no memory of what it had said itself: each
   * question was a new one-turn conversation. The transcript didn't supply it,
   * because it only contains speech —what the mic and the system say—, never the
   * generated answers.
   */
  private history: ConversationExchange[] = [];

  /**
   * How many exchanges are resent. Eight easily covers a several-minute
   * conversation without the prompt growing until it hurts; the oldest fall off
   * the front.
   */
  private static readonly MAX_HISTORY = 8;

  constructor(private readonly transcript: TranscriptBuffer) {
    super();
  }

  /** Attaches a capture to the next question. */
  attachImage(image: ImageAttachment): void {
    this.pendingImages.push(image);
  }

  get hasPendingImages(): boolean {
    return this.pendingImages.length > 0;
  }

  /** Copy of the memory, for whoever has to compose the request themselves. */
  historySnapshot(): ConversationExchange[] {
    return [...this.history];
  }

  /**
   * Shows an answer generated by someone else (the direct-audio engine).
   *
   * It doesn't go through `ask()` because there's nothing to request: when the
   * WAV goes to the model itself, the answer arrives with the transcription in
   * the same call. What it does share is everything after —broadcast to the
   * overlay, memory, on-disk history—, and that's why it lives here and not
   * loose in the orchestrator.
   */
  present(question: string, text: string, providerId: LLMProviderId, model: string): void {
    // If there was a generation in flight, this answer replaces it.
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
   * Forgets the previous turns. "New conversation" calls it: otherwise the
   * assistant's memory would survive a reset that exists precisely to cut with
   * what came before.
   */
  resetHistory(): void {
    this.history = [];
  }

  /**
   * How many exchanges the model has in its head, and how many fit.
   *
   * It's shown because it's the only part of a query's cost the user can
   * control, and there was no way to know it: each saved turn is resent whole in
   * the next question. With Ollama that also collides with `num_ctx`, and what
   * doesn't fit is discarded **with no error at all** — the symptom is the model
   * "forgetting" something you just told it.
   */
  get memory(): { turns: number; max: number } {
    return { turns: this.history.length, max: AnswerEngine.MAX_HISTORY };
  }

  /**
   * Forgets the conversation memory WITHOUT touching anything else.
   *
   * It's finer than "new conversation", and that's why it exists: that one
   * aborts the in-flight answer, empties the transcript, closes the conversation
   * on disk and starts another. Here only what's resent to the model on each
   * query is dropped, which is what bloats the prompt and what makes a local
   * model with a small window start losing the beginning.
   */
  forgetContext(): void {
    const had = this.history.length;
    this.history = [];
    console.log(`[answer] contexto olvidado a petición: ${had} intercambios fuera.`);
  }

  /** Cancels the current generation, if there is one. */
  abort(): void {
    this.controller?.abort();
    this.controller = null;
    if (
      this.current &&
      (this.current.status === 'thinking' || this.current.status === 'streaming')
    ) {
      this.update({ status: 'aborted' });
    }
  }

  /**
   * Fires an answer.
   *
   * @param question Specific question if it could be isolated; otherwise the
   *                 model infers it from the transcript.
   *
   * The `code` trigger isn't just a label for the log: it changes the profile
   * and the token cap of THIS query without touching the settings. It's what
   * lets you solve what's on screen mid-interview and have the next spoken
   * question still come out in four bullets.
   *
   * @param skillId Skill for this query only, from the `/skill` prefix of the
   *        writing tab. Without it `settings.activeSkillId` rules, which is the
   *        one set in the overlay.
   */
  async ask(trigger: AnswerTrigger, question?: string, skillId?: string): Promise<void> {
    // Aborting before starting is what guarantees the "only one in flight"
    // invariant no matter where it's called from.
    this.abort();

    const settings = settingsStore.get();

    /*
     * Two paths lead to a special profile: the screen button, which imposes it
     * for this query only, and the overlay chip, which leaves it set. Both have
     * to reach the same place — when only the trigger was looked at, choosing
     * "Code" by hand left the cap at 700 tokens and the solution came out cut off
     * mid-function.
     */
    const forced = PROFILE_BY_TRIGGER[trigger];
    const profile = forced ?? settings.promptProfileId;
    const onScreen = isScreenTrigger(trigger);

    // Screen actions can have their own model: speech asks for latency and the
    // screen asks for vision. See `screenModelFor`.
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
     * Two clocks, not one. The first covers "the provider doesn't start" —model
     * downloading, server stuck— and the second "it started but doesn't finish".
     * Telling them apart matters because the message to the user is different,
     * and because a partial answer is better than none: when the long one
     * expires, what was already written is kept.
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
       * With a vision-less model, a capture is discarded silently. For a spoken
       * question that just degrades and that's it —the question is still in the
       * audio—, but in the screen actions the capture IS the prompt: without it
       * the model would invent the whole exercise and the answer would look
       * perfect. It's better to spend the keypress saying what's missing.
       */
      if (onScreen && images.length && !provider.supportsVision) {
        this.update({
          status: 'error',
          error: m('err.noVision', { model: provider.model }),
        });
        return;
      }

      /*
       * The skill is resolved here and not in the caller so that the three paths
       * —the written prefix, the overlay chip and the automatic trigger— pass
       * through the same door. `getSkill` returns `undefined` if it's broken or
       * if the id no longer exists, which is what keeps a deleted folder from
       * leaving the app sending a half-baked prompt.
       */
      const skill = getSkill(skillId ?? settings.activeSkillId);

      const stream = provider.streamAnswer(
        {
          systemPrompt: buildSystemPrompt(settings, forced, skill),
          transcript: this.transcript.format(this.transcript.recent(settings.manualContextSeconds)),
          // When an answer language is pinned, the directive is appended to the
          // user turn IN that language — the strongest output-language cue, harder
          // for a model to ignore than the system rule (see Sonnet).
          ...(question
            ? {
                question:
                  settings.answerLanguage === 'auto'
                    ? question
                    : `${question}\n\n${answerLanguageDirective(settings.answerLanguage)}`,
              }
            : {}),
          // A copy is passed: generation is async and `history` can receive a
          // new turn while this one is still in flight.
          ...(this.history.length ? { history: [...this.history] } : {}),
          // A vision-less model would ignore the images silently; better not to
          // send them and save the bandwidth.
          ...(provider.supportsVision && images.length ? { images } : {}),
          maxTokens: TOKENS_BY_PROFILE[profile] ?? MAX_ANSWER_TOKENS,
          // Without the user-turn envelopes: the interpreter translates
          // everything and carried the tags along. See `AnswerRequest.interpreter`.
          interpreter: profile === 'interpreter',
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
   * Extends the last finished answer, adding to the SAME answer.
   *
   * It's what solves a solution longer than a single call's cap: the candidate
   * presses "Continue" and the model keeps going where it was cut off. The same
   * id is reused and the base text is seeded, so `consume` —which adds to
   * `this.current.text`— glues the continuation onto the end; the overlay and
   * the phone, which update by id, watch a single answer grow instead of two.
   *
   * The partial already travels as the assistant's last turn (`remember` put it
   * there), so the capture doesn't need resending: the model continues its own
   * code. It can be pressed several times.
   */
  async continueAnswer(): Promise<void> {
    const prev = this.current;
    if (!prev || prev.status !== 'done' || !prev.text.trim()) return;

    this.abort();
    const settings = settingsStore.get();
    const onScreen = isScreenTrigger(prev.trigger);
    const forced = PROFILE_BY_TRIGGER[prev.trigger];
    const profile = forced ?? settings.promptProfileId;

    // Same answer, same id, with its text already in place: `consume` adds on top.
    this.current = { ...prev, status: 'streaming' };
    this.emitCurrent();

    const controller = new AbortController();
    this.controller = controller;

    let gotFirstToken = false;
    const firstTokenTimer = setTimeout(() => {
      if (!gotFirstToken && !controller.signal.aborted) {
        controller.abort();
        // There's already text: keep what there was instead of leaving it in error.
        this.update({ status: 'done' });
      }
    }, FIRST_TOKEN_TIMEOUT_MS);
    const totalTimer = setTimeout(() => {
      if (!controller.signal.aborted) {
        controller.abort();
        this.update({ status: 'done' });
      }
    }, GENERATION_TIMEOUT_MS);

    try {
      const provider = createLLMProvider(settings, onScreen);
      const skill = getSkill(settings.activeSkillId);
      const stream = provider.streamAnswer(
        {
          systemPrompt: buildSystemPrompt(settings, forced, skill),
          transcript: this.transcript.format(this.transcript.recent(settings.manualContextSeconds)),
          question: CONTINUE_INSTRUCTION,
          ...(this.history.length ? { history: [...this.history] } : {}),
          maxTokens: TOKENS_BY_PROFILE[profile] ?? MAX_ANSWER_TOKENS,
        },
        controller.signal
      );

      await this.consume(stream, controller, settings, () => {
        gotFirstToken = true;
        clearTimeout(firstTokenTimer);
      });
      this.rememberContinuation();
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
   * Like `remember`, but for a continuation: it's the SAME round, so the last
   * exchange is updated instead of stacking a new one (otherwise the model would
   * see its solution twice in memory).
   */
  private rememberContinuation(): void {
    const answer = this.current;
    if (!answer || answer.status !== 'done' || !answer.text.trim()) return;
    const last = this.history[this.history.length - 1];
    if (last) last.answer = answer.text.trim();
    else this.remember();
  }

  /**
   * Consumes the stream, accumulating text and broadcasting with throttle.
   *
   * Without throttle, every token would fire an IPC message and a React
   * re-render: hundreds per answer, with the overlay stuttering.
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
      // A stream that ends with no text almost always means the model refused or
      // ran out of tokens; saying so is better than an empty panel.
      ...(this.current?.text ? {} : { status: 'error', error: m('err.emptyAnswer') }),
    });
  }

  /**
   * Archives the just-finished turn for the next queries.
   *
   * Only ones completed with text are saved: an aborted or failed one isn't
   * something the model "said", and adding it would make it believe otherwise.
   * If there was no isolated question a marker is saved, because the API demands
   * non-empty content in every message.
   */
  private remember(): void {
    const answer = this.current;
    if (!answer || answer.status !== 'done' || !answer.text.trim()) return;

    /*
     * The question is dismantled when saved, not when sent.
     *
     * It travels as a real `user` message —that's what makes the model treat its
     * previous answers as things it said— and therefore **outside every
     * envelope**. Without this, an instruction that had been stopped in
     * `<transcripcion>` would come back in the next query with nothing around it.
     *
     * Here and not in each provider because this is the only door to memory; the
     * history saved on disk is another path and keeps the literal text, which is
     * what has to be re-readable.
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

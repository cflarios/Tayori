import type { ImageAttachment, LLMProviderId, ModelInfo } from '@shared/types';

/**
 * Contract of an answer provider.
 *
 * The orchestrator doesn't know whether Claude, Gemini, ChatGPT or Ollama is
 * behind it. Adding Groq or any other one is a new file plus an entry in the
 * `index.ts` map.
 */

/**
 * An already-closed exchange from this same conversation.
 *
 * It exists because it was missing: each query used to be sent as a single turn
 * —system prompt plus one user message— and **the model's own previous answers
 * never came back**. The result, verified in a real conversation, is that the
 * assistant would say it was in sales and ninety seconds later reply "I have no
 * information about what my profession is". It wasn't a lack of context in the
 * transcript: it was that its own voice wasn't part of the input.
 */
export interface ConversationExchange {
  question: string;
  answer: string;
}

export interface AnswerRequest {
  /** Instructions + context packs. The stable part, and therefore cacheable. */
  systemPrompt: string;
  /** Recent transcript, already formatted with speaker tags. */
  transcript: string;
  /** The specific question to answer, if it could be isolated. */
  question?: string;
  /**
   * Previous turns, oldest to newest. They're sent as real messages
   * (`user`/`assistant`), not embedded in the text: that's what makes the model
   * treat them as something it said and not as reference material.
   */
  history?: ConversationExchange[];
  /** Attached screenshots. Ignored if the model can't see images. */
  images?: ImageAttachment[];
  /** Output token cap. Short on purpose: it has to be read out loud. */
  maxTokens: number;
  /**
   * Interpreter mode: the user turn goes in **raw**, without the
   * `<transcripcion>`/`<pregunta>` envelopes or the final instruction.
   *
   * Those envelopes are the injection safety boundary for the other profiles,
   * but here they're in the way: the interpreter translates EVERYTHING into the
   * other language, so it also translated the tag names (`<transcripcion>` →
   * `<transcription>`) and slipped them into the output. And there's nothing to
   * defend: translating is literal by design. See `buildUserTurn` and
   * CONTEXT.md §Intérprete.
   */
  interpreter?: boolean;
}

export interface LLMProvider {
  readonly id: LLMProviderId;
  readonly model: string;
  readonly supportsVision: boolean;

  /** Available models. May hit the network (Ollama) or be static. */
  listModels(): Promise<ModelInfo[]>;

  /**
   * Emits the text in chunks as it arrives.
   *
   * `signal` isn't optional by design: if the other party asks a new question
   * while the previous one is being generated, the in-flight request has to be
   * cancelled or the overlay would show the answer to a question that already
   * passed.
   */
  streamAnswer(request: AnswerRequest, signal: AbortSignal): AsyncIterable<string>;

  /** Checks credentials and connectivity; used by the dashboard button. */
  testConnection(): Promise<{ ok: boolean; error?: string }>;
}

/** Error with a message meant to be shown to the user as-is. */
export class LLMError extends Error {
  constructor(
    message: string,
    readonly providerId: LLMProviderId
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

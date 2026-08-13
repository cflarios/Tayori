import OpenAI from 'openai';
import { m } from '../i18n';
import { buildUserTurn } from './user-turn';
import type { LLMProviderId, ModelInfo } from '@shared/types';
import { LLMError, type AnswerRequest, type LLMProvider } from './types';

/**
 * OpenAI (ChatGPT) provider.
 *
 * It goes through the **Responses API**, not Chat Completions, and it's not
 * indifferent: the GPT-5 models reason, and in Chat Completions the reasoning
 * can't be governed —neither the effort nor the budget— so the only latency
 * lever that exists for this use case lives in the other API.
 *
 * Four provider-specific decisions, all verified against the installed SDK's
 * types (`node_modules/openai/resources/**`) and not from memory, which is the
 * rule already applied with `@google/genai`:
 *
 *  - **`store: false`.** The Responses API stores the response in the OpenAI
 *    account by default so it can be retrieved later by API. This app exists so
 *    that what's said in a meeting stays nowhere, so the provider's default goes
 *    against the product's promise and is turned off explicitly. It's the line
 *    equivalent to "the audio doesn't touch the disk", but on the cloud side.
 *  - **`reasoning.effort: 'low'`.** Same reasoning as Claude's `effort`: the
 *    answer is read out of the corner of your eye while someone looks you in the
 *    face, so latency is prioritized. It isn't disabled entirely (`none`)
 *    because not all models accept it and because `low` already trims almost
 *    everything.
 *  - **`max_output_tokens` also counts the reasoning tokens**, just like
 *    `num_predict` in Ollama. See `budgetFor`: it's exactly the same trap, and
 *    it produces the same silent failure — empty answer, no error.
 *  - **`temperature` and `top_p` are not sent.** The reasoning models reject
 *    them, and in the rest the style is controlled by prompt, which has been the
 *    project's rule since Claude.
 *
 * Prompt caching is **not requested**: OpenAI caches only prefixes over ~1,024
 * tokens. The equivalent of Anthropic's `cache_control` isn't needed, and that's
 * why it isn't here — it's not an oversight.
 */

/**
 * Starting catalog: the GPT-5.6 family, which is the current one.
 *
 * The three roles and the vision are **verified against OpenAI's reference**,
 * not deduced from the name — which is no help here, because "sol", "terra" and
 * "luna" don't say which is the big one: Sol is the frontier model for complex
 * work, Terra balances capability and cost, and Luna is the one for
 * price-sensitive loads. All three accept text **and image**, which is the
 * condition for also appearing in the screen selector.
 *
 * Like Claude's and Gemini's, it's a **suggestion and not a boundary**: the
 * dashboard offers "Other…" to type any id, and the installed SDK lists quite a
 * few more (the `gpt-5.4` and earlier families, the `-pro`s, the `-codex`es).
 *
 * The order isn't by price, it's by **which one almost everyone wants**: Terra
 * first because it's the default, and for the same reason Sonnet is in Claude —
 * an app that fires a query for every question it hears mustn't start with the
 * expensive model.
 */
export const OPENAI_MODELS: ModelInfo[] = [
  { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', supportsVision: true, note: 'mdl.balanced' },
  { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', supportsVision: true, note: 'mdl.capable' },
  { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', supportsVision: true, note: 'mdl.cheapest' },
];

/** Reasoning effort level. `low` prioritizes latency. */
type Effort = 'none' | 'minimal' | 'low' | 'medium' | 'high';

/**
 * How much the model is lent to reason, apart from the answer.
 *
 * `max_output_tokens` is a **joint** cap: the reasoning tokens come from the
 * same budget as the text that's read. With the code-mode cap —2,200— a model
 * that thinks can spend it entirely deliberating and finish without writing
 * anything, and the app then falls into its "the stream ended with no text"
 * branch, which points nowhere. It's literally the same bug already documented
 * with `num_predict` in Ollama, and here it's covered the same way: lending room
 * instead of raising the cap a little.
 *
 * With `effort: 'low'` the reasoning is much shorter than a local "thinking"
 * model's, so 4,000 is enough and isn't a blank check: only the ones the model
 * actually uses are spent.
 */
const REASONING_BUDGET_TOKENS = 4_000;

/**
 * Models that do **not** accept the `reasoning` block.
 *
 * Only the reasoning models accept it. A `gpt-4o` or a `gpt-4.1` typed by hand
 * in "Other…" returns a 400 over a parameter the user doesn't know is being
 * sent, so **all** their questions would fail — the exact same pattern that left
 * Haiku 4.5 dead in `claude.ts`.
 *
 * It starts empty and **is learned at runtime**: the list of models without
 * reasoning ages just as fast as the one with, so the first request discovers
 * it, retries without the block, and the following ones come out fine.
 */
const REASONING_UNSUPPORTED = new Set<string>();

/** Recognizes the specific `reasoning` 400, without guessing from free text. */
function isReasoningRejected(err: unknown): boolean {
  return (
    err instanceof OpenAI.BadRequestError &&
    /reasoning/i.test(err.message ?? '') &&
    /unsupported|not supported|unknown parameter|does not support/i.test(err.message ?? '')
  );
}

/**
 * Real output cap for this query.
 *
 * It's exported so it can be pinned with a test, for the same reason as
 * `budgetFor` in `ollama.ts`: the bug it avoids is invisible —an empty answer
 * with no error— and "simplifying" this to a bare `request.maxTokens` is exactly
 * what would bring it back.
 */
export function budgetFor(maxTokens: number, withReasoning: boolean): number {
  return withReasoning ? maxTokens + REASONING_BUDGET_TOKENS : maxTokens;
}

export class OpenAIProvider implements LLMProvider {
  readonly id: LLMProviderId = 'openai';
  readonly supportsVision = true;

  private client: OpenAI;

  constructor(
    apiKey: string,
    readonly model: string = 'gpt-5.6-terra',
    private readonly effort: Effort = 'low'
  ) {
    this.client = new OpenAI({ apiKey });
  }

  listModels(): Promise<ModelInfo[]> {
    return Promise.resolve(OPENAI_MODELS);
  }

  async *streamAnswer(request: AnswerRequest, signal: AbortSignal): AsyncIterable<string> {
    // Images first and text after, same as in Claude: the model interprets them
    // better when the instruction comes after and can refer to them.
    const content: OpenAI.Responses.ResponseInputMessageContentList = [];

    for (const image of request.images ?? []) {
      content.push({
        type: 'input_image',
        // The API accepts base64 as a data URL; there's no need to upload the
        // file first, which would be an extra trip per screen press.
        image_url: `data:${image.mime};base64,${image.base64}`,
        // `auto` lets the model decide the detail. Forcing `high` would spend
        // more tokens per capture without anyone asking for it.
        detail: 'auto',
      });
    }
    content.push({ type: 'input_text', text: buildUserTurn(request, true) });

    const withReasoning = !REASONING_UNSUPPORTED.has(this.model);
    let emitted = 0;

    try {
      for await (const chunk of this.run(content, request, signal, withReasoning)) {
        emitted += 1;
        yield chunk;
      }
    } catch (err) {
      // Cancelling is what's expected when another question arrives, not an
      // error to show.
      if (signal.aborted) return;

      // It's only retried if not a single token came out: repeating after having
      // written would duplicate text on screen. The `reasoning` 400 arrives
      // before any content, so in practice it always enters here.
      if (emitted === 0 && withReasoning && isReasoningRejected(err)) {
        REASONING_UNSUPPORTED.add(this.model);
        console.warn(`[openai] "${this.model}" no acepta "reasoning"; reintentando sin él.`);
        yield* this.run(content, request, signal, false);
        return;
      }
      throw toLLMError(err, this.id);
    }
  }

  /** A single request. `withReasoning` decides whether the block is sent. */
  private async *run(
    content: OpenAI.Responses.ResponseInputMessageContentList,
    request: AnswerRequest,
    signal: AbortSignal,
    withReasoning: boolean
  ): AsyncIterable<string> {
    const stream = await this.client.responses.create(
      {
        model: this.model,
        // The system prompt goes in `instructions`, which is its place: it
        // doesn't compete with the user turn and is the prefix OpenAI caches on
        // its own.
        instructions: request.systemPrompt,
        input: [...historyMessages(request), { role: 'user', content }],
        max_output_tokens: budgetFor(request.maxTokens, withReasoning),
        ...(withReasoning ? { reasoning: { effort: this.effort } } : {}),
        // Don't store the response in the OpenAI account. The API's default is
        // `true`, and storing what's said in an interview contradicts exactly
        // what this app exists for.
        store: false,
        stream: true,
      },
      { signal }
    );

    /** Whether it got to write anything, and why it stopped. Not the same. */
    let emitted = false;
    let refusal = '';
    let incompleteReason = '';

    for await (const event of stream) {
      if (signal.aborted) return;

      if (event.type === 'response.output_text.delta') {
        emitted = true;
        yield event.delta;
        continue;
      }

      /*
       * A refusal does NOT arrive as an exception: it comes as content of
       * another type inside a 200, just like Claude's `stop_reason: 'refusal'`.
       * Without looking at it, the overlay would go blank with no explanation.
       */
      if (event.type === 'response.refusal.delta') {
        refusal += event.delta;
        continue;
      }

      if (event.type === 'response.incomplete') {
        incompleteReason = event.response.incomplete_details?.reason ?? '';
        continue;
      }

      // The stream's own error isn't an SDK exception either.
      if (event.type === 'response.failed') {
        throw new LLMError(
          m('err.openaiStreamFailed', {
            message: event.response.error?.message ?? m('err.noReason'),
          }),
          this.id
        );
      }
    }

    if (refusal.trim()) {
      throw new LLMError(
        m('err.refusedOpenai', { detail: refusal.trim() }),
        this.id
      );
    }

    /*
     * Running out of budget is different from having nothing to say, and so is
     * the fix: here you touch a setting or switch models, so the message says so
     * instead of a "returned no text" that leads nowhere.
     */
    if (!emitted && incompleteReason === 'max_output_tokens') {
      throw new LLMError(
        m('err.budgetOpenai', { model: this.model }),
        this.id
      );
    }
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      /*
       * 16 tokens is the minimum the API accepts, and with reasoning on it eats
       * them whole: the response comes back `incomplete` and with no text. It
       * doesn't matter — what's checked here is that the key works and the model
       * exists, and both fail with an exception. Spending a real budget just to
       * read "OK" would be charging the user for a button.
       */
      await this.client.responses.create({
        model: this.model,
        input: 'Di OK.',
        max_output_tokens: 16,
        store: false,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: toLLMError(err, this.id).message };
    }
  }
}

/**
 * Translates the SDK errors into actionable messages.
 *
 * With the typed classes, which is the way that doesn't break when the provider
 * changes the message text.
 */
function toLLMError(err: unknown, providerId: LLMProviderId): LLMError {
  if (err instanceof LLMError) return err;

  if (err instanceof OpenAI.AuthenticationError) {
    return new LLMError(m('err.badKeyOpenai'), providerId);
  }
  if (err instanceof OpenAI.PermissionDeniedError) {
    return new LLMError(
      m('err.noAccessOpenai'),
      providerId
    );
  }
  if (err instanceof OpenAI.RateLimitError) {
    // OpenAI's 429 covers two things fixed very differently: going too fast, and
    // not having paid. Saying only "limit reached" sends whoever has to top up
    // their balance off to wait.
    return new LLMError(
      m('err.rateOpenai'),
      providerId
    );
  }
  if (err instanceof OpenAI.NotFoundError) {
    return new LLMError(
      m('err.noModel'),
      providerId
    );
  }
  if (err instanceof OpenAI.APIConnectionError) {
    return new LLMError(m('err.offlineOpenai'), providerId);
  }
  if (err instanceof OpenAI.APIError) {
    return new LLMError(m('err.apiError', { provider: 'OpenAI', status: err.status ?? '?', message: err.message }), providerId);
  }
  return new LLMError(err instanceof Error ? err.message : String(err), providerId);
}

/**
 * Previous turns as real messages.
 *
 * Alternating `user`/`assistant` and not summarized inside the prompt: it's what
 * makes the model recognize its answers as things it said. Empty ones are
 * skipped because a message with no content adds nothing and does take up space.
 */
function historyMessages(request: AnswerRequest): OpenAI.Responses.ResponseInputItem[] {
  const messages: OpenAI.Responses.ResponseInputItem[] = [];
  for (const turn of request.history ?? []) {
    if (!turn.question.trim() || !turn.answer.trim()) continue;
    messages.push({ role: 'user', content: turn.question });
    messages.push({ role: 'assistant', content: turn.answer });
  }
  return messages;
}


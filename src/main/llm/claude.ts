import Anthropic from '@anthropic-ai/sdk';
import { m } from '../i18n';
import { buildUserTurn } from './user-turn';
import type { LLMProviderId, ModelInfo } from '@shared/types';
import { LLMError, type AnswerRequest, type LLMProvider } from './types';

/**
 * Claude provider.
 *
 * Model-specific decisions, verified against the API reference and not from
 * memory:
 *
 *  - `temperature`, `top_p` and `top_k` are NOT sent: on Opus 5 and Sonnet 5
 *    they're removed and return 400. Style is controlled by prompt.
 *  - Thinking is on by default on Opus 5. For a real-time assistant the latency
 *    lever is `effort: 'low'`, not disabling thinking: disabling it has two known
 *    bugs (tool calls emitted as plain text and <thinking> tags leaked into the
 *    answer). **But `effort` is a generation-5 thing and not all models accept
 *    it**; see `EFFORT_UNSUPPORTED`. That distinction was missing and made Haiku
 *    4.5 fail with a 400 on every question.
 *  - `cache_control` on the system prompt: the CV and the job description don't
 *    change during the interview, so that prefix is cached and the following
 *    calls cost ~10% on that part. It requires ≥512 tokens on Opus 5 for the
 *    cache to be created; below that it simply doesn't cache.
 */

export const CLAUDE_MODELS: ModelInfo[] = [
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', supportsVision: true, note: 'mdl.fast' },
  { id: 'claude-opus-5', label: 'Claude Opus 5', supportsVision: true, note: 'mdl.capable' },
  {
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    supportsVision: true,
    note: 'mdl.lowLatency',
  },
];

/** Effort level. `low` prioritizes latency, which is what this case asks for. */
type Effort = 'low' | 'medium' | 'high';

/**
 * Models that do **not** accept `output_config.effort`.
 *
 * `effort` is a Claude-5-generation thing. It was being sent to all models, and
 * Haiku 4.5 rejects it with a blunt 400:
 *
 *   "This model does not support the effort parameter."
 *
 * The result was that Haiku ALWAYS failed on audio and the user only saw "error
 * 400" with nothing more. The set starts with what we know and completes itself:
 * if some future model also rejects it, the first request learns it and the
 * following ones come out fine.
 */
const EFFORT_UNSUPPORTED = new Set<string>(['claude-haiku-4-5']);

/** Recognizes the specific `effort` 400 without comparing strings blindly. */
function isEffortRejected(err: unknown): boolean {
  return (
    err instanceof Anthropic.BadRequestError && /effort parameter/i.test(err.message ?? '')
  );
}

export class ClaudeProvider implements LLMProvider {
  readonly id: LLMProviderId = 'claude';
  readonly supportsVision = true;

  private client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string = 'claude-sonnet-5',
    private readonly effort: Effort = 'low'
  ) {
    this.client = new Anthropic({ apiKey });
  }

  listModels(): Promise<ModelInfo[]> {
    return Promise.resolve(CLAUDE_MODELS);
  }

  async *streamAnswer(request: AnswerRequest, signal: AbortSignal): AsyncIterable<string> {
    // The user turn's content: images first, text after. Images go before
    // because the model interprets them better when the instruction comes next
    // and can refer to them.
    const content: Anthropic.ContentBlockParam[] = [];

    for (const image of request.images ?? []) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: image.mime, data: image.base64 },
      });
    }
    content.push({ type: 'text', text: buildUserTurn(request, true) });

    const withEffort = !EFFORT_UNSUPPORTED.has(this.model);
    let emitted = 0;

    try {
      for await (const chunk of this.run(content, request, signal, withEffort)) {
        emitted += 1;
        yield chunk;
      }
    } catch (err) {
      // A cancellation is the expected behavior when a new question arrives, not
      // an error to show.
      if (signal.aborted) return;

      // It's only retried if not a single token had come out: if something was
      // already emitted, repeating would duplicate text on screen. The `effort`
      // 400 arrives before any content, so in practice it always enters here.
      if (emitted === 0 && withEffort && isEffortRejected(err)) {
        EFFORT_UNSUPPORTED.add(this.model);
        console.warn(
          `[claude] "${this.model}" no acepta output_config.effort; reintentando sin él.`
        );
        yield* this.run(content, request, signal, false);
        return;
      }
      throw toLLMError(err, this.id);
    }
  }

  /** A single request. `withEffort` decides whether `output_config` is sent. */
  private async *run(
    content: Anthropic.ContentBlockParam[],
    request: AnswerRequest,
    signal: AbortSignal,
    withEffort: boolean
  ): AsyncIterable<string> {
    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: request.maxTokens,
        // The system prompt goes as a block with cache_control: it's the stable
        // prefix of the whole session.
        system: [
          {
            type: 'text',
            text: request.systemPrompt,
            cache_control: { type: 'ephemeral' },
          },
        ],
        ...(withEffort ? { output_config: { effort: this.effort } } : {}),
        messages: [...historyMessages(request), { role: 'user', content }],
      },
      { signal }
    );

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }

    // `refusal` arrives as HTTP 200, not as an exception: it has to be checked
    // explicitly or the overlay would go blank with no explanation.
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') {
      throw new LLMError(
        m('err.refusedClaude'),
        this.id
      );
    }
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.client.messages.create({
        model: this.model,
        max_tokens: 8,
        messages: [{ role: 'user', content: 'Di OK.' }],
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
 * The SDK's typed classes are the right way to tell them apart; comparing
 * message strings breaks as soon as the text changes.
 */
function toLLMError(err: unknown, providerId: LLMProviderId): LLMError {
  if (err instanceof LLMError) return err;

  if (err instanceof Anthropic.AuthenticationError) {
    return new LLMError(m('err.badKeyAnthropic'), providerId);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new LLMError(m('err.rateAnthropic'), providerId);
  }
  if (err instanceof Anthropic.NotFoundError) {
    return new LLMError(
      m('err.noModel'),
      providerId
    );
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new LLMError(m('err.offlineAnthropic'), providerId);
  }
  if (err instanceof Anthropic.APIError) {
    return new LLMError(m('err.apiError', { provider: 'Anthropic', status: err.status ?? '?', message: err.message }), providerId);
  }
  return new LLMError(err instanceof Error ? err.message : String(err), providerId);
}

/**
 * Previous turns as real messages.
 *
 * They go as alternating `user`/`assistant` and not summarized inside the
 * prompt: that way the model recognizes them as things it said. Empty ones are
 * skipped because the API rejects a message with no content.
 */
function historyMessages(request: AnswerRequest): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];
  for (const turn of request.history ?? []) {
    if (!turn.question.trim() || !turn.answer.trim()) continue;
    messages.push({ role: 'user', content: turn.question });
    messages.push({ role: 'assistant', content: turn.answer });
  }
  return messages;
}


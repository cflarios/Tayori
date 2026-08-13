import OpenAI from 'openai';
import { m } from '../i18n';
import { buildUserTurn } from './user-turn';
import type { LLMProviderId, ModelInfo } from '@shared/types';
import { LLMError, type AnswerRequest, type LLMProvider } from './types';

/**
 * DeepSeek provider.
 *
 * Its API is **OpenAI-compatible**, so the same SDK that's already installed is
 * used with a different `baseURL`. There's no new dependency and no hand-written
 * HTTP client to maintain; the only thing that changes from `openai.ts` is the
 * door you come in through.
 *
 * That said, you come in through **Chat Completions and not the Responses API**:
 * that one is OpenAI's, not the compatible format. With it you lose two things
 * used over there —`store: false` and `reasoning.effort`— and neither is needed
 * here: DeepSeek doesn't store the responses to retrieve them by API, and
 * reasoning effort isn't a parameter of theirs.
 *
 * **None of its models accept images.** It's not an oversight of this
 * integration: neither the pricing page nor the API reference mentions image
 * input for either of them. That's why they go with `supportsVision: false`,
 * which is what makes the screen-model selector mark them "no vision" and warn
 * before someone finds out mid-exam. For the screen actions you have to pick
 * another provider.
 */

/** The OpenAI-compatible door. The other one they offer speaks Anthropic format. */
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

/**
 * The catalog, verified against their pricing page and their models endpoint.
 *
 * **R1 is gone**, and it's not an oversight: DeepSeek's `list models` returns
 * exactly these two ids today, and their pricing table doesn't list
 * `deepseek-reasoner` or `deepseek-chat` either. The V4 family replaced them. If
 * an account keeps access to one, the dashboard's "Other…" field still allows
 * typing it — the catalog is a suggestion, not a boundary.
 *
 * Both declare **1M of context**, which is far more than this app needs: the
 * prompt with CV, transcript and eight turns of memory doesn't come close. It
 * changes nothing in the design, but it explains why there's no window setting
 * here like Ollama's.
 */
export const DEEPSEEK_MODELS: ModelInfo[] = [
  {
    id: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    supportsVision: false,
    note: 'mdl.fastCheap',
  },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', supportsVision: false, note: 'mdl.capable' },
];

export class DeepSeekProvider implements LLMProvider {
  readonly id: LLMProviderId = 'deepseek';
  /** See the note above: none of its models read images. */
  readonly supportsVision = false;

  private client: OpenAI;

  constructor(
    apiKey: string,
    readonly model: string = 'deepseek-v4-flash',
    /** Only the tests use it, to talk to a local server. */
    baseURL: string = DEEPSEEK_BASE_URL
  ) {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  listModels(): Promise<ModelInfo[]> {
    return Promise.resolve(DEEPSEEK_MODELS);
  }

  async *streamAnswer(request: AnswerRequest, signal: AbortSignal): AsyncIterable<string> {
    /*
     * Images are discarded **with a log warning** instead of being sent.
     *
     * Sending them to a model that doesn't understand them is the most expensive
     * way for nothing to happen: you pay the bandwidth and the model answers as
     * if there were no capture. For the screen actions the engine already fails
     * earlier with a clear message (see `answer-engine.ts`); this covers the
     * other path, a spoken question with an attached capture, where degrading is
     * correct but staying quiet about it isn't.
     */
    if (request.images?.length) {
      console.warn(
        `[deepseek] "${this.model}" no admite imágenes: se descarta la captura adjunta.`
      );
    }

    try {
      const stream = await this.client.chat.completions.create(
        {
          model: this.model,
          stream: true,
          max_tokens: request.maxTokens,
          messages: [
            { role: 'system', content: request.systemPrompt },
            // The previous turns as real messages: without them the model
            // remembers nothing of what it answered itself.
            ...(request.history ?? [])
              .filter((turn) => turn.question.trim() && turn.answer.trim())
              .flatMap((turn) => [
                { role: 'user' as const, content: turn.question },
                { role: 'assistant' as const, content: turn.answer },
              ]),
            { role: 'user', content: buildUserTurn(request, false) },
          ],
        },
        { signal }
      );

      for await (const chunk of stream) {
        if (signal.aborted) return;
        const text = chunk.choices[0]?.delta?.content;
        if (text) yield text;
      }
    } catch (err) {
      // Cancelling is expected when another question arrives, not an error.
      if (signal.aborted) return;
      throw toLLMError(err, this.id);
    }
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.client.chat.completions.create({
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
 * Translates the errors into actionable messages.
 *
 * With the SDK's typed classes, which work the same against DeepSeek because the
 * error format is compatible too: what's looked at is the HTTP code, and that
 * doesn't depend on who's on the other side.
 */
function toLLMError(err: unknown, providerId: LLMProviderId): LLMError {
  if (err instanceof LLMError) return err;

  if (err instanceof OpenAI.AuthenticationError) {
    return new LLMError(m('err.badKeyDeepseek'), providerId);
  }
  if (err instanceof OpenAI.RateLimitError) {
    return new LLMError(
      m('err.rateDeepseek'),
      providerId
    );
  }
  if (err instanceof OpenAI.NotFoundError) {
    return new LLMError(
      m('err.noModelDeepseek'),
      providerId
    );
  }
  if (err instanceof OpenAI.APIConnectionError) {
    return new LLMError(m('err.offlineDeepseek'), providerId);
  }
  if (err instanceof OpenAI.APIError) {
    return new LLMError(m('err.apiError', { provider: 'DeepSeek', status: err.status ?? '?', message: err.message }), providerId);
  }
  return new LLMError(err instanceof Error ? err.message : String(err), providerId);
}


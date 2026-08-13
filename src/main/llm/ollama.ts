import { Ollama } from 'ollama';
import { m } from '../i18n';
import { buildUserTurn } from './user-turn';
import type { LLMProviderId, ModelInfo, OllamaStatus } from '@shared/types';
import { LLMError, type AnswerRequest, type LLMProvider } from './types';

/**
 * Local provider via Ollama. No external network and no cost, in exchange for
 * the quality and speed the user's machine gives.
 *
 * Unlike Claude and Gemini, there's no fixed model catalog here: what the user
 * has downloaded is queried.
 */

/**
 * Vision families. Ollama doesn't expose a reliable "vision" capability in
 * /api/tags, so it's detected by name. If a vision model isn't on the list,
 * captures simply aren't attached to it — it degrades, doesn't break.
 */
const VISION_HINTS = ['llava', 'bakllava', 'moondream', 'vision', '-vl', 'qwen2.5vl', 'gemma3'];

function looksLikeVisionModel(name: string): boolean {
  const lower = name.toLowerCase();
  return VISION_HINTS.some((hint) => lower.includes(hint));
}

/**
 * Models that reason before answering, and why they need separate handling.
 *
 * Ollama returns the reasoning in a **different** field —`message.thinking`, not
 * `message.content`— and `num_predict` counts both together. Measured against
 * `qwen3-vl:8b-thinking` with an algorithms problem and the real code-mode
 * prompt:
 *
 * | `num_predict` | reasoning | answer | `done_reason` |
 * |---|---|---|---|
 * | 2200 (the code cap) | 6,432 chars | **0 chars** | `length` |
 * | 8000 | 23,329 chars | 589 chars | `stop` |
 *
 * That is: with the usual cap the model exhausted the budget **thinking** and
 * finished without writing a single character. The stream ended cleanly, with no
 * error, so the app fell into its "the stream ended with no text" branch and
 * showed *"The model returned no text"* — a message that points nowhere. The
 * reasoning was 10 to 50 times longer than the answer, so it's not a matter of
 * raising the cap a little.
 *
 * `think: false` is **not** a way out: it was tried against this same model and
 * it still reasoned 7,364 characters. Some models only know how to think.
 */
const THINKING_HINTS = ['thinking', 'reason', '-r1', 'qwq'];

/**
 * How much a model is lent to reason, apart from what it spends on the answer.
 * The worst measured case was 7,591 tokens in total; 8,000 of slack cover that
 * with margin without becoming a blank check.
 */
const THINKING_BUDGET_TOKENS = 8_000;

/**
 * Models that turned out to reason even though the name didn't say so.
 *
 * Same pattern as `EFFORT_UNSUPPORTED` in `claude.ts`: the hint list ages
 * —tomorrow a model that thinks and isn't called "thinking" comes out— so the
 * first query discovers it and the following ones come out with budget.
 */
const KNOWN_THINKERS = new Set<string>();

function looksLikeThinkingModel(name: string): boolean {
  const lower = name.toLowerCase();
  return KNOWN_THINKERS.has(lower) || THINKING_HINTS.some((hint) => lower.includes(hint));
}

/**
 * Output tokens for this model.
 *
 * It's exported so it can be pinned with a test: the bug it fixes is invisible
 * —an empty answer with no error— and the temptation to "simplify" this to a
 * bare `request.maxTokens` is exactly what would bring it back.
 */
export function budgetFor(model: string, maxTokens: number): number {
  return looksLikeThinkingModel(model) ? maxTokens + THINKING_BUDGET_TOKENS : maxTokens;
}

export class OllamaProvider implements LLMProvider {
  readonly id: LLMProviderId = 'ollama';
  readonly supportsVision: boolean;

  private client: Ollama;

  constructor(
    baseUrl: string,
    readonly model: string,
    /**
     * Context window in tokens (`num_ctx`).
     *
     * It has to be sent explicitly: Ollama **doesn't use the model's**, it
     * applies its own default of 2048 tokens and **silently discards** what
     * doesn't fit, starting from the front. With a system prompt with CV, the
     * transcript and eight turns of memory, those 2048 run out fast and the
     * symptom is the model "forgetting" what it was just told — exactly the bug
     * already documented once, which here didn't come from the history but from
     * the window.
     */
    private readonly contextTokens = 8192
  ) {
    this.client = new Ollama({ host: baseUrl });
    this.supportsVision = looksLikeVisionModel(model);
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const { models } = await this.client.list();
      return models.map((m) => ({
        id: m.name,
        label: m.name,
        supportsVision: looksLikeVisionModel(m.name),
      }));
    } catch (err) {
      throw toLLMError(err, this.id);
    }
  }

  async *streamAnswer(request: AnswerRequest, signal: AbortSignal): AsyncIterable<string> {
    if (!this.model) {
      throw new LLMError(
        m('err.noOllamaModel'),
        this.id
      );
    }

    // Ollama's SDK doesn't accept an AbortSignal, so it's aborted by closing the
    // stream from outside with `client.abort()`.
    const onAbort = (): void => this.client.abort();
    signal.addEventListener('abort', onAbort, { once: true });

    try {
      const stream = await this.client.chat({
        model: this.model,
        stream: true,
        messages: [
          { role: 'system', content: request.systemPrompt },
          // The previous turns go as real messages: without them the model
          // remembers nothing of what it answered itself.
          ...(request.history ?? [])
            .filter((turn) => turn.question.trim() && turn.answer.trim())
            .flatMap((turn) => [
              { role: 'user', content: turn.question },
              { role: 'assistant', content: turn.answer },
            ]),
          {
            role: 'user',
            content: buildUserTurn(request, false),
            // Ollama expects the images as base64 in the message itself, and
            // they're only attached if the model understands them.
            ...(this.supportsVision && request.images?.length
              ? { images: request.images.map((img) => img.base64) }
              : {}),
          },
        ],
        options: {
          num_predict: budgetFor(this.model, request.maxTokens),
          num_ctx: this.contextTokens,
        },
      });

      /** Whether it got to reason, and whether it got to write. Not the same. */
      let reasoned = false;
      let emitted = false;
      let doneReason = '';

      for await (const chunk of stream) {
        if (signal.aborted) return;

        if (chunk.message?.thinking && !reasoned) {
          reasoned = true;
          KNOWN_THINKERS.add(this.model.toLowerCase());
          /*
           * Heartbeat. The engine cancels the query if NOTHING has come out in
           * 45 s (`FIRST_TOKEN_TIMEOUT_MS`), and a reasoning model takes longer
           * than that to write its first character: measured, 62.8 s with this
           * same model. Without this the budget fix would be useless, because the
           * query would die before reaching the answer.
           *
           * It goes empty on purpose: it tells the engine "I'm still alive"
           * without painting the reasoning in the overlay. The panel is read out
           * of the corner of your eye while someone looks at you; twenty thousand
           * characters of deliberation would bury exactly what you wanted to read.
           */
          yield '';
        }

        if (chunk.message?.content) {
          emitted = true;
          yield chunk.message.content;
        }

        if (chunk.done) doneReason = chunk.done_reason ?? '';
      }

      /*
       * Ending with no text isn't the same depending on why. If the model was
       * thinking and ran out of budget, saying so is the difference between a
       * setting you touch and a "returned no text" that leads nowhere.
       */
      if (!emitted && reasoned && doneReason === 'length') {
        throw new LLMError(
          m('err.budgetOllama', { model: this.model }),
          this.id
        );
      }
    } catch (err) {
      if (signal.aborted) return;
      throw toLLMError(err, this.id);
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const models = await this.listModels();
      if (models.length === 0) {
        return {
          ok: false,
          error: m('err.ollamaNoModels'),
        };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: toLLMError(err, this.id).message };
    }
  }
}

/**
 * Probes the local Ollama server.
 *
 * It tells apart three states that look very different from the dashboard, and
 * that a simple "empty list" would conflate: not installed / not running,
 * running but with no models, and running with models. The third is the only
 * usable one, and the second has a concrete solution (`ollama pull`) worth
 * telling the user instead of leaving them guessing.
 */
export async function probeOllama(baseUrl: string): Promise<OllamaStatus> {
  // Short timeout: if Ollama isn't there, we want to know right away and not
  // block the dashboard UI waiting for fetch's default timeout.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_000);

  let version: string | undefined;
  try {
    const response = await fetch(new URL('/api/version', baseUrl), {
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        reachable: false,
        models: [],
        error: m('err.ollamaHttp', { status: response.status }),
      };
    }
    const body = (await response.json()) as { version?: string };
    version = body.version;
  } catch (err) {
    return {
      reachable: false,
      models: [],
      // Just the fact: the suggestion of what to do is set by the dashboard, to
      // avoid duplicating the instruction on screen.
      error:
        err instanceof Error && err.name === 'AbortError'
          ? m('err.ollamaTimeout')
          : m('err.ollamaNotFound'),
    };
  } finally {
    clearTimeout(timer);
  }

  try {
    const models = await new OllamaProvider(baseUrl, '').listModels();
    return { reachable: true, ...(version ? { version } : {}), models };
  } catch (err) {
    // The server is alive (it answered /api/version) but the listing failed.
    return {
      reachable: true,
      ...(version ? { version } : {}),
      models: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function toLLMError(err: unknown, providerId: LLMProviderId): LLMError {
  if (err instanceof LLMError) return err;
  const message = err instanceof Error ? err.message : String(err);

  if (/ECONNREFUSED|fetch failed|ENOTFOUND/i.test(message)) {
    return new LLMError(
      m('err.ollamaOffline'),
      providerId
    );
  }
  return new LLMError(m('err.ollamaError', { message }), providerId);
}


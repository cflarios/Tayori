import { GoogleGenAI } from '@google/genai';
import { m } from '../i18n';
import { buildUserTurn } from './user-turn';
import type { LLMProviderId, ModelInfo } from '@shared/types';
import { LLMError, type AnswerRequest, type LLMProvider } from './types';

/**
 * Gemini provider.
 *
 * It uses the same API key as the Gemini Live STT, so configuring a single
 * credential gets you transcription and answers.
 */

export const GEMINI_MODELS: ModelInfo[] = [
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', supportsVision: true, note: 'mdl.fast' },
];

export class GeminiProvider implements LLMProvider {
  readonly id: LLMProviderId = 'gemini';
  readonly supportsVision = true;

  private client: GoogleGenAI;

  constructor(
    apiKey: string,
    readonly model: string = 'gemini-3.6-flash'
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  listModels(): Promise<ModelInfo[]> {
    return Promise.resolve(GEMINI_MODELS);
  }

  async *streamAnswer(request: AnswerRequest, signal: AbortSignal): AsyncIterable<string> {
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

    for (const image of request.images ?? []) {
      parts.push({ inlineData: { mimeType: image.mime, data: image.base64 } });
    }
    parts.push({ text: buildUserTurn(request, true) });

    try {
      const stream = await this.client.models.generateContentStream({
        model: this.model,
        contents: [
          // Gemini calls the assistant role "model"; otherwise it's the same
          // idea as in Claude and Ollama: real turns, not glued text.
          ...(request.history ?? [])
            .filter((turn) => turn.question.trim() && turn.answer.trim())
            .flatMap((turn) => [
              { role: 'user', parts: [{ text: turn.question }] },
              { role: 'model', parts: [{ text: turn.answer }] },
            ]),
          { role: 'user', parts },
        ],
        config: {
          systemInstruction: request.systemPrompt,
          maxOutputTokens: request.maxTokens,
          abortSignal: signal,
        },
      });

      for await (const chunk of stream) {
        if (signal.aborted) return;
        const text = chunk.text;
        if (text) yield text;
      }
    } catch (err) {
      if (signal.aborted) return;
      throw toLLMError(err, this.id);
    }
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.client.models.generateContent({
        model: this.model,
        contents: 'Di OK.',
        config: { maxOutputTokens: 8 },
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: toLLMError(err, this.id).message };
    }
  }
}

function toLLMError(err: unknown, providerId: LLMProviderId): LLMError {
  const message = err instanceof Error ? err.message : String(err);

  // Google's SDK doesn't expose error classes typed by status, so the message
  // has to be inspected. It's narrowed to the cases the user can resolve on
  // their own.
  if (/API[_ ]?key|API_KEY_INVALID|unauthenticated/i.test(message)) {
    return new LLMError(m('err.badKeyGoogle'), providerId);
  }
  if (/quota|rate limit|RESOURCE_EXHAUSTED/i.test(message)) {
    return new LLMError(m('err.rateGoogle'), providerId);
  }
  if (/not found|NOT_FOUND/i.test(message)) {
    return new LLMError(m('err.noModelGemini'), providerId);
  }
  return new LLMError(m('err.geminiError', { message }), providerId);
}

import { GoogleGenAI } from '@google/genai';
import { m } from '../i18n';
import type { LLMProviderId, ModelInfo } from '@shared/types';
import { LLMError, type AnswerRequest, type LLMProvider } from './types';

/**
 * Proveedor de Gemini.
 *
 * Usa la misma API key que el STT de Gemini Live, así que configurando una sola
 * credencial se tiene transcripción y respuestas.
 */

export const GEMINI_MODELS: ModelInfo[] = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (rápido)', supportsVision: true },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (más capaz)', supportsVision: true },
];

export class GeminiProvider implements LLMProvider {
  readonly id: LLMProviderId = 'gemini';
  readonly supportsVision = true;

  private client: GoogleGenAI;

  constructor(
    apiKey: string,
    readonly model: string = 'gemini-2.5-flash'
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
    parts.push({ text: buildUserTurn(request) });

    try {
      const stream = await this.client.models.generateContentStream({
        model: this.model,
        contents: [
          // Gemini llama "model" al papel del asistente; por lo demás es la
          // misma idea que en Claude y Ollama: turnos reales, no texto pegado.
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

  // El SDK de Google no expone clases de error tipadas por status, así que hay
  // que inspeccionar el mensaje. Se acota a los casos que el usuario puede
  // resolver por su cuenta.
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

function buildUserTurn(request: AnswerRequest): string {
  const parts = [`<transcripcion>\n${request.transcript || '(sin audio aún)'}\n</transcripcion>`];

  if (request.question) parts.push(`<pregunta>\n${request.question}\n</pregunta>`);
  if (request.images?.length) {
    parts.push('El usuario adjuntó una captura de su pantalla; tenla en cuenta.');
  }
  parts.push(
    request.question
      ? 'Responde a la pregunta de <pregunta>.'
      : 'Responde a la última pregunta del entrevistador en la transcripción.'
  );

  return parts.join('\n\n');
}

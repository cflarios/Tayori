import Anthropic from '@anthropic-ai/sdk';
import type { LLMProviderId, ModelInfo } from '@shared/types';
import { LLMError, type AnswerRequest, type LLMProvider } from './types';

/**
 * Proveedor de Claude.
 *
 * Decisiones específicas de este modelo, verificadas contra la referencia de la
 * API y no de memoria:
 *
 *  - `temperature`, `top_p` y `top_k` NO se envían: en Opus 5 y Sonnet 5 están
 *    eliminados y devuelven 400. El estilo se controla por prompt.
 *  - El thinking está activo por defecto en Opus 5. Para un asistente en tiempo
 *    real la palanca de latencia es `effort: 'low'`, no desactivar el thinking:
 *    desactivarlo tiene dos fallos conocidos (llamadas a herramientas emitidas
 *    como texto plano y etiquetas <thinking> filtradas en la respuesta).
 *  - `cache_control` en el system prompt: el CV y la descripción del puesto no
 *    cambian durante la entrevista, así que ese prefijo se cachea y las
 *    llamadas siguientes cuestan ~10% en esa parte. Requiere ≥512 tokens en
 *    Opus 5 para que el caché se cree; por debajo simplemente no cachea.
 */

export const CLAUDE_MODELS: ModelInfo[] = [
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (rápido)', supportsVision: true },
  { id: 'claude-opus-5', label: 'Claude Opus 5 (más capaz)', supportsVision: true },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (mínima latencia)', supportsVision: true },
];

/** Nivel de esfuerzo. `low` prioriza latencia, que es lo que pide este caso. */
type Effort = 'low' | 'medium' | 'high';

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
    // El contenido del turno de usuario: imágenes primero, texto después.
    // Las imágenes van antes porque el modelo las interpreta mejor cuando la
    // instrucción viene a continuación y puede referirse a ellas.
    const content: Anthropic.ContentBlockParam[] = [];

    for (const image of request.images ?? []) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: image.mime, data: image.base64 },
      });
    }
    content.push({ type: 'text', text: buildUserTurn(request) });

    try {
      const stream = this.client.messages.stream(
        {
          model: this.model,
          max_tokens: request.maxTokens,
          // El system prompt va como bloque con cache_control: es el prefijo
          // estable de toda la sesión.
          system: [
            {
              type: 'text',
              text: request.systemPrompt,
              cache_control: { type: 'ephemeral' },
            },
          ],
          output_config: { effort: this.effort },
          messages: [{ role: 'user', content }],
        },
        { signal }
      );

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text;
        }
      }

      // `refusal` llega como HTTP 200, no como excepción: hay que comprobarlo
      // explícitamente o el overlay se quedaría en blanco sin explicación.
      const final = await stream.finalMessage();
      if (final.stop_reason === 'refusal') {
        throw new LLMError(
          'Claude declinó responder a este contenido. Prueba con Gemini o reformula la pregunta.',
          this.id
        );
      }
    } catch (err) {
      // Una cancelación es el comportamiento esperado cuando llega una pregunta
      // nueva, no un error que haya que mostrar.
      if (signal.aborted) return;
      throw toLLMError(err, this.id);
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
 * Traduce los errores del SDK a mensajes accionables.
 *
 * Las clases tipadas del SDK son la forma correcta de distinguirlos; comparar
 * cadenas del mensaje se rompe en cuanto cambia el texto.
 */
function toLLMError(err: unknown, providerId: LLMProviderId): LLMError {
  if (err instanceof LLMError) return err;

  if (err instanceof Anthropic.AuthenticationError) {
    return new LLMError('La API key de Anthropic no es válida.', providerId);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new LLMError('Límite de peticiones de Anthropic alcanzado.', providerId);
  }
  if (err instanceof Anthropic.NotFoundError) {
    return new LLMError(
      'El modelo indicado no existe o tu cuenta no tiene acceso. Elige otro en el dashboard.',
      providerId
    );
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new LLMError('Sin conexión con la API de Anthropic.', providerId);
  }
  if (err instanceof Anthropic.APIError) {
    return new LLMError(`Error de Anthropic (${err.status ?? '?'}): ${err.message}`, providerId);
  }
  return new LLMError(err instanceof Error ? err.message : String(err), providerId);
}

/** Compone el turno de usuario: transcripción como contexto, pregunta al final. */
function buildUserTurn(request: AnswerRequest): string {
  const parts = [`<transcripcion>\n${request.transcript || '(sin audio aún)'}\n</transcripcion>`];

  if (request.question) {
    parts.push(`<pregunta>\n${request.question}\n</pregunta>`);
  }
  if (request.images?.length) {
    parts.push('El usuario adjuntó una captura de su pantalla; tenla en cuenta.');
  }

  // La instrucción va al final: es la posición que el modelo atiende con más
  // fuerza, y además mantiene estable el prefijo cacheable de arriba.
  parts.push(
    request.question
      ? 'Responde a la pregunta de <pregunta>.'
      : 'Responde a la última pregunta del entrevistador en la transcripción.'
  );

  return parts.join('\n\n');
}

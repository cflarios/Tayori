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
 *    **Pero `effort` es de la generación 5 y no todos los modelos lo aceptan**;
 *    ver `EFFORT_UNSUPPORTED`. Esa distinción faltaba y hacía que Haiku 4.5
 *    fallara con un 400 en cada pregunta.
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

/**
 * Modelos que **no** aceptan `output_config.effort`.
 *
 * `effort` es de la generación Claude 5. Se estaba enviando a todos los
 * modelos, y Haiku 4.5 lo rechaza con un 400 tajante:
 *
 *   "This model does not support the effort parameter."
 *
 * El resultado era que Haiku fallaba SIEMPRE por audio y el usuario sólo veía
 * "error 400" sin más. El conjunto arranca con lo que sabemos y se completa
 * solo: si algún modelo futuro también lo rechaza, la primera petición lo
 * aprende y las siguientes ya salen bien.
 */
const EFFORT_UNSUPPORTED = new Set<string>(['claude-haiku-4-5']);

/** Reconoce el 400 concreto de `effort` sin comparar cadenas a ciegas. */
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

    const withEffort = !EFFORT_UNSUPPORTED.has(this.model);
    let emitted = 0;

    try {
      for await (const chunk of this.run(content, request, signal, withEffort)) {
        emitted += 1;
        yield chunk;
      }
    } catch (err) {
      // Una cancelación es el comportamiento esperado cuando llega una pregunta
      // nueva, no un error que haya que mostrar.
      if (signal.aborted) return;

      // Sólo se reintenta si no había salido ni un token: si ya se emitió algo,
      // repetir duplicaría texto en pantalla. El 400 de `effort` llega antes de
      // cualquier contenido, así que en la práctica siempre entra aquí.
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

  /** Una petición concreta. `withEffort` decide si se manda `output_config`. */
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
        // El system prompt va como bloque con cache_control: es el prefijo
        // estable de toda la sesión.
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

    // `refusal` llega como HTTP 200, no como excepción: hay que comprobarlo
    // explícitamente o el overlay se quedaría en blanco sin explicación.
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') {
      throw new LLMError(
        'Claude declinó responder a este contenido. Prueba con Gemini o reformula la pregunta.',
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

/**
 * Turnos anteriores como mensajes reales.
 *
 * Van como `user`/`assistant` alternos y no resumidos dentro del prompt: así el
 * modelo los reconoce como cosas que dijo él. Se saltan los vacíos porque la
 * API rechaza un mensaje sin contenido.
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

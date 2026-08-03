import OpenAI from 'openai';
import type { LLMProviderId, ModelInfo } from '@shared/types';
import { LLMError, type AnswerRequest, type LLMProvider } from './types';

/**
 * Proveedor de DeepSeek.
 *
 * Su API es **compatible con la de OpenAI**, así que se usa el mismo SDK que ya
 * está instalado cambiándole la `baseURL`. No hay dependencia nueva y no hay un
 * cliente HTTP escrito a mano que mantener; lo único que cambia respecto a
 * `openai.ts` es la puerta por la que se entra.
 *
 * Eso sí, se entra por **Chat Completions y no por la Responses API**: aquélla
 * es de OpenAI, no del formato compatible. Con ella se pierden dos cosas que
 * allí sí se usan —`store: false` y `reasoning.effort`— y ninguna hace falta
 * aquí: DeepSeek no guarda las respuestas para recuperarlas por API, y el
 * esfuerzo de razonamiento no es un parámetro suyo.
 *
 * **Ninguno de sus modelos acepta imágenes.** No es un descuido de esta
 * integración: ni la página de precios ni la referencia de la API mencionan
 * entrada de imagen para ninguno de los dos. Por eso van con
 * `supportsVision: false`, que es lo que hace que el selector del modelo de
 * pantalla los marque «sin visión» y avise antes de que alguien lo descubra a
 * mitad de un examen. Para las acciones de pantalla hay que elegir otro
 * proveedor.
 */

/** La puerta compatible con OpenAI. La otra que ofrecen habla formato Anthropic. */
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

/**
 * El catálogo, verificado contra su página de precios y su endpoint de modelos.
 *
 * **R1 ya no está**, y no es un olvido: el `list models` de DeepSeek devuelve
 * hoy exactamente estos dos ids, y su tabla de precios tampoco lista ni
 * `deepseek-reasoner` ni `deepseek-chat`. La familia V4 los sustituyó. Si una
 * cuenta conserva acceso a alguno, el campo «Otro…» del dashboard sigue
 * permitiendo escribirlo — el catálogo es una sugerencia, no una frontera.
 *
 * Los dos declaran **1M de contexto**, que es muchísimo más de lo que esta app
 * necesita: el prompt con CV, transcripción y ocho turnos de memoria no llega
 * ni de lejos. No cambia nada del diseño, pero explica por qué aquí no hay
 * ningún ajuste de ventana como el de Ollama.
 */
export const DEEPSEEK_MODELS: ModelInfo[] = [
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash (rápido y barato)', supportsVision: false },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro (más capaz)', supportsVision: false },
];

export class DeepSeekProvider implements LLMProvider {
  readonly id: LLMProviderId = 'deepseek';
  /** Ver la nota de arriba: ninguno de sus modelos lee imágenes. */
  readonly supportsVision = false;

  private client: OpenAI;

  constructor(
    apiKey: string,
    readonly model: string = 'deepseek-v4-flash',
    /** Sólo lo usan los tests, para hablar contra un servidor local. */
    baseURL: string = DEEPSEEK_BASE_URL
  ) {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  listModels(): Promise<ModelInfo[]> {
    return Promise.resolve(DEEPSEEK_MODELS);
  }

  async *streamAnswer(request: AnswerRequest, signal: AbortSignal): AsyncIterable<string> {
    /*
     * Las imágenes se descartan **con aviso en el log** en lugar de mandarse.
     *
     * Enviarlas a un modelo que no las entiende es la forma más cara de que no
     * pase nada: se paga el ancho de banda y el modelo contesta como si no
     * hubiera captura. Para las acciones de pantalla el motor ya falla antes
     * con un mensaje claro (ver `answer-engine.ts`); esto cubre el otro camino,
     * el de una pregunta hablada con captura adjunta, donde degradar es
     * correcto pero callarlo no.
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
            // Los turnos anteriores como mensajes reales: sin ellos el modelo no
            // recuerda nada de lo que él mismo respondió.
            ...(request.history ?? [])
              .filter((turn) => turn.question.trim() && turn.answer.trim())
              .flatMap((turn) => [
                { role: 'user' as const, content: turn.question },
                { role: 'assistant' as const, content: turn.answer },
              ]),
            { role: 'user', content: buildUserTurn(request) },
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
      // Cancelar es lo esperado cuando llega otra pregunta, no un error.
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
 * Traduce los errores a mensajes accionables.
 *
 * Con las clases tipadas del SDK, que funcionan igual contra DeepSeek porque el
 * formato de error también es compatible: lo que se mira es el código HTTP, y
 * ése no depende de quién esté al otro lado.
 */
function toLLMError(err: unknown, providerId: LLMProviderId): LLMError {
  if (err instanceof LLMError) return err;

  if (err instanceof OpenAI.AuthenticationError) {
    return new LLMError('La API key de DeepSeek no es válida.', providerId);
  }
  if (err instanceof OpenAI.RateLimitError) {
    return new LLMError(
      'Límite de peticiones de DeepSeek alcanzado, o la cuenta se ha quedado sin saldo.',
      providerId
    );
  }
  if (err instanceof OpenAI.NotFoundError) {
    return new LLMError(
      'El modelo indicado no existe en DeepSeek. Elige otro en el dashboard.',
      providerId
    );
  }
  if (err instanceof OpenAI.APIConnectionError) {
    return new LLMError('Sin conexión con la API de DeepSeek.', providerId);
  }
  if (err instanceof OpenAI.APIError) {
    return new LLMError(`Error de DeepSeek (${err.status ?? '?'}): ${err.message}`, providerId);
  }
  return new LLMError(err instanceof Error ? err.message : String(err), providerId);
}

/** Compone el turno de usuario: transcripción como contexto, pregunta al final. */
function buildUserTurn(request: AnswerRequest): string {
  const parts = [`<transcripcion>\n${request.transcript || '(sin audio aún)'}\n</transcripcion>`];

  if (request.question) parts.push(`<pregunta>\n${request.question}\n</pregunta>`);
  // No se menciona ninguna captura: este proveedor no la manda, y decirle al
  // modelo que hay una imagen que no ha recibido es invitarle a inventársela.
  parts.push(
    request.question
      ? 'Responde a la pregunta de <pregunta>.'
      : 'Responde a la última pregunta del entrevistador en la transcripción.'
  );

  return parts.join('\n\n');
}

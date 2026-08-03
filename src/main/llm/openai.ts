import OpenAI from 'openai';
import type { LLMProviderId, ModelInfo } from '@shared/types';
import { LLMError, type AnswerRequest, type LLMProvider } from './types';

/**
 * Proveedor de OpenAI (ChatGPT).
 *
 * Va por la **Responses API**, no por Chat Completions, y no es indiferente:
 * los modelos GPT-5 razonan, y en Chat Completions el razonamiento no se puede
 * gobernar —ni el esfuerzo ni el presupuesto— así que la única palanca de
 * latencia que existe para este caso de uso vive en la otra API.
 *
 * Cuatro decisiones específicas de este proveedor, todas verificadas contra los
 * tipos del SDK instalado (`node_modules/openai/resources/**`) y no de memoria,
 * que es la regla que ya se aplicó con `@google/genai`:
 *
 *  - **`store: false`.** La Responses API guarda por defecto la respuesta en la
 *    cuenta de OpenAI para poder recuperarla luego por API. Esta app existe
 *    para que lo que se dice en una reunión no se quede en ningún sitio, así
 *    que el defecto del proveedor va en contra de la promesa del producto y se
 *    apaga explícitamente. Es la línea equivalente a "el audio no toca el
 *    disco", pero del lado de la nube.
 *  - **`reasoning.effort: 'low'`.** Mismo razonamiento que el `effort` de
 *    Claude: la respuesta se lee de reojo mientras alguien te mira a la cara,
 *    así que se prioriza latencia. No se desactiva del todo (`none`) porque no
 *    todos los modelos lo aceptan y porque `low` ya recorta casi todo.
 *  - **`max_output_tokens` cuenta también los tokens de razonamiento**, igual
 *    que `num_predict` en Ollama. Ver `budgetFor`: es exactamente la misma
 *    trampa, y produce el mismo fallo mudo — respuesta vacía, sin error.
 *  - **`temperature` y `top_p` no se envían.** Los modelos de razonamiento los
 *    rechazan, y en el resto el estilo se controla por prompt, que es la regla
 *    del proyecto desde Claude.
 *
 * La caché de prompt **no se pide**: OpenAI cachea solo los prefijos de más de
 * ~1.024 tokens. No hace falta el equivalente a `cache_control` de Anthropic,
 * y por eso no está — no es un olvido.
 */

/**
 * Catálogo de partida: la familia GPT-5.6, que es la actual.
 *
 * Los tres papeles y la visión están **verificados contra la referencia de
 * OpenAI**, no deducidos del nombre — que aquí no ayuda nada, porque «sol»,
 * «terra» y «luna» no dicen cuál es el grande: Sol es el modelo de frontera
 * para trabajo complejo, Terra equilibra capacidad y coste, y Luna es el de
 * cargas sensibles al precio. Los tres aceptan texto **e imagen**, que es la
 * condición para poder salir también en el selector de la pantalla.
 *
 * Como el de Claude y el de Gemini, es una **sugerencia y no una frontera**: el
 * dashboard ofrece «Otro…» para escribir cualquier id, y el SDK instalado lista
 * bastantes más (las familias `gpt-5.4` y anteriores, las `-pro`, las `-codex`).
 *
 * El orden no es el de precio, es el de **cuál quiere casi todo el mundo**:
 * Terra primero porque es el defecto, y por el mismo motivo que Sonnet lo es en
 * Claude — una app que dispara una consulta por cada pregunta que oye no debe
 * arrancar con el modelo caro.
 */
export const OPENAI_MODELS: ModelInfo[] = [
  { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra (equilibrado)', supportsVision: true },
  { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol (más capaz)', supportsVision: true },
  { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna (el más barato)', supportsVision: true },
];

/** Nivel de esfuerzo de razonamiento. `low` prioriza latencia. */
type Effort = 'none' | 'minimal' | 'low' | 'medium' | 'high';

/**
 * Cuánto se le presta al modelo para razonar, aparte de la respuesta.
 *
 * `max_output_tokens` es un tope **conjunto**: los tokens de razonamiento salen
 * del mismo presupuesto que el texto que se lee. Con el tope del modo código
 * —2.200— un modelo que piensa puede gastárselo entero deliberando y terminar
 * sin escribir nada, y la app cae entonces en su rama de "el stream acabó sin
 * texto", que no señala a ninguna parte. Es literalmente el mismo fallo que ya
 * se documentó con `num_predict` en Ollama, y aquí se cubre igual: prestando
 * sitio en lugar de subir el tope un poco.
 *
 * Con `effort: 'low'` el razonamiento es mucho más corto que el de un modelo
 * local de la familia "thinking", así que 4.000 basta y no es un cheque en
 * blanco: sólo se gastan los que el modelo use de verdad.
 */
const REASONING_BUDGET_TOKENS = 4_000;

/**
 * Modelos que **no** aceptan el bloque `reasoning`.
 *
 * Sólo lo aceptan los modelos de razonamiento. Un `gpt-4o` o un `gpt-4.1`
 * escritos a mano en «Otro…» devuelven un 400 por un parámetro que el usuario
 * no sabe que se está enviando, así que fallarían **todas** sus preguntas — el
 * mismo patrón exacto que dejó a Haiku 4.5 muerto en `claude.ts`.
 *
 * Empieza vacío y **se aprende en caliente**: la lista de modelos sin
 * razonamiento envejece igual de rápido que la de los que sí, así que la
 * primera petición lo descubre, reintenta sin el bloque, y las siguientes ya
 * salen bien.
 */
const REASONING_UNSUPPORTED = new Set<string>();

/** Reconoce el 400 concreto del parámetro `reasoning`, sin adivinar por texto libre. */
function isReasoningRejected(err: unknown): boolean {
  return (
    err instanceof OpenAI.BadRequestError &&
    /reasoning/i.test(err.message ?? '') &&
    /unsupported|not supported|unknown parameter|does not support/i.test(err.message ?? '')
  );
}

/**
 * Tope de salida real para esta consulta.
 *
 * Se exporta para poder fijarlo con un test, por el mismo motivo que `budgetFor`
 * en `ollama.ts`: el fallo que evita es invisible —una respuesta vacía sin
 * ningún error— y "simplificar" esto a `request.maxTokens` seco es exactamente
 * lo que lo devolvería.
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
    // Imágenes primero y texto después, igual que en Claude: el modelo las
    // interpreta mejor cuando la instrucción viene detrás y puede referirse a
    // ellas.
    const content: OpenAI.Responses.ResponseInputMessageContentList = [];

    for (const image of request.images ?? []) {
      content.push({
        type: 'input_image',
        // La API acepta el base64 como data URL; no hay que subir el fichero
        // antes, que sería un viaje extra por cada pulsación de pantalla.
        image_url: `data:${image.mime};base64,${image.base64}`,
        // `auto` deja que el modelo decida el detalle. Forzar `high` gastaría
        // más tokens por captura sin que nadie lo haya pedido.
        detail: 'auto',
      });
    }
    content.push({ type: 'input_text', text: buildUserTurn(request) });

    const withReasoning = !REASONING_UNSUPPORTED.has(this.model);
    let emitted = 0;

    try {
      for await (const chunk of this.run(content, request, signal, withReasoning)) {
        emitted += 1;
        yield chunk;
      }
    } catch (err) {
      // Cancelar es lo que se espera cuando llega otra pregunta, no un error
      // que haya que enseñar.
      if (signal.aborted) return;

      // Sólo se reintenta si no salió ni un token: repetir después de haber
      // escrito duplicaría texto en pantalla. El 400 de `reasoning` llega antes
      // de cualquier contenido, así que en la práctica siempre entra aquí.
      if (emitted === 0 && withReasoning && isReasoningRejected(err)) {
        REASONING_UNSUPPORTED.add(this.model);
        console.warn(`[openai] "${this.model}" no acepta "reasoning"; reintentando sin él.`);
        yield* this.run(content, request, signal, false);
        return;
      }
      throw toLLMError(err, this.id);
    }
  }

  /** Una petición concreta. `withReasoning` decide si se manda el bloque. */
  private async *run(
    content: OpenAI.Responses.ResponseInputMessageContentList,
    request: AnswerRequest,
    signal: AbortSignal,
    withReasoning: boolean
  ): AsyncIterable<string> {
    const stream = await this.client.responses.create(
      {
        model: this.model,
        // El system prompt va en `instructions`, que es su sitio: no compite
        // con el turno del usuario y es el prefijo que OpenAI cachea solo.
        instructions: request.systemPrompt,
        input: [...historyMessages(request), { role: 'user', content }],
        max_output_tokens: budgetFor(request.maxTokens, withReasoning),
        ...(withReasoning ? { reasoning: { effort: this.effort } } : {}),
        // No guardar la respuesta en la cuenta de OpenAI. El defecto de la API
        // es `true`, y guardar lo que se dice en una entrevista contradice
        // exactamente aquello para lo que existe esta app.
        store: false,
        stream: true,
      },
      { signal }
    );

    /** Si llegó a escribir algo, y por qué se paró. No es lo mismo. */
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
       * Una negativa NO llega como excepción: viene como contenido de otro tipo
       * dentro de un 200, igual que el `stop_reason: 'refusal'` de Claude. Sin
       * mirarla, el overlay se quedaría en blanco sin explicación.
       */
      if (event.type === 'response.refusal.delta') {
        refusal += event.delta;
        continue;
      }

      if (event.type === 'response.incomplete') {
        incompleteReason = event.response.incomplete_details?.reason ?? '';
        continue;
      }

      // El error del propio stream tampoco es una excepción del SDK.
      if (event.type === 'response.failed') {
        throw new LLMError(
          `Error de OpenAI: ${event.response.error?.message ?? 'la respuesta falló sin motivo.'}`,
          this.id
        );
      }
    }

    if (refusal.trim()) {
      throw new LLMError(
        `OpenAI declinó responder a este contenido: ${refusal.trim()}`,
        this.id
      );
    }

    /*
     * Quedarse sin presupuesto es distinto de no tener nada que decir, y el
     * arreglo también: aquí se toca un ajuste o se cambia de modelo, así que
     * el mensaje lo dice en lugar de un "no devolvió texto" que no lleva a
     * ninguna parte.
     */
    if (!emitted && incompleteReason === 'max_output_tokens') {
      throw new LLMError(
        `"${this.model}" gastó todo su presupuesto razonando y no llegó a escribir la respuesta. ` +
          'Elige un modelo más pequeño en el dashboard, o recorta la captura a lo que hay que resolver.',
        this.id
      );
    }
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      /*
       * 16 tokens es el mínimo que acepta la API, y con razonamiento activo se
       * los come enteros: la respuesta vuelve `incomplete` y sin texto. Da
       * igual — lo que se comprueba aquí es que la clave sirve y que el modelo
       * existe, y las dos cosas fallan con excepción. Gastar un presupuesto de
       * verdad sólo para leer "OK" sería cobrarle al usuario por un botón.
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
 * Traduce los errores del SDK a mensajes accionables.
 *
 * Con las clases tipadas, que es la forma que no se rompe cuando el proveedor
 * cambia el texto del mensaje.
 */
function toLLMError(err: unknown, providerId: LLMProviderId): LLMError {
  if (err instanceof LLMError) return err;

  if (err instanceof OpenAI.AuthenticationError) {
    return new LLMError('La API key de OpenAI no es válida.', providerId);
  }
  if (err instanceof OpenAI.PermissionDeniedError) {
    return new LLMError(
      'Tu cuenta de OpenAI no tiene acceso a este modelo. Elige otro en el dashboard.',
      providerId
    );
  }
  if (err instanceof OpenAI.RateLimitError) {
    // El 429 de OpenAI cubre dos cosas que se arreglan de forma muy distinta:
    // ir demasiado rápido, y no haber pagado. Decir sólo "límite alcanzado"
    // manda a esperar a quien tiene que recargar saldo.
    return new LLMError(
      'Límite de peticiones de OpenAI alcanzado, o tu cuenta se ha quedado sin saldo.',
      providerId
    );
  }
  if (err instanceof OpenAI.NotFoundError) {
    return new LLMError(
      'El modelo indicado no existe o tu cuenta no tiene acceso. Elige otro en el dashboard.',
      providerId
    );
  }
  if (err instanceof OpenAI.APIConnectionError) {
    return new LLMError('Sin conexión con la API de OpenAI.', providerId);
  }
  if (err instanceof OpenAI.APIError) {
    return new LLMError(`Error de OpenAI (${err.status ?? '?'}): ${err.message}`, providerId);
  }
  return new LLMError(err instanceof Error ? err.message : String(err), providerId);
}

/**
 * Turnos anteriores como mensajes reales.
 *
 * `user`/`assistant` alternos y no resumidos dentro del prompt: es lo que hace
 * que el modelo reconozca sus respuestas como cosas que dijo él. Se saltan los
 * vacíos porque un mensaje sin contenido no aporta y sí ocupa.
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

/** Compone el turno de usuario: transcripción como contexto, pregunta al final. */
function buildUserTurn(request: AnswerRequest): string {
  const parts = [`<transcripcion>\n${request.transcript || '(sin audio aún)'}\n</transcripcion>`];

  if (request.question) parts.push(`<pregunta>\n${request.question}\n</pregunta>`);
  if (request.images?.length) {
    parts.push('El usuario adjuntó una captura de su pantalla; tenla en cuenta.');
  }

  // La instrucción va al final: es la posición que el modelo atiende con más
  // fuerza, y mantiene estable el prefijo de arriba, que es el que se cachea.
  parts.push(
    request.question
      ? 'Responde a la pregunta de <pregunta>.'
      : 'Responde a la última pregunta del entrevistador en la transcripción.'
  );

  return parts.join('\n\n');
}

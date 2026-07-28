import type { ImageAttachment, LLMProviderId, ModelInfo } from '@shared/types';

/**
 * Contrato de un proveedor de respuestas.
 *
 * El orquestador no sabe si detrás hay Claude, Gemini u Ollama. Añadir OpenAI o
 * Groq después es un archivo nuevo más una entrada en el mapa de `index.ts`.
 */

/**
 * Un intercambio ya cerrado de esta misma conversación.
 *
 * Existe porque faltaba: cada consulta se enviaba como un turno único —system
 * prompt más un mensaje de usuario— y **las respuestas anteriores del propio
 * modelo no volvían nunca**. El resultado, verificado en una conversación real,
 * es que el asistente decía ser comercial y noventa segundos después contestaba
 * "no tengo información sobre cuál es mi profesión". No era falta de contexto en
 * el transcript: era que su propia voz no formaba parte de la entrada.
 */
export interface ConversationExchange {
  question: string;
  answer: string;
}

export interface AnswerRequest {
  /** Instrucciones + context packs. Es la parte estable, y por tanto cacheable. */
  systemPrompt: string;
  /** Transcripción reciente ya formateada con etiquetas de hablante. */
  transcript: string;
  /** La pregunta concreta a responder, si se pudo aislar. */
  question?: string;
  /**
   * Turnos anteriores, del más antiguo al más reciente. Se envían como mensajes
   * de verdad (`user`/`assistant`), no embebidos en el texto: es lo que hace que
   * el modelo los trate como algo que dijo él y no como material de referencia.
   */
  history?: ConversationExchange[];
  /** Capturas de pantalla adjuntas. Se ignoran si el modelo no ve imágenes. */
  images?: ImageAttachment[];
  /** Tope de tokens de salida. Corto a propósito: hay que leerlo en voz alta. */
  maxTokens: number;
}

export interface LLMProvider {
  readonly id: LLMProviderId;
  readonly model: string;
  readonly supportsVision: boolean;

  /** Modelos disponibles. Puede consultar la red (Ollama) o ser estático. */
  listModels(): Promise<ModelInfo[]>;

  /**
   * Emite el texto en trozos a medida que llega.
   *
   * `signal` no es opcional por diseño: si el interlocutor hace una pregunta
   * nueva mientras se genera la anterior, hay que cancelar la petición en vuelo
   * o el overlay mostraría la respuesta a una pregunta que ya pasó.
   */
  streamAnswer(request: AnswerRequest, signal: AbortSignal): AsyncIterable<string>;

  /** Comprueba credenciales y conectividad; lo usa el botón del dashboard. */
  testConnection(): Promise<{ ok: boolean; error?: string }>;
}

/** Error con un mensaje pensado para mostrarse al usuario tal cual. */
export class LLMError extends Error {
  constructor(
    message: string,
    readonly providerId: LLMProviderId
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

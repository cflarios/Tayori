import { Ollama } from 'ollama';
import type { LLMProviderId, ModelInfo, OllamaStatus } from '@shared/types';
import { LLMError, type AnswerRequest, type LLMProvider } from './types';

/**
 * Proveedor local vía Ollama. Sin red externa y sin coste, a cambio de la
 * calidad y velocidad que dé la máquina del usuario.
 *
 * A diferencia de Claude y Gemini, aquí no hay un catálogo fijo de modelos:
 * se consulta lo que el usuario tenga descargado.
 */

/**
 * Familias con visión. Ollama no expone una capacidad de "vision" fiable en
 * /api/tags, así que se detecta por nombre. Si un modelo con visión no está en
 * la lista, simplemente no se le adjuntan capturas — degrada, no rompe.
 */
const VISION_HINTS = ['llava', 'bakllava', 'moondream', 'vision', '-vl', 'qwen2.5vl', 'gemma3'];

function looksLikeVisionModel(name: string): boolean {
  const lower = name.toLowerCase();
  return VISION_HINTS.some((hint) => lower.includes(hint));
}

export class OllamaProvider implements LLMProvider {
  readonly id: LLMProviderId = 'ollama';
  readonly supportsVision: boolean;

  private client: Ollama;

  constructor(
    baseUrl: string,
    readonly model: string,
    /**
     * Ventana de contexto en tokens (`num_ctx`).
     *
     * Hay que enviarla explícitamente: Ollama **no usa la del modelo**, aplica
     * su propio valor por defecto de 2048 tokens y **descarta en silencio** lo
     * que no quepa, empezando por el principio. Con un system prompt con CV,
     * la transcripción y ocho turnos de memoria, esos 2048 se agotan enseguida
     * y el síntoma es que el modelo "olvida" lo que se le acaba de decir —
     * exactamente el bug que ya se documentó una vez y que aquí no venía del
     * historial, sino de la ventana.
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
        'No hay ningún modelo de Ollama seleccionado. Elige uno en el dashboard.',
        this.id
      );
    }

    // El SDK de Ollama no acepta AbortSignal, así que se aborta cerrando el
    // stream desde fuera con `client.abort()`.
    const onAbort = (): void => this.client.abort();
    signal.addEventListener('abort', onAbort, { once: true });

    try {
      const stream = await this.client.chat({
        model: this.model,
        stream: true,
        messages: [
          { role: 'system', content: request.systemPrompt },
          // Los turnos anteriores van como mensajes reales: sin ellos el modelo
          // no recuerda nada de lo que él mismo respondió.
          ...(request.history ?? [])
            .filter((turn) => turn.question.trim() && turn.answer.trim())
            .flatMap((turn) => [
              { role: 'user', content: turn.question },
              { role: 'assistant', content: turn.answer },
            ]),
          {
            role: 'user',
            content: buildUserTurn(request),
            // Ollama espera las imágenes como base64 en el propio mensaje, y
            // sólo se adjuntan si el modelo las entiende.
            ...(this.supportsVision && request.images?.length
              ? { images: request.images.map((img) => img.base64) }
              : {}),
          },
        ],
        options: { num_predict: request.maxTokens, num_ctx: this.contextTokens },
      });

      for await (const chunk of stream) {
        if (signal.aborted) return;
        if (chunk.message?.content) yield chunk.message.content;
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
          error: 'Ollama responde pero no tiene modelos. Descarga uno con: ollama pull llama3.2',
        };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: toLLMError(err, this.id).message };
    }
  }
}

/**
 * Sondea el servidor local de Ollama.
 *
 * Distingue tres estados que desde el dashboard se ven muy distintos, y que un
 * simple "lista vacía" confundiría: no instalado / no corriendo, corriendo pero
 * sin modelos, y corriendo con modelos. El tercero es el único usable, y el
 * segundo tiene una solución concreta (`ollama pull`) que conviene decirle al
 * usuario en lugar de dejarlo adivinando.
 */
export async function probeOllama(baseUrl: string): Promise<OllamaStatus> {
  // Timeout corto: si Ollama no está, queremos saberlo ya y no bloquear la UI
  // del dashboard esperando el timeout por defecto de fetch.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_000);

  let version: string | undefined;
  try {
    const response = await fetch(new URL('/api/version', baseUrl), {
      signal: controller.signal,
    });
    if (!response.ok) {
      return { reachable: false, models: [], error: `Ollama respondió HTTP ${response.status}.` };
    }
    const body = (await response.json()) as { version?: string };
    version = body.version;
  } catch (err) {
    return {
      reachable: false,
      models: [],
      // Solo el hecho: la sugerencia de qué hacer la pone el dashboard, para no
      // duplicar la instrucción en pantalla.
      error:
        err instanceof Error && err.name === 'AbortError'
          ? 'Ollama no respondió a tiempo.'
          : 'No se encontró ningún servidor de Ollama escuchando.',
    };
  } finally {
    clearTimeout(timer);
  }

  try {
    const models = await new OllamaProvider(baseUrl, '').listModels();
    return { reachable: true, ...(version ? { version } : {}), models };
  } catch (err) {
    // El servidor está vivo (respondió a /api/version) pero fallo el listado.
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
      'No se pudo conectar con Ollama. Comprueba que esté corriendo (ollama serve).',
      providerId
    );
  }
  return new LLMError(`Error de Ollama: ${message}`, providerId);
}

function buildUserTurn(request: AnswerRequest): string {
  const parts = [`<transcripcion>\n${request.transcript || '(sin audio aún)'}\n</transcripcion>`];

  if (request.question) parts.push(`<pregunta>\n${request.question}\n</pregunta>`);
  parts.push(
    request.question
      ? 'Responde a la pregunta de <pregunta>.'
      : 'Responde a la última pregunta del entrevistador en la transcripción.'
  );

  return parts.join('\n\n');
}

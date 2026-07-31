import { screenModelFor, type LLMProviderId, type ModelInfo, type Settings } from '@shared/types';
import { getSecret } from '../config/secrets';
import { ClaudeProvider, CLAUDE_MODELS } from './claude';
import { GeminiProvider, GEMINI_MODELS } from './gemini';
import { OllamaProvider } from './ollama';
import { LLMError, type LLMProvider } from './types';

export { LLMError } from './types';
export type { AnswerRequest, LLMProvider } from './types';

/**
 * Construye el proveedor de respuestas según los settings.
 *
 * Añadir OpenAI, Groq o cualquier otro es: un archivo que implemente
 * `LLMProvider` más un `case` aquí. Nada más del sistema cambia.
 *
 * @param forScreen Usa el proveedor de las acciones de pantalla (código y
 *        test), que puede ser distinto del de conversar: lo hablado necesita
 *        latencia y lo de la pantalla necesita vista. Con `screenProviderId` en
 *        `same` —el valor por defecto— las dos ramas dan exactamente lo mismo.
 */
export function createLLMProvider(settings: Settings, forScreen = false): LLMProvider {
  const target = forScreen
    ? screenModelFor(settings)
    : { providerId: settings.llmProviderId, model: settings.llmModels[settings.llmProviderId] };

  const model = target.model;

  switch (target.providerId) {
    case 'claude': {
      const apiKey = getSecret('anthropic');
      if (!apiKey) {
        throw new LLMError(
          'Falta la API key de Anthropic. Configúrala en el dashboard o cambia de proveedor.',
          'claude'
        );
      }
      return new ClaudeProvider(apiKey, model || 'claude-sonnet-5');
    }

    case 'gemini': {
      const apiKey = getSecret('google');
      if (!apiKey) {
        throw new LLMError(
          'Falta la API key de Google. Configúrala en el dashboard o cambia de proveedor.',
          'gemini'
        );
      }
      return new GeminiProvider(apiKey, model || 'gemini-2.5-flash');
    }

    case 'ollama':
      return new OllamaProvider(settings.ollamaBaseUrl, model, settings.ollamaContextTokens);

    default: {
      // Añadir un id al tipo sin manejarlo aquí rompe el build.
      const exhaustive: never = target.providerId;
      throw new LLMError(`Proveedor desconocido: ${String(exhaustive)}`, 'claude');
    }
  }
}

/**
 * Modelos de un proveedor sin necesidad de credenciales.
 *
 * El dashboard necesita poblar el selector antes de que el usuario haya
 * configurado la key, así que Claude y Gemini devuelven su catálogo estático.
 * Ollama sí consulta la red, porque su lista depende de lo que haya descargado.
 */
export async function listModelsFor(
  providerId: LLMProviderId,
  settings: Settings
): Promise<ModelInfo[]> {
  if (providerId === 'claude') return CLAUDE_MODELS;
  if (providerId === 'gemini') return GEMINI_MODELS;
  return new OllamaProvider(settings.ollamaBaseUrl, '').listModels();
}

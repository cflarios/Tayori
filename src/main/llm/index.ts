import { screenModelFor, type LLMProviderId, type ModelInfo, type Settings } from '@shared/types';
import { m } from '../i18n';
import { getSecret } from '../config/secrets';
import { ClaudeProvider, CLAUDE_MODELS } from './claude';
import { GeminiProvider, GEMINI_MODELS } from './gemini';
import { OpenAIProvider, OPENAI_MODELS } from './openai';
import { DeepSeekProvider, DEEPSEEK_MODELS } from './deepseek';
import { OllamaProvider } from './ollama';
import { LLMError, type LLMProvider } from './types';

export { LLMError } from './types';
export type { AnswerRequest, LLMProvider } from './types';

/**
 * Builds the answer provider from the settings.
 *
 * Adding Groq or any other is: a file that implements `LLMProvider` plus a
 * `case` here. Nothing else in the **system** changes — but there are three
 * screens that decide "is this configured?" with their own condition that the
 * `never` below doesn't cover; they're listed in CONTEXT.md §4.
 *
 * @param forScreen Uses the provider for the screen actions (code and quiz),
 *        which may differ from the conversing one: speech needs latency and the
 *        screen needs vision. With `screenProviderId` set to `same` —the default
 *        value— the two branches give exactly the same thing.
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
        throw new LLMError(m('err.noKeyAnthropic'), 'claude');
      }
      return new ClaudeProvider(apiKey, model || 'claude-sonnet-5');
    }

    case 'gemini': {
      const apiKey = getSecret('google');
      if (!apiKey) {
        throw new LLMError(m('err.noKeyGoogle'), 'gemini');
      }
      return new GeminiProvider(apiKey, model || 'gemini-3.6-flash');
    }

    case 'openai': {
      const apiKey = getSecret('openai');
      if (!apiKey) {
        throw new LLMError(m('err.noKeyOpenai'), 'openai');
      }
      return new OpenAIProvider(apiKey, model || 'gpt-5.6-terra');
    }

    case 'deepseek': {
      const apiKey = getSecret('deepseek');
      if (!apiKey) {
        throw new LLMError(m('err.noKeyDeepseek'), 'deepseek');
      }
      return new DeepSeekProvider(apiKey, model || 'deepseek-v4-flash');
    }

    case 'ollama':
      return new OllamaProvider(settings.ollamaBaseUrl, model, settings.ollamaContextTokens);

    default: {
      // Adding an id to the type without handling it here breaks the build.
      const exhaustive: never = target.providerId;
      throw new LLMError(m('err.unknownProvider', { id: String(exhaustive) }), 'claude');
    }
  }
}

/**
 * A provider's models without needing credentials.
 *
 * The dashboard needs to populate the selector before the user has configured
 * the key, so the cloud providers return their static catalog. Ollama does hit
 * the network, because its list depends on what's been downloaded.
 */
export async function listModelsFor(
  providerId: LLMProviderId,
  settings: Settings
): Promise<ModelInfo[]> {
  if (providerId === 'claude') return CLAUDE_MODELS;
  if (providerId === 'gemini') return GEMINI_MODELS;
  if (providerId === 'openai') return OPENAI_MODELS;
  if (providerId === 'deepseek') return DEEPSEEK_MODELS;
  return new OllamaProvider(settings.ollamaBaseUrl, '').listModels();
}

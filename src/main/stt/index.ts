import type { Settings } from '@shared/types';
import { m } from '../i18n';
import { getSecret } from '../config/secrets';
import { GeminiLiveSTT } from './gemini-live';
import { GeminiAudioSTT, type AudioAnswerContext } from './gemini-audio';
import { OpenAILiveSTT } from './openai-live';
import { OpenAITranscribeSTT } from './openai-transcribe';
import { testWhisperBinary, WhisperLocalSTT } from './whisper-local';
import type { STTProvider } from './types';

export type { STTProvider, STTStartOptions, TranscriptEvent, DirectAnswerEvent } from './types';
export type { AudioAnswerContext } from './gemini-audio';

/**
 * Builds the transcription engine from the settings.
 *
 * Adding a new engine (Deepgram, Soniox) is adding a `case` here and a file
 * that implements `STTProvider`; the orchestrator doesn't change.
 */
/**
 * Actually tests the configured transcription engine.
 *
 * "Actually" is the important part: with Gemini Live it opens a session and
 * negotiates the model; with Whisper local it runs the binary over a WAV
 * generated on the fly. Just checking that the file exists or that there's a
 * key wouldn't have caught the `main.exe` stub or a Live model not enabled on
 * the account, which are exactly the two failures that have happened.
 */
export async function testSTTConnection(
  settings: Settings
): Promise<{ ok: boolean; detail: string }> {
  try {
    if (settings.sttProviderId === 'gemini-live' || settings.sttProviderId === 'gemini-audio') {
      const apiKey = getSecret('google');
      if (!apiKey) {
        return { ok: false, detail: m('err.sttNoKeyGoogle') };
      }
      if (settings.sttProviderId === 'gemini-audio') {
        return await new GeminiAudioSTT(
          apiKey,
          settings.llmModels.gemini || 'gemini-3.6-flash',
          () => ({ systemPrompt: '', history: [] })
        ).testConnection();
      }
      return await new GeminiLiveSTT(apiKey).testConnection(settings.language);
    }

    if (
      settings.sttProviderId === 'openai-live' ||
      settings.sttProviderId === 'openai-transcribe'
    ) {
      const apiKey = getSecret('openai');
      if (!apiKey) {
        return { ok: false, detail: m('err.sttNoKeyOpenai') };
      }
      return settings.sttProviderId === 'openai-live'
        ? await new OpenAILiveSTT(apiKey).testConnection(settings.language)
        : await new OpenAITranscribeSTT(apiKey).testConnection();
    }

    return await testWhisperBinary(settings.whisperModel);
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

export function createSTTProvider(
  settings: Settings,
  /** Only the direct-audio engine uses it; it composes the query itself. */
  answerContext?: () => AudioAnswerContext
): STTProvider {
  switch (settings.sttProviderId) {
    case 'gemini-live': {
      const apiKey = getSecret('google');
      if (!apiKey) {
        throw new Error(m('err.sttNoKeyGoogleLive'));
      }
      return new GeminiLiveSTT(apiKey);
    }

    case 'gemini-audio': {
      const apiKey = getSecret('google');
      if (!apiKey) {
        throw new Error(m('err.sttNoKeyGoogleAudio'));
      }
      if (!answerContext) {
        // With no context there's no prompt or memory: better to fail here than
        // answer with an empty system prompt and not understand why.
        throw new Error(m('err.sttNoContext'));
      }
      return new GeminiAudioSTT(
        apiKey,
        settings.llmModels.gemini || 'gemini-3.6-flash',
        answerContext
      );
    }

    case 'openai-live':
    case 'openai-transcribe': {
      const apiKey = getSecret('openai');
      if (!apiKey) {
        throw new Error(m('err.sttNoKeyOpenaiEngine'));
      }
      return settings.sttProviderId === 'openai-live'
        ? new OpenAILiveSTT(apiKey)
        : new OpenAITranscribeSTT(apiKey);
    }

    case 'whisper-local':
      // `create` throws with a message saying what's missing to download and where.
      return WhisperLocalSTT.create(settings.whisperModel);

    default: {
      // If an id is added to the type and not handled here, TypeScript fails the build.
      const exhaustive: never = settings.sttProviderId;
      throw new Error(m('err.sttUnknown', { id: String(exhaustive) }));
    }
  }
}

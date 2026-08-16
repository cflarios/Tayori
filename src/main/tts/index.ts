import type { Settings } from '@shared/types';
import type { TTSResult } from './types';
import { openaiTTS } from './openai';

/**
 * Synthesize an answer to speech with the active engine.
 *
 * Returns `null` when the active provider is renderer-only (`webspeech`, which
 * the overlay speaks itself) or not yet wired (`piper`/`kokoro`), so the caller
 * falls back to its own handling instead of erroring. A misconfigured cloud
 * provider (no key) still throws — that's a real failure worth surfacing.
 */
export async function synthesizeSpeech(settings: Settings, text: string): Promise<TTSResult | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const options = { text: trimmed, voice: settings.ttsVoice, rate: settings.ttsRate };

  switch (settings.ttsProviderId) {
    case 'openai':
      return openaiTTS.synthesize(options);
    // Renderer-only or not yet implemented: the overlay handles Web Speech, and
    // Piper/Kokoro land in later phases.
    case 'webspeech':
    case 'piper':
    case 'kokoro':
    default:
      return null;
  }
}

import type { Settings } from '@shared/types';
import type { TTSResult } from './types';
import { openaiTTS } from './openai';
import { piperTTS } from './piper';

/**
 * Synthesize an answer to speech with the active engine.
 *
 * Returns `null` when the active provider is renderer-only (`webspeech`, which
 * the overlay speaks itself), so the caller falls back to its own handling
 * instead of erroring. A misconfigured cloud provider (no key) still throws —
 * that's a real failure worth surfacing.
 */
export async function synthesizeSpeech(settings: Settings, text: string): Promise<TTSResult | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const options = { text: trimmed, voice: settings.ttsVoice, rate: settings.ttsRate };

  switch (settings.ttsProviderId) {
    case 'openai':
      return openaiTTS.synthesize(options);
    case 'piper':
      return piperTTS.synthesize(options);
    // Renderer-only: the overlay speaks Web Speech itself.
    case 'webspeech':
    default:
      return null;
  }
}

import { getSecret } from '../config/secrets';
import { m } from '../i18n';
import type { TTSProvider, TTSResult, TTSSynthesizeOptions } from './types';

/**
 * OpenAI text-to-speech (`/v1/audio/speech`).
 *
 * Reuses the same OpenAI key as answering and transcription. `gpt-4o-mini-tts`
 * is the cheap, natural current model; MP3 is the default format and plays in an
 * `<audio>` element without any extra decoding. Speed is clamped to the API's
 * accepted 0.25–4.0 range.
 */

const ENDPOINT = 'https://api.openai.com/v1/audio/speech';
const MODEL = 'gpt-4o-mini-tts';
const DEFAULT_VOICE = 'alloy';

export const openaiTTS: TTSProvider = {
  async synthesize({ text, voice, rate }: TTSSynthesizeOptions): Promise<TTSResult> {
    const apiKey = getSecret('openai');
    if (!apiKey) throw new Error(m('tts.err.noOpenaiKey'));

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        voice: voice || DEFAULT_VOICE,
        input: text,
        response_format: 'mp3',
        speed: Math.min(4, Math.max(0.25, rate || 1)),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(m('tts.err.openaiRequest', { status: response.status, detail }));
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return { audioBase64: buffer.toString('base64'), mime: 'audio/mpeg' };
  },
};

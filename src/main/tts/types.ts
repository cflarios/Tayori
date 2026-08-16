/**
 * Contract for a text-to-speech engine that synthesizes in the main process.
 *
 * Web Speech is deliberately NOT one of these: it's a renderer-only browser API
 * that plays on its own. The engines here (OpenAI now, Piper/Kokoro later) turn
 * text into an audio buffer that a renderer plays through the chosen output, so
 * device routing (`setSinkId`) keeps working.
 */

export interface TTSSynthesizeOptions {
  text: string;
  /** Provider-specific voice id/name; empty means the provider's default. */
  voice: string;
  /** Speed multiplier, 1 = normal. */
  rate: number;
}

export interface TTSResult {
  /** The audio, base64-encoded, ready for a `data:` URL. */
  audioBase64: string;
  /** e.g. `audio/mpeg`. */
  mime: string;
}

export interface TTSProvider {
  synthesize(options: TTSSynthesizeOptions): Promise<TTSResult>;
}

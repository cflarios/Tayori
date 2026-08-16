/**
 * Catalog of local Piper voices.
 *
 * Like `whisper-models.ts`, it lives in `shared/` because both sides need it: the
 * main process to download the voices and the dashboard to list them. It's pure
 * data; the download and disk logic stays in `main/tts/piper-assets.ts`.
 *
 * Each voice is two files in the `rhasspy/piper-voices` repo — the `.onnx` model
 * and its `.onnx.json` config — under a `<lang>/<locale>/<voice>/<quality>/`
 * path. `path` is that path plus the shared filename base (no extension); the id
 * is also the on-disk name, chosen by us, so the id rules over the remote layout.
 */

export type PiperQuality = 'low' | 'medium' | 'high';

export interface PiperVoiceInfo {
  /** e.g. `en_US-lessac-medium`; also the on-disk filename base. */
  id: string;
  /** Display name; not translated, like a model's proper name. */
  name: string;
  /** BCP-47-ish tag, for grouping and the OS-language default. */
  lang: string;
  quality: PiperQuality;
  /** Approximate size of the `.onnx` model, for the download hint. */
  sizeMB: number;
  /** Path under the piper-voices repo, WITHOUT extension. */
  path: string;
}

const REPO = 'https://huggingface.co/rhasspy/piper-voices/resolve/main';

/** Full URL of a voice's `.onnx` (or `.onnx.json` when `config`). */
export function piperVoiceUrl(voice: PiperVoiceInfo, config = false): string {
  return `${REPO}/${voice.path}.onnx${config ? '.json' : ''}`;
}

export function piperVoiceById(id: string): PiperVoiceInfo | undefined {
  return PIPER_VOICES.find((v) => v.id === id);
}

export const PIPER_VOICES: PiperVoiceInfo[] = [
  {
    id: 'en_US-lessac-medium',
    name: 'Lessac (US English)',
    lang: 'en-US',
    quality: 'medium',
    sizeMB: 63,
    path: 'en/en_US/lessac/medium/en_US-lessac-medium',
  },
  {
    id: 'en_US-amy-medium',
    name: 'Amy (US English)',
    lang: 'en-US',
    quality: 'medium',
    sizeMB: 63,
    path: 'en/en_US/amy/medium/en_US-amy-medium',
  },
  {
    id: 'en_GB-alan-medium',
    name: 'Alan (UK English)',
    lang: 'en-GB',
    quality: 'medium',
    sizeMB: 63,
    path: 'en/en_GB/alan/medium/en_GB-alan-medium',
  },
  {
    id: 'es_ES-davefx-medium',
    name: 'DaveFX (Spain Spanish)',
    lang: 'es-ES',
    quality: 'medium',
    sizeMB: 63,
    path: 'es/es_ES/davefx/medium/es_ES-davefx-medium',
  },
  {
    id: 'es_MX-ald-medium',
    name: 'Ald (Mexican Spanish)',
    lang: 'es-MX',
    quality: 'medium',
    sizeMB: 63,
    path: 'es/es_MX/ald/medium/es_MX-ald-medium',
  },
];

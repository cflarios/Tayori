/**
 * Catalog of local Whisper models (whisper.cpp GGML).
 *
 * It lives in `shared/` —not in `main/stt`— because both sides need it: the main
 * process to download them and the dashboard to paint them. It's pure data; the
 * download and disk logic stays in `main/stt/whisper-assets.ts`.
 *
 * Almost all follow the official `ggerganov/whisper.cpp` repo pattern
 * (`ggml-<id>.bin`). The **Distil** ones aren't in that repo nor in whisper.cpp's
 * official downloader, so they carry their **explicit URL** —verified against
 * Hugging Face, because a dead URL doesn't fail on save, it fails on download—.
 * The local file is always named `ggml-<id>.bin`, we choose it, so the id rules
 * over the name on disk even if the remote one is named differently.
 */

export type ModelSpeed = 'very-fast' | 'fast' | 'medium' | 'slow';
export type ModelAccuracy = 'decent' | 'good' | 'high' | 'very-high';

export interface WhisperModelInfo {
  id: string;
  /** The model's proper name; not translated, like «Claude Sonnet 5». */
  name: string;
  sizeMB: number;
  speed: ModelSpeed;
  accuracy: ModelAccuracy;
  /** Only when it does NOT follow the default repo pattern (the Distil ones). */
  url?: string;
}

const DISTIL = 'https://huggingface.co/distil-whisper';

export const WHISPER_MODELS = [
  { id: 'tiny.en', name: 'Tiny English', sizeMB: 75, speed: 'very-fast', accuracy: 'decent' },
  { id: 'tiny', name: 'Tiny Multilingual', sizeMB: 75, speed: 'very-fast', accuracy: 'decent' },
  { id: 'base.en', name: 'Base English', sizeMB: 142, speed: 'fast', accuracy: 'good' },
  { id: 'base', name: 'Base Multilingual', sizeMB: 142, speed: 'fast', accuracy: 'good' },
  {
    id: 'distil-small.en',
    name: 'Distil Small EN',
    sizeMB: 166,
    speed: 'very-fast',
    accuracy: 'high',
    url: `${DISTIL}/distil-small.en/resolve/main/ggml-distil-small.en.bin`,
  },
  { id: 'small.en', name: 'Small English', sizeMB: 466, speed: 'medium', accuracy: 'high' },
  { id: 'small', name: 'Small Multilingual', sizeMB: 466, speed: 'medium', accuracy: 'high' },
  {
    id: 'distil-medium.en',
    name: 'Distil Medium EN',
    sizeMB: 394,
    speed: 'fast',
    accuracy: 'very-high',
    url: `${DISTIL}/distil-medium.en/resolve/main/ggml-medium-32-2.en.bin`,
  },
  {
    id: 'distil-large-v3',
    name: 'Distil Large v3',
    sizeMB: 1520,
    speed: 'medium',
    accuracy: 'very-high',
    url: `${DISTIL}/distil-large-v3-ggml/resolve/main/ggml-distil-large-v3.bin`,
  },
  { id: 'medium.en', name: 'Medium English', sizeMB: 1533, speed: 'slow', accuracy: 'very-high' },
  { id: 'medium', name: 'Medium Multilingual', sizeMB: 1533, speed: 'slow', accuracy: 'very-high' },
  {
    id: 'large-v3-turbo',
    name: 'Large v3 Turbo',
    sizeMB: 1624,
    speed: 'medium',
    accuracy: 'very-high',
  },
] as const satisfies readonly WhisperModelInfo[];

export type WhisperModelId = (typeof WHISPER_MODELS)[number]['id'];

/** The factory one: balanced and light, does well on almost any machine. */
export const DEFAULT_WHISPER_MODEL: WhisperModelId = 'base';

export function whisperModelById(id: string): WhisperModelInfo | undefined {
  return WHISPER_MODELS.find((m) => m.id === id);
}

/**
 * Reorders a catalog of local models putting the favorites first.
 *
 * Stable: within each group (favorites and rest) the catalog's order is
 * preserved, which already comes sorted from lightest to heaviest. It's generic
 * over any list with `id`, so as not to tie it to the Whisper catalog.
 */
export function sortByFavorite<T extends { id: string }>(
  models: readonly T[],
  favorites: readonly string[]
): T[] {
  const fav = new Set(favorites);
  const favored = models.filter((m) => fav.has(m.id));
  const rest = models.filter((m) => !fav.has(m.id));
  return [...favored, ...rest];
}

/**
 * Recommends a model based on RAM, with a bias toward the fast: transcription is
 * live and a slow model ruins the use case even if it fits in memory.
 * Multilingual is preferred because you don't know which language the user will
 * speak.
 */
export function recommendWhisperModel(totalMemoryGB: number): WhisperModelId {
  if (totalMemoryGB < 8) return 'base';
  if (totalMemoryGB < 16) return 'small';
  return 'distil-large-v3';
}

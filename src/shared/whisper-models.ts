/**
 * Catálogo de modelos de Whisper local (GGML de whisper.cpp).
 *
 * Vive en `shared/` —no en `main/stt`— porque lo necesitan los dos lados: el
 * main para descargarlos y el dashboard para pintarlos. Es dato puro; la lógica
 * de descarga y disco sigue en `main/stt/whisper-assets.ts`.
 *
 * Casi todos siguen el patrón del repo oficial `ggerganov/whisper.cpp`
 * (`ggml-<id>.bin`). Los **Distil** no están en ese repo ni en el descargador
 * oficial de whisper.cpp, así que llevan su **URL explícita** —verificada contra
 * Hugging Face, porque una URL muerta no falla al guardar, falla al descargar—.
 * El archivo local siempre se llama `ggml-<id>.bin`, lo elegimos nosotros, así
 * que el id manda sobre el nombre en disco aunque el remoto se llame distinto.
 */

export type ModelSpeed = 'very-fast' | 'fast' | 'medium' | 'slow';
export type ModelAccuracy = 'decent' | 'good' | 'high' | 'very-high';

export interface WhisperModelInfo {
  id: string;
  /** Nombre propio del modelo; no se traduce, como «Claude Sonnet 5». */
  name: string;
  sizeMB: number;
  speed: ModelSpeed;
  accuracy: ModelAccuracy;
  /** Sólo cuando NO sigue el patrón del repo por defecto (los Distil). */
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

/** El de fábrica: equilibrado y ligero, va bien en casi cualquier equipo. */
export const DEFAULT_WHISPER_MODEL: WhisperModelId = 'base';

export function whisperModelById(id: string): WhisperModelInfo | undefined {
  return WHISPER_MODELS.find((m) => m.id === id);
}

/**
 * Reordena un catálogo de modelos locales poniendo los favoritos primero.
 *
 * Estable: dentro de cada grupo (favoritos y resto) se conserva el orden del
 * catálogo, que ya viene ordenado de más ligero a más pesado. Es genérica sobre
 * cualquier lista con `id`, para no atarla al catálogo de Whisper.
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
 * Recomienda un modelo según la RAM, con sesgo hacia lo rápido: la transcripción
 * es en vivo y un modelo lento arruina el caso de uso aunque quepa en memoria.
 * Se prefiere multilingüe porque no se sabe en qué idioma hablará el usuario.
 */
export function recommendWhisperModel(totalMemoryGB: number): WhisperModelId {
  if (totalMemoryGB < 8) return 'base';
  if (totalMemoryGB < 16) return 'small';
  return 'distil-large-v3';
}

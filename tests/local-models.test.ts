import { describe, expect, it } from 'vitest';
import { sortByFavorite, WHISPER_MODELS } from '../src/shared/whisper-models';

/**
 * La estrella de favoritos del Model Manager. No cambia qué modelo está activo:
 * sólo sube arriba los marcados para no rebuscarlos entre toda la familia.
 */
describe('sortByFavorite', () => {
  const ids = (models: readonly { id: string }[]): string[] => models.map((m) => m.id);

  it('sin favoritos deja el catálogo tal cual', () => {
    expect(ids(sortByFavorite(WHISPER_MODELS, []))).toEqual(ids(WHISPER_MODELS));
  });

  it('sube los favoritos al principio conservando el resto en su orden', () => {
    const sorted = sortByFavorite(WHISPER_MODELS, ['small', 'tiny.en']);
    // Los favoritos, en el orden en que aparecen en el catálogo, no en el de la lista.
    expect(ids(sorted).slice(0, 2)).toEqual(['tiny.en', 'small']);
    // Y el resto sigue en el orden original, sin los dos que subieron.
    const rest = WHISPER_MODELS.filter((m) => m.id !== 'small' && m.id !== 'tiny.en');
    expect(ids(sorted).slice(2)).toEqual(ids(rest));
  });

  it('ignora ids que ya no están en el catálogo', () => {
    // Un favorito de una versión anterior cuyo modelo se quitó no debe romper nada.
    const sorted = sortByFavorite(WHISPER_MODELS, ['modelo-fantasma', 'base']);
    expect(ids(sorted)[0]).toBe('base');
    expect(sorted).toHaveLength(WHISPER_MODELS.length);
  });

  it('es genérico: vale para cualquier lista con id', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as const;
    expect(ids(sortByFavorite(items, ['c']))).toEqual(['c', 'a', 'b']);
  });
});

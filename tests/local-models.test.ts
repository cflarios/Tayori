import { describe, expect, it } from 'vitest';
import { sortByFavorite, WHISPER_MODELS } from '../src/shared/whisper-models';

/**
 * The Model Manager's favorites star. It doesn't change which model is active:
 * it only moves the marked ones to the top so you don't hunt for them among the
 * whole family.
 */
describe('sortByFavorite', () => {
  const ids = (models: readonly { id: string }[]): string[] => models.map((m) => m.id);

  it('with no favorites it leaves the catalog as-is', () => {
    expect(ids(sortByFavorite(WHISPER_MODELS, []))).toEqual(ids(WHISPER_MODELS));
  });

  it('moves the favorites to the front keeping the rest in their order', () => {
    const sorted = sortByFavorite(WHISPER_MODELS, ['small', 'tiny.en']);
    // The favorites, in the order they appear in the catalog, not in the list's.
    expect(ids(sorted).slice(0, 2)).toEqual(['tiny.en', 'small']);
    // And the rest stays in the original order, without the two that moved up.
    const rest = WHISPER_MODELS.filter((m) => m.id !== 'small' && m.id !== 'tiny.en');
    expect(ids(sorted).slice(2)).toEqual(ids(rest));
  });

  it('ignores ids that are no longer in the catalog', () => {
    // A favorite from an earlier version whose model was removed mustn't break anything.
    const sorted = sortByFavorite(WHISPER_MODELS, ['modelo-fantasma', 'base']);
    expect(ids(sorted)[0]).toBe('base');
    expect(sorted).toHaveLength(WHISPER_MODELS.length);
  });

  it('is generic: works for any list with an id', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as const;
    expect(ids(sortByFavorite(items, ['c']))).toEqual(['c', 'a', 'b']);
  });
});

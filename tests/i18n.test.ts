import { describe, expect, it } from 'vitest';
import { en } from '../src/shared/locales/en';
import { es } from '../src/shared/locales/es';
import { translate, UI_LANGS } from '../src/shared/i18n';

/**
 * What the compiler **can't** check about the translations.
 *
 * That all the keys are there is already guaranteed by the type: `es` is a
 * `Record<UIKey, string>`, so if one is missing it doesn't compile. What's left
 * out of the type is the content, and there are two failures there that reach the
 * screen without giving any error:
 *
 *  - **A slot that doesn't match.** If the English says `{turns}/{max}` and the
 *    Spanish says `{turnos}/{max}`, the Spanish sentence comes out with a literal
 *    `{turnos}` in the middle of the panel.
 *  - **A translation that wasn't translated.** Copying the English line and
 *    forgetting leaves a "translated" key that says exactly the same thing, and
 *    the type takes it as good.
 */

/** A text's `{slots}`, sorted and without repeats. */
const slots = (text: string): string[] =>
  [...new Set(text.match(/\{(\w+)\}/g) ?? [])].sort();

describe('translations', () => {
  it('each key has the same slots in both languages', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(slots(es[key]), key).toEqual(slots(en[key]));
    }
  });

  it('no translation was left empty', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(en[key].trim(), key).not.toBe('');
      expect(es[key].trim(), key).not.toBe('');
    }
  });

  it('almost no key is identical in the two languages', () => {
    /*
     * Some legitimately are —«Tests», «{keys}»— so you can't require that ALL of
     * them differ. What does give away a copy-paste is many starting to coincide:
     * with the cap set, forgetting to translate a whole block breaks the test even
     * if the type is happy.
     */
    const iguales = (Object.keys(en) as (keyof typeof en)[]).filter(
      (key) => en[key] === es[key]
    );
    expect(iguales.length / Object.keys(en).length).toBeLessThan(0.1);
  });

  it('fills the slots and leaves the missing ones in view', () => {
    // A slot left unfilled stays visible on purpose: a sentence with a hole gets
    // fixed, one that's silently missing a datum reads as if it were fine.
    expect(translate('en', 'overlay.memory', { turns: 3, max: 8 })).toBe('memory 3/8');
    expect(translate('es', 'overlay.memory', { turns: 3, max: 8 })).toBe('memoria 3/8');
    expect(translate('en', 'overlay.memory', { turns: 3 })).toContain('{max}');
  });

  it('English is the source and translates nothing', () => {
    // If this fails, someone swapped the tables.
    expect(translate('en', 'overlay.listen')).toBe(en['overlay.listen']);
    expect(UI_LANGS[0]).toBe('en');
  });
});

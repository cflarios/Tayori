import { en, type UIKey } from './locales/en';
import { es } from './locales/es';

/**
 * Two languages, with the texts outside the components and with no dependency.
 *
 * The dictionaries are **TypeScript modules and not `.json`**, and the reason is
 * a single one: `es.ts` is declared as `Record<UIKey, string>`, so an
 * untranslated key **doesn't compile**. With JSON it would fall back to the
 * fallback language and the failure would only show when a user came across an
 * English sentence in the middle of a Spanish screen — mute until then.
 * Everything else is the same as with two JSONs, and on top of that there's no
 * need to touch `resolveJsonModule` or the configuration of two bundlers.
 *
 * See `locales/en.ts` for the key conventions.
 */

/** The INTERFACE language. Not to be confused with `Settings.language`, which is the ASR's. */
export type UILang = 'en' | 'es';

export const UI_LANGS: readonly UILang[] = ['en', 'es'] as const;

/** What each language is called **in its own language**, which is how they're looked up. */
export const UI_LANG_LABEL: Record<UILang, string> = {
  en: 'English',
  es: 'Español',
};

const TABLES: Record<UILang, Record<UIKey, string>> = { en, es };

/**
 * The whole dictionary for a language. The dashboard's section search reads it to
 * index every visible string, so a term that lives deep in a card ("microphone",
 * "decoy", "vocabulary") still finds its section.
 */
export function uiTable(lang: UILang): Record<UIKey, string> {
  return TABLES[lang];
}

/**
 * A key's text, with the `{…}` slots already filled.
 *
 * It lives loose —outside React— because the main process also translates: the
 * providers' errors are read in the overlay, and with the interface in English a
 * «Falta la API key de Anthropic» is exactly the half-translated thing this
 * change exists to avoid.
 *
 * A slot that isn't filled is left **in view** (`{modelo}`) instead of being
 * erased: a sentence with a visible hole gets fixed; one missing a datum
 * silently reads as if it were fine.
 */
export function translate(
  lang: UILang,
  key: UIKey,
  vars?: Record<string, string | number>
): string {
  const text = TABLES[lang][key];
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole
  );
}

/** Chooses between two already-built values. For what isn't table text. */
export function pick<T>(lang: UILang, enValue: T, esValue: T): T {
  return lang === 'es' ? esValue : enValue;
}

export type { UIKey };

/**
 * The language used when none is chosen.
 *
 * English, by project decision. Whoever wants Spanish chooses it on the first
 * settings screen, which is in their language as soon as they change it.
 */
export const DEFAULT_UI_LANG: UILang = 'en';

/**
 * Guesses the language from whatever the system has set.
 *
 * It's used **only the first time**, so that someone with Windows in Spanish
 * isn't greeted by an app in English when their language exists. As soon as they
 * change it by hand, their choice rules: `uiLanguage` is saved and this isn't
 * looked at again.
 */
export function guessUILang(locale: string | undefined): UILang {
  return locale?.toLowerCase().startsWith('es') ? 'es' : DEFAULT_UI_LANG;
}

import { DEFAULT_UI_LANG, translate, type UIKey } from '@shared/i18n';
import { settingsStore } from './config/store';

/**
 * Translating from the main process.
 *
 * It's needed because **the main process's errors are read in the overlay**: when
 * a provider fails, the message that appears in the panel is written by
 * `llm/*.ts`. Without this, someone with the interface in English had the whole
 * app in English until something went wrong, and then an "Anthropic API key
 * missing" popped up in Spanish.
 *
 * It reads the language from the settings on **every call** and not once at
 * startup: the user can change it with the app open, and a cached message would
 * come out in the previous language at exactly the moment you least want to doubt
 * what you're reading.
 *
 * **If the settings can't be read, it falls back to the default language instead
 * of propagating.** Almost everything that passes through here is an error
 * message, and a function that blows up building the explanation of a failure
 * replaces the real cause with its own: that once hid OpenAI's "ran out of
 * budget" behind a `Cannot read properties of undefined`.
 */
export function m(key: UIKey, vars?: Record<string, string | number>): string {
  let lang = DEFAULT_UI_LANG;
  try {
    lang = settingsStore.get().uiLanguage;
  } catch {
    // With no readable settings the default language is the best possible answer.
  }
  return translate(lang, key, vars);
}

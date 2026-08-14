import { createContext, useContext, type ReactNode } from 'react';
import { DEFAULT_UI_LANG, translate, type UIKey, type UILang } from '@shared/i18n';

/**
 * The interface language, for the windows.
 *
 * A context and not a module variable: the windows are separate render
 * processes, and a variable that mutates behind React's back repaints nothing —
 * the language would change and the screen would stay as it was until the next
 * render for another reason.
 */

const LangContext = createContext<UILang>(DEFAULT_UI_LANG);

export function LangProvider({
  lang,
  children,
}: {
  lang: UILang | undefined;
  children: ReactNode;
}) {
  // `undefined` while the settings are in flight: better to paint the default
  // language for a moment than paint nothing.
  return <LangContext.Provider value={lang ?? DEFAULT_UI_LANG}>{children}</LangContext.Provider>;
}

export function useUILang(): UILang {
  return useContext(LangContext);
}

/**
 * Translates a key. For labels, `title`, `placeholder`, `aria-label`.
 *
 *     const t = useT();
 *     <button title={t('overlay.stop')}>{t('overlay.memory', { turns, max })}</button>
 */
export function useT(): (key: UIKey, vars?: Record<string, string | number>) => string {
  const lang = useUILang();
  return (key, vars) => translate(lang, key, vars);
}

/**
 * The same, but interpreting `**bold**` and `` `code` ``.
 *
 * It's needed because almost all this project's notices carry markup inside, and
 * a translation table can only store strings. The alternatives were splitting
 * each sentence into three keys —which leaves the translator without seeing the
 * whole sentence— or putting JSX in the table, which is no longer a table.
 *
 * **It's not a Markdown renderer and must not become one**, just like
 * `answer-format.ts`: two marks, and one left unclosed stays as literal text.
 * The difference from that one is this doesn't have to survive streaming, so it's
 * half the code.
 */
export function Tx({
  k,
  vars,
}: {
  k: UIKey;
  vars?: Record<string, string | number>;
}): ReactNode {
  return renderMarkup(translate(useUILang(), k, vars));
}

/**
 * The markup, without depending on the context.
 *
 * Loose because each window's root component **provides** the language and
 * therefore can't consume it: for its own strings it translates by hand and
 * paints with this.
 */
export function renderMarkup(text: string): ReactNode {
  // It's split by the delimiters keeping them, and decided by the first
  // character of each piece. No lookahead or states: there's nothing more than
  // two marks that open and close the same.
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
          return <strong key={index}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          return <code key={index}>{part.slice(1, -1)}</code>;
        }
        return part;
      })}
    </>
  );
}

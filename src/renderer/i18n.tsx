import { createContext, useContext, type ReactNode } from 'react';
import { DEFAULT_UI_LANG, translate, type UIKey, type UILang } from '@shared/i18n';

/**
 * El idioma de la interfaz, para las ventanas.
 *
 * Un contexto y no una variable de módulo: las ventanas son procesos de render
 * distintos, y una variable que muta a espaldas de React no repinta nada — el
 * idioma cambiaría y la pantalla se quedaría como estaba hasta el siguiente
 * render por otro motivo.
 */

const LangContext = createContext<UILang>(DEFAULT_UI_LANG);

export function LangProvider({
  lang,
  children,
}: {
  lang: UILang | undefined;
  children: ReactNode;
}) {
  // `undefined` mientras los settings están en vuelo: mejor pintar el idioma
  // por defecto un instante que no pintar nada.
  return <LangContext.Provider value={lang ?? DEFAULT_UI_LANG}>{children}</LangContext.Provider>;
}

export function useUILang(): UILang {
  return useContext(LangContext);
}

/**
 * Traduce una clave. Para etiquetas, `title`, `placeholder`, `aria-label`.
 *
 *     const t = useT();
 *     <button title={t('overlay.stop')}>{t('overlay.memory', { turns, max })}</button>
 */
export function useT(): (key: UIKey, vars?: Record<string, string | number>) => string {
  const lang = useUILang();
  return (key, vars) => translate(lang, key, vars);
}

/**
 * Lo mismo, pero interpretando `**negrita**` y `` `código` ``.
 *
 * Hace falta porque casi todos los avisos de este proyecto llevan marcado
 * dentro, y una tabla de traducciones sólo puede guardar cadenas. Las
 * alternativas eran partir cada frase en tres claves —que deja al traductor sin
 * ver la frase entera— o meter JSX en la tabla, que ya no es una tabla.
 *
 * **No es un renderizador de Markdown y no debe convertirse en uno**, igual que
 * `answer-format.ts`: dos marcas, y una sin cerrar se queda como texto literal.
 * La diferencia con aquél es que éste no tiene que sobrevivir al streaming, así
 * que es la mitad de código.
 */
export function Tx({
  k,
  vars,
}: {
  k: UIKey;
  vars?: Record<string, string | number>;
}): ReactNode {
  const text = translate(useUILang(), k, vars);
  // Se parte por los delimitadores conservándolos, y se decide por el primer
  // carácter de cada trozo. Sin lookahead ni estados: no hay nada más que dos
  // marcas que se abren y se cierran igual.
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

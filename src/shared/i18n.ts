import { en, type UIKey } from './locales/en';
import { es } from './locales/es';

/**
 * Dos idiomas, con los textos fuera de los componentes y sin dependencia.
 *
 * Los diccionarios son **módulos de TypeScript y no `.json`**, y la razón es
 * una sola: `es.ts` se declara como `Record<UIKey, string>`, así que una clave
 * sin traducir **no compila**. Con JSON caería al idioma de reserva y el fallo
 * sólo se vería cuando un usuario se encontrara una frase en inglés en mitad de
 * una pantalla en español — mudo hasta entonces. Todo lo demás es igual que con
 * dos JSON, y encima no hay que tocar `resolveJsonModule` ni la configuración
 * de dos bundlers.
 *
 * Ver `locales/en.ts` para las convenciones de las claves.
 */

/** Idioma de la INTERFAZ. No confundir con `Settings.language`, que es del ASR. */
export type UILang = 'en' | 'es';

export const UI_LANGS: readonly UILang[] = ['en', 'es'] as const;

/** Cómo se llama cada idioma **en su propio idioma**, que es como se buscan. */
export const UI_LANG_LABEL: Record<UILang, string> = {
  en: 'English',
  es: 'Español',
};

const TABLES: Record<UILang, Record<UIKey, string>> = { en, es };

/**
 * El texto de una clave, con los huecos `{…}` ya rellenos.
 *
 * Vive suelta —fuera de React— porque el proceso principal también traduce: los
 * errores de los proveedores se leen en el overlay, y con la interfaz en inglés
 * un «Falta la API key de Anthropic» es justo la mitad-traducida que este
 * cambio existe para evitar.
 *
 * Un hueco que no se rellena se deja **a la vista** (`{modelo}`) en lugar de
 * borrarse: una frase con un agujero visible se arregla; una a la que le falta
 * un dato en silencio se lee como si estuviera bien.
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

/** Elige entre dos valores ya construidos. Para lo que no es texto de tabla. */
export function pick<T>(lang: UILang, enValue: T, esValue: T): T {
  return lang === 'es' ? esValue : enValue;
}

export type { UIKey };

/**
 * El idioma que se usa cuando no hay ninguno elegido.
 *
 * Inglés, por decisión del proyecto. Quien quiera español lo elige en la
 * primera pantalla de ajustes, que está en su idioma en cuanto lo cambia.
 */
export const DEFAULT_UI_LANG: UILang = 'en';

/**
 * Adivina el idioma a partir del que tenga puesto el sistema.
 *
 * Se usa **sólo la primera vez**, para que a alguien con Windows en español no
 * le reciba una app en inglés cuando existe su idioma. En cuanto lo cambia a
 * mano, manda su elección: `uiLanguage` se guarda y esto no vuelve a mirarse.
 */
export function guessUILang(locale: string | undefined): UILang {
  return locale?.toLowerCase().startsWith('es') ? 'es' : DEFAULT_UI_LANG;
}

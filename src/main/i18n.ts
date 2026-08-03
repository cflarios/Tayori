import { DEFAULT_UI_LANG, translate, type UIKey } from '@shared/i18n';
import { settingsStore } from './config/store';

/**
 * Traducir desde el proceso principal.
 *
 * Hace falta porque **los errores del main se leen en el overlay**: cuando un
 * proveedor falla, el mensaje que aparece en el panel lo escribe `llm/*.ts`. Sin
 * esto, alguien con la interfaz en inglés tenía la app entera en inglés hasta
 * que algo iba mal, y entonces le saltaba un «Falta la API key de Anthropic».
 *
 * Lee el idioma de los settings en **cada llamada** y no una vez al arrancar: el
 * usuario puede cambiarlo con la app abierta, y un mensaje cacheado saldría en
 * el idioma anterior justo en el momento en el que menos ganas hay de dudar de
 * lo que se lee.
 *
 * **Si los ajustes no se pueden leer, se cae al idioma por defecto en lugar de
 * propagar.** Casi todo lo que pasa por aquí es un mensaje de error, y una
 * función que revienta construyendo la explicación de un fallo sustituye la
 * causa real por la suya: eso ya escondió una vez el "se quedó sin presupuesto"
 * de OpenAI detrás de un `Cannot read properties of undefined`.
 */
export function m(key: UIKey, vars?: Record<string, string | number>): string {
  let lang = DEFAULT_UI_LANG;
  try {
    lang = settingsStore.get().uiLanguage;
  } catch {
    // Sin ajustes legibles el idioma por defecto es la mejor respuesta posible.
  }
  return translate(lang, key, vars);
}

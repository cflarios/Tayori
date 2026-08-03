import { translate, type UIKey } from '@shared/i18n';
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
 */
export function m(key: UIKey, vars?: Record<string, string | number>): string {
  return translate(settingsStore.get().uiLanguage, key, vars);
}

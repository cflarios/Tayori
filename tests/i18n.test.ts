import { describe, expect, it } from 'vitest';
import { en } from '../src/shared/locales/en';
import { es } from '../src/shared/locales/es';
import { translate, UI_LANGS } from '../src/shared/i18n';

/**
 * Lo que el compilador **no** puede comprobar de las traducciones.
 *
 * Que estén todas las claves ya lo garantiza el tipo: `es` es un
 * `Record<UIKey, string>`, así que falta una y no compila. Lo que queda fuera
 * del tipo es el contenido, y ahí hay dos fallos que llegan a pantalla sin dar
 * ningún error:
 *
 *  - **Un hueco que no coincide.** Si el inglés dice `{turns}/{max}` y el
 *    español dice `{turnos}/{max}`, la frase española sale con un `{turnos}`
 *    literal en mitad del panel.
 *  - **Una traducción que no se tradujo.** Copiar la línea inglesa y olvidarse
 *    deja una clave "traducida" que dice exactamente lo mismo, y el tipo la da
 *    por buena.
 */

/** Los `{huecos}` de un texto, ordenados y sin repetir. */
const slots = (text: string): string[] =>
  [...new Set(text.match(/\{(\w+)\}/g) ?? [])].sort();

describe('traducciones', () => {
  it('cada clave tiene los mismos huecos en los dos idiomas', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(slots(es[key]), key).toEqual(slots(en[key]));
    }
  });

  it('ninguna traducción se quedó vacía', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(en[key].trim(), key).not.toBe('');
      expect(es[key].trim(), key).not.toBe('');
    }
  });

  it('casi ninguna clave es idéntica en los dos idiomas', () => {
    /*
     * Algunas lo son legítimamente —«Tests», «{keys}»— así que no se puede
     * exigir que TODAS difieran. Lo que sí delata un copiar y pegar es que
     * empiecen a coincidir muchas: con el tope puesto, olvidarse de traducir un
     * bloque entero rompe el test aunque el tipo esté contento.
     */
    const iguales = (Object.keys(en) as (keyof typeof en)[]).filter(
      (key) => en[key] === es[key]
    );
    expect(iguales.length / Object.keys(en).length).toBeLessThan(0.1);
  });

  it('rellena los huecos y deja a la vista los que falten', () => {
    // Un hueco sin rellenar se queda visible a propósito: una frase con un
    // agujero se arregla, una a la que le falta un dato en silencio se lee como
    // si estuviera bien.
    expect(translate('en', 'overlay.memory', { turns: 3, max: 8 })).toBe('memory 3/8');
    expect(translate('es', 'overlay.memory', { turns: 3, max: 8 })).toBe('memoria 3/8');
    expect(translate('en', 'overlay.memory', { turns: 3 })).toContain('{max}');
  });

  it('el inglés es la fuente y no traduce nada', () => {
    // Si esto falla es que alguien invirtió las tablas.
    expect(translate('en', 'overlay.listen')).toBe(en['overlay.listen']);
    expect(UI_LANGS[0]).toBe('en');
  });
});

import { describe, expect, it } from 'vitest';
import {
  activeHotkeys,
  DEFAULT_HOTKEYS,
  DEFAULT_SETTINGS,
  type HotkeyMap,
  type Settings,
} from '../src/shared/types';
import { duplicateAccelerators } from '../src/shared/accelerator';

/**
 * Apagar un atajo tiene que **soltar la combinación**, no sólo dejar de hacer
 * su trabajo. Un acelerador global se lo quita a la aplicación que tenga el
 * foco, así que un atajo apagado que siguiera registrado sería lo peor de los
 * dos mundos: no hace nada y encima nadie más puede usar esas teclas.
 *
 * Todo lo que se comprueba aquí pasa por `activeHotkeys`, que es el único sitio
 * donde se decide qué está vivo. Lo consumen el registro de `globalShortcut` y
 * el aviso de duplicados del dashboard.
 */

const settings = (patch: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  ...patch,
});

describe('activeHotkeys', () => {
  it('sin nada apagado devuelve los atajos tal cual', () => {
    expect(activeHotkeys(settings())).toEqual(DEFAULT_HOTKEYS);
  });

  it('vacía el acelerador del apagado y no toca los demás', () => {
    const active = activeHotkeys(settings({ disabledHotkeys: ['solveQuiz'] }));

    // Vacío es lo que `registerHotkeys` ya ignoraba: la combinación no llega a
    // registrarse, así que queda libre para otra aplicación.
    expect(active.solveQuiz).toBe('');
    expect(active.askNow).toBe(DEFAULT_HOTKEYS.askNow);
    expect(active.solveOnScreen).toBe(DEFAULT_HOTKEYS.solveOnScreen);
  });

  it('NO borra el acelerador guardado: apagar no es olvidar', () => {
    // Es lo que permite volver a encenderlo sin teclear la combinación otra
    // vez; si apagar vaciase `settings.hotkeys`, el valor se habría perdido.
    const current = settings({ disabledHotkeys: ['moveUp'] });
    activeHotkeys(current);
    expect(current.hotkeys.moveUp).toBe(DEFAULT_HOTKEYS.moveUp);
  });

  it('un atajo apagado deja de contar como choque', () => {
    /*
     * El caso real: reasignas algo a una combinación que ya usaba otra acción
     * que tienes apagada. No hay conflicto —sólo se registra una— y marcarlo en
     * rojo mandaría a arreglar un problema que no existe.
     */
    const collide: HotkeyMap = { ...DEFAULT_HOTKEYS, moveUp: DEFAULT_HOTKEYS.askNow };

    expect(duplicateAccelerators(collide).size).toBe(1);
    expect(
      duplicateAccelerators(
        activeHotkeys(settings({ hotkeys: collide, disabledHotkeys: ['moveUp'] }))
      ).size
    ).toBe(0);
  });

  it('con todo apagado no queda ninguna combinación tomada', () => {
    const all = Object.keys(DEFAULT_HOTKEYS) as (keyof HotkeyMap)[];
    const active = activeHotkeys(settings({ disabledHotkeys: all }));

    expect(Object.values(active).every((accelerator) => accelerator === '')).toBe(true);
  });

  it('tolera una acción apagada que ya no existe', () => {
    // Un `settings.json` de una versión que tenía un atajo que se quitó después.
    const active = activeHotkeys(
      settings({ disabledHotkeys: ['unaQueYaNoExiste' as keyof HotkeyMap] })
    );
    expect(active).toEqual(DEFAULT_HOTKEYS);
  });
});

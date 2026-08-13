import { describe, expect, it } from 'vitest';
import { idleShutoffDue } from '../src/shared/types';

/**
 * El apagado por inactividad: si nadie habla durante los minutos configurados, la
 * app deja de escuchar. La lógica es pura para poder fijarla sin el orquestador.
 */
describe('idleShutoffDue', () => {
  const cfg = (enabled: boolean, minutes: number) => ({
    idleShutoffEnabled: enabled,
    idleShutoffMinutes: minutes,
  });

  it('no apaga si está desactivado, por mucho silencio que haya', () => {
    expect(idleShutoffDue(cfg(false, 10), 60 * 60_000)).toBe(false);
  });

  it('apaga al alcanzar el umbral', () => {
    expect(idleShutoffDue(cfg(true, 10), 10 * 60_000)).toBe(true);
    expect(idleShutoffDue(cfg(true, 10), 10 * 60_000 + 1)).toBe(true);
  });

  it('no apaga antes del umbral', () => {
    expect(idleShutoffDue(cfg(true, 10), 10 * 60_000 - 1)).toBe(false);
    expect(idleShutoffDue(cfg(true, 5), 4 * 60_000)).toBe(false);
  });

  it('un cero (de un settings.json editado a mano) no apaga en el acto', () => {
    // Sin esta guarda, minutos=0 haría que cualquier silencio ≥ 0 apagara la
    // escucha nada más empezar.
    expect(idleShutoffDue(cfg(true, 0), 0)).toBe(false);
    expect(idleShutoffDue(cfg(true, 0), 60 * 60_000)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { isNewerVersion } from '../src/shared/types';

/**
 * La comparación de versiones del botón de actualización. Comparar cadenas sin
 * más ("1.10.0" < "1.9.0" en orden alfabético) es justo el fallo que esto evita.
 */
describe('isNewerVersion', () => {
  it('detecta una versión posterior', () => {
    expect(isNewerVersion('1.5.0', '1.4.0')).toBe(true);
    expect(isNewerVersion('1.4.1', '1.4.0')).toBe(true);
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true);
  });

  it('la misma versión no es más nueva', () => {
    expect(isNewerVersion('1.4.0', '1.4.0')).toBe(false);
  });

  it('una versión anterior no es más nueva', () => {
    expect(isNewerVersion('1.3.0', '1.4.0')).toBe(false);
    expect(isNewerVersion('1.4.0', '1.4.1')).toBe(false);
  });

  it('compara por número, no alfabéticamente', () => {
    // El caso clásico: 1.10.0 es posterior a 1.9.0 aunque "1" < "9" como texto.
    expect(isNewerVersion('1.10.0', '1.9.0')).toBe(true);
    expect(isNewerVersion('1.9.0', '1.10.0')).toBe(false);
  });

  it('tolera la "v" inicial de los tags de git', () => {
    expect(isNewerVersion('v1.5.0', 'v1.4.0')).toBe(true);
    expect(isNewerVersion('v1.4.0', '1.4.0')).toBe(false);
  });

  it('ignora sufijos de pre-release cayendo a la base', () => {
    expect(isNewerVersion('1.5.0-beta', '1.4.0')).toBe(true);
    expect(isNewerVersion('1.4.0-rc1', '1.4.0')).toBe(false);
  });
});

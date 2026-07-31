import { describe, expect, it } from 'vitest';
import {
  acceleratorFromEvent,
  duplicateAccelerators,
  formatAccelerator,
  type KeyStroke,
} from '../src/shared/accelerator';
import { DEFAULT_HOTKEYS } from '../src/shared/types';

const stroke = (key: string, mods: Partial<KeyStroke> = {}): KeyStroke => ({
  key,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

describe('acceleratorFromEvent', () => {
  it('compone el formato que espera Electron', () => {
    expect(acceleratorFromEvent(stroke('s', { ctrlKey: true, shiftKey: true }))).toBe(
      'Control+Shift+S'
    );
    expect(acceleratorFromEvent(stroke('C', { ctrlKey: true, altKey: true }))).toBe(
      'Control+Alt+C'
    );
  });

  it('mantiene el orden Control, Alt, Shift, Super', () => {
    const all = acceleratorFromEvent(
      stroke('k', { ctrlKey: true, altKey: true, shiftKey: true, metaKey: true })
    );
    expect(all).toBe('Control+Alt+Shift+Super+K');
  });

  it('rechaza una tecla sin modificador', () => {
    // No es cosmético: un atajo global sin modificador secuestra esa tecla en
    // todo el sistema, y dejaría de poder escribirse en cualquier aplicación.
    expect(acceleratorFromEvent(stroke('s'))).toBeNull();
    expect(acceleratorFromEvent(stroke('F5'))).toBeNull();
  });

  it('ignora los modificadores sueltos mientras se compone la combinación', () => {
    expect(acceleratorFromEvent(stroke('Control', { ctrlKey: true }))).toBeNull();
    expect(acceleratorFromEvent(stroke('Shift', { ctrlKey: true, shiftKey: true }))).toBeNull();
  });

  it('traduce los nombres del DOM a los de Electron', () => {
    expect(acceleratorFromEvent(stroke('ArrowUp', { ctrlKey: true, altKey: true }))).toBe(
      'Control+Alt+Up'
    );
    expect(acceleratorFromEvent(stroke(' ', { ctrlKey: true }))).toBe('Control+Space');
  });

  it('deja pasar las teclas cuyo nombre ya coincide', () => {
    expect(acceleratorFromEvent(stroke('Enter', { ctrlKey: true }))).toBe('Control+Enter');
    expect(acceleratorFromEvent(stroke('F5', { ctrlKey: true }))).toBe('Control+F5');
  });

  it('normaliza la caja de las letras', () => {
    // Con Shift la tecla llega en mayúscula y sin él en minúscula; el
    // acelerador tiene que ser el mismo en ambos casos.
    expect(acceleratorFromEvent(stroke('m', { ctrlKey: true }))).toBe('Control+M');
    expect(acceleratorFromEvent(stroke('M', { ctrlKey: true }))).toBe('Control+M');
  });
});

describe('formatAccelerator', () => {
  it('abrevia Control y separa con espacios', () => {
    expect(formatAccelerator('Control+Shift+S')).toBe('Ctrl + Shift + S');
  });

  it('dice algo cuando no hay atajo', () => {
    expect(formatAccelerator('')).toBe('Sin asignar');
  });
});

describe('duplicateAccelerators', () => {
  it('los atajos por defecto no chocan entre sí', () => {
    // Es la comprobación que importa: dos acciones con el mismo acelerador no
    // dan error, `globalShortcut` registra la primera y la otra queda muerta.
    expect(duplicateAccelerators(DEFAULT_HOTKEYS).size).toBe(0);
  });

  it('detecta el choque', () => {
    const repeated = duplicateAccelerators({
      askNow: 'Control+Enter',
      otra: 'Control+Enter',
      tercera: 'Control+M',
    });
    expect([...repeated]).toEqual(['Control+Enter']);
  });

  it('los vacíos no cuentan como repetidos', () => {
    expect(duplicateAccelerators({ a: '', b: '' }).size).toBe(0);
  });
});

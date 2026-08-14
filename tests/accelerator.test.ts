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
  it('composes the format Electron expects', () => {
    expect(acceleratorFromEvent(stroke('s', { ctrlKey: true, shiftKey: true }))).toBe(
      'Control+Shift+S'
    );
    expect(acceleratorFromEvent(stroke('C', { ctrlKey: true, altKey: true }))).toBe(
      'Control+Alt+C'
    );
  });

  it('keeps the order Control, Alt, Shift, Super', () => {
    const all = acceleratorFromEvent(
      stroke('k', { ctrlKey: true, altKey: true, shiftKey: true, metaKey: true })
    );
    expect(all).toBe('Control+Alt+Shift+Super+K');
  });

  it('rejects a key without a modifier', () => {
    // Not cosmetic: a global shortcut with no modifier hijacks that key across
    // the whole system, and it would stop being typable in any application.
    expect(acceleratorFromEvent(stroke('s'))).toBeNull();
    expect(acceleratorFromEvent(stroke('F5'))).toBeNull();
  });

  it('ignores lone modifiers while composing the combination', () => {
    expect(acceleratorFromEvent(stroke('Control', { ctrlKey: true }))).toBeNull();
    expect(acceleratorFromEvent(stroke('Shift', { ctrlKey: true, shiftKey: true }))).toBeNull();
  });

  it("translates the DOM names to Electron's", () => {
    expect(acceleratorFromEvent(stroke('ArrowUp', { ctrlKey: true, altKey: true }))).toBe(
      'Control+Alt+Up'
    );
    expect(acceleratorFromEvent(stroke(' ', { ctrlKey: true }))).toBe('Control+Space');
  });

  it('lets through keys whose name already matches', () => {
    expect(acceleratorFromEvent(stroke('Enter', { ctrlKey: true }))).toBe('Control+Enter');
    expect(acceleratorFromEvent(stroke('F5', { ctrlKey: true }))).toBe('Control+F5');
  });

  it('normalizes the case of the letters', () => {
    // With Shift the key arrives uppercase and without it lowercase; the
    // accelerator has to be the same in both cases.
    expect(acceleratorFromEvent(stroke('m', { ctrlKey: true }))).toBe('Control+M');
    expect(acceleratorFromEvent(stroke('M', { ctrlKey: true }))).toBe('Control+M');
  });
});

describe('formatAccelerator', () => {
  it('abbreviates Control and separates with spaces', () => {
    expect(formatAccelerator('Control+Shift+S')).toBe('Ctrl + Shift + S');
  });

  it("says something when there's no shortcut", () => {
    // The text is provided by the caller, the only one that knows the language;
    // with nothing, a dash, so the field is never seen simply empty.
    expect(formatAccelerator('')).toBe('—');
    expect(formatAccelerator('', 'Unassigned')).toBe('Unassigned');
  });
});

describe('duplicateAccelerators', () => {
  it("the default shortcuts don't clash with each other", () => {
    // It's the check that matters: two actions with the same accelerator give no
    // error, `globalShortcut` registers the first and the other is left dead.
    expect(duplicateAccelerators(DEFAULT_HOTKEYS).size).toBe(0);
  });

  it('detects the clash', () => {
    const repeated = duplicateAccelerators({
      askNow: 'Control+Enter',
      otra: 'Control+Enter',
      tercera: 'Control+M',
    });
    expect([...repeated]).toEqual(['Control+Enter']);
  });

  it("empty ones don't count as duplicates", () => {
    expect(duplicateAccelerators({ a: '', b: '' }).size).toBe(0);
  });
});

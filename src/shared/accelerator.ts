/**
 * Translation between a keystroke and an Electron accelerator.
 *
 * The shortcuts existed from the start in `HotkeyMap`, but could only be changed
 * by editing `settings.json` by hand — and they have to be changed: a global
 * accelerator takes it away from whatever application has the focus, so any
 * choice clashes with someone's editor, game or language.
 *
 * It lives in `shared` and not in the dashboard because it's pure logic with
 * tests: the format is dictated by Electron (`globalShortcut.register`), not the
 * UI, and getting it wrong produces a shortcut that **doesn't register,
 * silently**.
 */

/** What's needed from a keyboard event; this way it can be tested without a DOM. */
export interface KeyStroke {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

/** Keys whose DOM name doesn't match Electron's. */
const KEY_ALIASES: Record<string, string> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ' ': 'Space',
  Escape: 'Esc',
  '+': 'Plus',
};

/** Lone modifiers: pressing them doesn't complete a shortcut. */
const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'CapsLock']);

/**
 * Turns a keystroke into an accelerator, or `null` if it isn't a valid one yet.
 *
 * **At least one modifier** is required, and it's not a style quirk: a global
 * shortcut with no modifier hijacks that key across the whole system. Binding `S`
 * to "capture screen" would make it impossible to type the letter S in any
 * application while the assistant is open.
 */
export function acceleratorFromEvent(event: KeyStroke): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null;

  const modifiers: string[] = [];
  if (event.ctrlKey) modifiers.push('Control');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');
  if (event.metaKey) modifiers.push('Super');
  if (!modifiers.length) return null;

  const key = normalizeKey(event.key);
  if (!key) return null;

  return [...modifiers, key].join('+');
}

function normalizeKey(raw: string): string | null {
  const alias = KEY_ALIASES[raw];
  if (alias) return alias;

  // A lone letter arrives lowercase or uppercase depending on Shift; Electron
  // expects them uppercase and without depending on that.
  if (raw.length === 1) return raw.toUpperCase();

  // F1–F24, Enter, Tab, Delete, Home… already come with the name Electron uses.
  if (/^F\d{1,2}$/.test(raw)) return raw;
  if (/^[A-Za-z]{2,}$/.test(raw)) return raw;

  return null;
}

/**
 * How an accelerator is shown: `Control+Shift+S` → `Ctrl + Shift + S`.
 *
 * The «unassigned» text comes in as a parameter because this function is pure
 * and doesn't know which language the interface is in. Its caller does: the
 * dashboard passes its translated key, and the dash is left for the tests and
 * for any use that doesn't have a table at hand.
 */
export function formatAccelerator(accelerator: string, unassigned = '—'): string {
  if (!accelerator) return unassigned;
  return accelerator
    .split('+')
    .map((part) => (part === 'Control' ? 'Ctrl' : part))
    .join(' + ');
}

/**
 * Repeated shortcuts within the map.
 *
 * Two actions with the same accelerator give no error: `globalShortcut` registers
 * the first and returns `false` for the second, so one of the two actions stops
 * working without anything saying so.
 */
export function duplicateAccelerators(map: object): Set<string> {
  const seen = new Set<string>();
  const repeated = new Set<string>();

  for (const accelerator of Object.values(map) as string[]) {
    if (!accelerator) continue;
    if (seen.has(accelerator)) repeated.add(accelerator);
    seen.add(accelerator);
  }
  return repeated;
}

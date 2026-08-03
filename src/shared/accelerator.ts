/**
 * Traducción entre una pulsación de teclado y un acelerador de Electron.
 *
 * Los atajos existían desde el principio en `HotkeyMap`, pero sólo se podían
 * cambiar editando `settings.json` a mano — y hay que cambiarlos: un acelerador
 * global se lo quita a la aplicación que tenga el foco, así que cualquier
 * elección choca con el editor, el juego o el idioma de alguien.
 *
 * Vive en `shared` y no en el dashboard porque es lógica pura y con tests: el
 * formato lo dicta Electron (`globalShortcut.register`), no la UI, y equivocarse
 * produce un atajo que **no se registra en silencio**.
 */

/** Lo que se necesita de un evento de teclado; así se puede probar sin DOM. */
export interface KeyStroke {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

/** Teclas cuyo nombre en el DOM no coincide con el de Electron. */
const KEY_ALIASES: Record<string, string> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ' ': 'Space',
  Escape: 'Esc',
  '+': 'Plus',
};

/** Modificadores sueltos: pulsarlos no completa un atajo. */
const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'CapsLock']);

/**
 * Convierte una pulsación en acelerador, o `null` si todavía no es uno válido.
 *
 * Se exige **al menos un modificador**, y no es una manía de estilo: un atajo
 * global sin modificador secuestra esa tecla en todo el sistema. Ligar `S` a
 * "capturar pantalla" haría imposible escribir la letra ese en cualquier
 * aplicación mientras el asistente esté abierto.
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

  // Una letra suelta llega en minúscula o mayúscula según el Shift; Electron
  // las espera en mayúscula y sin depender de eso.
  if (raw.length === 1) return raw.toUpperCase();

  // F1–F24, Enter, Tab, Delete, Home… ya vienen con el nombre que Electron usa.
  if (/^F\d{1,2}$/.test(raw)) return raw;
  if (/^[A-Za-z]{2,}$/.test(raw)) return raw;

  return null;
}

/**
 * Cómo se enseña un acelerador: `Control+Shift+S` → `Ctrl + Shift + S`.
 *
 * El texto de «sin asignar» entra por parámetro porque esta función es pura y
 * no sabe en qué idioma está la interfaz. Quien la llama sí: el dashboard le
 * pasa su clave traducida, y el guion queda para los tests y para cualquier uso
 * que no tenga una tabla a mano.
 */
export function formatAccelerator(accelerator: string, unassigned = '—'): string {
  if (!accelerator) return unassigned;
  return accelerator
    .split('+')
    .map((part) => (part === 'Control' ? 'Ctrl' : part))
    .join(' + ');
}

/**
 * Atajos repetidos dentro del mapa.
 *
 * Dos acciones con el mismo acelerador no dan ningún error: `globalShortcut`
 * registra el primero y devuelve `false` para el segundo, así que una de las dos
 * acciones deja de funcionar sin que nada lo diga.
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

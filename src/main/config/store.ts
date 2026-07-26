import { app } from 'electron';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { EventEmitter } from 'node:events';
import { DEFAULT_SETTINGS, type Settings } from '@shared/types';

/**
 * Persistencia de settings en un JSON dentro de userData.
 *
 * Se escribió a mano en lugar de usar `electron-store` porque esa librería
 * es ESM-only desde la v10 y el proceso main se empaqueta como CommonJS
 * (necesario para los módulos nativos de whisper/onnxruntime). Lo que
 * necesitamos es pequeño y no justifica pelear con el interop.
 *
 * Los secretos NO viven aquí — ver `secrets.ts`.
 */

/**
 * Mezcla superficial por clave de primer nivel: si el archivo en disco no
 * tiene una clave (porque se añadió en una versión posterior), gana el default.
 * `hotkeys` se mezcla un nivel más para no perder atajos nuevos.
 */
function withDefaults(raw: unknown): Settings {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  const stored = raw as Partial<Settings>;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    llmModels: { ...DEFAULT_SETTINGS.llmModels, ...(stored.llmModels ?? {}) },
    hotkeys: { ...DEFAULT_SETTINGS.hotkeys, ...(stored.hotkeys ?? {}) },
    contextPacks: stored.contextPacks ?? DEFAULT_SETTINGS.contextPacks,
  };
}

class SettingsStore extends EventEmitter {
  private cache: Settings | null = null;

  private get file(): string {
    return join(app.getPath('userData'), 'settings.json');
  }

  get(): Settings {
    if (this.cache) return this.cache;

    let raw: unknown = null;
    try {
      if (existsSync(this.file)) {
        let text = readFileSync(this.file, 'utf-8');
        // Notepad y `Set-Content -Encoding utf8` de PowerShell 5.1 escriben un
        // BOM que hace fallar a JSON.parse. Como el archivo está pensado para
        // poder editarse a mano, lo toleramos en lugar de ignorar la config
        // entera en silencio.
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
        raw = JSON.parse(text);
      }
    } catch (err) {
      // Un JSON corrupto no debe impedir arrancar: caemos a defaults.
      console.error('[settings] no se pudo leer, usando defaults:', err);
    }

    this.cache = withDefaults(raw);
    return this.cache;
  }

  /** Aplica un patch parcial, persiste y notifica a los suscriptores. */
  update(patch: Partial<Settings>): Settings {
    const next = withDefaults({ ...this.get(), ...patch });
    this.cache = next;
    this.persist(next);
    this.emit('change', next);
    return next;
  }

  /** Escritura atómica: si el proceso muere a mitad, el archivo previo sigue íntegro. */
  private persist(settings: Settings): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf-8');
      renameSync(tmp, this.file);
    } catch (err) {
      console.error('[settings] no se pudo guardar:', err);
    }
  }
}

export const settingsStore = new SettingsStore();

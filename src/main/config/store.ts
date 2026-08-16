import { app } from 'electron';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { EventEmitter } from 'node:events';
import { guessUILang } from '@shared/i18n';
import { DEFAULT_SETTINGS, type ContextPack, type Settings } from '@shared/types';

/**
 * Settings persistence in a JSON inside userData.
 *
 * It was written by hand instead of using `electron-store` because that library
 * has been ESM-only since v10 and the main process is packaged as CommonJS
 * (needed for the native whisper/onnxruntime modules). What we need is small and
 * doesn't justify fighting the interop.
 *
 * Secrets do NOT live here — see `secrets.ts`.
 */

/**
 * Shallow merge by top-level key: if the file on disk doesn't have a key
 * (because it was added in a later version), the default wins. `hotkeys` is
 * merged one level deeper so as not to lose new shortcuts.
 */
function withDefaults(raw: unknown, systemLocale?: string): Settings {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };

  /*
   * The single `customPrompt` string became a list of named `customProfiles`.
   * It's destructured OUT so it isn't written back as a dead key, and carried
   * over as the first profile so nobody loses the prompt they had. `activeCustomId`
   * then points at it, so a user who was on the custom profile keeps their text.
   */
  const { customPrompt: legacyCustom, ...stored } = raw as Partial<Settings> & {
    customPrompt?: string;
  };
  const customProfiles = Array.isArray(stored.customProfiles)
    ? stored.customProfiles
    : typeof legacyCustom === 'string' && legacyCustom.trim()
      ? [{ id: 'custom-1', name: 'Personalizado', prompt: legacyCustom.trim() }]
      : [];

  return {
    ...DEFAULT_SETTINGS,
    /*
     * The interface language, only the FIRST time.
     *
     * The default is English, but greeting someone with Windows in Spanish in
     * English when their language exists is a free bad first impression. As soon
     * as they choose it by hand it's saved and this isn't looked at again — the
     * check is `stored.uiLanguage` and not the final value precisely so that
     * changing it to English on purpose doesn't get undone on the next startup.
     */
    uiLanguage: stored.uiLanguage ?? guessUILang(systemLocale),
    ...stored,
    llmModels: { ...DEFAULT_SETTINGS.llmModels, ...(stored.llmModels ?? {}) },
    hotkeys: { ...DEFAULT_SETTINGS.hotkeys, ...(stored.hotkeys ?? {}) },
    /*
     * The disabled list is **normalized to an array**, not taken as-is.
     *
     * The rest of the fields tolerate garbage because an odd value shows; this
     * one doesn't: if a hand-edited `settings.json` brings something here that
     * isn't an array, `activeHotkeys` would do `new Set(undefined)` and blow up
     * at startup, with all eleven shortcuts down and no hint why.
     */
    disabledHotkeys: Array.isArray(stored.disabledHotkeys) ? stored.disabledHotkeys : [],
    hiddenProfiles: Array.isArray(stored.hiddenProfiles) ? stored.hiddenProfiles : [],
    deletedProfiles: Array.isArray(stored.deletedProfiles) ? stored.deletedProfiles : [],
    builtinOverrides:
      stored.builtinOverrides && typeof stored.builtinOverrides === 'object'
        ? stored.builtinOverrides
        : {},
    removedCustoms: Array.isArray(stored.removedCustoms) ? stored.removedCustoms : [],
    customProfiles,
    activeCustomId:
      typeof stored.activeCustomId === 'string' && stored.activeCustomId
        ? stored.activeCustomId
        : (customProfiles[0]?.id ?? ''),
    contextPacks: (stored.contextPacks ?? DEFAULT_SETTINGS.contextPacks).map(normalizePack),
  };
}

/**
 * Fills in the fields an old pack didn't have.
 *
 * `withDefaults` only merges the top level, so a `contextPacks` saved before
 * `kind` and `profiles` existed would arrive without them and blow up when read.
 * `notes` and `[]` reproduce exactly the previous behavior: free text applied to
 * all profiles.
 */
function normalizePack(pack: ContextPack): ContextPack {
  return {
    ...pack,
    kind: pack.kind ?? 'notes',
    profiles: Array.isArray(pack.profiles) ? pack.profiles : [],
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
        // Notepad and PowerShell 5.1's `Set-Content -Encoding utf8` write a BOM
        // that makes JSON.parse fail. Since the file is meant to be editable by
        // hand, we tolerate it instead of silently ignoring the whole config.
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
        raw = JSON.parse(text);
      }
    } catch (err) {
      // A corrupt JSON must not prevent startup: we fall back to defaults.
      console.error('[settings] no se pudo leer, usando defaults:', err);
    }

    // `app.getLocale()` only has a value after `ready`, and by the time someone
    // asks for the settings it already is.
    this.cache = withDefaults(raw, app.getLocale());
    return this.cache;
  }

  /** Applies a partial patch, persists and notifies subscribers. */
  update(patch: Partial<Settings>): Settings {
    const next = withDefaults({ ...this.get(), ...patch });
    this.cache = next;
    this.persist(next);
    this.emit('change', next);
    return next;
  }

  /** Atomic write: if the process dies mid-way, the previous file stays intact. */
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

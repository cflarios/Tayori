import { useCallback, useEffect, useRef, useState } from 'react';
import type { WhisperProgress } from '@shared/ipc';
import {
  activeHotkeys,
  adviseLocalModels,
  applyModelPreset,
  autoTriggerIsInert,
  clampFontScale,
  DROPDOWN_PROFILES,
  DEFAULT_HOTKEYS,
  FONT_SCALE,
  HOTKEY_LABEL,
  isScreenTrigger,
  LLM_LABEL,
  normalizeModelId,
  mqttTopics,
  INTERPRETER_LANGS,
  packsForProfile,
  presetFromSettings,
  PROFILE_SLOTS,
  providerIsReady,
  screenModelFor,
  speakersFor,
} from '@shared/types';
import {
  acceleratorFromEvent,
  duplicateAccelerators,
  formatAccelerator,
} from '@shared/accelerator';
import { translate, UI_LANG_LABEL, UI_LANGS, type UIKey, type UILang } from '@shared/i18n';
import { skillDescription, skillName } from '@shared/skills';
import {
  WHISPER_MODELS,
  recommendWhisperModel,
  sortByFavorite,
  type ModelAccuracy,
  type ModelSpeed,
} from '@shared/whisper-models';
import { LangProvider, renderMarkup, Tx, useT, useUILang } from '@renderer/i18n';
import { Mascot } from '@renderer/Mascot';
import { Icon, type IconName } from './icons';
import { SetupWizard } from './SetupWizard';
import type {
  AudioLevels,
  CaptureStatus,
  ContextPack,
  Conversation,
  ConversationSummary,
  HotkeyMap,
  LLMProviderId,
  ModelInfo,
  ModelPreset,
  MqttStatus,
  OllamaStatus,
  PhoneMirrorStatus,
  PromptProfileId,
  SecretKey,
  SecretsPresence,
  Settings,
  Skill,
  STTProviderId,
  SystemSpecs,
  ContextKind,
  UpdateInfo,
} from '@shared/types';

/** Sibling projects born from this one. */
const TAYORI_WEB_URL = 'https://tayori-web.cflarios.workers.dev/';
const TAYORI_ESP32_URL = 'https://github.com/cflarios/TayoriESP32';

/**
 * Link to an external site. It opens in the system browser, never inside the
 * dashboard: the `onClick` delegates it to `openExternal`, and just in case main
 * denies any navigation out of the app (see `windows/dashboard.ts`).
 */
function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="extlink"
      onClick={(e) => {
        e.preventDefault();
        void window.api.system.openExternal(href);
      }}
    >
      {children}
    </a>
  );
}

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className="switch"
      data-on={on}
      aria-pressed={on}
      onClick={() => onChange(!on)}
    >
      <span className="switch__knob" />
    </button>
  );
}

/**
 * A settings row: label, explanation and its control on the right.
 *
 * The icon is optional and not decoration: in a column of twelve rows in a row
 * it's what lets you find the one you're looking for again without re-reading the
 * labels. It's put where it helps distinguish —two similar switches, a long
 * settings list— and omitted where the row is already unique in its card.
 */
function Row({
  label,
  desc,
  icon,
  children,
}: {
  label: string;
  desc?: React.ReactNode;
  icon?: IconName;
  children?: React.ReactNode;
}) {
  return (
    <div className="row">
      {icon && (
        <span className="row__icon">
          <Icon name={icon} size={16} />
        </span>
      )}
      <div className="row__text">
        <div className="row__label">{label}</div>
        {desc && <div className="row__desc">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

/** Built-in profile labels for the manager toggles (same keys as the select). */
const PROFILE_BEH_LABEL: Partial<Record<PromptProfileId, UIKey>> = {
  interview: 'beh.profInterview',
  meeting: 'beh.profMeeting',
  lecture: 'beh.profLecture',
  support: 'beh.profSupport',
  coding: 'beh.profCoding',
  quiz: 'beh.profQuiz',
  interpreter: 'beh.profInterpreter',
};

/**
 * Enable/disable, remove, and create answer profiles.
 *
 * A built-in can be **hidden** (off the overlay picker, still a toggle here) or
 * **removed** (gone from both, but restorable — its prompt is code, never lost).
 * Removing exists because seven profiles land at once and most people want only
 * a couple; hiding alone still leaves the seven toggles cluttering this list.
 * Neither is allowed to strand the picker with nothing to choose. A custom
 * profile is a name and a free-text instruction; there can be several, all under
 * the single `custom` id (`activeCustomId` picks which). Whenever the active
 * profile is what's hidden, removed or deleted, it falls back so the app never
 * sits on one that isn't offered.
 */
function ProfileManager({
  settings,
  patch,
}: {
  settings: Settings;
  patch: (p: Partial<Settings>) => void;
}) {
  const t = useT();

  // Everything the overlay picker can offer under a prospective state.
  const availableBuiltins = (
    hidden: PromptProfileId[],
    removed: PromptProfileId[]
  ): PromptProfileId[] => DROPDOWN_PROFILES.filter((p) => !hidden.includes(p) && !removed.includes(p));
  const visibleCustoms = (customs: Settings['customProfiles']): Settings['customProfiles'] =>
    customs.filter((c) => !c.hidden);

  // A change that would leave the picker with nothing to choose is refused.
  const strands = (
    hidden: PromptProfileId[],
    removed: PromptProfileId[],
    customs: Settings['customProfiles']
  ): boolean =>
    availableBuiltins(hidden, removed).length === 0 && visibleCustoms(customs).length === 0;

  // Where the active profile lands when it stops being offered.
  const fallback = (
    hidden: PromptProfileId[],
    removed: PromptProfileId[],
    customs: Settings['customProfiles']
  ): Partial<Settings> => {
    const builtin = availableBuiltins(hidden, removed)[0];
    if (builtin) return { promptProfileId: builtin };
    const custom = visibleCustoms(customs)[0];
    return custom ? { promptProfileId: 'custom', activeCustomId: custom.id } : {};
  };

  const setHidden = (id: PromptProfileId, visible: boolean): void => {
    const hiddenProfiles = visible
      ? settings.hiddenProfiles.filter((h) => h !== id)
      : [...settings.hiddenProfiles, id];
    if (!visible && strands(hiddenProfiles, settings.deletedProfiles, settings.customProfiles)) return;
    const moveActive =
      !visible && settings.promptProfileId === id
        ? fallback(hiddenProfiles, settings.deletedProfiles, settings.customProfiles)
        : {};
    patch({ hiddenProfiles, ...moveActive });
  };

  const removeBuiltin = (id: PromptProfileId): void => {
    const deletedProfiles = [...settings.deletedProfiles, id];
    if (strands(settings.hiddenProfiles, deletedProfiles, settings.customProfiles)) return;
    const moveActive =
      settings.promptProfileId === id
        ? fallback(settings.hiddenProfiles, deletedProfiles, settings.customProfiles)
        : {};
    patch({ deletedProfiles, ...moveActive });
  };

  const restoreBuiltins = (): void => patch({ deletedProfiles: [] });

  const addCustom = (): void => {
    const id = `custom-${Date.now().toString(36)}`;
    patch({
      customProfiles: [...settings.customProfiles, { id, name: '', prompt: '' }],
      promptProfileId: 'custom',
      activeCustomId: id,
    });
  };

  const editCustom = (id: string, field: 'name' | 'prompt', value: string): void => {
    patch({
      customProfiles: settings.customProfiles.map((p) =>
        p.id === id ? { ...p, [field]: value } : p
      ),
    });
  };

  const setCustomHidden = (id: string, visible: boolean): void => {
    const customProfiles = settings.customProfiles.map((p) =>
      p.id === id ? { ...p, hidden: !visible } : p
    );
    if (!visible && strands(settings.hiddenProfiles, settings.deletedProfiles, customProfiles)) return;
    const moveActive =
      !visible && settings.promptProfileId === 'custom' && settings.activeCustomId === id
        ? fallback(settings.hiddenProfiles, settings.deletedProfiles, customProfiles)
        : {};
    patch({ customProfiles, ...moveActive });
  };

  const removeCustom = (id: string): void => {
    const customProfiles = settings.customProfiles.filter((p) => p.id !== id);
    if (strands(settings.hiddenProfiles, settings.deletedProfiles, customProfiles)) return;
    const wasActive = settings.promptProfileId === 'custom' && settings.activeCustomId === id;
    const moveActive = wasActive
      ? fallback(settings.hiddenProfiles, settings.deletedProfiles, customProfiles)
      : {};
    patch({ customProfiles, ...moveActive });
  };

  return (
    <div className="profmgr">
      <div className="profmgr__head">{t('beh.profVisible')}</div>
      <div className="profmgr__toggles">
        {DROPDOWN_PROFILES.filter((id) => !settings.deletedProfiles.includes(id)).map((id) => (
          <div key={id} className="profmgr__toggle">
            <span>{t(PROFILE_BEH_LABEL[id] ?? 'beh.profCustom')}</span>
            <div className="profmgr__togglectl">
              <Switch
                on={!settings.hiddenProfiles.includes(id)}
                onChange={(v) => setHidden(id, v)}
              />
              <button
                type="button"
                className="profmgr__del"
                title={t('beh.profRemove')}
                aria-label={t('beh.profRemove')}
                onClick={() => removeBuiltin(id)}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
      {settings.deletedProfiles.length > 0 && (
        <button type="button" className="profmgr__restore" onClick={restoreBuiltins}>
          {t('beh.profRestore')} ({settings.deletedProfiles.length})
        </button>
      )}

      <div className="profmgr__head">{t('beh.profCustomTitle')}</div>
      {settings.customProfiles.length === 0 && (
        <p className="profmgr__empty">{t('beh.profCustomEmpty')}</p>
      )}
      {settings.customProfiles.map((p) => (
        <div key={p.id} className="profmgr__custom">
          <div className="profmgr__customhead">
            <input
              type="text"
              value={p.name}
              placeholder={t('beh.profNamePlaceholder')}
              onChange={(e) => editCustom(p.id, 'name', e.target.value)}
            />
            <Switch on={!p.hidden} onChange={(v) => setCustomHidden(p.id, v)} />
            <button
              type="button"
              className="profmgr__del"
              title={t('beh.profDelete')}
              aria-label={t('beh.profDelete')}
              onClick={() => removeCustom(p.id)}
            >
              ✕
            </button>
          </div>
          <textarea
            value={p.prompt}
            placeholder={t('beh.customPlaceholder')}
            onChange={(e) => editCustom(p.id, 'prompt', e.target.value)}
          />
        </div>
      ))}
      <button type="button" className="profmgr__add" onClick={addCustom}>
        + {t('beh.profAdd')}
      </button>
    </div>
  );
}

/**
 * Link to another section. It exists because splitting the dashboard into
 * sections has a cost: two settings that explain each other stop being visible at
 * the same time. Where that happens —"what's listened to" and the auto-trigger—
 * the jump is put instead of repeating the text.
 */
function Jump({
  to,
  go,
  children,
}: {
  to: SectionId;
  go: (id: SectionId) => void;
  children: string;
}) {
  return (
    <button className="jump" onClick={() => go(to)}>
      {children}
      <Icon name="arrow" size={14} />
    </button>
  );
}

/**
 * API key field. The stored value is never read back — main only reports whether
 * it exists or not. That's why the input always starts empty and typing something
 * new overwrites the previous one.
 */
function SecretField({
  label,
  hint,
  present,
  /** What's asked for, if it's not an API key. The broker reuses the component. */
  placeholder = 'keys.placeholder',
  onSave,
  onClear,
  /**
   * Checks that the key really works, right here.
   *
   * It was down below, in the model card, and it tested **the active provider**:
   * to know whether the DeepSeek key worked you had to switch to DeepSeek, test
   * and switch back. The question you ask yourself when pasting a key is "does
   * this one work?", and it's answered where you paste it.
   */
  onTest,
}: {
  label: UIKey;
  hint: UIKey;
  present: boolean;
  placeholder?: UIKey;
  onSave: (value: string) => Promise<void>;
  onClear: () => Promise<void>;
  onTest?: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const t = useT();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [tested, setTested] = useState<{ ok: boolean; error?: string } | null>(null);

  const save = async (): Promise<void> => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await onSave(draft);
      setDraft('');
      // A new key invalidates the previous verdict: leaving it up would say
      // "connection OK" about the key that was just replaced.
      setTested(null);
    } finally {
      setBusy(false);
    }
  };

  const test = async (): Promise<void> => {
    if (!onTest) return;
    setBusy(true);
    setTested(null);
    try {
      setTested(await onTest());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="row__label">{t(label)}</span>
        <span className={present ? 'badge badge--ok' : 'badge badge--missing'}>
          {present ? t('keys.configured') : t('keys.missing')}
        </span>
      </div>
      <div className="row__desc">{t(hint)}</div>
      <div className="field">
        <input
          type="password"
          value={draft}
          placeholder={present ? t('keys.replace') : t(placeholder)}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
          }}
        />
        <button className="btn" disabled={busy || !draft.trim()} onClick={() => void save()}>
          {t('keys.save')}
        </button>
        {onTest && present && (
          <button className="btn" disabled={busy} onClick={() => void test()}>
            {busy ? t('keys.testing') : t('keys.test')}
          </button>
        )}
        {present && (
          <button className="btn btn--danger" disabled={busy} onClick={() => void onClear()}>
            {t('keys.clear')}
          </button>
        )}
      </div>
      {tested && (
        <div className="field">
          <span className={tested.ok ? 'badge badge--ok' : 'badge badge--missing'}>
            {tested.ok ? t('keys.ok') : (tested.error ?? t('keys.failed'))}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Capture panel. Besides being the on/off control, it's the instrument that lets
 * you check at a glance that the TWO streams arrive separately: if speaking only
 * moves "You" and playing a video only moves "Them", the pipeline is fine.
 */
function CaptureCard({ status, levels }: { status: CaptureStatus; levels: AudioLevels }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const listening = status.state === 'listening';

  const toggle = async (): Promise<void> => {
    setBusy(true);
    try {
      if (listening) await window.api.capture.stop();
      else await window.api.capture.start();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2 className="card__title">{t('aud.captureTitle')}</h2>
      <p className="card__hint">{t('aud.captureHint')}</p>

      <Row
        icon="power"
        label={listening ? t('aud.listening') : t('aud.paused')}
        desc={
          status.state === 'error'
            ? (status.error ?? t('overlay.unknownError'))
            : t('aud.devices', {
                mic: status.micActive ? t('aud.active') : t('aud.inactive'),
                system: status.loopbackActive ? t('aud.active') : t('aud.inactive'),
              })
        }
      >
        <button
          className="btn btn--primary"
          disabled={busy || status.state === 'starting'}
          onClick={() => void toggle()}
        >
          {status.state === 'starting'
            ? t('overlay.starting')
            : listening
              ? t('aud.stop')
              : t('aud.start')}
        </button>
      </Row>

      {/* The meters are the instrument, not decoration: if speaking only moves
          "You" and playing a video only moves "Them", the two streams really do
          arrive separately. */}
      <div className="meters">
        <div className="meter">
          <span className="meter__label">
            <Icon name="mic" size={14} />
            {t('aud.meterMe')}
          </span>
          <div className="meter__bar">
            <div className="meter__fill" style={{ width: `${Math.min(levels.me * 140, 100)}%` }} />
          </div>
        </div>
        <div className="meter">
          <span className="meter__label">
            <Icon name="speaker" size={14} />
            {t('aud.meterThem')}
          </span>
          <div className="meter__bar">
            <div
              className="meter__fill meter__fill--them"
              style={{ width: `${Math.min(levels.them * 140, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

// ──────────────────────── Sections and navigation ────────────────────────

/**
 * The dashboard was **a single column** with twelve cards, from the first steps
 * to the diagnostics log. It worked while there were four; with twelve, finding
 * a setting meant remembering how far down the scroll it was, and the warnings
 * that matter —no provider configured, Windows rejected a shortcut— fell off the
 * screen exactly when they were needed.
 *
 * Now each group is a section with its own navigation. Three consequences that go
 * together and shouldn't be separated:
 *
 * - **The pane's header is what titles**, so cards that are unique in their
 *   section no longer repeat title or explanation. The same thing twice on the
 *   same screen is noise, not reinforcement.
 * - **The warnings rise to the sidebar** as an amber dot. A problem visible only
 *   by entering the section where it lives is a problem no one sees: the warning
 *   has to arrive before the navigation.
 * - **The listen switch lives in the header**, visible from any section. It's the
 *   most-used control and it was buried in a card.
 */
type SectionId =
  | 'general'
  | 'audio'
  | 'phone'
  | 'mqtt'
  | 'models'
  | 'transcription'
  | 'behaviour'
  | 'context'
  | 'skills'
  | 'history'
  | 'hotkeys'
  | 'diagnostics'
  | 'about';

/**
 * The sections, with their texts as KEYS and not as text.
 *
 * The `hint` was `React.ReactNode` because one of them carried a `<strong>`
 * inside. Now they're all keys and the markup is resolved with `<Tx>`, which
 * interprets `**bold**`: that way the translation table can store them as
 * strings, which is the only thing it knows how to store.
 */
const SECTIONS: Record<SectionId, { icon: IconName; label: UIKey; hint: UIKey }> = {
  general: { icon: 'sliders', label: 'sec.general', hint: 'sec.generalHint' },
  audio: { icon: 'mic', label: 'sec.audio', hint: 'sec.audioHint' },
  phone: { icon: 'phone', label: 'sec.phone', hint: 'sec.phoneHint' },
  mqtt: { icon: 'broadcast', label: 'sec.mqtt', hint: 'sec.mqttHint' },
  models: { icon: 'cpu', label: 'sec.models', hint: 'sec.modelsHint' },
  transcription: {
    icon: 'waveform',
    label: 'sec.transcription',
    hint: 'sec.transcriptionHint',
  },
  behaviour: { icon: 'bolt', label: 'sec.behaviour', hint: 'sec.behaviourHint' },
  context: { icon: 'file', label: 'sec.context', hint: 'sec.contextHint' },
  skills: { icon: 'sparkles', label: 'sec.skills', hint: 'sec.skillsHint' },
  history: { icon: 'history', label: 'sec.history', hint: 'sec.historyHint' },
  hotkeys: { icon: 'keyboard', label: 'sec.hotkeys', hint: 'sec.hotkeysHint' },
  diagnostics: { icon: 'activity', label: 'sec.diagnostics', hint: 'sec.diagnosticsHint' },
  about: { icon: 'book', label: 'sec.about', hint: 'sec.aboutHint' },
};

const SECTION_ORDER: SectionId[] = [
  'general',
  'audio',
  'phone',
  'mqtt',
  'models',
  'transcription',
  'behaviour',
  'context',
  'skills',
  'history',
  'hotkeys',
  'diagnostics',
  'about',
];

/**
 * The section is remembered between openings. The dashboard is opened and closed
 * many times in a row while tuning something —change the model, test, go back—
 * and always returning to "General" forces repeating the same click.
 */
const SECTION_KEY = 'dashboard.section';

function storedSection(): SectionId {
  try {
    const saved = localStorage.getItem(SECTION_KEY);
    if (saved && saved in SECTIONS) return saved as SectionId;
  } catch {
    // Unavailable storage is no reason not to open the settings.
  }
  return 'general';
}

/**
 * Own title bar, macOS-style.
 *
 * The dashboard window is `frame: false` (see windows/dashboard.ts), so the
 * system buttons are painted by the app: the three traffic lights, on the left.
 * The rest of the bar is a drag zone —here `-webkit-app-region: drag` DOES work,
 * because the dashboard is a normal focusable window, unlike the overlay—. The
 * glyphs (×, −, +) only appear on hovering the group, as in macOS. Close closes
 * ONLY this window; the app lives in the overlay.
 */
function TitleBar() {
  const { window: win } = window.api;
  return (
    <div className="titlebar">
      <div className="lights">
        <button
          type="button"
          className="light light--close"
          aria-label="Close"
          onClick={() => win.closeDashboard()}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3.4 3.4l5.2 5.2M8.6 3.4l-5.2 5.2" />
          </svg>
        </button>
        <button
          type="button"
          className="light light--min"
          aria-label="Minimize"
          onClick={() => win.minimizeDashboard()}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3 6h6" />
          </svg>
        </button>
        <button
          type="button"
          className="light light--zoom"
          aria-label="Maximize"
          onClick={() => win.toggleMaximizeDashboard()}
        >
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M6 3v6M3 6h6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function DashboardApp() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [presence, setPresence] = useState<SecretsPresence>({
    anthropic: false,
    google: false,
    openai: false,
    deepseek: false,
    mqtt: false,
  });
  const [status, setStatus] = useState<CaptureStatus>({
    state: 'idle',
    micActive: false,
    loopbackActive: false,
  });
  const [levels, setLevels] = useState<AudioLevels>({ me: 0, them: 0 });
  const [section, setSection] = useState<SectionId>(storedSection);
  /**
   * It rises here from `HotkeysCard` because painting it inside is no longer
   * enough: the sidebar marks the section that has a problem, and for that the
   * warning has to exist even if that section isn't mounted.
   */
  const [failedHotkeys, setFailedHotkeys] = useState<string[]>([]);
  /** Reopened by hand from the sidebar footer. */
  const [wizard, setWizard] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const { api } = window;
    void api.settings.get().then(setSettings);
    void api.secrets.getPresence().then(setPresence);
    void api.capture.getStatus().then(setStatus);
    void api.hotkeys.getFailed().then(setFailedHotkeys);

    const unsubs = [
      api.settings.onChange(setSettings),
      api.capture.onStatus(setStatus),
      api.capture.onLevels(setLevels),
      api.hotkeys.onFailures(setFailedHotkeys),
    ];
    return () => unsubs.forEach((off) => off());
  }, []);

  const go = useCallback((next: SectionId): void => {
    setSection(next);
    try {
      localStorage.setItem(SECTION_KEY, next);
    } catch {
      // Remembering the section is a convenience, not a requirement.
    }
  }, []);

  // Switching sections has to start at the top: inheriting the previous one's
  // scroll leaves the new one starting halfway down for no visible reason.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [section]);

  const patch = useCallback(async (p: Partial<Settings>): Promise<void> => {
    setSettings(await window.api.settings.update(p));
  }, []);

  const saveSecret = useCallback(async (key: SecretKey, value: string): Promise<void> => {
    setPresence(await window.api.secrets.set(key, value));
  }, []);

  const clearSecret = useCallback(async (key: SecretKey): Promise<void> => {
    setPresence(await window.api.secrets.clear(key));
  }, []);

  if (!settings)
    return (
      <div className="shell">
        <TitleBar />
        <div className="loading">…</div>
      </div>
    );

  /*
   * The wizard replaces the whole dashboard while it's open, and it's not just
   * another section: whoever needs it doesn't yet know what the sections mean. It
   * opens on its own the first time and can be called again from the sidebar
   * footer.
   */
  if (!settings.onboardingDone || wizard) {
    return (
      <div className="shell">
        {/* Same "detectable" frame as the rest of the dashboard: the wizard is
            also protected from capture at the window level, but without the frame
            it seemed to fall outside the stealth switch. */}
        {!settings.stealthEnabled && <div className="detectable-frame" aria-hidden="true" />}
        <TitleBar />
        <SetupWizard
          settings={settings}
          presence={presence}
          patch={patch}
          saveSecret={saveSecret}
          onClose={() => {
            setWizard(false);
            // Leaving the wizard counts as "don't show it to me anymore": if not,
            // closing it would reopen it on the next render.
            if (!settings.onboardingDone) void patch({ onboardingDone: true });
          }}
        />
      </div>
    );
  }

  const meta = SECTIONS[section];

  /*
   * This component provides the language, so it can't read it with `useT()`. It
   * translates by hand against the settings, which is where it came from anyway.
   */
  const t = (key: UIKey, vars?: Record<string, string | number>): string =>
    translate(settings.uiLanguage, key, vars);

  /*
   * Which sections ask for attention. They're exactly the warnings that already
   * existed inside each card: the only new thing is that they're now visible
   * without entering. A warning you have to go looking for warns of nothing — the
   * case that motivated it is the inert auto-trigger, which gives no symptom but
   * silence.
   */
  const alerts: Partial<Record<SectionId, boolean>> = {
    general: !settings.stealthEnabled,
    audio: status.state === 'error',
    models: !providerIsReady(settings, presence),
    behaviour: autoTriggerIsInert(settings),
    hotkeys: failedHotkeys.length > 0 || duplicateAccelerators(activeHotkeys(settings)).size > 0,
  };

  return (
    <div className="shell">
      {/* Dashed red frame when stealth is off: the dashboard —with the API keys,
          the CV and the history— also shows in the capture right now, so it warns
          on the window's edge itself. */}
      {!settings.stealthEnabled && <div className="detectable-frame" aria-hidden="true" />}
      <TitleBar />
      <LangProvider lang={settings.uiLanguage}>
        <div className="app">
          <aside className="nav">
            <div className="nav__brand">
              <Mascot className="nav__mascot" autoBlink />
              <div className="nav__brandtext">
                <div className="nav__eyebrow">{t('nav.eyebrow')}</div>
                <div className="nav__app">Tayori</div>
              </div>
            </div>

            <nav className="nav__list">
              {SECTION_ORDER.map((id) => (
                <button
                  key={id}
                  className="navitem"
                  aria-current={id === section}
                  onClick={() => go(id)}
                >
                  <Icon name={SECTIONS[id].icon} />
                  <span className="navitem__label">{t(SECTIONS[id].label)}</span>
                  {alerts[id] && <span className="navitem__dot" title={t('nav.attention')} />}
                </button>
              ))}
            </nav>

            <div className="nav__foot">
              {/* Closing the app from here too: the overlay has its own Quit, but
              when you're in the dashboard reaching for it means finding the
              overlay first. It's the same `window.api.window.quit`. */}
              <button
                className="navitem navitem--ghost navitem--danger"
                onClick={() => void window.api.window.quit()}
              >
                <Icon name="power" />
                <span className="navitem__label">{t('nav.quit')}</span>
              </button>
              {/* The wizard can be called again: having finished it once shouldn't
              leave you without it. It lives in the footer and not at the end of a
              section because it belongs to none — it crosses them all. */}
              <button className="navitem navitem--ghost" onClick={() => setWizard(true)}>
                <Icon name="compass" />
                <span className="navitem__label">{t('nav.wizard')}</span>
              </button>
              <p className="nav__note">{t('nav.footer')}</p>
            </div>
          </aside>

          <main className="pane">
            <header className="pane__head">
              <div className="pane__heading">
                <h1 className="pane__title">{t(meta.label)}</h1>
                <p className="pane__sub">{renderMarkup(t(meta.hint))}</p>
              </div>
              {/* The app's most-used control, reachable from any section: before
              you had to get all the way to the capture card to press it. */}
              <ListenButton status={status} />
            </header>

            <div className="pane__body" ref={bodyRef}>
              <div className="pane__inner">
                {section === 'general' && <VisibilityCards settings={settings} patch={patch} />}

                {section === 'audio' && (
                  <>
                    <CaptureCard status={status} levels={levels} />
                    <AudioSourcesCard settings={settings} patch={patch} go={go} />
                  </>
                )}

                {section === 'phone' && <PhoneMirrorCard settings={settings} patch={patch} />}

                {section === 'mqtt' && (
                  <MqttCard
                    settings={settings}
                    presence={presence}
                    patch={patch}
                    saveSecret={saveSecret}
                    clearSecret={clearSecret}
                  />
                )}

                {section === 'models' && (
                  <>
                    <ApiKeysCard
                      presence={presence}
                      saveSecret={saveSecret}
                      clearSecret={clearSecret}
                    />
                    <ModelPresetsCard settings={settings} patch={patch} />
                    <ModelCard settings={settings} patch={patch} />
                    {/* Right behind the answers model: it reads as "and for the
                    screen, this other one", which is the decision to make. */}
                    <ScreenModelCard settings={settings} patch={patch} />
                    <LocalModelGuide />
                  </>
                )}

                {section === 'transcription' && (
                  <TranscriptionCard settings={settings} patch={patch} go={go} />
                )}
                {section === 'behaviour' && (
                  <BehaviourCard settings={settings} patch={patch} go={go} />
                )}
                {section === 'context' && <ContextCard settings={settings} patch={patch} />}
                {section === 'skills' && <SkillsCard settings={settings} patch={patch} />}
                {section === 'history' && <HistoryCard settings={settings} patch={patch} />}
                {section === 'hotkeys' && (
                  <HotkeysCard settings={settings} patch={patch} failed={failedHotkeys} />
                )}
                {section === 'diagnostics' && <DiagnosticsCard />}
                {section === 'about' && <AboutCard />}
              </div>
            </div>
          </main>
        </div>
      </LangProvider>
    </div>
  );
}

/*
 * The "can this provider answer?" rule lives in `shared/types.ts`.
 *
 * It was written here and again in the overlay, with different `if` chains, and
 * they were two places you had to remember to touch with every new provider
 * without anything warning if you forgot one.
 */

/**
 * The listening state, and the control to change it.
 *
 * It's a button and not an indicator because they're the same question: whoever
 * checks whether it's listening is because they want it to listen. The overlay
 * made this decision earlier —"the indicator **is** the control"— and separating
 * the two things here would leave two different grammars for the same control.
 */
function ListenButton({ status }: { status: CaptureStatus }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const listening = status.state === 'listening';

  const toggle = async (): Promise<void> => {
    setBusy(true);
    try {
      if (listening) await window.api.capture.stop();
      else await window.api.capture.start();
    } finally {
      setBusy(false);
    }
  };

  const label =
    status.state === 'starting'
      ? t('overlay.starting')
      : status.state === 'error'
        ? t('overlay.captureError')
        : listening
          ? t('aud.listening')
          : t('aud.paused');

  return (
    <button
      className="listen"
      data-state={status.state}
      disabled={busy || status.state === 'starting'}
      title={listening ? t('aud.stopTitle') : t('aud.startTitle')}
      onClick={() => void toggle()}
    >
      <span className="listen__dot" />
      {label}
    </button>
  );
}

// ────────────────────────── General · visibility ──────────────────────────

/**
 * The two switches that decide whether the app gives you away go highlighted and
 * first: they're among the few settings changed **during** a call, and the rest
 * of the section are preferences touched once.
 */
function VisibilityCards({ settings, patch }: { settings: Settings; patch: PatchFn }) {
  const t = useT();
  return (
    <>
      {/*
        The language goes first of all, and not in "About" or at the end: whoever
        opens the settings because the app is in a language that isn't theirs has
        to find it without reading anything else.
      */}
      <section className="card">
        <Row icon="globe" label={t('dash.language')} desc={t('dash.languageDesc')}>
          <select
            value={settings.uiLanguage}
            onChange={(e) => void patch({ uiLanguage: e.target.value as UILang })}
          >
            {UI_LANGS.map((lang) => (
              <option key={lang} value={lang}>
                {UI_LANG_LABEL[lang]}
              </option>
            ))}
          </select>
        </Row>
      </section>

      <div className="hero">
        <span className="hero__icon">
          <Icon name="eyeOff" size={19} />
        </span>
        <div className="hero__text">
          <div className="hero__title">{t('gen.stealth')}</div>
          <div className="hero__desc">{t('gen.stealthDesc')}</div>
        </div>
        <Switch
          on={settings.stealthEnabled}
          onChange={(v) => {
            void window.api.window.setStealth(v);
          }}
        />
      </div>

      <div className="hero">
        <span className="hero__icon">
          <Icon name="pointer" size={19} />
        </span>
        <div className="hero__text">
          <div className="hero__title">{t('gen.clickThrough')}</div>
          <div className="hero__desc">{t('gen.clickThroughDesc')}</div>
        </div>
        <Switch
          on={settings.clickThrough}
          onChange={(v) => {
            void window.api.window.setClickThrough(v);
          }}
        />
      </div>

      {!settings.stealthEnabled && (
        <div className="warn">
          <Tx k="gen.stealthWarn" />
        </div>
      )}

      <div className="hero">
        <span className="hero__icon">
          <Icon name="monitor" size={19} />
        </span>
        <div className="hero__text">
          <div className="hero__title">{t('gen.decoy')}</div>
          <div className="hero__desc">{t('gen.decoyDesc')}</div>
        </div>
        <select
          value={settings.decoyIcon}
          onChange={(e) => void patch({ decoyIcon: e.target.value as Settings['decoyIcon'] })}
        >
          <option value="off">{t('gen.decoyOff')}</option>
          <option value="terminal">Windows Terminal</option>
          <option value="settings">Settings</option>
          <option value="taskmanager">Task Manager</option>
        </select>
      </div>

      <section className="card">
        <h2 className="card__title">{t('gen.lookTitle')}</h2>
        <p className="card__hint">{t('gen.lookHint')}</p>

        {/*
          The opacity and font size existed in `Settings` and could only be
          touched by editing the JSON: the overlay applied them but no one had a
          way to change them.
        */}
        <Row icon="contrast" label={t('gen.opacity')} desc={t('gen.opacityDesc')}>
          <div className="slider">
            <input
              type="range"
              min={0.3}
              max={1}
              step={0.05}
              value={settings.overlayOpacity}
              onChange={(e) => void patch({ overlayOpacity: Number(e.target.value) })}
            />
            <span className="slider__value">{Math.round(settings.overlayOpacity * 100)} %</span>
          </div>
        </Row>

        <Row icon="type" label={t('gen.textSize')} desc={t('gen.textSizeDesc')}>
          <div className="slider">
            <input
              type="range"
              min={FONT_SCALE.min}
              max={FONT_SCALE.max}
              step={FONT_SCALE.step}
              value={settings.overlayFontScale}
              onChange={(e) =>
                void patch({ overlayFontScale: clampFontScale(Number(e.target.value)) })
              }
            />
            <span className="slider__value">{Math.round(settings.overlayFontScale * 100)} %</span>
          </div>
        </Row>

        <Row icon="collapse" label={t('gen.compact')} desc={t('gen.compactDesc')}>
          <Switch
            on={settings.overlayCompact}
            onChange={(v) => void patch({ overlayCompact: v })}
          />
        </Row>

        {/* It goes here and not in "Behavior" because it doesn't change what the
            app answers, it changes how it's read: it's overlay appearance, like
            the two above. */}
        <Row icon="type" label={t('gen.teleprompter')} desc={t('gen.teleprompterDesc')}>
          <Switch
            on={settings.teleprompterEnabled}
            onChange={(v) => void patch({ teleprompterEnabled: v })}
          />
        </Row>

        {settings.teleprompterEnabled && (
          <div className="warn">
            {/* The combinations are read from the settings, not written in the
                key: they're configurable, and a sentence saying Ctrl+Shift+Down
                when the user changed it to something else sends you to press the
                wrong key. */}
            <Tx
              k="gen.teleprompterHint"
              vars={{
                next: formatAccelerator(settings.hotkeys.teleprompterNext, t('hk.unassigned')),
                prev: formatAccelerator(settings.hotkeys.teleprompterPrev, t('hk.unassigned')),
              }}
            />
          </div>
        )}
      </section>

      <div className="warn">
        <Tx k="gen.protects" />
      </div>
    </>
  );
}

// ──────────────────────────── Audio · sources ────────────────────────────

/**
 * What's listened to lived inside "Transcription", which is where it's
 * implemented and not where it's looked for: the question it answers is about
 * microphones, not engines. Its costliest warning —the combination that leaves
 * the auto-trigger inert— is explained in Behavior, so here the jump goes instead
 * of the repeated text.
 */
function AudioSourcesCard({
  settings,
  patch,
  go,
}: {
  settings: Settings;
  patch: PatchFn;
  go: (id: SectionId) => void;
}) {
  const t = useT();
  return (
    <section className="card">
      <h2 className="card__title">{t('aud.sourcesTitle')}</h2>
      <p className="card__hint">{t('aud.sourcesHint')}</p>

      <Row
        icon="speaker"
        label={t('aud.sources')}
        desc={t(AUDIO_SOURCE_HINT[settings.audioSources])}
      >
        <select
          value={settings.audioSources}
          onChange={(e) => void patch({ audioSources: e.target.value as Settings['audioSources'] })}
        >
          <option value="both">{t('aud.both')}</option>
          <option value="system">{t('aud.systemOnly')}</option>
          <option value="mic">{t('aud.micOnly')}</option>
        </select>
      </Row>

      {autoTriggerIsInert(settings) && (
        <div className="warn">
          <Tx k="aud.inertWarn" vars={{ wanted: t(SPEAKER_LABEL[settings.autoTriggerSpeaker]) }} />
          <div className="field">
            <Jump to="behaviour" go={go}>
              {t('aud.seeTrigger')}
            </Jump>
          </div>
        </div>
      )}
    </section>
  );
}

// ───────────────────────── Phone mirror ─────────────────────────

/**
 * The QR, drawn as SVG from the matrix main sends.
 *
 * It's not an image or a `data:` URI: they're rectangles, so it comes out sharp
 * at any size, there's no need to widen the CSP and the "quiet zone" —the
 * mandatory four-module white margin, without which many readers don't latch
 * on— is arithmetic in the `viewBox` instead of a border trusted to the CSS.
 */
function QrCode({ modules }: { modules: boolean[][] }) {
  const t = useT();
  const size = modules.length;
  if (size === 0) return null;
  const quiet = 4;
  const side = size + quiet * 2;

  return (
    <svg
      className="qr"
      viewBox={`0 0 ${side} ${side}`}
      role="img"
      aria-label={t('ph.qrAlt')}
      shapeRendering="crispEdges"
    >
      <rect x="0" y="0" width={side} height={side} fill="#fff" />
      {modules.map((row, y) =>
        row.map((dark, x) =>
          dark ? (
            <rect key={`${x}-${y}`} x={x + quiet} y={y + quiet} width="1" height="1" fill="#000" />
          ) : null
        )
      )}
    </svg>
  );
}

/**
 * The phone mirror.
 *
 * The card has to answer three questions, in this order: is it on?, what do I
 * open on the phone?, and —the one that really matters— am I seeing it already?
 * The last is answered with the connected-phones counter: without it, the only
 * way to know if it works is to get up and look.
 */
function PhoneMirrorCard({ settings, patch }: { settings: Settings; patch: PatchFn }) {
  const t = useT();
  const [status, setStatus] = useState<PhoneMirrorStatus | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void window.api.phone.getStatus().then(setStatus);
    return window.api.phone.onStatus(setStatus);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const on = settings.phoneMirrorEnabled;
  const running = status?.running ?? false;

  return (
    <>
      <div className="hero">
        <span className="hero__icon">
          <Icon name="phone" size={19} />
        </span>
        <div className="hero__text">
          <div className="hero__title">{t('ph.turnOn')}</div>
          <div className="hero__desc">
            {running
              ? settings.phoneMirrorLan
                ? t('ph.onLan')
                : t('ph.onLocal')
              : t('ph.offDesc')}
          </div>
        </div>
        <Switch on={on} onChange={(v) => void patch({ phoneMirrorEnabled: v })} />
      </div>

      <div className="hero">
        <span className="hero__icon">
          <Icon name="wifi" size={19} />
        </span>
        <div className="hero__text">
          <div className="hero__title">{t('ph.allowLan')}</div>
          <div className="hero__desc">
            {settings.phoneMirrorLan ? t('ph.lanOn') : t('ph.lanOff')}
          </div>
        </div>
        <Switch on={settings.phoneMirrorLan} onChange={(v) => void patch({ phoneMirrorLan: v })} />
      </div>

      {/* The warning goes where the decision is made, not in the footer: turning
          on the LAN is the moment the scope changes. */}
      {on && settings.phoneMirrorLan && (
        <div className="warn">
          <Tx k="ph.lanWarn" />
        </div>
      )}

      {!on && (
        <section className="card">
          <p className="card__hint" style={{ marginBottom: 0 }}>
            {t('ph.offHint')}
          </p>
        </section>
      )}

      {on && status?.error && (
        <div className="warn">
          {t('ph.serverFailed')} {status.error}
        </div>
      )}

      {/* The check is on `status` and not on the `running` above so TypeScript
          knows there's state in here. */}
      {on && status?.running && (
        <section className="card">
          <h2 className="card__title">{t('ph.scan')}</h2>
          <p className="card__hint">{t('ph.scanHint')}</p>

          <div className="pair">
            <QrCode modules={status.qr} />
            <div className="pair__side">
              <code className="pair__url">{status.url}</code>
              <div className="field">
                <button
                  className="btn"
                  onClick={() => {
                    void window.api.clipboard.write(status.url).then(() => setCopied(true));
                  }}
                >
                  {copied ? t('ph.copied') : t('ph.copyLink')}
                </button>
              </div>
              {/*
                The confirmation that can't be deduced from anything else. A
                pretty QR and a phone that doesn't connect look exactly the same
                from here until this number moves.
              */}
              <div className={status.clients > 0 ? 'pair__live' : 'pair__idle'}>
                {status.clients === 0
                  ? t('ph.noClients')
                  : t('ph.clients', { count: status.clients })}
              </div>
            </div>
          </div>

          {!settings.phoneMirrorLan && (
            <div className="warn">
              <Tx k="ph.loopbackWarn" />
            </div>
          )}

          {/*
            With VPN, Docker or VirtualBox the machine has several IPv4s and the
            heuristic may pick the one that leads nowhere. The symptom is horrible
            —the phone's browser hangs loading without saying anything— so the
            others are shown instead of hidden.
          */}
          {status.alternates.length > 0 && (
            <>
              <div className="ctxbar" style={{ marginTop: 18 }}>
                <span className="ctxbar__label">{t('ph.altsTitle')}</span>
              </div>
              <p className="card__hint" style={{ marginBottom: 6 }}>
                {t('ph.altsHint')}
              </p>
              <ul className="pair__alts">
                {status.alternates.map((url) => (
                  <li key={url}>
                    <code>{url}</code>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <section className="card">
        <h2 className="card__title">{t('ph.sentTitle')}</h2>
        <p className="card__hint" style={{ marginBottom: 0 }}>
          <Tx k="ph.sentHint" />
        </p>
      </section>
    </>
  );
}

// ──────────────────────────────── MQTT ────────────────────────────────

/**
 * Publishing the answers to a broker.
 *
 * The card answers three questions in this order: is it connected?, what topic do
 * I subscribe to?, and —the one that really matters— has anything reached my
 * gadget? The last is answered with the published counter and a test button: a
 * broken setup and a good one look identical from here until the first message
 * arrives, and finding out with the first real answer is finding out at the worst
 * moment.
 */
function MqttCard({
  settings,
  presence,
  patch,
  saveSecret,
  clearSecret,
}: {
  settings: Settings;
  presence: SecretsPresence;
  patch: PatchFn;
  saveSecret: (key: SecretKey, value: string) => Promise<void>;
  clearSecret: (key: SecretKey) => Promise<void>;
}) {
  const t = useT();
  const [status, setStatus] = useState<MqttStatus | null>(null);
  const [tested, setTested] = useState<{ ok: boolean; error?: string } | null>(null);

  useEffect(() => {
    void window.api.mqtt.getStatus().then(setStatus);
    return window.api.mqtt.onStatus(setStatus);
  }, []);

  const topics = mqttTopics(settings.mqttTopic);
  const on = settings.mqttEnabled;

  return (
    <>
      <div className="hero">
        <span className="hero__icon">
          <Icon name="broadcast" size={19} />
        </span>
        <div className="hero__text">
          <div className="hero__title">{t('mq.publish')}</div>
          <div className="hero__desc">{t('mq.publishDesc')}</div>
        </div>
        <Switch on={on} onChange={(v) => void patch({ mqttEnabled: v })} />
      </div>

      {on && <MqttStatusLine status={status} />}

      <section className="card">
        <h2 className="card__title">{t('mq.brokerTitle')}</h2>
        <p className="card__hint">
          <Tx k="mq.brokerHint" /> {t('mq.brokerHint2')}
        </p>

        <Row icon="cloud" label={t('mq.address')} desc={t('mq.addressDesc')}>
          <input
            type="text"
            className="modelpick__id"
            style={{ width: 260 }}
            value={settings.mqttUrl}
            placeholder="mqtt://192.168.1.100:1883"
            onChange={(e) => void patch({ mqttUrl: e.target.value })}
          />
        </Row>

        <Row icon="file" label={t('mq.topic')} desc={t('mq.topicDesc')}>
          <input
            type="text"
            className="modelpick__id"
            style={{ width: 260 }}
            value={settings.mqttTopic}
            placeholder="tayori/answer"
            onChange={(e) => void patch({ mqttTopic: e.target.value })}
          />
        </Row>

        <Row icon="key" label={t('mq.user')} desc={t('mq.userDesc')}>
          <input
            type="text"
            style={{ width: 180, flex: 'none' }}
            value={settings.mqttUsername}
            onChange={(e) => void patch({ mqttUsername: e.target.value })}
          />
        </Row>

        <SecretField
          label="mqtt.password"
          hint="mqtt.passwordHint"
          placeholder="mqtt.passwordPlaceholder"
          present={presence.mqtt}
          onSave={(v) => saveSecret('mqtt', v)}
          onClear={() => clearSecret('mqtt')}
        />
      </section>

      {on && (
        <section className="card">
          <h2 className="card__title">{t('mq.subscribeTitle')}</h2>
          <p className="card__hint">{t('mq.twoTopics')}</p>

          <ul className="pair__alts">
            <li>
              <code>{topics.json}</code> — {t('mq.jsonTopic')}
            </li>
            <li>
              <code>{topics.text}</code> — {t('mq.textTopic')}
            </li>
          </ul>

          <p className="card__hint" style={{ marginTop: 14 }}>
            <Tx k="mq.qos" />
          </p>

          <div className="field">
            <button
              className="btn"
              disabled={status?.state !== 'connected'}
              onClick={() => {
                void window.api.mqtt.test().then(setTested);
              }}
            >
              {t('mq.testPublish')}
            </button>
            {tested && (
              <span className={tested.ok ? 'badge badge--ok' : 'badge badge--missing'}>
                {tested.ok ? t('mq.published') : (tested.error ?? t('keys.failed'))}
              </span>
            )}
          </div>
        </section>
      )}

      <section className="card">
        <h2 className="card__title">{t('mq.esp32Title')}</h2>
        <p className="card__hint">
          <ExtLink href={TAYORI_ESP32_URL}>TayoriESP32</ExtLink> {t('mq.esp32Post')}
        </p>
        <div className="field">
          <button className="btn" onClick={() => void window.api.system.openExternal(TAYORI_ESP32_URL)}>
            {t('mq.esp32Open')}
          </button>
        </div>
      </section>

      <div className="warn">
        <Tx k="mq.outWarn" /> {t('mq.yourDevice')}
      </div>
    </>
  );
}

/** Connection state, with the counter that's the only real confirmation. */
function MqttStatusLine({ status }: { status: MqttStatus | null }) {
  // The hook goes BEFORE the `return null`: React requires the number of hooks
  // not to change between renders, and returning before calling it breaks that rule.
  const t = useT();
  if (!status) return null;

  const label =
    status.state === 'connected'
      ? t('mq.connected')
      : status.state === 'connecting'
        ? t('mq.connecting')
        : status.state === 'error'
          ? t('mq.noConnection')
          : t('mq.off');

  return (
    <>
      <div className="hero">
        <span className="hero__icon">
          <span className={`listen__dot mqttdot mqttdot--${status.state}`} />
        </span>
        <div className="hero__text">
          <div className="hero__title">{label}</div>
          <div className="hero__desc">
            {status.published > 0
              ? t('mq.publishedCount', { count: status.published })
              : t('mq.nothingPublished')}
          </div>
        </div>
      </div>
      {status.error && <div className="warn">{status.error}</div>}
    </>
  );
}

// ─────────────────────────────────── Skills ───────────────────────────────────

/**
 * The skills on disk, and which one is set.
 *
 * The **broken** ones are also listed, with their reason. It's the difference
 * between "you haven't created any" and "yours has a bug": hiding the second
 * leaves someone looking at a folder that does exist with no hint why the app
 * doesn't see it, and that's exactly the silent failure this project chases.
 *
 * There's no editor. A SKILL.md is written with each person's own editor,
 * versioned and shared; putting a textarea here would be reinventing worse
 * something that already works, and it would also turn the folder into a format
 * of this app instead of the format it already is.
 */
function SkillsCard({ settings, patch }: { settings: Settings; patch: PatchFn }) {
  const t = useT();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [folder, setFolder] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.api.skills.list().then(setSkills);
    void window.api.skills.folder().then(setFolder);
  }, []);

  const refresh = async (): Promise<void> => {
    setBusy(true);
    try {
      setSkills(await window.api.skills.reload());
    } finally {
      setBusy(false);
    }
  };

  const active = skills.find((skill) => skill.id === settings.activeSkillId && !skill.error);

  return (
    <>
      <section className="card">
        <div className="skillhead">
          <div>
            <h2 className="card__title">{t('sk.folderTitle')}</h2>
            <p className="card__hint">
              <Tx k="sk.folderHint" />
            </p>
          </div>
          <button className="btn" disabled={busy} onClick={() => void refresh()}>
            <Icon name="refresh" size={15} />
            {busy ? t('sk.reloading') : t('sk.reload')}
          </button>
        </div>

        <div className="skillfolder">
          <span className="skillfolder__icon">
            <Icon name="folder" size={18} />
          </span>
          <div className="skillfolder__text">
            <div className="skillfolder__title">{t('sk.addHere')}</div>
            <code className="skillfolder__path">{folder || '…'}</code>
          </div>
          <button className="btn" onClick={() => void window.api.skills.openFolder()}>
            {t('sk.openFolder')}
          </button>
        </div>

        <div className="warn">
          <Tx k="sk.promptWarn" />
        </div>
      </section>

      <section className="card">
        <h2 className="card__title">{t('sk.activeTitle')}</h2>
        <p className="card__hint">
          <Tx k="sk.activeHint" />
        </p>

        <Row
          icon="sparkles"
          label={t('sk.instruction')}
          desc={active ? t('sk.activeDesc') : t('sk.noneDesc')}
        >
          <select
            value={active ? active.id : ''}
            onChange={(e) => void patch({ activeSkillId: e.target.value })}
          >
            <option value="">{t('sk.none')}</option>
            {skills
              .filter((skill) => !skill.error)
              .map((skill) => (
                <option key={skill.id} value={skill.id}>
                  {skillName(t, skill)}
                </option>
              ))}
          </select>
        </Row>

        {skills.length === 0 && (
          <p className="card__hint">
            <Tx k="sk.empty" />
          </p>
        )}

        <ul className="skills">
          {skills.map((skill) => (
            <li
              key={skill.id}
              className={`skill${skill.id === settings.activeSkillId && !skill.error ? ' skill--on' : ''}`}
            >
              <span className="skill__icon">
                <Icon name="sparkles" size={16} />
              </span>
              <div className="skill__body">
                <div className="skill__head">
                  <span className="skill__name">{skillName(t, skill)}</span>
                  {/* The id goes next to the name because it's what you type
                      after the slash, and it doesn't have to resemble the title. */}
                  <code className="skill__id">{skill.id}</code>
                  {skill.builtIn && <span className="skill__tag">{t('sk.builtIn')}</span>}
                </div>
                {skill.error ? (
                  <p className="skill__error">
                    {t(skill.error)}
                    {skill.errorDetail ? ` ${skill.errorDetail}` : ''}
                  </p>
                ) : (
                  <p className="skill__desc">
                    {skillDescription(t, skill) || t('sk.noDescription')}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

// ─────────────────────────────── About ───────────────────────────────

/**
 * What this is, what version and what it does with your data.
 *
 * The version matters more than it seems: half an hour went into investigating a
 * bug that was already fixed, because no one knew which build was running on the
 * machine where it was seen. A visible number would have said it in two seconds,
 * and that's why it's here and not hidden in the log.
 *
 * The privacy summary is repeated —it's also in the README and in each section
 * that opens an outlet— and the repetition is deliberate: it's what someone needs
 * to know before leaving this listening to an interview, and you can't depend on
 * them having read the README.
 */
function AboutCard() {
  const t = useT();
  const [info, setInfo] = useState<{ version: string; author: string } | null>(null);
  const [update, setUpdate] = useState<UpdateInfo | { error: string } | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    void window.api.app.getInfo().then(setInfo);
  }, []);

  const checkUpdate = async (): Promise<void> => {
    setChecking(true);
    setUpdate(null);
    try {
      setUpdate(await window.api.app.checkUpdate());
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      <section className="card">
        <div className="about__head">
          <Mascot className="about__mascot" autoBlink />
          <h2 className="card__title" style={{ margin: 0 }}>
            Tayori
          </h2>
        </div>
        <p className="card__hint">
          <Tx k="about.what" />
        </p>

        <Row icon="check" label={t('about.version')}>
          <code className="aboutval">{info?.version ?? '…'}</code>
        </Row>
        <Row icon="check" label={t('about.author')}>
          <code className="aboutval">{info?.author ?? '@cflarios'}</code>
        </Row>
        <Row icon="check" label={t('about.license')} desc={t('about.licenseDesc')}>
          <code className="aboutval">MIT</code>
        </Row>
        <Row icon="globe" label={t('about.web')} desc={t('about.webDesc')}>
          <ExtLink href={TAYORI_WEB_URL}>tayori-web.cflarios.workers.dev</ExtLink>
        </Row>
      </section>

      <section className="card">
        <h2 className="card__title">{t('about.updateTitle')}</h2>
        <p className="card__hint">{t('about.updateHint')}</p>

        <div className="field">
          <button className="btn" disabled={checking} onClick={() => void checkUpdate()}>
            {checking ? t('about.checking') : t('about.checkUpdate')}
          </button>
        </div>

        {update && 'error' in update && <div className="warn">{update.error}</div>}

        {update && !('error' in update) && !update.isNewer && (
          <div className="diag diag--ok">
            <Tx k="about.upToDate" vars={{ version: update.current }} />
          </div>
        )}

        {update && !('error' in update) && update.isNewer && (
          <div className="diag diag--ok">
            <p>
              <Tx k="about.updateAvailable" vars={{ latest: update.latest, current: update.current }} />
            </p>
            {update.notes && <pre className="update__notes">{update.notes}</pre>}
            <div className="field">
              {update.downloadUrl && (
                <button
                  className="btn"
                  onClick={() => void window.api.system.openExternal(update.downloadUrl)}
                >
                  {t('about.download')}
                </button>
              )}
              <button
                className="btn btn--ghost"
                onClick={() => void window.api.system.openExternal(update.releaseUrl)}
              >
                {t('about.viewRelease')}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="card__title">{t('about.dataTitle')}</h2>
        <p className="card__hint">{t('about.dataHint')}</p>

        <div className="about">
          <p>
            <Tx k="about.audio" />
          </p>
          <p>
            <Tx k="about.text" />
          </p>
          <p>
            <Tx k="about.noServer" />
          </p>
          <p>
            <Tx k="about.offline" />
          </p>
        </div>

        <div className="warn">{t('about.legal')}</div>
      </section>
    </>
  );
}

// ──────────────────────────── Models · keys ────────────────────────────

/**
 * Ollama, in the keys card even though it has none.
 *
 * It was a decision with doubts and this is the reason for resolving it this way:
 * the card isn't about keys, it's about **"is this ready to answer?"**. Ollama
 * enters that question like the others; the only thing that changes is that its
 * answer doesn't depend on a credential but on the server being alive. Leaving it
 * out would force looking for that check elsewhere just because it's local.
 *
 * That's why it has no text field: there's nothing to paste. It has the badge
 * saying it doesn't need one, and the same button as the others.
 */
function OllamaCheck() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [tested, setTested] = useState<{ ok: boolean; error?: string } | null>(null);

  const test = async (): Promise<void> => {
    setBusy(true);
    setTested(null);
    try {
      setTested(await window.api.llm.testConnection('ollama'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="row__label">{t('keys.ollama')}</span>
        <span className="badge badge--ok">{t('keys.ollamaBadge')}</span>
      </div>
      <div className="row__desc">{t('keys.ollamaHint')}</div>
      <div className="field">
        <button className="btn" disabled={busy} onClick={() => void test()}>
          {busy ? t('keys.testing') : t('keys.test')}
        </button>
        {tested && (
          <span className={tested.ok ? 'badge badge--ok' : 'badge badge--missing'}>
            {tested.ok ? t('keys.ok') : (tested.error ?? t('keys.failed'))}
          </span>
        )}
      </div>
    </div>
  );
}

function ApiKeysCard({
  presence,
  saveSecret,
  clearSecret,
}: {
  presence: SecretsPresence;
  saveSecret: (key: SecretKey, value: string) => Promise<void>;
  clearSecret: (key: SecretKey) => Promise<void>;
}) {
  const t = useT();
  return (
    <section className="card">
      <h2 className="card__title">{t('keys.title')}</h2>
      <p className="card__hint">{t('keys.hint')}</p>

      <SecretField
        label="keys.anthropic"
        hint="keys.anthropicHint"
        present={presence.anthropic}
        onSave={(v) => saveSecret('anthropic', v)}
        onClear={() => clearSecret('anthropic')}
        onTest={() => window.api.llm.testConnection('claude')}
      />
      <SecretField
        label="keys.google"
        hint="keys.googleHint"
        present={presence.google}
        onSave={(v) => saveSecret('google', v)}
        onClear={() => clearSecret('google')}
        onTest={() => window.api.llm.testConnection('gemini')}
      />
      <SecretField
        label="keys.openai"
        hint="keys.openaiHint"
        present={presence.openai}
        onSave={(v) => saveSecret('openai', v)}
        onClear={() => clearSecret('openai')}
        onTest={() => window.api.llm.testConnection('openai')}
      />
      <SecretField
        label="keys.deepseek"
        hint="keys.deepseekHint"
        present={presence.deepseek}
        onSave={(v) => saveSecret('deepseek', v)}
        onClear={() => clearSecret('deepseek')}
        onTest={() => window.api.llm.testConnection('deepseek')}
      />
      <OllamaCheck />
    </section>
  );
}

// ───────────────────── Model for the screen actions ─────────────────────

/**
 * What the screen's code and quizzes are solved with.
 *
 * Before there was a single model for everything, and the two tasks ask for
 * opposite things: speech needs **latency**, because the answer is read while
 * someone looks at you; the screen needs **vision and brains**, because you have
 * to read a prompt in a capture and not get it wrong. A small local model works
 * for the first and not the second; a big paid one, the other way around, is
 * expensive for every stray sentence in a meeting.
 */
function ScreenModelCard({ settings, patch }: { settings: Settings; patch: PatchFn }) {
  const t = useT();
  /*
   * The result is stored TOGETHER with the provider that requested it, and
   * discarded by comparison when painting. It's the same pattern as the main
   * selector, and for the same reason: Ollama's list travels over the network,
   * the user can switch providers while it arrives, and a slow response from the
   * previous one would paint the wrong models. Storing the pair also avoids having
   * to clean up state inside the effect, which is what `set-state-in-effect`
   * catches.
   */
  const [loaded, setLoaded] = useState<{ providerId: string; list: ModelInfo[] }>({
    providerId: '',
    list: [],
  });
  const provider = settings.screenProviderId;
  const target = screenModelFor(settings);

  useEffect(() => {
    if (provider === 'same') return;
    let live = true;
    void window.api.llm
      .listModelsFor(provider)
      .then((list) => {
        if (live) setLoaded({ providerId: provider, list });
      })
      .catch(() => {
        if (live) setLoaded({ providerId: provider, list: [] });
      });
    return () => {
      live = false;
    };
  }, [provider]);

  const models = loaded.providerId === provider ? loaded.list : [];

  const chosen = models.find((m) => m.id === target.model);
  const blind = chosen && !chosen.supportsVision;

  return (
    <section className="card" id="screen-model">
      <h2 className="card__title">{t('screen.title')}</h2>
      <p className="card__hint">
        <Tx k="screen.hint" />
      </p>

      <Row icon="cpu" label={t('model.provider')} desc={t('screen.providerDesc')}>
        <select
          value={provider}
          onChange={(e) =>
            void patch({
              screenProviderId: e.target.value as Settings['screenProviderId'],
              // Switching provider invalidates the chosen model: the ids don't
              // resemble each other at all between one provider and the next.
              screenModel: '',
            })
          }
        >
          <option value="same">{t('screen.same')}</option>
          <option value="claude">{t('screen.claude')}</option>
          <option value="gemini">{t('screen.gemini')}</option>
          <option value="openai">{t('screen.openai')}</option>
          {/* DeepSeek isn't here: none of its models read images, and this card
              exists to pick the one that DOES have to read the screen. Offering it
              would be offering the option that guarantees both buttons fail. It
              can be typed by hand if they ever release one with vision. */}
          <option value="ollama">{t('screen.ollama')}</option>
        </select>
      </Row>

      {provider !== 'same' && (
        <Row
          icon="monitor"
          label={t('model.model')}
          desc={
            models.length === 0
              ? t('screen.noModels')
              : provider === 'ollama'
                ? t('screen.visionOnly')
                : t('screen.visionOnlyCloud')
          }
        >
          <ModelPicker
            providerId={provider}
            models={models.map((m) => ({
              ...m,
              // Vision decides whether this model works for the only thing this
              // card does, so it goes in the label and not in a separate note.
              label: `${m.label}${m.supportsVision ? t('screen.seesImages') : t('screen.noVision')}`,
            }))}
            value={target.model}
            onChange={(screenModel) => void patch({ screenModel })}
          />
        </Row>
      )}

      {blind && (
        <div className="warn">
          <Tx k="screen.blind" vars={{ model: target.model }} />
        </div>
      )}

      {provider === 'same' && settings.llmProviderId === 'ollama' && (
        <div className="warn">
          <Tx k="screen.allOllama" />
        </div>
      )}
    </section>
  );
}

// ─────────────────────── Local models guide ───────────────────────

/**
 * Which local model to ask this machine for.
 *
 * The question has no generic answer —the same model is instant with a GPU and
 * takes a minute without one— and getting it wrong costs a multi-gig download.
 * What can be measured is measured and what can't is said clearly: VRAM, which is
 * what really decides whether a model fits in the card, can't be read reliably
 * from here.
 */
function LocalModelGuide() {
  const t = useT();
  const [specs, setSpecs] = useState<SystemSpecs | null>(null);
  const [copied, setCopied] = useState('');
  const [guide, setGuide] = useState<{ ok: boolean; error?: string } | null>(null);
  /** What Ollama says it has downloaded. Empty if it's not running. */
  const [installed, setInstalled] = useState<string[]>([]);

  useEffect(() => {
    void window.api.system.getSpecs().then(setSpecs);
    void window.api.ollama
      .getStatus()
      .then((status) => setInstalled(status.models.map((m) => m.id)))
      .catch(() => setInstalled([]));
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(''), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!specs) return null;

  const advice = adviseLocalModels(specs);
  const pull = (model: string): void => {
    void window.api.clipboard.write(`ollama pull ${model}`).then(() => setCopied(model));
  };

  /**
   * Whether the recommended model is already downloaded.
   *
   * It's compared tolerating the implicit tag: Ollama lists `llama3.2:latest` for
   * what you downloaded as `llama3.2`, so an exact comparison would say something
   * is missing that's there — and would send you to repeat a multi-gig download.
   */
  const has = (model: string): boolean => {
    const base = model.includes(':') ? model : `${model}:latest`;
    return installed.some((id) => id === model || id === base);
  };

  /** The button to copy the `pull`, or the confirmation that it's no longer needed. */
  const action = (model: string): React.ReactNode =>
    has(model) ? (
      <span className="badge badge--ok">{t('local.alreadyInstalled')}</span>
    ) : (
      <button className="btn btn--small" onClick={() => pull(model)}>
        {copied === model ? t('local.copied') : `ollama pull ${model}`}
      </button>
    );

  return (
    <section className="card" id="local-models">
      <h2 className="card__title">{t('local.title')}</h2>
      <p className="card__hint">{t('local.hint')}</p>

      <div className="specs">
        <span className="specs__item">
          <strong>{specs.totalMemoryGB} GB</strong> {t('local.ram')}
        </span>
        <span className="specs__item">
          {t('local.cores', { cores: specs.cpuCores, cpu: specs.cpuModel })}
        </span>
        {specs.gpu && (
          <span className="specs__item">
            {t('local.gpu')} <strong>{specs.gpu}</strong>
          </span>
        )}
      </div>

      <p className="card__hint" style={{ marginTop: 12, marginBottom: 4 }}>
        {t(advice.tier, { ram: specs.totalMemoryGB })}
      </p>

      <Row icon="waveform" label={t('local.forChat')} desc={t(advice.chat.note)}>
        {action(advice.chat.model)}
      </Row>

      <Row icon="monitor" label={t('local.forScreen')} desc={t(advice.vision.note)}>
        {action(advice.vision.model)}
      </Row>

      <div className="warn">{t(advice.caveat)}</div>

      {/*
        The card answers "what do I install?" in two lines, which is what's needed
        with the window in front of you. The guide answers the next-door question
        —"and why, and what else is there, and how much does it cost?"—, which
        needs tables and in this column would be a wall. It goes to a document and
        not to another app window: every Electron window has to be registered in
        the capture protection.
      */}
      <Row icon="book" label={t('local.guide')} desc={t('local.guideDesc')}>
        <button
          className="btn"
          onClick={() => {
            void window.api.guide.open().then(setGuide);
          }}
        >
          {t('local.openGuide')}
        </button>
      </Row>

      {guide && !guide.ok && (
        <div className="warn">
          {t('local.guideFailed')} {guide.error ?? t('overlay.unknownError')}
        </div>
      )}

      <p className="card__hint" style={{ marginTop: 12, marginBottom: 0 }}>
        <Tx k="local.vramNote" />
      </p>
    </section>
  );
}

// ─────────────────────────────── Shortcuts ───────────────────────────────

/**
 * A shortcut, captured by pressing it.
 *
 * It's captured instead of typed because the format is Electron's
 * (`Control+Shift+S`) and no one has to know it; and because typing an invalid
 * accelerator gives no error, just a shortcut that doesn't register.
 *
 * The `input` is read-only on purpose: what counts is the keypress, not what
 * could be pasted into it.
 */
function HotkeyField({
  action,
  accelerator,
  enabled,
  failed,
  duplicated,
  onChange,
  onToggle,
}: {
  action: keyof HotkeyMap;
  accelerator: string;
  /** Off = it doesn't register, so the combination stays free. */
  enabled: boolean;
  failed: boolean;
  duplicated: boolean;
  onChange: (accelerator: string) => void;
  onToggle: (enabled: boolean) => void;
}) {
  const t = useT();
  const [capturing, setCapturing] = useState(false);
  const [rejected, setRejected] = useState(false);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    event.preventDefault();

    // Escape exits without changing anything: an exit that isn't assigning
    // something is needed, because the field swallows all keypresses while capturing.
    if (event.key === 'Escape') {
      setCapturing(false);
      setRejected(false);
      event.currentTarget.blur();
      return;
    }

    const next = acceleratorFromEvent(event);
    if (!next) {
      // It only warns if the key wasn't a lone modifier: composing Ctrl+Shift+X
      // you pass through "Ctrl" and "Ctrl+Shift", and marking that as an error
      // would flash the warning on every legitimate attempt.
      if (!['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) setRejected(true);
      return;
    }

    setRejected(false);
    setCapturing(false);
    onChange(next);
    event.currentTarget.blur();
  };

  return (
    <Row
      label={t(HOTKEY_LABEL[action])}
      desc={
        // Off rules over the warnings: a shortcut that doesn't register can't be
        // held by another app or clash with another, so showing "Windows rejected
        // it" over an off one would be a warning about something that isn't
        // happening.
        !enabled
          ? t('hk.offDesc')
          : rejected
            ? t('hk.needsModifier')
            : failed
              ? t('hk.taken')
              : duplicated
                ? t('hk.duplicated')
                : undefined
      }
    >
      <input
        type="text"
        readOnly
        className={`hotkey${enabled && (failed || duplicated || rejected) ? ' hotkey--bad' : ''}${
          enabled ? '' : ' hotkey--off'
        }`}
        style={{ width: 190, flex: 'none' }}
        value={capturing ? t('hk.pressCombo') : formatAccelerator(accelerator, t('hk.unassigned'))}
        onFocus={() => setCapturing(true)}
        onBlur={() => {
          setCapturing(false);
          setRejected(false);
        }}
        onKeyDown={onKeyDown}
      />
      {/* The field stays editable with the shortcut off: preparing the
          combination for when you turn it back on is a normal case, and blocking
          it would force turning on, typing and turning off again. */}
      <Switch on={enabled} onChange={onToggle} />
    </Row>
  );
}

/**
 * The shortcuts, editable.
 *
 * `HotkeyMap` existed from the start and could only be changed by editing
 * `settings.json` by hand. It's not a luxury: a global accelerator takes it away
 * from the app that has focus, so any default choice clashes with someone's
 * editor, game or keyboard layout.
 */
function HotkeysCard({
  settings,
  patch,
  failed,
}: {
  settings: Settings;
  patch: PatchFn;
  /* The list is kept by the shell: the sidebar marks this section red even when
     it's not open, and for that the warning can't live in here. */
  failed: string[];
}) {
  const t = useT();
  // Over the ACTIVE ones: an off shortcut doesn't register, so it can't clash
  // with another. Counting it would mark red a conflict that doesn't exist.
  const duplicated = duplicateAccelerators(activeHotkeys(settings));
  const actions = Object.keys(HOTKEY_LABEL) as (keyof HotkeyMap)[];
  const off = new Set(settings.disabledHotkeys);

  const setEnabled = (action: keyof HotkeyMap, enabled: boolean): void => {
    const next = settings.disabledHotkeys.filter((id) => id !== action);
    void patch({ disabledHotkeys: enabled ? next : [...next, action] });
  };

  return (
    <section className="card">
      <p className="card__hint">{t('hk.switchHint')}</p>

      {failed.length > 0 && (
        <div className="warn">
          {/* The bold goes INSIDE the key: in English the emphasis doesn't fall
              in the same place of the sentence, and splitting it in three would
              pin it. */}
          <Tx
            k={failed.length === 1 ? 'hk.rejectedOne' : 'hk.rejectedMany'}
            vars={{
              keys: failed.map((accel) => formatAccelerator(accel)).join(', '),
            }}
          />
        </div>
      )}

      {actions.map((action) => (
        <HotkeyField
          key={action}
          action={action}
          accelerator={settings.hotkeys[action]}
          enabled={!off.has(action)}
          failed={failed.includes(settings.hotkeys[action])}
          duplicated={duplicated.has(settings.hotkeys[action])}
          onChange={(accelerator) =>
            void patch({ hotkeys: { ...settings.hotkeys, [action]: accelerator } })
          }
          onToggle={(enabled) => setEnabled(action, enabled)}
        />
      ))}

      <div className="row">
        <div>
          <div className="row__label">{t('hk.reset')}</div>
          <div className="row__desc">{t('hk.resetDesc')}</div>
        </div>
        {/* It also returns the switches to their place: "factory defaults" with
            three shortcuts off wouldn't be the factory ones. */}
        <button
          className="btn"
          onClick={() => void patch({ hotkeys: DEFAULT_HOTKEYS, disabledHotkeys: [] })}
        >
          {t('hk.resetButton')}
        </button>
      </div>
    </section>
  );
}

// ────────────────────────────── Diagnostics ──────────────────────────────

/**
 * Logs and transcription-engine test.
 *
 * It exists because in the packaged `.exe` **there was nowhere to look**: the
 * main process's `console.*` were only seen launching from a terminal. A Gemini
 * Live failure and a silent room produced exactly the same screen.
 */
function DiagnosticsCard() {
  const t = useT();
  const [log, setLog] = useState('');
  const [location, setLocation] = useState('');
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; detail: string } | null>(null);

  const refresh = useCallback((): void => {
    void window.api.logs.read().then(setLog);
  }, []);

  useEffect(() => {
    refresh();
    void window.api.logs.location().then(setLocation);
  }, [refresh]);

  const runTest = async (): Promise<void> => {
    setTesting(true);
    setResult(null);
    try {
      // The test writes to the log, so it's re-read afterwards: the full detail
      // (which models were tried and what each answered) is there.
      setResult(await window.api.transcript.testConnection());
      refresh();
    } finally {
      setTesting(false);
    }
  };

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(log);
    setCopied(true);
    setTimeout(() => setCopied(false), 1_500);
  };

  return (
    <section className="card">
      <p className="card__hint">
        <Tx k="diag.logAt" vars={{ where: location || t('diag.dataFolder') }} />
      </p>

      <Row icon="activity" label={t('diag.testStt')} desc={t('diag.testSttDesc')}>
        <button className="btn" disabled={testing} onClick={() => void runTest()}>
          {testing ? t('keys.testing') : t('keys.test')}
        </button>
      </Row>

      {result && (
        <div className={result.ok ? 'diag diag--ok' : 'warn'}>
          <strong>{result.ok ? t('diag.works') : t('diag.failed')}</strong> {result.detail}
        </div>
      )}

      <div className="field" style={{ marginTop: 12 }}>
        <button className="btn" onClick={refresh}>
          {t('diag.refresh')}
        </button>
        <button className="btn" disabled={!log} onClick={() => void copy()}>
          {copied ? t('diag.copied') : t('diag.copy')}
        </button>
      </div>

      <pre className="logview">{log || t('diag.emptyLog')}</pre>
    </section>
  );
}

// ────────────────────────────── History ──────────────────────────────

/**
 * Each conversation's date, in the interface language.
 *
 * It was pinned to `es-ES`, so with the app in English the list said "03 ago,
 * 18:42". It's built per language and not once because `Intl` doesn't accept
 * changing the locale of an already-created formatter.
 */
const DATE_FORMAT: Record<UILang, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }),
  es: new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }),
};

/**
 * Conversation history.
 *
 * This card is the one that makes visible that the app **does** write to disk,
 * something it didn't during its entire previous life. That's why it shows the
 * exact path and the delete-all button is here and not hidden: if you're going to
 * save other people's transcripts, you have to be able to see what's there and
 * remove it.
 */
function HistoryCard({ settings, patch }: { settings: Settings; patch: PatchFn }) {
  const t = useT();
  const dateFormat = DATE_FORMAT[useUILang()];
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Conversation | null>(null);
  const [location, setLocation] = useState('');
  const [confirmingClear, setConfirmingClear] = useState(false);
  /**
   * How many conversations are painted at once.
   *
   * Painting them all made the page grow without a ceiling: with fifty
   * conversations, any setting below was half a screen of scroll away. The recent
   * ones are shown, which are the ones consulted. A search bypasses the cap — its
   * results are already the ones you asked for.
   */
  const [showAll, setShowAll] = useState(false);
  const VISIBLE = 5;
  const searching = query.trim().length > 0;

  // The list honours the search box: with a query it's the matches, without it
  // the full list. Both come as lightweight headers from the main process, where
  // the conversation files live.
  const refresh = useCallback((): void => {
    const q = query.trim();
    void (q ? window.api.history.search(q) : window.api.history.list()).then(setItems);
  }, [query]);

  // Debounced so typing doesn't read every conversation on each keystroke;
  // clearing the box is instant. This also does the first load on mount.
  useEffect(() => {
    const id = setTimeout(refresh, searching ? 200 : 0);
    return () => clearTimeout(id);
  }, [refresh, searching]);

  useEffect(() => {
    void window.api.history.location().then(setLocation);
  }, []);

  // Starting a new conversation from the overlay must show here without having to
  // close and reopen the dashboard.
  useEffect(() => window.api.history.onReset(refresh), [refresh]);

  // The detail is requested on demand: the list only brings headers, and loading
  // each full transcript to paint a list wouldn't make sense.
  useEffect(() => {
    if (!openId) return;
    let cancelled = false;
    void window.api.history.get(openId).then((conversation) => {
      if (!cancelled) setDetail(conversation);
    });
    return () => {
      cancelled = true;
    };
  }, [openId]);

  const remove = async (id: string): Promise<void> => {
    await window.api.history.remove(id);
    refresh();
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
    }
  };

  const clearAll = async (): Promise<void> => {
    await window.api.history.clear();
    setQuery('');
    setItems([]);
    setOpenId(null);
    setDetail(null);
    setConfirmingClear(false);
  };

  return (
    <section className="card">
      <Row
        icon="history"
        label={t('hist.save')}
        desc={
          settings.historyEnabled
            ? t('hist.on', { where: location || t('hist.yourFolder') })
            : t('hist.off')
        }
      >
        <Switch on={settings.historyEnabled} onChange={(v) => void patch({ historyEnabled: v })} />
      </Row>

      {(items.length > 0 || searching) && (
        <input
          type="text"
          className="convsearch"
          placeholder={t('hist.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}

      {!searching && items.length === 0 && (
        <p className="card__hint" style={{ marginBottom: 0 }}>
          {settings.historyEnabled ? t('hist.emptyOn') : t('hist.emptyOff')}
        </p>
      )}

      {searching && items.length === 0 && (
        <p className="card__hint" style={{ marginBottom: 0 }}>
          {t('hist.searchNone', { query: query.trim() })}
        </p>
      )}

      {(searching || showAll ? items : items.slice(0, VISIBLE)).map((item) => (
        <div key={item.id} className="conv">
          <div className="conv__head">
            <button
              className="conv__title"
              onClick={() => setOpenId(openId === item.id ? null : item.id)}
            >
              <span className="conv__name">
                {item.screenTitle
                  ? t(
                      item.screenTitle === 'code'
                        ? 'hist.screenCode'
                        : item.screenTitle === 'quiz'
                          ? 'hist.screenQuiz'
                          : 'hist.screenGeneral'
                    )
                  : item.title || t('hist.untitled')}
              </span>
              <span className="conv__meta">
                {t('hist.meta', {
                  date: dateFormat.format(item.startedAt),
                  turns: item.turnCount,
                  segments: item.segmentCount,
                })}
              </span>
            </button>
            <button className="btn btn--danger" onClick={() => void remove(item.id)}>
              {t('hist.delete')}
            </button>
          </div>

          {openId === item.id && detail?.id === item.id && (
            <div className="conv__body">
              {detail.turns.map((turn) => (
                <div key={turn.id} className="turn">
                  <div className="turn__q">
                    {isScreenTrigger(turn.trigger)
                      ? t(
                          turn.trigger === 'code'
                            ? 'hist.screenCode'
                            : turn.trigger === 'quiz'
                              ? 'hist.screenQuiz'
                              : 'hist.screenGeneral'
                        )
                      : turn.question || t('hist.noQuestion')}
                  </div>
                  <div className={`turn__a${turn.error ? ' turn__a--error' : ''}`}>
                    {turn.error ?? turn.answer}
                  </div>
                  <div className="turn__meta">
                    {turn.providerId} · {turn.model} · {turn.trigger}
                  </div>
                </div>
              ))}

              {detail.segments.length > 0 && (
                <>
                  <div className="conv__subtitle">{t('hist.transcript')}</div>
                  <div className="conv__transcript">
                    {detail.segments.map((seg) => (
                      <div key={seg.id} className="conv__line">
                        <span className={`transcript-who transcript-who--${seg.speaker}`}>
                          {seg.speaker === 'me' ? t('overlay.me') : t('overlay.them')}
                        </span>
                        <span>{seg.text}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      ))}

      {!searching && items.length > VISIBLE && (
        <div className="field">
          <button className="btn" onClick={() => setShowAll(!showAll)}>
            {showAll
              ? t('hist.showLast', { count: VISIBLE })
              : t('hist.showAll', { count: items.length })}
          </button>
        </div>
      )}

      {items.length > 0 && (
        <div className="field">
          {confirmingClear ? (
            <>
              <span className="row__desc" style={{ flex: 1 }}>
                {t('hist.clearConfirm', { count: items.length })}
              </span>
              <button className="btn btn--danger" onClick={() => void clearAll()}>
                {t('hist.clearYes')}
              </button>
              <button className="btn" onClick={() => setConfirmingClear(false)}>
                {t('hist.cancel')}
              </button>
            </>
          ) : (
            <button className="btn btn--danger" onClick={() => setConfirmingClear(true)}>
              {t('hist.clearAll')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────── Model ───────────────────────────────

type PatchFn = (p: Partial<Settings>) => Promise<void>;

/** Sentinel dropdown value for "I'll type it myself". */
const CUSTOM_MODEL = '__custom__';

/**
 * Choosing a model: from the catalog, or by typing it.
 *
 * The cloud providers' catalog is written in the code, so it ages: each new model
 * from the provider takes as long as an app version to arrive here, and meanwhile
 * there's no way to use it even if your account has access. The list is still the
 * first thing seen —it's what 90% want and it avoids typing an id from memory—
 * but it stops being a boundary.
 *
 * **With Ollama it isn't offered**, and it's not an omission: that list isn't a
 * catalog of ours, it's what the local server says it has downloaded. Typing
 * there the name of a model that isn't installed doesn't install it; it only
 * produces an error later and further away.
 */
function ModelPicker({
  providerId,
  models,
  value,
  onChange,
}: {
  providerId: LLMProviderId | 'same';
  models: ModelInfo[];
  value: string;
  onChange: (model: string) => void;
}) {
  const t = useT();
  /** The user asked to type it; it's remembered even if they clear the field. */
  const [manual, setManual] = useState(false);

  const allowCustom = providerId !== 'ollama';
  const known = models.some((m) => m.id === value);

  /*
   * It's typed by hand if they asked, or if the stored one isn't in the catalog —
   * which is exactly the case of whoever already typed one and comes back to the
   * dashboard. The check requires the list to have arrived: while loading it's
   * empty and EVERYTHING would look hand-typed, so the field would appear and
   * disappear on its own on every opening.
   */
  const typing = allowCustom && (manual || (Boolean(value) && models.length > 0 && !known));

  return (
    <div className="modelpick">
      <select
        value={typing ? CUSTOM_MODEL : known ? value : ''}
        disabled={models.length === 0 && !allowCustom}
        onChange={(e) => {
          if (e.target.value === CUSTOM_MODEL) {
            setManual(true);
            return;
          }
          setManual(false);
          onChange(e.target.value);
        }}
      >
        {/* A controlled select ALWAYS needs an option with its value, or the
            browser paints the first as chosen without firing onChange and the UI
            lies. It cost a while once. */}
        {!typing && !known && (
          <option value="">{models.length === 0 ? t('model.none') : t('model.pick')}</option>
        )}
        {models.map((model) => (
          <option key={model.id} value={model.id}>
            {model.note ? `${model.label} · ${t(model.note)}` : model.label}
          </option>
        ))}
        {allowCustom && <option value={CUSTOM_MODEL}>{t('model.other')}</option>}
      </select>

      {typing && (
        <input
          type="text"
          className="modelpick__id"
          placeholder={t('model.idPlaceholder')}
          value={value}
          autoFocus
          // It's normalized on every key: an id pasted from the docs carries
          // spaces that produce a 404 impossible to see at a glance.
          onChange={(e) => onChange(normalizeModelId(e.target.value))}
        />
      )}
    </div>
  );
}

/** Transcription engine name, as a key. The exhaustive `Record` forces giving a
 *  label to each new engine added to `STTProviderId`. */
const STT_LABEL: Record<STTProviderId, UIKey> = {
  'openai-live': 'stt.openaiLive',
  'openai-transcribe': 'stt.openaiTranscribe',
  'gemini-live': 'stt.geminiLive',
  'gemini-audio': 'stt.geminiAudio',
  'whisper-local': 'stt.whisperLocal',
};


/**
 * Model mini-profiles: named presets that fix in one click which engines and
 * models to use for a case (interview, meeting, interpreter…).
 *
 * It doesn't replace the prompt profile: it **includes** it as one more field.
 * Switching prompt profile still decides the shape of the answer; applying a
 * preset also sets the models. See `applyModelPreset` in `shared/types.ts`.
 */
function ModelPresetsCard({ settings, patch }: { settings: Settings; patch: PatchFn }) {
  const t = useT();
  const presets = settings.modelPresets;

  const write = (next: ModelPreset[]): void => void patch({ modelPresets: next });

  const saveCurrent = (): void => {
    write([
      ...presets,
      {
        id: crypto.randomUUID(),
        // Default name: the current prompt profile. It's editable on the spot.
        name: t(PROFILE_LABEL[settings.promptProfileId]),
        ...presetFromSettings(settings),
      },
    ]);
  };

  const rename = (id: string, name: string): void =>
    write(presets.map((p) => (p.id === id ? { ...p, name } : p)));

  const remove = (id: string): void => write(presets.filter((p) => p.id !== id));

  const apply = (preset: ModelPreset): void => void patch(applyModelPreset(settings, preset));

  return (
    <section className="card">
      <h2 className="card__title">{t('presets.title')}</h2>
      <p className="card__hint">{t('presets.hint')}</p>

      {presets.length === 0 ? (
        <p className="preset__empty">{t('presets.empty')}</p>
      ) : (
        <div className="preset__list">
          {presets.map((p) => (
            <div key={p.id} className="preset__row">
              <input
                className="preset__name"
                value={p.name}
                aria-label={t('presets.nameLabel')}
                onChange={(e) => rename(p.id, e.target.value)}
              />
              <div className="preset__tags">
                <span className="preset__tag">{t(STT_LABEL[p.sttProviderId])}</span>
                <span className="preset__tag">
                  {LLM_LABEL[p.llmProviderId]}
                  {p.llmModel ? ` · ${p.llmModel}` : ''}
                </span>
                <span className="preset__tag">{t(PROFILE_LABEL[p.promptProfileId])}</span>
              </div>
              <div className="preset__acts">
                <button className="btn btn--small" onClick={() => apply(p)}>
                  {t('presets.apply')}
                </button>
                <button
                  className="preset__del"
                  aria-label={t('presets.delete')}
                  title={t('presets.delete')}
                  onClick={() => remove(p.id)}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="field">
        <button className="btn" onClick={saveCurrent}>
          {t('presets.saveCurrent')}
        </button>
      </div>
    </section>
  );
}

function ModelCard({ settings, patch }: { settings: Settings; patch: PatchFn }) {
  const t = useT();
  const provider = settings.llmProviderId;

  /**
   * The result is stored together with the provider it corresponds to, and
   * discarded by comparison when rendering. That avoids the bug where a slow
   * `listModels()` from provider A resolves after switching to B and shows the
   * wrong models — and there's no need to clean up state inside the effect.
   */
  const [loaded, setLoaded] = useState<{ provider: LLMProviderId; models: ModelInfo[] } | null>(
    null
  );
  const [tested, setTested] = useState<{
    provider: LLMProviderId;
    result: { ok: boolean; error?: string };
  } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.api.llm
      .listModels()
      .then(async (models) => {
        if (cancelled) return;
        setLoaded({ provider, models });

        /*
         * If there's NO stored model, one has to be persisted. A controlled
         * <select> whose `value` doesn't exist among its <option>s paints the
         * first option as chosen but doesn't fire `onChange`: the UI said
         * "llama3.2:3b" while the settings still had "", and every answer failed
         * with "no model selected".
         *
         * The condition is "it's empty", NOT "it's not in the list", and the
         * difference matters now that models can be typed by hand: with the
         * previous check, a typed id —or one from the catalog that's one day
         * retired— replaced itself with the first in the list on reopening the
         * dashboard. Changing someone's model behind their back is bad with a
         * local one and worse with a paid one.
         */
        const stored = await window.api.settings.get();
        const currentModel = stored.llmModels[provider];
        const first = models[0];
        if (!first || currentModel) return;
        // It's re-read from main instead of using the render's `settings`:
        // between requesting the list and it arriving, the user may have touched
        // another setting.
        await patch({ llmModels: { ...stored.llmModels, [provider]: first.id } });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ provider, models: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [provider, patch]);

  const models = loaded?.provider === provider ? loaded.models : [];
  const test = tested?.provider === provider ? tested.result : null;
  const selectedModel = settings.llmModels[provider];

  const runTest = async (): Promise<void> => {
    setBusy(true);
    try {
      setTested({ provider, result: await window.api.llm.testConnection() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2 className="card__title">{t('model.title')}</h2>
      <p className="card__hint">{t('model.hint')}</p>

      <Row icon="cpu" label={t('model.provider')}>
        <select
          value={settings.llmProviderId}
          onChange={(e) => void patch({ llmProviderId: e.target.value as LLMProviderId })}
        >
          <option value="claude">Claude (Anthropic)</option>
          <option value="gemini">Gemini (Google)</option>
          <option value="openai">ChatGPT (OpenAI)</option>
          <option value="deepseek">DeepSeek</option>
          <option value="ollama">{t('mdl.providerOllama')}</option>
        </select>
      </Row>

      <Row
        icon="sliders"
        label={t('model.model')}
        desc={
          // The detailed diagnostics come from the status panel below; here it
          // just points toward it so as not to say the same thing twice.
          provider === 'ollama' && models.length === 0
            ? t('model.noneAvailable')
            : provider !== 'ollama'
              ? t('model.catalogHint')
              : undefined
        }
      >
        <ModelPicker
          providerId={provider}
          models={models}
          value={selectedModel}
          onChange={(model) =>
            void patch({ llmModels: { ...settings.llmModels, [provider]: model } })
          }
        />
      </Row>

      <Row icon="globe" label={t('model.answerLang')} desc={t('model.answerLangDesc')}>
        <select
          value={settings.answerLanguage}
          onChange={(e) => void patch({ answerLanguage: e.target.value })}
        >
          <option value="auto">{t('model.answerLangAuto')}</option>
          {INTERPRETER_LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l[settings.uiLanguage]}
            </option>
          ))}
        </select>
      </Row>

      <div className="field">
        <button className="btn" disabled={busy} onClick={() => void runTest()}>
          {busy ? t('keys.testing') : t('model.test')}
        </button>
        {test && (
          <span className={test.ok ? 'badge badge--ok' : 'badge badge--missing'}>
            {test.ok ? t('keys.ok') : (test.error ?? t('keys.failed'))}
          </span>
        )}
      </div>

      {/*
        The context window is shown if Ollama is used FOR ANYTHING, even just for
        the screen: the silent trimming is just as harmful there, and harder to
        suspect, because a capture takes up many tokens.
      */}
      {(provider === 'ollama' || settings.screenProviderId === 'ollama') && (
        <Row icon="file" label={t('model.ollamaContext')} desc={t('model.ollamaContextDesc')}>
          <select
            value={settings.ollamaContextTokens}
            onChange={(e) => void patch({ ollamaContextTokens: Number(e.target.value) })}
          >
            <option value={2048}>{t('model.ctxDefault')}</option>
            <option value={4096}>4096</option>
            <option value={8192}>{t('model.ctxRecommended')}</option>
            <option value={16384}>{t('model.ctxLongCv')}</option>
            <option value={32768}>{t('model.ctxHeavy')}</option>
          </select>
        </Row>
      )}

      {provider === 'ollama' && <OllamaStatusPanel />}
    </section>
  );
}

/**
 * Ollama status. It tells apart the three cases that matter, because "no model
 * appears" has very different causes and different solutions: it's not installed,
 * it's installed but stopped, or it runs with no models downloaded.
 */
function OllamaStatusPanel() {
  const t = useT();
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [checking, setChecking] = useState(true);
  /** Incremented to relaunch the probe from the button. */
  const [attempt, setAttempt] = useState(0);

  // The effect only calls setState from the promise's callback; putting
  // `setChecking(true)` in here would fire cascading renders.
  useEffect(() => {
    let cancelled = false;
    void window.api.ollama
      .getStatus()
      .then((next) => {
        if (cancelled) return;
        setStatus(next);
        setChecking(false);
      })
      .catch(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const probe = (): void => {
    setChecking(true);
    setAttempt((n) => n + 1);
  };

  return (
    <div className="ollama">
      <div className="ollama__head">
        <span className="row__label">{t('ol.status')}</span>
        {checking && <span className="badge badge--missing">{t('ol.checking')}</span>}
        {!checking && status?.reachable && (
          <span className="badge badge--ok">
            {t('ol.detected')}
            {status.version ? ` · v${status.version}` : ''}
          </span>
        )}
        {!checking && status && !status.reachable && (
          <span className="badge badge--missing">{t('ol.notDetected')}</span>
        )}
        <span className="statusbar__spacer" style={{ flex: 1 }} />
        <button className="btn" onClick={probe} disabled={checking}>
          {t('ol.recheck')}
        </button>
      </div>

      {!checking && status && !status.reachable && (
        <div className="warn">
          <Tx k="ol.installHint" vars={{ error: status.error ?? '' }} />
        </div>
      )}

      {!checking && status?.reachable && status.models.length === 0 && (
        <div className="warn">
          <Tx k="ol.noModels" />
        </div>
      )}

      {!checking && status?.reachable && status.models.length > 0 && (
        <>
          <div className="row__desc" style={{ marginTop: 10 }}>
            {t('ol.detectedCount', { count: status.models.length })}
          </div>
          <ul className="ollama__list">
            {status.models.map((m) => (
              <li key={m.id}>
                {m.id}
                {m.supportsVision && <span className="badge badge--ok">{t('ol.vision')}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ──────────────────────────── Transcription ────────────────────────────

function TranscriptionCard({
  settings,
  patch,
  go,
}: {
  settings: Settings;
  patch: PatchFn;
  go: (id: SectionId) => void;
}) {
  const t = useT();
  const [status, setStatus] = useState({
    binaryInstalled: false,
    modelInstalled: false,
    installed: [] as string[],
  });
  const [ram, setRam] = useState<number | null>(null);
  const [progress, setProgress] = useState<WhisperProgress | null>(null);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback((): void => {
    void window.api.whisper.getStatus().then(setStatus);
  }, []);

  useEffect(() => {
    refresh();
    void window.api.system.getSpecs().then((specs) => setRam(specs.totalMemoryGB));
    return window.api.whisper.onProgress(setProgress);
  }, [refresh, settings.whisperModel]);

  const install = async (): Promise<void> => {
    setInstalling(true);
    setError(null);
    try {
      const result = await window.api.whisper.install();
      if (!result.ok) setError(result.error ?? t('stt.downloadFailed'));
      refresh();
    } finally {
      setInstalling(false);
      setProgress(null);
    }
  };

  /** Install from a row: first it's chosen (main downloads the active one). */
  const installModel = async (id: string): Promise<void> => {
    await patch({ whisperModel: id });
    await install();
  };

  /** Adds or removes a model from favorites, returning the new list. */
  const toggleFavorite = (id: string): string[] =>
    settings.favoriteLocalModels.includes(id)
      ? settings.favoriteLocalModels.filter((m) => m !== id)
      : [...settings.favoriteLocalModels, id];

  const recommended = ram !== null ? recommendWhisperModel(ram) : null;
  const pct =
    progress && progress.totalBytes > 0
      ? Math.round((progress.receivedBytes / progress.totalBytes) * 100)
      : null;

  return (
    <section className="card">
      <Row
        icon="waveform"
        label={t('stt.engine')}
        desc={
          <>
            {t('stt.engineDesc')}{' '}
            <Jump to="audio" go={go}>
              {t('stt.goAudio')}
            </Jump>
          </>
        }
      >
        <select
          value={settings.sttProviderId}
          onChange={(e) =>
            void patch({ sttProviderId: e.target.value as Settings['sttProviderId'] })
          }
        >
          <option value="openai-live">{t('stt.openaiLive')}</option>
          <option value="openai-transcribe">{t('stt.openaiTranscribe')}</option>
          <option value="gemini-live">{t('stt.geminiLive')}</option>
          <option value="gemini-audio">{t('stt.geminiAudio')}</option>
          <option value="whisper-local">{t('stt.whisperLocal')}</option>
        </select>
      </Row>

      {(settings.sttProviderId === 'openai-live' ||
        settings.sttProviderId === 'openai-transcribe') && (
        <p className="card__hint">
          {settings.sttProviderId === 'openai-live' ? (
            <Tx k="stt.openaiLiveHint" />
          ) : (
            <Tx k="stt.openaiTranscribeHint" />
          )}{' '}
          {t('stt.openaiKeyNote')}
        </p>
      )}

      {settings.sttProviderId === 'gemini-audio' && (
        <div className="diag diag--ok">
          <Tx k="stt.geminiAudioNote" />
        </div>
      )}

      <Row icon="globe" label={t('stt.language')} desc={t('stt.languageDesc')}>
        <select
          value={settings.language}
          onChange={(e) => void patch({ language: e.target.value })}
        >
          <option value="auto">{t('stt.auto')}</option>
          <option value="es">{t('stt.langEs')}</option>
          <option value="en">{t('stt.langEn')}</option>
          <option value="pt">{t('stt.langPt')}</option>
          <option value="fr">{t('stt.langFr')}</option>
          <option value="de">{t('stt.langDe')}</option>
        </select>
      </Row>

      {/*
        The warning is strong because the failure is silent and very confusing:
        it really happened with the language in English and someone speaking
        Spanish. Whisper returned "Are y'all gonna eat?" and the model answered
        that.
      */}
      {settings.language !== 'auto' && (
        <div className="warn">
          <Tx
            k="stt.forcedWarn"
            vars={{
              lang: LANGUAGE_LABEL[settings.language]
                ? t(LANGUAGE_LABEL[settings.language]!)
                : settings.language,
            }}
          />
        </div>
      )}

      {settings.sttProviderId === 'whisper-local' && (
        <>
          <div className="mm__head">
            <div className="mm__title">{t('stt.whisperModel')}</div>
            <div className="mm__desc">
              {settings.language === 'en' || settings.language === 'auto'
                ? t('stt.whisperModelDesc')
                : t('stt.whisperModelDescNonEn')}
              {recommended && (
                <>
                  {' · '}
                  {t('stt.recForPc')}:{' '}
                  <strong>{WHISPER_MODELS.find((mo) => mo.id === recommended)?.name}</strong>
                </>
              )}
            </div>
          </div>

          <div className="mm">
            {sortByFavorite(WHISPER_MODELS, settings.favoriteLocalModels).map((mo) => {
              const isInstalled = status.installed.includes(mo.id);
              const isActive = settings.whisperModel === mo.id;
              const isFavorite = settings.favoriteLocalModels.includes(mo.id);
              return (
                <div key={mo.id} className={`mm__row${isActive ? ' mm__row--active' : ''}`}>
                  <button
                    type="button"
                    className={`mm__fav${isFavorite ? ' mm__fav--on' : ''}`}
                    aria-pressed={isFavorite}
                    title={t(isFavorite ? 'stt.unfavorite' : 'stt.favorite')}
                    aria-label={t(isFavorite ? 'stt.unfavorite' : 'stt.favorite')}
                    onClick={() => void patch({ favoriteLocalModels: toggleFavorite(mo.id) })}
                  >
                    <Icon name={isFavorite ? 'starFilled' : 'star'} size={15} />
                  </button>
                  <div className="mm__info">
                    <div className="mm__name">
                      {mo.name}
                      {mo.id === recommended && (
                        <span className="mm__badge">{t('stt.recommended')}</span>
                      )}
                    </div>
                    <div className="mm__tags">
                      <span className="mm__tag">{mo.sizeMB} MB</span>
                      <span className="mm__tag">{t(SPEED_KEY[mo.speed])}</span>
                      <span className="mm__tag">{t(ACC_KEY[mo.accuracy])}</span>
                    </div>
                  </div>
                  {isInstalled && isActive ? (
                    <span className="badge badge--ok">{t('stt.inUse')}</span>
                  ) : isInstalled ? (
                    <button className="mm__act" onClick={() => void patch({ whisperModel: mo.id })}>
                      {t('stt.use')}
                    </button>
                  ) : (
                    <button
                      className="mm__act"
                      disabled={installing}
                      onClick={() => void installModel(mo.id)}
                    >
                      {installing && isActive ? t('stt.downloading') : t('stt.install')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {installing && (
            <div className="progress">
              <div className="progress__label">
                {progress?.target === 'binary' ? t('stt.progressBinary') : t('stt.progressModel')}
                {pct !== null ? ` — ${pct}%` : ''}
              </div>
              <div className="progress__bar">
                <div className="progress__fill" style={{ width: `${pct ?? 0}%` }} />
              </div>
            </div>
          )}

          {error && <div className="warn">{error}</div>}
        </>
      )}
    </section>
  );
}

/**
 * By default the auto-trigger ignores your own voice (it only evaluates the other
 * party's utterances), so this option mainly decides what enters the CONTEXT sent
 * to the model. The texts say so explicitly because it's the natural confusion —
 * and they warn about the combination that leaves the trigger inert.
 */
const AUDIO_SOURCE_HINT: Record<Settings['audioSources'], UIKey> = {
  both: 'aud.hintBoth',
  system: 'aud.hintSystem',
  mic: 'aud.hintMic',
};

/**
 * The right balance depends on what you use the app for, so the texts describe
 * the use case and not the algorithm: no one chooses "recall" blindly.
 */
const SENSITIVITY_HINT: Record<Settings['autoTriggerSensitivity'], UIKey> = {
  strict: 'beh.sensStrictHint',
  balanced: 'beh.sensBalancedHint',
  all: 'beh.sensAllHint',
};

/** Speaker names in the warnings, so as not to repeat them in every text. */
const SPEAKER_LABEL: Record<'me' | 'them' | 'any', UIKey> = {
  them: 'beh.speakerThemShort',
  me: 'beh.speakerMeShort',
  any: 'beh.speakerAnyShort',
};

/**
 * The recognizer's language, written in the interface language.
 *
 * They're the same keys that label the dropdown above: the "you're forcing X"
 * warning has to say X exactly like the option just chosen, or they look like two
 * different settings.
 */
const LANGUAGE_LABEL: Record<string, UIKey> = {
  es: 'stt.langEs',
  en: 'stt.langEn',
  pt: 'stt.langPt',
  fr: 'stt.langFr',
  de: 'stt.langDe',
};

const SPEED_KEY: Record<ModelSpeed, UIKey> = {
  'very-fast': 'mdl.speedVeryFast',
  fast: 'mdl.speedFast',
  medium: 'mdl.speedMedium',
  slow: 'mdl.speedSlow',
};

const ACC_KEY: Record<ModelAccuracy, UIKey> = {
  decent: 'mdl.accDecent',
  good: 'mdl.accGood',
  high: 'mdl.accHigh',
  'very-high': 'mdl.accVeryHigh',
};

// ────────────────────────────── Behavior ──────────────────────────────

function BehaviourCard({
  settings,
  patch,
  go,
}: {
  settings: Settings;
  patch: PatchFn;
  go: (id: SectionId) => void;
}) {
  const t = useT();
  return (
    <section className="card">
      <Row icon="bolt" label={t('beh.auto')} desc={t('beh.autoDesc')}>
        <select
          value={settings.autoTriggerMode}
          onChange={(e) =>
            void patch({ autoTriggerMode: e.target.value as Settings['autoTriggerMode'] })
          }
        >
          <option value="off">{t('beh.autoOff')}</option>
          <option value="heuristic">{t('beh.autoHeuristic')}</option>
          <option value="heuristic+classifier">{t('beh.autoClassifier')}</option>
        </select>
      </Row>

      {settings.autoTriggerMode === 'heuristic+classifier' && (
        <div className="warn">
          <Tx k="beh.classifierWarn" />
          <br />
          <Tx k="beh.classifierCost" />
        </div>
      )}

      {settings.autoTriggerMode !== 'off' && (
        <>
          <Row icon="mic" label={t('beh.speaker')} desc={t('beh.speakerDesc')}>
            <select
              value={settings.autoTriggerSpeaker}
              onChange={(e) =>
                void patch({
                  autoTriggerSpeaker: e.target.value as Settings['autoTriggerSpeaker'],
                })
              }
            >
              <option value="them">{t('beh.speakerThem')}</option>
              <option value="me">{t('beh.speakerMe')}</option>
              <option value="any">{t('beh.speakerAny')}</option>
            </select>
          </Row>

          <Row
            icon="waveform"
            label={t('beh.sensitivity')}
            desc={t(SENSITIVITY_HINT[settings.autoTriggerSensitivity])}
          >
            <select
              value={settings.autoTriggerSensitivity}
              onChange={(e) =>
                void patch({
                  autoTriggerSensitivity: e.target.value as Settings['autoTriggerSensitivity'],
                })
              }
            >
              <option value="strict">{t('beh.sensStrict')}</option>
              <option value="balanced">{t('beh.sensBalanced')}</option>
              <option value="all">{t('beh.sensAll')}</option>
            </select>
          </Row>

          {/* The impossible combination gives no symptom: audio arrives, it's
              transcribed, and the trigger discards everything silently. That's
              why it warns here and not only in the main process's log. */}
          {autoTriggerIsInert(settings) && (
            <div className="warn">
              <Tx
                k="beh.inertWarn"
                vars={{
                  wanted: t(SPEAKER_LABEL[settings.autoTriggerSpeaker]),
                  heard: speakersFor(settings.audioSources)
                    .map((speaker) => t(SPEAKER_LABEL[speaker]))
                    .join(t('stt.and')),
                }}
              />
              <div className="field">
                <Jump to="audio" go={go}>
                  {t('beh.changeSources')}
                </Jump>
              </div>
            </div>
          )}
        </>
      )}

      <Row icon="power" label={t('beh.idle')} desc={t('beh.idleDesc')}>
        <Switch
          on={settings.idleShutoffEnabled}
          onChange={(v) => void patch({ idleShutoffEnabled: v })}
        />
      </Row>

      {settings.idleShutoffEnabled && (
        <Row icon="clock" label={t('beh.idleMinutes')} desc={t('beh.idleMinutesDesc')}>
          <input
            type="number"
            min={1}
            max={240}
            step={1}
            style={{ width: 90, flex: 'none' }}
            value={settings.idleShutoffMinutes}
            onChange={(e) =>
              void patch({ idleShutoffMinutes: Math.max(1, Number(e.target.value) || 10) })
            }
          />
        </Row>
      )}

      <Row icon="clock" label={t('beh.window')} desc={t('beh.windowDesc')}>
        <input
          type="number"
          min={10}
          max={300}
          step={5}
          style={{ width: 90, flex: 'none' }}
          value={settings.manualContextSeconds}
          onChange={(e) =>
            void patch({ manualContextSeconds: Math.max(10, Number(e.target.value) || 30) })
          }
        />
      </Row>

      <Row icon="file" label={t('beh.profile')} desc={t('beh.profileDesc')}>
        <select
          value={
            settings.promptProfileId === 'custom'
              ? `custom:${settings.activeCustomId}`
              : settings.promptProfileId
          }
          onChange={(e) => {
            const v = e.target.value;
            if (v.startsWith('custom:')) {
              void patch({ promptProfileId: 'custom', activeCustomId: v.slice('custom:'.length) });
            } else {
              void patch({ promptProfileId: v as Settings['promptProfileId'] });
            }
          }}
        >
          <option value="interview">{t('beh.profInterview')}</option>
          <option value="meeting">{t('beh.profMeeting')}</option>
          <option value="lecture">{t('beh.profLecture')}</option>
          <option value="support">{t('beh.profSupport')}</option>
          <option value="coding">{t('beh.profCoding')}</option>
          <option value="quiz">{t('beh.profQuiz')}</option>
          <option value="interpreter">{t('beh.profInterpreter')}</option>
          {/* User profiles all live under `custom`; the id rides in the value. */}
          {settings.customProfiles.length > 0 && (
            <optgroup label={t('beh.profCustomTitle')}>
              {settings.customProfiles.map((p) => (
                <option key={p.id} value={`custom:${p.id}`}>
                  {p.name || t('beh.profCustom')}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </Row>

      {settings.promptProfileId === 'interpreter' && (
        <Row icon="globe" label={t('beh.interpreterLangs')} desc={t('beh.interpreterLangsDesc')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select
              value={settings.interpreterLangA}
              onChange={(e) => void patch({ interpreterLangA: e.target.value })}
            >
              {INTERPRETER_LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l[settings.uiLanguage]}
                </option>
              ))}
            </select>
            <span style={{ color: 'var(--text-faint)' }}>⇄</span>
            <select
              value={settings.interpreterLangB}
              onChange={(e) => void patch({ interpreterLangB: e.target.value })}
            >
              {INTERPRETER_LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l[settings.uiLanguage]}
                </option>
              ))}
            </select>
          </div>
        </Row>
      )}

      {/*
        Shown always, not only with the "Code" profile set: the normal path to
        code mode is Ctrl+Alt+C, which solves the screen WITHOUT touching the
        profile. Hiding this setting behind the profile would leave it invisible
        exactly for whoever's going to use it most.
      */}
      <Row icon="monitor" label={t('beh.codeLang')} desc={t('beh.codeLangDesc')}>
        <input
          type="text"
          placeholder="auto"
          style={{ width: 140, flex: 'none' }}
          value={settings.codeLanguage}
          onChange={(e) => void patch({ codeLanguage: e.target.value })}
        />
      </Row>

      {/* Chunk capture: for a test on a shared screen revealed by scrolling. The
          mode decides how the frames are collected. */}
      <Row
        icon="monitor"
        label={t('scroll.title')}
        desc={`${t('scroll.hint')} ${t(
          settings.scrollCaptureMode === 'auto' ? 'scroll.autoHint' : 'scroll.manualHint'
        )}`}
      >
        <select
          value={settings.scrollCaptureMode}
          onChange={(e) =>
            void patch({ scrollCaptureMode: e.target.value as Settings['scrollCaptureMode'] })
          }
        >
          <option value="manual">{t('scroll.manual')}</option>
          <option value="auto">{t('scroll.auto')}</option>
        </select>
      </Row>

      <ProfileManager settings={settings} patch={patch} />
    </section>
  );
}

// ──────────────────────────── Context packs ────────────────────────────

const PROFILE_LABEL: Record<Settings['promptProfileId'], UIKey> = {
  interview: 'beh.profInterview',
  meeting: 'beh.profMeeting',
  lecture: 'beh.profLecture',
  support: 'beh.profSupport',
  coding: 'overlay.profileCoding',
  quiz: 'overlay.profileQuiz',
  general: 'beh.profGeneral',
  interpreter: 'beh.profInterpreter',
  custom: 'beh.profCustom',
};

/** What to ask the user for in each slot, and why it's worth filling in. */
const SLOT_HELP: Record<ContextKind, { placeholder: UIKey; hint: UIKey }> = {
  cv: { placeholder: 'ctx.cvPlaceholder', hint: 'ctx.cvHint' },
  job: { placeholder: 'ctx.jobPlaceholder', hint: 'ctx.jobHint' },
  qa: { placeholder: 'ctx.qaPlaceholder', hint: 'ctx.qaHint' },
  vocabulary: { placeholder: 'ctx.vocabularyPlaceholder', hint: 'ctx.vocabularyHint' },
  notes: { placeholder: 'ctx.notesPlaceholder', hint: 'ctx.notesHint' },
};

/**
 * The name of each kind, **for the interface**.
 *
 * `CONTEXT_KIND_LABEL` from `shared/types.ts` stays as it is and in Spanish:
 * `prompt.ts` uses it to label the blocks sent to the model, and the prompts
 * aren't translated. They're two uses of the same concept with different
 * recipients —a person and a model— and mixing them would put an untranslated key
 * inside the system prompt.
 */
const CONTEXT_KIND_KEY: Record<ContextKind, UIKey> = {
  cv: 'ctx.kindCv',
  job: 'ctx.kindJob',
  qa: 'ctx.kindQa',
  vocabulary: 'ctx.kindVocabulary',
  notes: 'ctx.kindNotes',
};

/**
 * Profile-guided context.
 *
 * Before, this was a list of named free-text boxes, all active at once in any
 * meeting. It worked, but it left the user two things they shouldn't have to
 * solve: **what** to prepare, and **remembering to enable and disable** the packs
 * when switching meeting type.
 *
 * Now the active profile rules: it shows its named slots and only that material
 * reaches the model. Underneath they're still packs, so whoever wants something
 * different adds it below.
 */
/** Icon of each context kind in its tile. */
const KIND_ICON: Record<ContextKind, IconName> = {
  cv: 'user',
  job: 'briefcase',
  qa: 'message',
  vocabulary: 'book',
  notes: 'file',
};

function ContextCard({ settings, patch }: { settings: Settings; patch: PatchFn }) {
  const t = useT();
  const packs = settings.contextPacks;
  const profile = settings.promptProfileId;
  const slots = PROFILE_SLOTS[profile];

  // Which tile is open in the editor: a profile slot (by kind) or an own pack
  // (by id). `null` = just the grid.
  const [sel, setSel] = useState<
    { type: 'slot'; kind: ContextKind } | { type: 'pack'; id: string } | null
  >(null);

  const write = (next: ContextPack[]): void => void patch({ contextPacks: next });

  const update = (id: string, changes: Partial<ContextPack>): void =>
    write(packs.map((p) => (p.id === id ? { ...p, ...changes } : p)));

  const remove = (id: string): void => {
    write(packs.filter((p) => p.id !== id));
    setSel(null);
  };

  /** This slot's pack for the active profile, if it already exists. */
  const slotPack = (kind: ContextKind): ContextPack | undefined =>
    packs.find((p) => p.kind === kind && p.profiles.includes(profile));

  /**
   * Writes to a slot, creating it if needed. It's created on the first character
   * and not on selecting it: otherwise strolling through the tiles would leave
   * empty packs scattered around.
   */
  const writeSlot = (kind: ContextKind, content: string): void => {
    const existing = slotPack(kind);
    if (existing) {
      update(existing.id, { content });
      return;
    }
    write([
      ...packs,
      {
        id: crypto.randomUUID(),
        name: t(CONTEXT_KIND_KEY[kind]),
        content,
        enabled: true,
        kind,
        profiles: [profile],
      },
    ]);
  };

  const addOwn = (): void => {
    const id = crypto.randomUUID();
    write([
      ...packs,
      {
        id,
        name: t('ctx.newName'),
        content: '',
        enabled: true,
        kind: 'notes',
        // No profiles = applied always, which is how everything behaved before
        // the profiles existed.
        profiles: [],
      },
    ]);
    setSel({ type: 'pack', id });
  };

  // The ones that don't fill a slot of the active profile: the user's own packs
  // and those of other profiles, worth being able to see and edit without
  // switching mode.
  const others = packs.filter((p) => !slots.includes(p.kind) || !p.profiles.includes(profile));
  const activeNow = packsForProfile(packs, profile).filter((p) => p.content.trim());
  const isActive = (pack?: ContextPack): boolean =>
    !!pack && activeNow.some((a) => a.id === pack.id);

  const editing = sel?.type === 'pack' ? packs.find((p) => p.id === sel.id) : undefined;

  return (
    <section className="card">
      <div className="ctxbar ctxbar--first">
        <span className="ctxbar__label">{t('ctx.preparingFor')}</span>
        <strong className="ctxbar__profile">{t(PROFILE_LABEL[profile])}</strong>
        <span className="ctxbar__spacer" />
        <span className="ctxbar__active">
          {activeNow.length
            ? t('ctx.inUse', {
                count: activeNow.length,
                names: activeNow.map((pack) => pack.name).join(', '),
              })
            : t('ctx.nothingActive')}
        </span>
      </div>

      <div className="ctxgrid">
        {slots.map((kind) => (
          <ContextTile
            key={kind}
            icon={KIND_ICON[kind]}
            name={t(CONTEXT_KIND_KEY[kind])}
            content={slotPack(kind)?.content}
            active={isActive(slotPack(kind))}
            selected={sel?.type === 'slot' && sel.kind === kind}
            onClick={() => setSel({ type: 'slot', kind })}
          />
        ))}

        {others.map((pack) => (
          <ContextTile
            key={pack.id}
            icon={KIND_ICON[pack.kind]}
            name={pack.name || t('ctx.newName')}
            kindLabel={t(CONTEXT_KIND_KEY[pack.kind])}
            content={pack.content}
            active={isActive(pack)}
            selected={sel?.type === 'pack' && sel.id === pack.id}
            onClick={() => setSel({ type: 'pack', id: pack.id })}
          />
        ))}

        <button type="button" className="ctxtile ctxtile--add" onClick={addOwn}>
          <span className="ctxtile__plus">
            <Icon name="plus" size={20} />
          </span>
          <span className="ctxtile__addlabel">{t('ctx.addOwn')}</span>
        </button>
      </div>

      {sel?.type === 'slot' && (
        <SlotEditor
          kind={sel.kind}
          pack={slotPack(sel.kind)}
          onChange={(content) => writeSlot(sel.kind, content)}
          onToggle={(on) => {
            const existing = slotPack(sel.kind);
            if (existing) update(existing.id, { enabled: on });
          }}
          onClose={() => setSel(null)}
        />
      )}

      {editing && (
        <div className="ctxeditor">
          <div className="ctxeditor__head">
            <input
              type="text"
              value={editing.name}
              onChange={(e) => update(editing.id, { name: e.target.value })}
            />
            <select
              value={editing.kind}
              onChange={(e) => update(editing.id, { kind: e.target.value as ContextKind })}
            >
              {(Object.keys(CONTEXT_KIND_KEY) as ContextKind[]).map((k) => (
                <option key={k} value={k}>
                  {t(CONTEXT_KIND_KEY[k])}
                </option>
              ))}
            </select>
            <Switch on={editing.enabled} onChange={(v) => update(editing.id, { enabled: v })} />
            <span className="ctxbar__spacer" />
            <button className="btn btn--danger" onClick={() => remove(editing.id)}>
              {t('ctx.remove')}
            </button>
            <button className="btn" onClick={() => setSel(null)}>
              {t('ctx.close')}
            </button>
          </div>
          <div className="pack__profiles">
            {(Object.keys(PROFILE_LABEL) as Settings['promptProfileId'][])
              // `general` is a screen-only profile, never chosen by hand, so it
              // isn't offered as a pack target.
              .filter((p) => p !== 'general')
              .map((p) => (
              <label key={p} className="pack__profile">
                <input
                  type="checkbox"
                  checked={editing.profiles.includes(p)}
                  onChange={(e) =>
                    update(editing.id, {
                      profiles: e.target.checked
                        ? [...editing.profiles, p]
                        : editing.profiles.filter((x) => x !== p),
                    })
                  }
                />
                {t(PROFILE_LABEL[p])}
              </label>
            ))}
          </div>
          <textarea
            placeholder={t('ctx.pasteHere')}
            value={editing.content}
            onChange={(e) => update(editing.id, { content: e.target.value })}
          />
          <FileDrop onText={(text) => update(editing.id, { content: text })} />
        </div>
      )}
    </section>
  );
}

/** A grid tile: a typed slot or an own pack. */
function ContextTile({
  icon,
  name,
  kindLabel,
  content,
  active,
  selected,
  onClick,
}: {
  icon: IconName;
  name: string;
  kindLabel?: string;
  content: string | undefined;
  active: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const t = useT();
  const text = content?.trim();
  return (
    <button
      type="button"
      className={`ctxtile${selected ? ' ctxtile--sel' : ''}${active ? ' ctxtile--on' : ''}`}
      onClick={onClick}
    >
      {active && <span className="ctxtile__badge">{t('ctx.badgeInUse')}</span>}
      <span className="ctxtile__ico">
        <Icon name={icon} />
      </span>
      <span className="ctxtile__name">{name}</span>
      {kindLabel && <span className="ctxtile__kind">{kindLabel}</span>}
      <span className={`ctxtile__snip${text ? '' : ' ctxtile__snip--empty'}`}>
        {text || t('ctx.tileEmpty')}
      </span>
    </button>
  );
}

/** Editor of a typed slot of the active profile (CV, job offer, Q&A…). */
function SlotEditor({
  kind,
  pack,
  onChange,
  onToggle,
  onClose,
}: {
  kind: ContextKind;
  pack: ContextPack | undefined;
  onChange: (content: string) => void;
  onToggle: (on: boolean) => void;
  onClose: () => void;
}) {
  const t = useT();
  const help = SLOT_HELP[kind];
  return (
    <div className="ctxeditor">
      <div className="ctxeditor__head">
        <strong className="slot__title">{t(CONTEXT_KIND_KEY[kind])}</strong>
        {pack && <Switch on={pack.enabled} onChange={onToggle} />}
        <span className="ctxbar__spacer" />
        <button className="btn" onClick={onClose}>
          {t('ctx.close')}
        </button>
      </div>
      <p className="slot__hint">{t(help.hint)}</p>
      <textarea
        placeholder={t(help.placeholder)}
        value={pack?.content ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
      <FileDrop onText={onChange} />
    </div>
  );
}

/**
 * Context-file upload zone.
 *
 * Plain text —`.txt`/`.md`— is read right here with FileReader, without crossing
 * the IPC. PDF and Word (`.docx`) go to main to parse (`context.parseFile`),
 * which is where the heavy libraries live; meanwhile "Reading…" is shown and, if
 * the file can't be read —a PDF with no text, a scan, something corrupt—, a red
 * warning instead of swallowing it silently.
 */
function FileDrop({ onText }: { onText: (text: string) => void }) {
  const t = useT();
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const read = async (file: File): Promise<void> => {
    setError(null);
    const ext = file.name.toLowerCase().split('.').pop();
    // PDF and Word: main parses them. The rest (.txt/.md) is plain text and the
    // renderer reads it itself.
    if (ext === 'pdf' || ext === 'docx') {
      setBusy(true);
      try {
        const result = await window.api.context.parseFile(file.name, await file.arrayBuffer());
        if (result.ok) onText(result.text);
        else setError(t('ctx.parseFailed'));
      } finally {
        setBusy(false);
      }
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onText(String(reader.result ?? ''));
    reader.readAsText(file);
  };

  return (
    <div
      className={`ctxdrop${over ? ' ctxdrop--over' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => ref.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') ref.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) void read(file);
      }}
    >
      <span className="ctxdrop__ico">
        <Icon name="upload" size={22} />
      </span>
      <span className="ctxdrop__t1">{busy ? t('ctx.parsing') : t('ctx.dropHint')}</span>
      <span className={`ctxdrop__t2${error ? ' ctxdrop__t2--err' : ''}`}>
        {error ?? t('ctx.import')}
      </span>
      <input
        ref={ref}
        type="file"
        accept=".txt,.md,.pdf,.docx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void read(file);
          // It's cleared so choosing the SAME file again fires the event.
          e.target.value = '';
        }}
      />
    </div>
  );
}

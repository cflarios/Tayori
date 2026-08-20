import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PiperStatus, TtsPiperProgress, WhisperProgress } from '@shared/ipc';
import { PIPER_VOICES, piperVoiceById } from '@shared/piper-voices';
import {
  activeHotkeys,
  adviseLocalModels,
  applyModelPreset,
  autoTriggerIsInert,
  clampFontScale,
  DECOY_ICONS,
  EDITABLE_PROFILES,
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
  OPENAI_TTS_VOICES,
} from '@shared/types';
import {
  acceleratorFromEvent,
  duplicateAccelerators,
  formatAccelerator,
} from '@shared/accelerator';
import {
  translate,
  uiTable,
  DEFAULT_UI_LANG,
  UI_LANG_LABEL,
  UI_LANGS,
  type UIKey,
  type UILang,
} from '@shared/i18n';
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
  AutoTriggerMode,
  CaptureStatus,
  ContextPack,
  Conversation,
  DecoyIcon,
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
  TTSProviderId,
  SystemSpecs,
  ContextKind,
  UpdateInfo,
} from '@shared/types';

/** Sibling projects born from this one. */
const TAYORI_WEB_URL = 'https://tayori-web.cflarios.workers.dev/';
const TAYORI_DOCS_URL = `${TAYORI_WEB_URL}docs`;
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

/** Built-in profile default labels (before any rename). */
const PROFILE_BEH_LABEL: Partial<Record<PromptProfileId, UIKey>> = {
  interview: 'beh.profInterview',
  meeting: 'beh.profMeeting',
  lecture: 'beh.profLecture',
  support: 'beh.profSupport',
  coding: 'beh.profCoding',
  quiz: 'beh.profQuiz',
};

/** A downward/rightward chevron for the expand toggle. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms ease' }}
    >
      <path d="M4.5 2.5 8 6l-3.5 3.5" />
    </svg>
  );
}

type SelectOption = { value: string; label: string; disabled?: boolean };
type SelectGroup = { label: string; options: SelectOption[] };

/**
 * A themed dropdown that replaces the native `<select>`, whose OS-drawn popup
 * can't be styled and clashed with the dark UI. Same job — pick one value from a
 * list — but the menu is ours: dark surface, accent on the active item, keyboard
 * and click-outside handling. `variant="inline"` is the borderless blue trigger
 * the Context header uses; the default `box` matches the app's form controls.
 */
function Select({
  value,
  onChange,
  options = [],
  groups = [],
  placeholder,
  disabled,
  ariaLabel,
  variant = 'box',
}: {
  value: string;
  onChange: (value: string) => void;
  options?: SelectOption[];
  groups?: SelectGroup[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  variant?: 'box' | 'inline';
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: PointerEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [open]);

  // On opening, move focus to the selected item so arrows and Enter drive it
  // from the keyboard the way a native select does.
  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    if (!root) return;
    const sel = root.querySelector<HTMLButtonElement>('.selopt[aria-selected="true"]');
    (sel ?? root.querySelector<HTMLButtonElement>('.selopt'))?.focus();
  }, [open]);

  // Keep the menu on screen. It opens growing rightward (CSS `left: 0`); if that
  // overflows the app's right edge —which happens for selects near it— flip it to
  // grow leftward instead. Done imperatively before paint (no state round-trip,
  // no visible jump). A blanket right-anchor used to push left-placed selects
  // (the model picker, with an input beside it) off under the sidebar.
  useLayoutEffect(() => {
    if (!open) return;
    const menu = rootRef.current?.querySelector<HTMLElement>('.selmenu');
    if (menu && menu.getBoundingClientRect().right > window.innerWidth - 12) {
      menu.style.left = 'auto';
      menu.style.right = '0';
    }
  }, [open]);

  const current = [...options, ...groups.flatMap((g) => g.options)].find((o) => o.value === value);
  const label = current?.label ?? placeholder ?? value;
  const pick = (v: string) => (): void => {
    setOpen(false);
    onChange(v);
  };

  const optButton = (o: SelectOption) => {
    const on = o.value === value;
    return (
      <button
        key={o.value}
        type="button"
        role="option"
        aria-selected={on}
        disabled={o.disabled}
        className={`selopt${on ? ' selopt--on' : ''}`}
        onClick={pick(o.value)}
      >
        <span>{o.label}</span>
        {on && (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M2.5 6.2 5 8.5 9.5 3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
    );
  };

  return (
    <div className={`sel sel--${variant}`} ref={rootRef}>
      <button
        type="button"
        className={`selbtn selbtn--${variant}${open ? ' selbtn--on' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (!open && e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className={`selbtn__label${current ? '' : ' selbtn__label--ph'}`}>{label}</span>
        <svg className="selbtn__caret" width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
          <path
            d="M2 3.5 5 6.5 8 3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          className="selmenu"
          role="listbox"
          onKeyDown={(e) => {
            const items = Array.from(
              e.currentTarget.querySelectorAll<HTMLButtonElement>('.selopt:not(:disabled)')
            );
            if (!items.length) return;
            const i = items.indexOf(document.activeElement as HTMLButtonElement);
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              items[(i + 1 + items.length) % items.length]?.focus();
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              items[(i - 1 + items.length) % items.length]?.focus();
            } else if (e.key === 'Home') {
              e.preventDefault();
              items[0]?.focus();
            } else if (e.key === 'End') {
              e.preventDefault();
              items[items.length - 1]?.focus();
            }
          }}
        >
          {options.map(optButton)}
          {groups.map((g) => (
            <div key={g.label} role="group">
              <div className="selsep">{g.label}</div>
              {g.options.map(optButton)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The profile picker's shared model: the same options, value encoding and patch
 * used by both the Behaviour dropdown and the Context header. Customs ride under
 * `custom:<id>` so a single string value carries any of them.
 */
function useProfileSelect(
  settings: Settings,
  patch: PatchFn
): { value: string; options: SelectOption[]; groups: SelectGroup[]; onChange: (v: string) => void } {
  const t = useT();
  const builtins = EDITABLE_PROFILES.filter((id) => !settings.deletedProfiles.includes(id));
  const options: SelectOption[] = [
    ...builtins.map((id) => ({
      value: id,
      label: settings.builtinOverrides[id]?.name || t(PROFILE_BEH_LABEL[id] ?? 'beh.profCustom'),
    })),
    { value: 'interpreter', label: t('beh.profInterpreter') },
  ];
  const groups: SelectGroup[] = settings.customProfiles.length
    ? [
        {
          label: t('beh.profCustomTitle'),
          options: settings.customProfiles.map((p) => ({
            value: `custom:${p.id}`,
            label: p.name || t('beh.profCustom'),
          })),
        },
      ]
    : [];
  const value =
    settings.promptProfileId === 'custom'
      ? `custom:${settings.activeCustomId}`
      : settings.promptProfileId;
  const onChange = (v: string): void => {
    if (v.startsWith('custom:')) {
      void patch({ promptProfileId: 'custom', activeCustomId: v.slice('custom:'.length) });
    } else {
      void patch({ promptProfileId: v as Settings['promptProfileId'] });
    }
  };
  return { value, options, groups, onChange };
}

/** The mark for each built-in, so the list scans as a list and not six rows. */
const PROFILE_ICON: Partial<Record<PromptProfileId, IconName>> = {
  interview: 'briefcase',
  meeting: 'message',
  lecture: 'book',
  support: 'key',
  coding: 'monitor',
  quiz: 'check',
};

/**
 * One row of the profile list: what it is, what it reads, and what you can do
 * to it.
 *
 * It used to be a name box, a naked switch and an ✕. Three things the list never
 * said, and all three are here now: **which profile is in use** (you had to read
 * the picker in another card to find out), **what context each one reads** —the
 * app already knows, from `PROFILE_SLOTS`, and never showed it— and **which are
 * hidden**, which is why a hidden row is dimmed and keeps its eye lit.
 *
 * The actions stay visible at low contrast rather than appearing on hover: an
 * affordance nobody can see is one nobody uses, and hover has no touch
 * equivalent.
 */
function ProfileRow({
  icon,
  name,
  placeholder,
  slots,
  active,
  visible,
  edited,
  open,
  onName,
  onUse,
  onToggleVisible,
  onDuplicate,
  onRemove,
  onOpen,
  removeTitle,
  children,
}: {
  icon: IconName;
  name: string;
  placeholder?: string;
  slots: ContextKind[];
  active: boolean;
  visible: boolean;
  edited?: boolean;
  open: boolean;
  onName: (v: string) => void;
  onUse: () => void;
  onToggleVisible: (v: boolean) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onOpen: () => void;
  removeTitle: string;
  children?: React.ReactNode;
}) {
  const t = useT();
  const cls = [
    'profcard',
    open ? 'profcard--open' : '',
    active ? 'profcard--active' : '',
    visible ? '' : 'profcard--hidden',
  ]
    .filter(Boolean)
    .join(' ');
  const eyeTitle = visible ? t('beh.profShown') : t('beh.profHiddenTitle');
  return (
    <div className={cls}>
      <div className="profcard__head">
        <button
          type="button"
          className="profcard__expand"
          aria-expanded={open}
          aria-label={t('beh.profExpand')}
          onClick={onOpen}
        >
          <Chevron open={open} />
        </button>

        <span className="profcard__icon">
          <Icon name={icon} size={15} />
        </span>

        <div className="profcard__main">
          <input
            type="text"
            className="profcard__name"
            value={name}
            placeholder={placeholder}
            onChange={(e) => onName(e.target.value)}
          />
          {slots.length > 0 && (
            <div className="profcard__slots">
              {slots.map((kind) => (
                <span key={kind} className="profslot">
                  {t(CONTEXT_KIND_KEY[kind])}
                </span>
              ))}
            </div>
          )}
        </div>

        {active ? (
          <span className="badge badge--active">{t('beh.profActive')}</span>
        ) : (
          <button type="button" className="profuse" onClick={onUse}>
            {t('beh.profUse')}
          </button>
        )}
        {edited && <span className="badge badge--missing">{t('beh.profEdited')}</span>}

        <div className="profcard__acts">
          <button
            type="button"
            className={`profact${visible ? '' : ' profact--on'}`}
            title={eyeTitle}
            aria-label={eyeTitle}
            aria-pressed={visible}
            onClick={() => onToggleVisible(!visible)}
          >
            <Icon name={visible ? 'eye' : 'eyeOff'} size={15} />
          </button>
          <button
            type="button"
            className="profact"
            title={t('beh.profDuplicate')}
            aria-label={t('beh.profDuplicate')}
            onClick={onDuplicate}
          >
            <Icon name="copy" size={15} />
          </button>
          <button
            type="button"
            className="profact profact--danger"
            title={removeTitle}
            aria-label={removeTitle}
            onClick={onRemove}
          >
            <Icon name="trash" size={15} />
          </button>
        </div>
      </div>

      {open && <div className="profcard__body">{children}</div>}
    </div>
  );
}

/**
 * Create, edit, hide, remove and restore answer profiles — built-ins and
 * custom alike.
 *
 * Every profile is one editable card: a name and a prompt. The built-ins ship
 * with our default name and prompt (fetched from the main), and the user can
 * rewrite either, hide it from the overlay, remove it, or reset it back to ours.
 * A custom is the same card with an empty start. Removing is a soft delete —
 * built-ins and customs both go to a "removed" bucket and come back one by one
 * or all at once. Nothing may strand the picker with nothing to choose, and the
 * active profile falls back whenever it stops being offered.
 *
 * Duplicating is the other way in, and the one people actually reach for: a
 * custom profile almost always starts as "the interview one, but…", and before
 * this the only path was «New profile» and an empty box.
 */
function ProfileManager({
  settings,
  patch,
}: {
  settings: Settings;
  patch: (p: Partial<Settings>) => void;
}) {
  const t = useT();
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  // Removed profiles fold away: it's a recovery path, not a second list to read
  // past every time you come here.
  const [removedOpen, setRemovedOpen] = useState(false);
  useEffect(() => {
    void window.api.settings.profileDefaults().then(setDefaults);
  }, [settings.uiLanguage]);

  // What the overlay picker can offer under a prospective state; a change that
  // would empty it is refused, and the active profile falls back if dropped.
  const availableBuiltins = (hidden: PromptProfileId[], removed: PromptProfileId[]) =>
    EDITABLE_PROFILES.filter((p) => !hidden.includes(p) && !removed.includes(p));
  const visibleCustoms = (customs: Settings['customProfiles']) => customs.filter((c) => !c.hidden);
  const strands = (
    hidden: PromptProfileId[],
    removed: PromptProfileId[],
    customs: Settings['customProfiles']
  ) => availableBuiltins(hidden, removed).length === 0 && visibleCustoms(customs).length === 0;
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

  const builtinName = (id: PromptProfileId): string =>
    settings.builtinOverrides[id]?.name ?? t(PROFILE_BEH_LABEL[id] ?? 'beh.profCustom');

  /** The prompt a profile is actually running with, ours or the rewritten one. */
  const builtinPrompt = (id: PromptProfileId): string =>
    settings.builtinOverrides[id]?.prompt ?? defaults[id] ?? '';

  /**
   * A free id for a new custom profile.
   *
   * Counted rather than stamped with `Date.now()`: two profiles created inside
   * the same millisecond would collide, and reading the clock while rendering is
   * not something a component may do. The removed ones count as taken — they can
   * come back.
   */
  const freshCustomId = (): string => {
    const taken = new Set([
      ...settings.customProfiles.map((p) => p.id),
      ...settings.removedCustoms.map((p) => p.id),
    ]);
    let n = taken.size + 1;
    while (taken.has(`custom-${n}`)) n += 1;
    return `custom-${n}`;
  };

  // ── Built-in edits ──
  const setOverride = (id: string, field: 'name' | 'prompt', value: string): void => {
    patch({
      builtinOverrides: {
        ...settings.builtinOverrides,
        [id]: { ...settings.builtinOverrides[id], [field]: value },
      },
    });
  };
  const resetBuiltin = (id: string): void => {
    const next = { ...settings.builtinOverrides };
    delete next[id];
    patch({ builtinOverrides: next });
  };

  const setHidden = (id: PromptProfileId, visible: boolean): void => {
    const hiddenProfiles = visible
      ? settings.hiddenProfiles.filter((h) => h !== id)
      : [...settings.hiddenProfiles, id];
    if (!visible && strands(hiddenProfiles, settings.deletedProfiles, settings.customProfiles))
      return;
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
  const restoreBuiltin = (id: PromptProfileId): void =>
    patch({ deletedProfiles: settings.deletedProfiles.filter((d) => d !== id) });

  // ── Custom edits ──
  const addCustom = (): void => {
    const id = freshCustomId();
    patch({
      customProfiles: [...settings.customProfiles, { id, name: '', prompt: '' }],
      promptProfileId: 'custom',
      activeCustomId: id,
    });
    setOpenId(id);
  };

  /**
   * Copy a profile into a new custom one. It carries the prompt it was running
   * with —ours for an untouched built-in— so the copy starts where the original
   * left off, which is the whole point of copying it.
   */
  const duplicate = (name: string, prompt: string): void => {
    const id = freshCustomId();
    patch({
      customProfiles: [
        ...settings.customProfiles,
        { id, name: t('beh.profCopy', { name }), prompt },
      ],
      promptProfileId: 'custom',
      activeCustomId: id,
    });
    setOpenId(id);
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
    if (!visible && strands(settings.hiddenProfiles, settings.deletedProfiles, customProfiles))
      return;
    const moveActive =
      !visible && settings.promptProfileId === 'custom' && settings.activeCustomId === id
        ? fallback(settings.hiddenProfiles, settings.deletedProfiles, customProfiles)
        : {};
    patch({ customProfiles, ...moveActive });
  };
  const removeCustom = (id: string): void => {
    const gone = settings.customProfiles.find((p) => p.id === id);
    if (!gone) return;
    const customProfiles = settings.customProfiles.filter((p) => p.id !== id);
    if (strands(settings.hiddenProfiles, settings.deletedProfiles, customProfiles)) return;
    const wasActive = settings.promptProfileId === 'custom' && settings.activeCustomId === id;
    patch({
      customProfiles,
      removedCustoms: [...settings.removedCustoms, gone],
      ...(wasActive
        ? fallback(settings.hiddenProfiles, settings.deletedProfiles, customProfiles)
        : {}),
    });
  };
  const restoreCustom = (id: string): void => {
    const back = settings.removedCustoms.find((p) => p.id === id);
    if (!back) return;
    patch({
      removedCustoms: settings.removedCustoms.filter((p) => p.id !== id),
      customProfiles: [...settings.customProfiles, back],
    });
  };
  // Drop a removed custom for good. Only customs can go: the built-ins are the
  // app's own, so «removing» one just hides it (`deletedProfiles`) and it can
  // always come back — there's nothing to delete.
  const deleteCustom = (id: string): void =>
    patch({ removedCustoms: settings.removedCustoms.filter((p) => p.id !== id) });
  const restoreAll = (): void =>
    patch({
      deletedProfiles: [],
      removedCustoms: [],
      customProfiles: [...settings.customProfiles, ...settings.removedCustoms],
    });

  const removedBuiltins = EDITABLE_PROFILES.filter((id) => settings.deletedProfiles.includes(id));
  const removedCount = removedBuiltins.length + settings.removedCustoms.length;

  return (
    <section className="card">
      <div className="card__title">{t('beh.profCustomTitle')}</div>
      <div className="card__hint">{t('beh.profListHint')}</div>

      <div className="profmgr">
        <div className="profmgr__list">
          {EDITABLE_PROFILES.filter((id) => !settings.deletedProfiles.includes(id)).map((id) => {
            const override = settings.builtinOverrides[id];
            const edited = override?.name !== undefined || override?.prompt !== undefined;
            return (
              <ProfileRow
                key={id}
                icon={PROFILE_ICON[id] ?? 'sparkles'}
                name={builtinName(id)}
                slots={PROFILE_SLOTS[id]}
                active={settings.promptProfileId === id}
                visible={!settings.hiddenProfiles.includes(id)}
                edited={edited}
                open={openId === id}
                onName={(v) => setOverride(id, 'name', v)}
                onUse={() => patch({ promptProfileId: id })}
                onToggleVisible={(v) => setHidden(id, v)}
                onDuplicate={() => duplicate(builtinName(id), builtinPrompt(id))}
                onRemove={() => removeBuiltin(id)}
                onOpen={() => setOpenId(openId === id ? null : id)}
                removeTitle={t('beh.profRemove')}
              >
                <div className="profcard__label">{t('beh.profSystemPrompt')}</div>
                <textarea
                  className="profmgr__prompt"
                  value={builtinPrompt(id)}
                  placeholder={t('beh.customPlaceholder')}
                  onChange={(e) => setOverride(id, 'prompt', e.target.value)}
                />
                <div className="profcard__foot">
                  <span className="row__desc">{t('beh.profPromptHint')}</span>
                  {edited && (
                    <button
                      type="button"
                      className="profmgr__restore"
                      onClick={() => resetBuiltin(id)}
                    >
                      {t('beh.profReset')}
                    </button>
                  )}
                </div>
              </ProfileRow>
            );
          })}

          {settings.customProfiles.map((p) => (
            <ProfileRow
              key={p.id}
              icon="sparkles"
              name={p.name}
              placeholder={t('beh.profNamePlaceholder')}
              slots={PROFILE_SLOTS.custom}
              active={settings.promptProfileId === 'custom' && settings.activeCustomId === p.id}
              visible={!p.hidden}
              open={openId === p.id}
              onName={(v) => editCustom(p.id, 'name', v)}
              onUse={() => patch({ promptProfileId: 'custom', activeCustomId: p.id })}
              onToggleVisible={(v) => setCustomHidden(p.id, v)}
              onDuplicate={() => duplicate(p.name || t('beh.profUntitled'), p.prompt)}
              onRemove={() => removeCustom(p.id)}
              onOpen={() => setOpenId(openId === p.id ? null : p.id)}
              removeTitle={t('beh.profDelete')}
            >
              <div className="profcard__label">{t('beh.profSystemPrompt')}</div>
              <textarea
                className="profmgr__prompt"
                value={p.prompt}
                placeholder={t('beh.customPlaceholder')}
                onChange={(e) => editCustom(p.id, 'prompt', e.target.value)}
              />
              <div className="profcard__foot">
                <span className="row__desc">{t('beh.profPromptHint')}</span>
              </div>
            </ProfileRow>
          ))}
        </div>

        <div className="profmgr__foot">
          <button type="button" className="profmgr__add" onClick={addCustom}>
            + {t('beh.profAdd')}
          </button>

          {removedCount > 0 && (
            <button
              type="button"
              className="profmgr__removedtoggle"
              aria-expanded={removedOpen}
              onClick={() => setRemovedOpen(!removedOpen)}
            >
              <Chevron open={removedOpen} />
              {t('beh.profRemovedCount', { count: removedCount })}
            </button>
          )}
        </div>

        {removedCount > 0 && removedOpen && (
          <div className="profmgr__removed">
            <div className="profmgr__removedhead">
              <span>{t('beh.profRemovedTitle')}</span>
              <button type="button" className="profmgr__restore" onClick={restoreAll}>
                {t('beh.profRestoreAll')}
              </button>
            </div>
            {removedBuiltins.map((id) => (
              <div key={id} className="profmgr__removeditem">
                <span>{builtinName(id)}</span>
                <button
                  type="button"
                  className="profmgr__restore"
                  onClick={() => restoreBuiltin(id)}
                >
                  {t('beh.profRestoreOne')}
                </button>
              </div>
            ))}
            {settings.removedCustoms.map((c) => (
              <div key={c.id} className="profmgr__removeditem">
                <span>{c.name || t('beh.profCustom')}</span>
                <div className="profmgr__removedacts">
                  <button
                    type="button"
                    className="profmgr__restore"
                    onClick={() => restoreCustom(c.id)}
                  >
                    {t('beh.profRestoreOne')}
                  </button>
                  {/* Custom-only: delete it for good, since it can't be re-created
                      like a built-in. */}
                  <button
                    type="button"
                    className="profmgr__delete"
                    aria-label={t('beh.profDeleteForever')}
                    title={t('beh.profDeleteForever')}
                    onClick={() => deleteCustom(c.id)}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
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
  /**
   * Shows as one line until it's opened.
   *
   * The keys card holds four of these and only one is ever being typed into, so
   * four open fields are three too many. The broker's password is alone in its
   * card and stays open, which is why this is a prop and not the behaviour.
   */
  collapsible = false,
  /** What this key unlocks. Replaces the hint while the field is closed. */
  use,
}: {
  label: UIKey;
  hint: UIKey;
  present: boolean;
  placeholder?: UIKey;
  onSave: (value: string) => Promise<void>;
  onClear: () => Promise<void>;
  onTest?: () => Promise<{ ok: boolean; error?: string }>;
  collapsible?: boolean;
  use?: UIKey;
}) {
  const t = useT();
  const [open, setOpen] = useState(!collapsible);
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
    <div className="keyrow">
      <div className={collapsible ? 'keyrow__head keyrow__head--list' : 'keyrow__head'}>
        <span className="row__label">{t(label)}</span>
        <span className={present ? 'badge badge--ok' : 'badge badge--missing'}>
          {present ? t('keys.configured') : t('keys.missing')}
        </span>
        {collapsible && (
          <button
            className="btn btn--small"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? t('keys.close') : present ? t('keys.change') : t('keys.add')}
          </button>
        )}
      </div>

      {/* Closed, the line says what the key is for; open, where to get it. */}
      {!open && use && <div className="row__desc">{t(use)}</div>}

      {open && (
        <>
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
              <button
                className="btn btn--danger btn--icon"
                disabled={busy}
                onClick={() => void onClear()}
                aria-label={t('keys.clear')}
                title={t('keys.clear')}
              >
                <Icon name="trash" size={15} />
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
        </>
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
  | 'home'
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
  home: { icon: 'home', label: 'sec.home', hint: 'sec.homeHint' },
  general: { icon: 'eyeOff', label: 'sec.general', hint: 'sec.generalHint' },
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

/**
 * The sidebar, in groups.
 *
 * Thirteen items in one flat column is a list you read from the top every time,
 * because nothing in it says which ones you are looking for right now. The
 * headings answer that and only that: **when** would I open this — before the
 * call, with it running, or hardly ever. Nothing moved between sections and
 * nothing was renamed except «General», which is now called by what it decides.
 *
 * Inside each group the order is the one the guided setup already walks (who
 * answers, what it hears, what it knows), so the two agree.
 */
const NAV_GROUPS: { label: UIKey | null; ids: SectionId[] }[] = [
  // Home carries no heading: a heading over a single item names it twice.
  { label: null, ids: ['home'] },
  { label: 'nav.groupSetup', ids: ['models', 'transcription', 'audio', 'context', 'skills'] },
  { label: 'nav.groupCall', ids: ['general', 'behaviour', 'hotkeys', 'phone'] },
  { label: 'nav.groupMore', ids: ['mqtt', 'history', 'diagnostics', 'about'] },
];

/** Every section, in the order the sidebar shows them. */
const SECTION_ORDER: SectionId[] = NAV_GROUPS.flatMap((group) => group.ids);

/**
 * Locale-key prefixes that belong to each section, so the sidebar search can index
 * every string a section shows —not just its name— and a term buried in a card
 * ("microphone", "decoy", "vocabulary", "broker") still surfaces it. It leans on
 * the locale namespacing (`aud.`, `keys.`, `stt.`…); prefixes outside a dashboard
 * section (`overlay.`, `guide.`, `wiz.`, `err.`…) are simply not mapped, so their
 * text isn't searched. Keep in sync when a card moves between sections.
 */
const SECTION_SEARCH_PREFIXES: Record<SectionId, readonly string[]> = {
  home: ['home'],
  general: ['gen', 'dash'],
  audio: ['aud', 'tts'],
  phone: ['ph'],
  mqtt: ['mq', 'mqtt'],
  models: ['keys', 'presets', 'model', 'mdl', 'screen', 'local', 'ol', 'jobs'],
  transcription: ['stt'],
  behaviour: ['beh'],
  context: ['ctx'],
  skills: ['sk'],
  history: ['hist'],
  hotkeys: ['hk'],
  diagnostics: ['diag'],
  about: ['about'],
};

/**
 * Everything that is wrong right now, worst first.
 *
 * This was an inline `Partial<Record<SectionId, boolean>>` feeding the sidebar's
 * amber dots. A dot says «there is something in here» and nothing else, so the
 * only way to learn WHAT was to enter the section and find the warning. Home
 * lists the same problems with their sentence and their fix, and the two have to
 * be computed once or they drift: a dot with nothing behind it is worse than no
 * dot.
 */
type AlertId = 'stealth' | 'capture' | 'provider' | 'autoInert' | 'hotkeyFailed' | 'hotkeyDup';

interface Alert {
  id: AlertId;
  /** Whose dot lights up, and where the fix button goes when it can't fix in place. */
  section: SectionId;
  /** The combination Windows rejected, for the sentence that names it. */
  combo?: string;
}

function pendingAlerts(
  settings: Settings,
  presence: SecretsPresence,
  status: CaptureStatus,
  failedHotkeys: string[]
): Alert[] {
  const alerts: Alert[] = [];
  // Being seen comes first: it's the only one whose cost lands while you read it.
  if (!settings.stealthEnabled) alerts.push({ id: 'stealth', section: 'general' });
  if (status.state === 'error') alerts.push({ id: 'capture', section: 'audio' });
  if (!providerIsReady(settings, presence)) alerts.push({ id: 'provider', section: 'models' });
  if (autoTriggerIsInert(settings)) alerts.push({ id: 'autoInert', section: 'behaviour' });
  for (const combo of failedHotkeys) alerts.push({ id: 'hotkeyFailed', section: 'hotkeys', combo });
  // Over the ACTIVE ones only: a disabled shortcut doesn't register, so it can't
  // clash. This is the same rule `HotkeysCard` applies to paint its own warning.
  if (duplicateAccelerators(activeHotkeys(settings)).size > 0)
    alerts.push({ id: 'hotkeyDup', section: 'hotkeys' });
  return alerts;
}

/** How each alert reads, and which button ends it. */
const ALERT_COPY: Record<
  AlertId,
  { icon: IconName; tone: 'warn' | 'danger'; title: UIKey; desc: UIKey; action: UIKey }
> = {
  stealth: {
    icon: 'eyeOff',
    tone: 'danger',
    title: 'home.alertStealth',
    desc: 'home.alertStealthDesc',
    action: 'home.alertStealthAct',
  },
  capture: {
    icon: 'mic',
    tone: 'danger',
    title: 'home.alertCapture',
    // Replaced at render by what the capture actually said; this is the fallback.
    desc: 'overlay.unknownError',
    action: 'home.alertCaptureAct',
  },
  provider: {
    icon: 'key',
    tone: 'warn',
    title: 'home.alertProvider',
    desc: 'home.alertProviderDesc',
    action: 'home.alertProviderAct',
  },
  autoInert: {
    icon: 'bolt',
    tone: 'warn',
    title: 'home.alertAuto',
    desc: 'home.alertAutoDesc',
    action: 'home.alertAutoAct',
  },
  hotkeyFailed: {
    icon: 'keyboard',
    tone: 'warn',
    title: 'home.alertHotkey',
    desc: 'home.alertHotkeyDesc',
    action: 'home.alertHotkeyAct',
  },
  hotkeyDup: {
    icon: 'keyboard',
    tone: 'warn',
    title: 'home.alertHotkeyDup',
    desc: 'home.alertHotkeyDupDesc',
    action: 'home.alertHotkeyAct',
  },
};

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
  return 'home';
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

/** The CSS Custom Highlight registry name for the search matches. */
const SEARCH_HL = 'nav-search';

/** Every range in `container` whose text matches `query` (case-insensitive). */
function searchRanges(container: HTMLElement, query: string): Range[] {
  const q = query.trim().toLowerCase();
  const ranges: Range[] = [];
  if (!q) return ranges;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.nodeValue ?? '').toLowerCase();
    for (let idx = text.indexOf(q); idx !== -1; idx = text.indexOf(q, idx + q.length)) {
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + q.length);
      ranges.push(range);
    }
  }
  return ranges;
}

/**
 * Paints (or clears) the search highlight over the matches in the content pane,
 * using the CSS Custom Highlight API — no DOM mutation, so React's tree is
 * untouched. A no-op where the API is missing; the jump-to-match still works.
 */
function paintHighlight(container: HTMLElement, query: string): void {
  const HL = (globalThis as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
  const reg = (CSS as { highlights?: { set(k: string, v: unknown): void; delete(k: string): void } })
    .highlights;
  if (!HL || !reg) return;
  reg.delete(SEARCH_HL);
  const ranges = searchRanges(container, query);
  if (ranges.length) reg.set(SEARCH_HL, new HL(...ranges));
}

/** Scrolls the first match in the content pane into view. */
function scrollToMatch(container: HTMLElement, query: string): void {
  const first = searchRanges(container, query)[0];
  first?.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
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
  /** Sidebar search: filters the sections by any text they contain (see `searchBlobs`). */
  const [navQuery, setNavQuery] = useState('');
  /** Set when a result is chosen, to scroll to its first match after navigating.
      The nonce makes repeated jumps to the same query re-fire the effect. */
  const [searchJump, setSearchJump] = useState<{ query: string; nonce: number }>({
    query: '',
    nonce: 0,
  });
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

  // Paint the search term over the shown section, live as you type. A frame lets
  // the section render first; the cleanup clears the highlight on unmount.
  useEffect(() => {
    const container = bodyRef.current;
    if (!container) return;
    const raf = requestAnimationFrame(() => paintHighlight(container, navQuery));
    return () => cancelAnimationFrame(raf);
  }, [section, navQuery]);

  useEffect(
    () => () => {
      (CSS as { highlights?: { delete(k: string): void } }).highlights?.delete(SEARCH_HL);
    },
    []
  );

  // Jump to the first match when a result is chosen (click or Enter). Bumped by a
  // counter so it fires even if the section and query didn't change.
  useEffect(() => {
    if (!searchJump.nonce) return;
    const container = bodyRef.current;
    if (!container) return;
    const raf = requestAnimationFrame(() => scrollToMatch(container, searchJump.query));
    return () => cancelAnimationFrame(raf);
  }, [searchJump]);

  const patch = useCallback(async (p: Partial<Settings>): Promise<void> => {
    setSettings(await window.api.settings.update(p));
  }, []);

  const saveSecret = useCallback(async (key: SecretKey, value: string): Promise<void> => {
    setPresence(await window.api.secrets.set(key, value));
  }, []);

  const clearSecret = useCallback(async (key: SecretKey): Promise<void> => {
    setPresence(await window.api.secrets.clear(key));
  }, []);

  // Search index: for each section, all of its visible strings (label, hint and
  // every locale entry under its namespaces) in the active language, lowercased.
  // Rebuilt only when the interface language changes. It's up here, before the
  // early returns, so the hook order never changes.
  const searchLang = settings?.uiLanguage ?? DEFAULT_UI_LANG;
  const searchBlobs = useMemo(() => {
    const table = uiTable(searchLang);
    const entries = Object.entries(table) as [string, string][];
    const blobs = {} as Record<SectionId, string>;
    for (const id of SECTION_ORDER) {
      const prefixes = SECTION_SEARCH_PREFIXES[id];
      // The section id and the locale keys go in too, so internal terms that
      // aren't in the visible text still match: "hotkey" finds Shortcuts (id
      // `hotkeys`), "decoy" finds General (key `gen.decoy`, even if the label
      // reads "disguise"). Keys are English, a bonus when the UI is in Spanish.
      const parts = [id, table[SECTIONS[id].label], table[SECTIONS[id].hint]];
      for (const [key, value] of entries) {
        if (prefixes.some((p) => key.startsWith(`${p}.`))) parts.push(value, key);
      }
      blobs[id] = parts.join(' ').toLowerCase();
    }
    return blobs;
  }, [searchLang]);

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
   * Computed once and used twice: Home lists them with their fix, the sidebar
   * marks the sections they live in. See `pendingAlerts`.
   */
  const alerts = pendingAlerts(settings, presence, status, failedHotkeys);
  const alerted = new Set(alerts.map((alert) => alert.section));

  // Filter the sidebar against the search index (built above, before the early
  // returns), so any keyword shown anywhere in a section —not only its name—
  // finds it.
  const q = navQuery.trim().toLowerCase();
  const navSections = q ? SECTION_ORDER.filter((id) => searchBlobs[id].includes(q)) : SECTION_ORDER;

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

            <div className="nav__search">
              <Icon name="search" size={15} />
              <input
                className="nav__searchinput"
                value={navQuery}
                placeholder={t('nav.search')}
                aria-label={t('nav.search')}
                onChange={(e) => setNavQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setNavQuery('');
                    return;
                  }
                  // Enter jumps to the first match, so a search can end without
                  // reaching for the mouse.
                  if (e.key === 'Enter') {
                    const first = navSections[0];
                    if (first) {
                      go(first);
                      setSearchJump((p) => ({ query: navQuery, nonce: p.nonce + 1 }));
                    }
                  }
                }}
              />
              {navQuery && (
                <button
                  type="button"
                  className="nav__searchclear"
                  aria-label={t('nav.searchClear')}
                  onClick={() => setNavQuery('')}
                >
                  ×
                </button>
              )}
            </div>

            <nav className="nav__list">
              {NAV_GROUPS.map((group) => {
                // A search that leaves a group empty takes its heading with it:
                // a title over nothing reads as a section that failed to load.
                const ids = group.ids.filter((id) => navSections.includes(id));
                if (ids.length === 0) return null;
                return (
                  <div className="nav__group" key={group.label ?? 'top'}>
                    {group.label && <div className="nav__groupname">{t(group.label)}</div>}
                    {ids.map((id) => (
                      <button
                        key={id}
                        className="navitem"
                        aria-current={id === section}
                        onClick={() => {
                          go(id);
                          // With a search active, a click is a "take me there": scroll
                          // to and highlight the first match in the section.
                          if (navQuery.trim()) {
                            setSearchJump((p) => ({ query: navQuery, nonce: p.nonce + 1 }));
                          }
                        }}
                      >
                        <Icon name={SECTIONS[id].icon} />
                        <span className="navitem__label">{t(SECTIONS[id].label)}</span>
                        {alerted.has(id) && (
                          <span className="navitem__dot" title={t('nav.attention')} />
                        )}
                      </button>
                    ))}
                  </div>
                );
              })}
              {navSections.length === 0 && <p className="nav__empty">{t('nav.noSection')}</p>}
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
              {/* The project's docs live on the web; this opens them in the
                  browser, never inside the app. */}
              <button
                className="navitem navitem--ghost"
                onClick={() => void window.api.system.openExternal(TAYORI_DOCS_URL)}
              >
                <Icon name="bookOpen" />
                <span className="navitem__label">{t('nav.docs')}</span>
                {/* Signals it leaves the app for the browser. */}
                <Icon name="external" size={13} />
              </button>
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
                {section === 'home' && (
                  <HomeCards
                    settings={settings}
                    presence={presence}
                    status={status}
                    levels={levels}
                    alerts={alerts}
                    patch={patch}
                    go={go}
                    onWizard={() => setWizard(true)}
                  />
                )}

                {section === 'general' && <VisibilityCards settings={settings} patch={patch} />}

                {section === 'audio' && (
                  <>
                    <CaptureCard status={status} levels={levels} />
                    <AudioDevicesCard settings={settings} patch={patch} />
                    <AudioSourcesCard settings={settings} patch={patch} go={go} />
                    <TTSCard settings={settings} patch={patch} presence={presence} go={go} />
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

                {/*
                  The two jobs first, then what they are built out of. The keys
                  used to open the section: four fields for providers you may
                  never use, three cards above the one you picked.
                */}
                {section === 'models' && (
                  <>
                    <AnswerJobCard
                      settings={settings}
                      presence={presence}
                      patch={patch}
                      saveSecret={saveSecret}
                      clearSecret={clearSecret}
                    />
                    <ScreenJobCard settings={settings} patch={patch} />
                    <ApiKeysCard
                      presence={presence}
                      saveSecret={saveSecret}
                      clearSecret={clearSecret}
                    />
                    <LocalGuide />
                    {/* Last: a preset is saved once the rest is set up, not before. */}
                    <ModelPresetsCard settings={settings} patch={patch} />
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
/** Decoy names, proper nouns; `off` uses the translated label. */
const DECOY_LABEL: Record<DecoyIcon, string> = {
  off: '',
  terminal: 'Windows Terminal',
  settings: 'Settings',
  taskmanager: 'Task Manager',
};

// ─────────────────────────────── Home ───────────────────────────────

/** Transcription engines, short. Proper nouns, so they aren't translated. */
const STT_SHORT: Record<STTProviderId, string> = {
  'gemini-live': 'Gemini Live',
  'gemini-audio': 'Gemini',
  'openai-live': 'OpenAI live',
  'openai-transcribe': 'OpenAI',
  'whisper-local': 'Whisper',
};

/** The key each engine needs, so the tile can tell without asking main. */
const STT_SECRET: Record<STTProviderId, keyof SecretsPresence | null> = {
  'gemini-live': 'google',
  'gemini-audio': 'google',
  'openai-live': 'openai',
  'openai-transcribe': 'openai',
  'whisper-local': null,
};

const TTS_LABEL: Record<TTSProviderId, UIKey> = {
  webspeech: 'tts.webspeech',
  openai: 'tts.openai',
  piper: 'tts.piper',
};

/**
 * The four shortcuts worth showing on Home.
 *
 * Not the eleven: the list of every combination is a section of its own, and
 * what belongs here is the handful you press while you are talking and can't go
 * looking for them.
 */
const HOME_HOTKEYS: (keyof HotkeyMap)[] = [
  'askNow',
  'solveOnScreen',
  'toggleOverlay',
  'toggleListening',
];

/**
 * Home: the section the dashboard opens on.
 *
 * It used to open on «General» —interface language, stealth, the taskbar decoy,
 * the overlay's opacity—, which answers none of the questions you have with a
 * call about to start: can it answer, is it hearing both sides, is it going to
 * show up on the screen I'm sharing. The answer was spread across five sections
 * and summarised nowhere.
 *
 * Nothing here is a new setting. The banner and the tiles **read** what is
 * configured and take you to the section that owns it; the switches are the same
 * ones «Overlay & stealth» and «Behaviour» already have, brought to where they
 * are reached in a hurry; and the alerts are the warnings that already lived
 * inside the cards, with the sentence that says which one it is and the button
 * that ends it.
 */
function HomeCards({
  settings,
  presence,
  status,
  levels,
  alerts,
  patch,
  go,
  onWizard,
}: {
  settings: Settings;
  presence: SecretsPresence;
  status: CaptureStatus;
  levels: AudioLevels;
  alerts: Alert[];
  patch: PatchFn;
  go: (section: SectionId) => void;
  onWizard: () => void;
}) {
  const t = useT();

  /*
   * Which mode to come back to when the automatic answers are switched on again.
   * `autoTriggerMode` has three values and this is a switch: without remembering
   * the last one, turning it off and on would silently downgrade «automatic +
   * classifier» to «automatic», and the classifier is the half that costs money.
   */
  const lastAutoMode = useRef<AutoTriggerMode>('heuristic');
  useEffect(() => {
    if (settings.autoTriggerMode !== 'off') lastAutoMode.current = settings.autoTriggerMode;
  }, [settings.autoTriggerMode]);

  const listening = status.state === 'listening';
  /*
   * Never configured, as opposed to configured with something wrong: the
   * provider can't answer AND nothing has been prepared for it to answer with.
   * The wizard covers the first run; this catches whoever closed it early, and
   * offers it back instead of a list of five complaints.
   */
  const fresh =
    alerts.some((alert) => alert.id === 'provider') && settings.contextPacks.length === 0;

  const tone = fresh ? 'fresh' : alerts.length > 0 ? 'warn' : 'ok';
  const title = fresh
    ? t('home.freshTitle')
    : alerts.length > 0
      ? t(alerts.length === 1 ? 'home.pendingOne' : 'home.pendingMany', { n: alerts.length })
      : listening
        ? t('home.listeningTitle')
        : t('home.readyTitle');
  const desc = fresh
    ? t('home.freshDesc')
    : alerts.length > 0
      ? t('home.pendingDesc')
      : listening
        ? t('home.listeningDesc')
        : t('home.readyDesc', {
            llm: LLM_LABEL[settings.llmProviderId],
            stt: STT_SHORT[settings.sttProviderId],
          });

  const llmModel = settings.llmModels[settings.llmProviderId];
  const llmReady = providerIsReady(settings, presence);
  const sttSecret = STT_SECRET[settings.sttProviderId];
  const sttReady = !sttSecret || presence[sttSecret];
  const packs = settings.contextPacks.filter((pack) => pack.enabled).length;

  const tiles: {
    kind: UIKey;
    icon: IconName;
    section: SectionId;
    value: string;
    badge: UIKey;
    ok: boolean;
  }[] = [
    {
      kind: 'home.tileLlm',
      icon: 'cpu',
      section: 'models',
      value: llmModel
        ? `${LLM_LABEL[settings.llmProviderId]} · ${llmModel}`
        : LLM_LABEL[settings.llmProviderId],
      badge: llmReady ? 'home.badgeReady' : 'home.badgeCheck',
      ok: llmReady,
    },
    {
      kind: 'home.tileStt',
      icon: 'waveform',
      section: 'transcription',
      value:
        settings.sttProviderId === 'whisper-local'
          ? `${STT_SHORT[settings.sttProviderId]} · ${settings.whisperModel}`
          : STT_SHORT[settings.sttProviderId],
      badge: sttReady ? 'home.badgeReady' : 'home.badgeCheck',
      ok: sttReady,
    },
    {
      kind: 'home.tileContext',
      icon: 'file',
      section: 'context',
      value: packs
        ? t(packs === 1 ? 'home.valuePacksOne' : 'home.valuePacks', { n: packs })
        : t('home.valueNoPacks'),
      badge: packs ? 'home.badgeReady' : 'home.badgeTodo',
      ok: packs > 0,
    },
    {
      kind: 'home.tileTts',
      icon: 'speaker',
      section: 'audio',
      value: settings.ttsEnabled ? t(TTS_LABEL[settings.ttsProviderId]) : t('home.valueOff'),
      badge: settings.ttsEnabled ? 'home.badgeOn' : 'home.badgeOptional',
      ok: settings.ttsEnabled,
    },
  ];

  const disabled = new Set(settings.disabledHotkeys);
  const shortcuts = HOME_HOTKEYS.filter(
    (action) => !disabled.has(action) && settings.hotkeys[action]
  );

  return (
    <>
      <section className="ready" data-tone={tone}>
        <div className="ready__head">
          <span className="ready__icon">
            <Icon name={fresh ? 'compass' : alerts.length > 0 ? 'alert' : 'check'} size={21} />
          </span>
          <div className="ready__text">
            <div className="ready__title">{title}</div>
            <div className="ready__desc">{desc}</div>
          </div>
          {fresh && (
            <button className="btn btn--primary" onClick={onWizard}>
              {t('home.freshAction')}
            </button>
          )}
        </div>

        {/* The same meters as the capture card: with the banner claiming it is
            listening, the proof that both sources arrive belongs next to it. */}
        {listening && (
          <div className="meters">
            <div className="meter">
              <span className="meter__label">
                <Icon name="mic" size={14} />
                {t('aud.meterMe')}
              </span>
              <div className="meter__bar">
                <div
                  className="meter__fill"
                  style={{ width: `${Math.min(levels.me * 140, 100)}%` }}
                />
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
        )}
      </section>

      {alerts.length > 0 && (
        <section className="card card--attn">
          <h2 className="attn__head">{t('home.attention')}</h2>
          {alerts.map((alert, i) => {
            const copy = ALERT_COPY[alert.id];
            return (
              <div className="attn" key={`${alert.id}-${alert.combo ?? i}`}>
                <span className="attn__icon" data-tone={copy.tone}>
                  <Icon name={copy.icon} size={16} />
                </span>
                <div className="attn__text">
                  <div className="attn__title">
                    {t(copy.title, { combo: formatAccelerator(alert.combo ?? '') })}
                  </div>
                  <div className="attn__desc">
                    {/* The capture's error is the engine's own sentence, not a
                        key: «unknown error» is only the fallback. */}
                    {alert.id === 'capture'
                      ? (status.error ?? t('overlay.unknownError'))
                      : t(copy.desc, { provider: LLM_LABEL[settings.llmProviderId] })}
                  </div>
                </div>
                {/* Stealth is fixed right here; the rest need a decision, so they
                    take you to the card where it is made. */}
                <button
                  className={`btn${alert.id === 'stealth' ? ' btn--primary' : ''}`}
                  onClick={() => {
                    if (alert.id === 'stealth') void window.api.window.setStealth(true);
                    else go(alert.section);
                  }}
                >
                  {t(copy.action)}
                </button>
              </div>
            );
          })}
        </section>
      )}

      {/*
        The interface language, high up and under the banner.
        Its reason for being near the top hasn't changed since it was written in
        «Overlay & stealth» —whoever opens the settings because the app is in a
        language that isn't theirs has to find it without reading anything
        else—; what changed is which screen you land on. It goes under the
        alerts and not between them and the banner, so the count and the list it
        counts stay together. It stays in its section too: this is a shortcut to
        it, like the two switches below.
      */}
      <section className="card">
        <Row icon="globe" label={t('dash.language')} desc={t('dash.languageDesc')}>
          <Select
            ariaLabel={t('dash.language')}
            value={settings.uiLanguage}
            onChange={(v) => void patch({ uiLanguage: v as UILang })}
            options={UI_LANGS.map((lang) => ({ value: lang, label: UI_LANG_LABEL[lang] }))}
          />
        </Row>
      </section>

      <h2 className="home__head">{t('home.setup')}</h2>
      <div className="tiles">
        {tiles.map((tile) => (
          <button className="tile" key={tile.kind} onClick={() => go(tile.section)}>
            <span className="tile__icon">
              <Icon name={tile.icon} size={17} />
            </span>
            <span className="tile__text">
              <span className="tile__kind">{t(tile.kind)}</span>
              <span className="tile__value">{tile.value}</span>
              <span className={`badge badge--${tile.ok ? 'ok' : 'missing'}`}>{t(tile.badge)}</span>
            </span>
          </button>
        ))}
      </div>

      <h2 className="home__head">{t('home.duringCall')}</h2>
      <section className="card">
        <Row icon="eyeOff" label={t('gen.stealth')} desc={t('gen.stealthDesc')}>
          <Switch
            on={settings.stealthEnabled}
            onChange={(v) => {
              void window.api.window.setStealth(v);
            }}
          />
        </Row>
        <Row icon="pointer" label={t('gen.clickThrough')} desc={t('gen.clickThroughDesc')}>
          <Switch
            on={settings.clickThrough}
            onChange={(v) => {
              void window.api.window.setClickThrough(v);
            }}
          />
        </Row>
        <Row icon="bolt" label={t('home.autoAnswer')} desc={t('home.autoAnswerDesc')}>
          <Switch
            on={settings.autoTriggerMode !== 'off'}
            onChange={(v) => void patch({ autoTriggerMode: v ? lastAutoMode.current : 'off' })}
          />
        </Row>
      </section>

      <div className="home__headrow">
        <h2 className="home__head">{t('home.whileTalking')}</h2>
        <button className="jump" onClick={() => go('hotkeys')}>
          {t('home.allShortcuts')}
          <Icon name="arrow" size={13} />
        </button>
      </div>
      <div className="keys">
        {shortcuts.map((action) => (
          <div className="key" key={action}>
            <span className="key__combo">{formatAccelerator(settings.hotkeys[action])}</span>
            <span className="key__label">{t(HOTKEY_LABEL[action])}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function VisibilityCards({ settings, patch }: { settings: Settings; patch: PatchFn }) {
  const t = useT();
  // Icon previews for the decoy picker; empty until the main hands them over,
  // and empty per key for a decoy whose .ico hasn't been added yet.
  const [decoyImgs, setDecoyImgs] = useState<Partial<Record<DecoyIcon, string>>>({});
  useEffect(() => {
    void window.api.window.decoyPreviews().then(setDecoyImgs);
  }, []);
  return (
    <>
      {/*
        The language goes first of all, and not in "About" or at the end: whoever
        opens the settings because the app is in a language that isn't theirs has
        to find it without reading anything else.
      */}
      <section className="card">
        <Row icon="globe" label={t('dash.language')} desc={t('dash.languageDesc')}>
          <Select
            ariaLabel={t('dash.language')}
            value={settings.uiLanguage}
            onChange={(v) => void patch({ uiLanguage: v as UILang })}
            options={UI_LANGS.map((lang) => ({ value: lang, label: UI_LANG_LABEL[lang] }))}
          />
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

      <section className="card">
        <h2 className="card__title">{t('gen.decoy')}</h2>
        <p className="card__hint">{t('gen.decoyDesc')}</p>
        <div className="decoy__grid">
          {DECOY_ICONS.map((key) => (
            <button
              key={key}
              type="button"
              className={`decoy__opt${settings.decoyIcon === key ? ' decoy__opt--on' : ''}`}
              onClick={() => void patch({ decoyIcon: key })}
            >
              <span className="decoy__thumb">
                {decoyImgs[key] ? (
                  <img src={decoyImgs[key]} alt="" className="decoy__img" />
                ) : (
                  <span className="decoy__missing">?</span>
                )}
              </span>
              <span className="decoy__label">
                {key === 'off' ? t('gen.decoyOff') : DECOY_LABEL[key]}
              </span>
            </button>
          ))}
        </div>
      </section>

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
        <Select
          ariaLabel={t('aud.sources')}
          value={settings.audioSources}
          onChange={(v) => void patch({ audioSources: v as Settings['audioSources'] })}
          options={[
            { value: 'both', label: t('aud.both') },
            { value: 'system', label: t('aud.systemOnly') },
            { value: 'mic', label: t('aud.micOnly') },
          ]}
        />
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

// ──────────────────────────── Audio · devices ────────────────────────────

/**
 * Enumerates audio input/output devices and refreshes on hardware changes.
 *
 * Runs in the dashboard —not the capture worker— because this is the window that
 * shows the pickers. Labels come through because the main process grants `media`
 * to our windows (see `registerPermissionHandlers`); when one arrives empty
 * (some drivers do), the card falls back to a numbered name.
 */
function useAudioDevices(): { inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] } {
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.enumerateDevices) return;
    const refresh = (): void => {
      void md.enumerateDevices().then((devices) => {
        // 'default'/'communications' are Windows aliases of a real device also in
        // the list; dropping them avoids duplicate rows — our own "system
        // default" option already covers "follow the OS".
        const real = devices.filter(
          (d) => d.deviceId !== 'default' && d.deviceId !== 'communications'
        );
        setInputs(real.filter((d) => d.kind === 'audioinput'));
        setOutputs(real.filter((d) => d.kind === 'audiooutput'));
      });
    };
    refresh();
    md.addEventListener('devicechange', refresh);
    return () => md.removeEventListener('devicechange', refresh);
  }, []);

  return { inputs, outputs };
}

/**
 * Plays a short tone through a specific output, so the pick can be checked now,
 * before TTS exists to use it. `setSinkId` routes a WebAudio graph to a chosen
 * device via a hidden `<audio>` element; with `''` it plays on the default.
 */
async function playTestTone(deviceId: string): Promise<void> {
  const ctx = new AudioContext();
  try {
    const dest = ctx.createMediaStreamDestination();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 660;
    osc.connect(gain).connect(dest);

    const el = new Audio();
    el.srcObject = dest.stream;
    const sinkable = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    if (deviceId && typeof sinkable.setSinkId === 'function') {
      await sinkable.setSinkId(deviceId).catch(() => undefined);
    }
    await el.play();

    // Soft attack and release so it's a blip, not a click (an abrupt gain step
    // pops the speaker). Can't ramp to 0 with `exponential`, hence 0.0001.
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    osc.start(now);
    osc.stop(now + 0.42);
    await new Promise<void>((resolve) => {
      osc.onended = (): void => {
        el.pause();
        resolve();
      };
    });
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

/**
 * Pick which microphone the capture opens and which output playback uses.
 *
 * The input takes effect on the capture immediately (the main process reopens
 * the streams if it's already listening). The output doesn't touch capture —the
 * system loopback is always the default render mix— it's saved for the spoken
 * answers (TTS) to play through; the «test» button lets it be verified today.
 */
function AudioDevicesCard({ settings, patch }: { settings: Settings; patch: PatchFn }) {
  const t = useT();
  const { inputs, outputs } = useAudioDevices();
  const [testing, setTesting] = useState(false);

  const inputOptions = [
    { value: '', label: t('aud.deviceDefault') },
    ...inputs.map((d, i) => ({
      value: d.deviceId,
      label: d.label || t('aud.inputFallback', { n: i + 1 }),
    })),
  ];
  const outputOptions = [
    { value: '', label: t('aud.deviceDefault') },
    ...outputs.map((d, i) => ({
      value: d.deviceId,
      label: d.label || t('aud.outputFallback', { n: i + 1 }),
    })),
  ];

  const test = (): void => {
    setTesting(true);
    void playTestTone(settings.outputDeviceId).finally(() => setTesting(false));
  };

  return (
    <section className="card">
      <h2 className="card__title">{t('aud.devicesTitle')}</h2>
      <p className="card__hint">{t('aud.devicesHint')}</p>

      <Row icon="mic" label={t('aud.inputLabel')} desc={t('aud.inputHint')}>
        <Select
          ariaLabel={t('aud.inputLabel')}
          value={settings.inputDeviceId}
          onChange={(v) => void patch({ inputDeviceId: v })}
          options={inputOptions}
        />
      </Row>

      <Row icon="speaker" label={t('aud.outputLabel')} desc={t('aud.outputHint')}>
        <Select
          ariaLabel={t('aud.outputLabel')}
          value={settings.outputDeviceId}
          onChange={(v) => void patch({ outputDeviceId: v })}
          options={outputOptions}
        />
      </Row>

      <div className="field">
        <button className="btn" disabled={testing} onClick={test}>
          {testing ? t('aud.testing') : t('aud.testOutput')}
        </button>
      </div>
    </section>
  );
}

// ──────────────────────────── Audio · spoken answers ────────────────────────────

/** The OS voices for Web Speech, refreshed when the async list finishes loading. */
function useSpeechVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const refresh = (): void => setVoices(synth.getVoices());
    refresh();
    synth.addEventListener('voiceschange', refresh);
    return () => synth.removeEventListener('voiceschange', refresh);
  }, []);
  return voices;
}

/** Speaks a sample with the current settings, so the voice can be tried here. */
async function speakSample(settings: Settings, text: string): Promise<void> {
  if (settings.ttsProviderId === 'webspeech') {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = settings.ttsRate || 1;
    if (settings.ttsVoice) {
      const voice = synth.getVoices().find((v) => v.voiceURI === settings.ttsVoice);
      if (voice) utter.voice = voice;
    }
    synth.speak(utter);
    return;
  }
  const res = await window.api.tts.synthesize(text);
  if (!res) return;
  const audio = new Audio(`data:${res.mime};base64,${res.audioBase64}`);
  const sinkable = audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
  if (settings.outputDeviceId && typeof sinkable.setSinkId === 'function') {
    await sinkable.setSinkId(settings.outputDeviceId).catch(() => undefined);
  }
  await audio.play();
}

/** Piper's install state and download progress, refreshed on demand. */
function usePiperStatus(): {
  status: PiperStatus | null;
  progress: TtsPiperProgress | null;
  refresh: () => void;
  clearProgress: () => void;
} {
  const [status, setStatus] = useState<PiperStatus | null>(null);
  const [progress, setProgress] = useState<TtsPiperProgress | null>(null);
  const refresh = useCallback((): void => {
    void window.api.tts.piperStatus().then(setStatus);
  }, []);
  useEffect(() => {
    refresh();
    return window.api.tts.onPiperProgress(setProgress);
  }, [refresh]);
  return { status, progress, refresh, clearProgress: () => setProgress(null) };
}

/**
 * Spoken answers (TTS). A master switch, the engine and voice, speed, and whether
 * new answers are read on their own. Web Speech is free and offline; OpenAI reuses
 * the existing key; Piper is a local neural engine (downloaded binary + voice).
 */
function TTSCard({
  settings,
  patch,
  presence,
  go,
}: {
  settings: Settings;
  patch: PatchFn;
  presence: SecretsPresence;
  go: (id: SectionId) => void;
}) {
  const t = useT();
  const voices = useSpeechVoices();
  const piper = usePiperStatus();
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

  const provider = settings.ttsProviderId;
  const needsKey = provider === 'openai' && !presence.openai;

  // For Piper the voice must be downloaded before it can speak; the install block
  // below handles it. The Test button waits on that.
  const piperVoiceReady =
    provider === 'piper' &&
    settings.ttsVoice !== '' &&
    (piper.status?.installedVoices.includes(settings.ttsVoice) ?? false);
  const canTest = !needsKey && (provider !== 'piper' || piperVoiceReady);

  const voiceOptions =
    provider === 'webspeech'
      ? [
          { value: '', label: t('tts.voiceDefault') },
          ...voices.map((v) => ({ value: v.voiceURI, label: `${v.name} (${v.lang})` })),
        ]
      : provider === 'piper'
        ? PIPER_VOICES.map((v) => ({
            value: v.id,
            label: piper.status?.installedVoices.includes(v.id)
              ? v.name
              : `${v.name} · ${t('tts.piperNotInstalled')}`,
          }))
        : [
            { value: '', label: t('tts.voiceDefault') },
            ...OPENAI_TTS_VOICES.map((v) => ({
              value: v,
              label: v.charAt(0).toUpperCase() + v.slice(1),
            })),
          ];

  const test = (): void => {
    setTesting(true);
    setTestError(null);
    speakSample(settings, t('tts.sample'))
      .catch((err: unknown) => setTestError(err instanceof Error ? err.message : String(err)))
      .finally(() => setTesting(false));
  };

  const installVoice = (): void => {
    if (!settings.ttsVoice) return;
    setInstalling(true);
    setTestError(null);
    window.api.tts
      .piperInstall(settings.ttsVoice)
      .then((r) => {
        if (!r.ok) setTestError(r.error ?? null);
      })
      .finally(() => {
        setInstalling(false);
        piper.refresh();
        piper.clearProgress();
      });
  };

  const piperPct =
    piper.progress && piper.progress.totalBytes > 0
      ? Math.round((piper.progress.receivedBytes / piper.progress.totalBytes) * 100)
      : null;
  const selectedVoice = piperVoiceById(settings.ttsVoice);

  return (
    <section className="card">
      <h2 className="card__title">{t('tts.title')}</h2>
      <p className="card__hint">{t('tts.hint')}</p>

      <Row icon="speaker" label={t('tts.enable')} desc={t('tts.enableHint')}>
        <Switch on={settings.ttsEnabled} onChange={(v) => void patch({ ttsEnabled: v })} />
      </Row>

      {settings.ttsEnabled && (
        <>
          <Row
            label={t('tts.provider')}
            desc={
              provider === 'webspeech'
                ? t('tts.webspeechNote')
                : provider === 'piper'
                  ? t('tts.piperNote')
                  : t('tts.providerHint')
            }
          >
            <Select
              ariaLabel={t('tts.provider')}
              value={provider}
              // Reset the voice on engine change: a voice id from one engine is
              // meaningless in another.
              onChange={(v) => void patch({ ttsProviderId: v as TTSProviderId, ttsVoice: '' })}
              options={[
                { value: 'webspeech', label: t('tts.webspeech') },
                { value: 'openai', label: t('tts.openai') },
                { value: 'piper', label: t('tts.piper') },
              ]}
            />
          </Row>

          {needsKey && (
            <div className="warn">
              <Tx k="tts.needsKey" />
              <div className="field">
                <Jump to="models" go={go}>
                  {t('tts.goKeys')}
                </Jump>
              </div>
            </div>
          )}

          <Row label={t('tts.voice')}>
            <Select
              ariaLabel={t('tts.voice')}
              value={settings.ttsVoice}
              onChange={(v) => void patch({ ttsVoice: v })}
              options={voiceOptions}
            />
          </Row>

          {/* Piper voices must be downloaded before they can speak. The binary
              comes along on the first install. */}
          {provider === 'piper' && settings.ttsVoice !== '' && !piperVoiceReady && (
            <div className="field">
              <button className="btn btn--primary" disabled={installing} onClick={installVoice}>
                {installing
                  ? piperPct !== null
                    ? t('tts.installingPct', { pct: piperPct })
                    : t('tts.installing')
                  : t('tts.installVoice', { size: selectedVoice?.sizeMB ?? 0 })}
              </button>
            </div>
          )}

          <Row label={t('tts.rate')}>
            <Select
              ariaLabel={t('tts.rate')}
              value={String(settings.ttsRate)}
              onChange={(v) => void patch({ ttsRate: Number(v) })}
              options={[
                { value: '0.75', label: '0.75×' },
                { value: '1', label: '1×' },
                { value: '1.25', label: '1.25×' },
                { value: '1.5', label: '1.5×' },
              ]}
            />
          </Row>

          <Row label={t('tts.autoRead')} desc={t('tts.autoReadHint')}>
            <Switch on={settings.ttsAutoRead} onChange={(v) => void patch({ ttsAutoRead: v })} />
          </Row>

          <div className="field">
            <button className="btn" disabled={testing || !canTest} onClick={test}>
              {testing ? t('tts.testing') : t('tts.test')}
            </button>
            {testError && <span className="badge badge--missing">{testError}</span>}
          </div>
        </>
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
          <Select
            ariaLabel={t('sk.instruction')}
            value={active ? active.id : ''}
            onChange={(v) => void patch({ activeSkillId: v })}
            options={[
              { value: '', label: t('sk.none') },
              ...skills
                .filter((skill) => !skill.error)
                .map((skill) => ({ value: skill.id, label: skillName(t, skill) })),
            ]}
          />
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
          <code className="aboutval">GPL-3.0-only</code>
        </Row>
        <Row icon="globe" label={t('about.web')} desc={t('about.webDesc')}>
          <ExtLink href={TAYORI_WEB_URL}>Web</ExtLink>
        </Row>
        <Row icon="book" label={t('about.docs')} desc={t('about.docsDesc')}>
          <ExtLink href={TAYORI_DOCS_URL}>Docs</ExtLink>
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
    <div className="keyrow">
      <div className="keyrow__head keyrow__head--list">
        <span className="row__label">{t('keys.ollama')}</span>
        <span className="badge badge--ok">{t('keys.ollamaBadge')}</span>
        <button className="btn btn--small" disabled={busy} onClick={() => void test()}>
          {busy ? t('keys.testing') : t('keys.test')}
        </button>
      </div>
      <div className="row__desc">{t('keys.useOllama')}</div>
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
 * The four API keys, with what each one unlocks.
 *
 * It's a list and not four calls written out because the same four now feed two
 * places: the keys card, and the answer card when the provider you picked is
 * missing its own.
 */
const API_KEYS: {
  secret: Exclude<SecretKey, 'mqtt'>;
  provider: LLMProviderId;
  label: UIKey;
  hint: UIKey;
  use: UIKey;
}[] = [
  {
    secret: 'anthropic',
    provider: 'claude',
    label: 'keys.anthropic',
    hint: 'keys.anthropicHint',
    use: 'keys.useAnthropic',
  },
  {
    secret: 'google',
    provider: 'gemini',
    label: 'keys.google',
    hint: 'keys.googleHint',
    use: 'keys.useGoogle',
  },
  {
    secret: 'openai',
    provider: 'openai',
    label: 'keys.openai',
    hint: 'keys.openaiHint',
    use: 'keys.useOpenai',
  },
  {
    secret: 'deepseek',
    provider: 'deepseek',
    label: 'keys.deepseek',
    hint: 'keys.deepseekHint',
    use: 'keys.useDeepseek',
  },
];

/** The key each answer provider needs. Ollama needs none: it runs here. */
const LLM_SECRET: Record<LLMProviderId, Exclude<SecretKey, 'mqtt'> | null> = {
  claude: 'anthropic',
  gemini: 'google',
  openai: 'openai',
  deepseek: 'deepseek',
  ollama: null,
};

/**
 * The keys, one line each.
 *
 * They used to be four blocks open at once, each with its input, its Save, its
 * Test and its Delete on screen — for providers you may well never use. Reading
 * is the common case and typing the rare one, so what is always visible is the
 * line that answers «do I have this one, and what does it unlock»; the field
 * appears when you say you want to type.
 */
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

      {API_KEYS.map((entry) => (
        <SecretField
          key={entry.secret}
          collapsible
          label={entry.label}
          hint={entry.hint}
          use={entry.use}
          present={presence[entry.secret]}
          onSave={(v) => saveSecret(entry.secret, v)}
          onClear={() => clearSecret(entry.secret)}
          onTest={() => window.api.llm.testConnection(entry.provider)}
        />
      ))}
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
function ScreenJobCard({ settings, patch }: { settings: Settings; patch: PatchFn }) {
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
  /*
   * `same` stopped being an option inside the picker and became the resting
   * state of the card: the question is «does the screen need its own model?»,
   * and asking it as a switch is what makes the answer «no» free of reading.
   */
  const own = provider !== 'same';

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

  const useOwn = (on: boolean): void => {
    if (!on) {
      void patch({ screenProviderId: 'same', screenModel: '' });
      return;
    }
    /*
     * Turning the switch on starts from whoever is already answering, so it
     * changes nothing until you pick — except with DeepSeek, whose models don't
     * read images: defaulting to it would be defaulting to the one combination
     * that guarantees both screen buttons fail.
     */
    const answering = settings.llmProviderId;
    void patch({
      screenProviderId: answering === 'deepseek' ? 'gemini' : answering,
      screenModel: '',
    });
  };

  return (
    <section className="card job" id="screen-model">
      <div className="job__head">
        <span className="job__icon">
          <Icon name="monitor" size={19} />
        </span>
        <div className="job__text">
          <h2 className="job__title">{t('jobs.screen')}</h2>
          <p className="job__desc">{t('jobs.screenDesc')}</p>
        </div>
      </div>

      <Row icon="swap" label={t('jobs.screenOwn')} desc={t('jobs.screenOwnDesc')}>
        <Switch on={own} onChange={useOwn} />
      </Row>

      {own && (
        <>
          <Row icon="cpu" label={t('model.provider')} desc={t('screen.providerDesc')}>
            {/* DeepSeek isn't offered: none of its models read images, and this
                card exists to pick the one that DOES have to read the screen.
                Offering it would be offering the option that guarantees both
                buttons fail. It can be typed by hand if they ever release one
                with vision. */}
            <Select
              ariaLabel={t('model.provider')}
              value={provider}
              onChange={(v) =>
                void patch({
                  screenProviderId: v as Settings['screenProviderId'],
                  // Switching provider invalidates the chosen model: the ids don't
                  // resemble each other at all between one provider and the next.
                  screenModel: '',
                })
              }
              options={[
                { value: 'claude', label: t('screen.claude') },
                { value: 'gemini', label: t('screen.gemini') },
                { value: 'openai', label: t('screen.openai') },
                { value: 'ollama', label: t('screen.ollama') },
              ]}
            />
          </Row>

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
        </>
      )}

      {blind && (
        <div className="warn">
          <Tx k="screen.blind" vars={{ model: target.model }} />
        </div>
      )}

      {!own && settings.llmProviderId === 'ollama' && (
        <div className="warn">
          <Tx k="screen.allOllama" />
        </div>
      )}
    </section>
  );
}

/**
 * The local-model guide, behind a line you open.
 *
 * It's a whole card of specs and download sizes that only matters if you are
 * considering Ollama, and it sat open under everything else for everyone. The
 * summary is one line; the measuring only happens if you ask for it, which also
 * spares the specs probe on every visit to the section.
 */
function LocalGuide() {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="disclose" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="disclose__icon">
          <Icon name="laptop" size={17} />
        </span>
        <span className="disclose__text">
          <span className="disclose__title">{t('local.title')}</span>
          <span className="disclose__desc">{t('local.disclose')}</span>
        </span>
        <Chevron open={open} />
      </button>
      {open && <LocalModelGuide />}
    </>
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
      <Select
        ariaLabel={t('model.model')}
        value={typing ? CUSTOM_MODEL : known ? value : ''}
        placeholder={models.length === 0 ? t('model.none') : t('model.pick')}
        disabled={models.length === 0 && !allowCustom}
        onChange={(v) => {
          if (v === CUSTOM_MODEL) {
            setManual(true);
            return;
          }
          setManual(false);
          onChange(v);
        }}
        options={[
          ...models.map((model) => ({
            value: model.id,
            label: model.note ? `${model.label} · ${t(model.note)}` : model.label,
          })),
          ...(allowCustom ? [{ value: CUSTOM_MODEL, label: t('model.other') }] : []),
        ]}
      />

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
                  <Icon name="trash" size={15} />
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

/**
 * The first of the section's two jobs: who writes the answers.
 *
 * It was «Answering model», three cards below the key it cannot work without —
 * so a first run was a trip up the page, a paste, and a trip back down. The key
 * now appears **inside this card** when the chosen provider is missing it, and
 * shrinks to one line saying it is saved once it is. The answer language left:
 * it decides how what comes out reads, not who writes it, so it lives in
 * Behaviour with the profile and the trigger.
 */
function AnswerJobCard({
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

  const secret = LLM_SECRET[provider];
  const keyEntry = API_KEYS.find((entry) => entry.secret === secret);
  const hasKey = !secret || presence[secret];

  const runTest = async (): Promise<void> => {
    setBusy(true);
    try {
      setTested({ provider, result: await window.api.llm.testConnection() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card job">
      <div className="job__head">
        <span className="job__icon job__icon--on">
          <Icon name="message" size={19} />
        </span>
        <div className="job__text">
          <h2 className="job__title">{t('jobs.answers')}</h2>
          <p className="job__desc">{t('jobs.answersDesc')}</p>
        </div>
      </div>

      <Row icon="cpu" label={t('model.provider')}>
        <Select
          ariaLabel={t('model.provider')}
          value={settings.llmProviderId}
          onChange={(v) => void patch({ llmProviderId: v as LLMProviderId })}
          options={[
            { value: 'claude', label: 'Claude (Anthropic)' },
            { value: 'gemini', label: 'Gemini (Google)' },
            { value: 'openai', label: 'ChatGPT (OpenAI)' },
            { value: 'deepseek', label: 'DeepSeek' },
            { value: 'ollama', label: t('mdl.providerOllama') },
          ]}
        />
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

      {/* The missing key, where it is missed. Same field as the list below —
          saving it here is saving it there. */}
      {!hasKey && keyEntry && (
        <div className="job__key">
          <p className="job__keynote">
            {t('jobs.keyNeeded', { provider: LLM_LABEL[provider] })}
          </p>
          <SecretField
            label={keyEntry.label}
            hint={keyEntry.hint}
            present={false}
            onSave={(v) => saveSecret(keyEntry.secret, v)}
            onClear={() => clearSecret(keyEntry.secret)}
            onTest={() => window.api.llm.testConnection(provider)}
          />
        </div>
      )}

      {hasKey && (
        <div className="job__stat">
          <Icon name={secret ? 'check' : 'laptop'} size={16} />
          <span className="job__statline">
            {secret ? t('jobs.keySaved', { provider: LLM_LABEL[provider] }) : t('keys.useOllama')}
          </span>
          <button className="btn btn--small" disabled={busy} onClick={() => void runTest()}>
            {busy ? t('keys.testing') : t('model.test')}
          </button>
          {test && (
            <span className={test.ok ? 'badge badge--ok' : 'badge badge--missing'}>
              {test.ok ? t('keys.ok') : (test.error ?? t('keys.failed'))}
            </span>
          )}
        </div>
      )}

      {/*
        The context window is shown if Ollama is used FOR ANYTHING, even just for
        the screen: the silent trimming is just as harmful there, and harder to
        suspect, because a capture takes up many tokens.
      */}
      {(provider === 'ollama' || settings.screenProviderId === 'ollama') && (
        <Row icon="file" label={t('model.ollamaContext')} desc={t('model.ollamaContextDesc')}>
          <Select
            ariaLabel={t('model.ollamaContext')}
            value={String(settings.ollamaContextTokens)}
            onChange={(v) => void patch({ ollamaContextTokens: Number(v) })}
            options={[
              { value: '2048', label: t('model.ctxDefault') },
              { value: '4096', label: '4096' },
              { value: '8192', label: t('model.ctxRecommended') },
              { value: '16384', label: t('model.ctxLongCv') },
              { value: '32768', label: t('model.ctxHeavy') },
            ]}
          />
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
        <Select
          ariaLabel={t('stt.engine')}
          value={settings.sttProviderId}
          onChange={(v) => void patch({ sttProviderId: v as Settings['sttProviderId'] })}
          options={[
            { value: 'openai-live', label: t('stt.openaiLive') },
            { value: 'openai-transcribe', label: t('stt.openaiTranscribe') },
            { value: 'gemini-live', label: t('stt.geminiLive') },
            { value: 'gemini-audio', label: t('stt.geminiAudio') },
            { value: 'whisper-local', label: t('stt.whisperLocal') },
          ]}
        />
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
        <Select
          ariaLabel={t('stt.language')}
          value={settings.language}
          onChange={(v) => void patch({ language: v })}
          options={[
            { value: 'auto', label: t('stt.auto') },
            { value: 'es', label: t('stt.langEs') },
            { value: 'en', label: t('stt.langEn') },
            { value: 'pt', label: t('stt.langPt') },
            { value: 'fr', label: t('stt.langFr') },
            { value: 'de', label: t('stt.langDe') },
          ]}
        />
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

/**
 * One card per question, instead of the single stack this used to be.
 *
 * Twelve rows in a row said nothing about which of them answered what, and four
 * of them appear and disappear with the trigger mode — as one flat list, turning
 * the trigger off tore a hole through the middle of the page. Grouped, the
 * conditional rows live INSIDE the card they belong to and that card just gets
 * shorter. The order is the order of the decisions: when it fires, how long it
 * listens, how the answer reads, what happens on the screen, and last the list
 * of profiles, which is long and is edited rarely.
 */
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
  const prof = useProfileSelect(settings, patch);
  return (
    <>
      <section className="card">
        <div className="card__title">{t('beh.cardTrigger')}</div>
        <div className="card__hint">{t('beh.cardTriggerHint')}</div>

        <Row icon="bolt" label={t('beh.auto')} desc={t('beh.autoDesc')}>
          <Select
            ariaLabel={t('beh.auto')}
            value={settings.autoTriggerMode}
            onChange={(v) => void patch({ autoTriggerMode: v as Settings['autoTriggerMode'] })}
            options={[
              { value: 'off', label: t('beh.autoOff') },
              { value: 'heuristic', label: t('beh.autoHeuristic') },
              { value: 'heuristic+classifier', label: t('beh.autoClassifier') },
            ]}
          />
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
              <Select
                ariaLabel={t('beh.speaker')}
                value={settings.autoTriggerSpeaker}
                onChange={(v) =>
                  void patch({ autoTriggerSpeaker: v as Settings['autoTriggerSpeaker'] })
                }
                options={[
                  { value: 'them', label: t('beh.speakerThem') },
                  { value: 'me', label: t('beh.speakerMe') },
                  { value: 'any', label: t('beh.speakerAny') },
                ]}
              />
            </Row>

            <Row
              icon="waveform"
              label={t('beh.sensitivity')}
              desc={t(SENSITIVITY_HINT[settings.autoTriggerSensitivity])}
            >
              <Select
                ariaLabel={t('beh.sensitivity')}
                value={settings.autoTriggerSensitivity}
                onChange={(v) =>
                  void patch({ autoTriggerSensitivity: v as Settings['autoTriggerSensitivity'] })
                }
                options={[
                  { value: 'strict', label: t('beh.sensStrict') },
                  { value: 'balanced', label: t('beh.sensBalanced') },
                  { value: 'all', label: t('beh.sensAll') },
                ]}
              />
            </Row>
          </>
        )}

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
      </section>

      <section className="card">
        <div className="card__title">{t('beh.cardWindow')}</div>
        <div className="card__hint">{t('beh.cardWindowHint')}</div>

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
      </section>

      <section className="card">
        <div className="card__title">{t('beh.cardVoice')}</div>
        <div className="card__hint">{t('beh.cardVoiceHint')}</div>

        {/* Picking the profile lives here —«which one am I in»— and the list you
            edit lives in its own card below. They used to be four rows apart in
            the same stack, which read as two unrelated things. */}
        <Row icon="file" label={t('beh.profile')} desc={t('beh.profileDesc')}>
          <Select ariaLabel={t('beh.profile')} {...prof} />
        </Row>

        {/* It came from the answering-model card, where it was the one row that
            did not describe the model: it decides how what comes out reads, not
            who writes it. Here it sits with the profile and the interpreter's two
            languages, which is the rest of that same decision. */}
        <Row icon="globe" label={t('beh.answerLang')} desc={t('beh.answerLangDesc')}>
          <Select
            ariaLabel={t('beh.answerLang')}
            value={settings.answerLanguage}
            onChange={(v) => void patch({ answerLanguage: v })}
            options={[
              { value: 'auto', label: t('beh.answerLangAuto') },
              ...INTERPRETER_LANGS.map((l) => ({ value: l.code, label: l[settings.uiLanguage] })),
            ]}
          />
        </Row>

        {/* Interpreter is its own mode now, so its two languages are always
            configurable here, not only while it's the active profile. */}
        <Row icon="globe" label={t('beh.interpreterLangs')} desc={t('beh.interpreterLangsDesc')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Select
              ariaLabel={t('beh.interpreterLangs')}
              value={settings.interpreterLangA}
              onChange={(v) => void patch({ interpreterLangA: v })}
              // The language chosen on the other side is dropped here (and vice
              // versa): the interpreter translates BETWEEN two languages, so the
              // same one on both makes no sense. Its own value always stays.
              options={INTERPRETER_LANGS.filter(
                (l) => l.code === settings.interpreterLangA || l.code !== settings.interpreterLangB
              ).map((l) => ({ value: l.code, label: l[settings.uiLanguage] }))}
            />
            <button
              type="button"
              className="langswap"
              aria-label={t('beh.interpreterSwap')}
              title={t('beh.interpreterSwap')}
              onClick={() =>
                void patch({
                  interpreterLangA: settings.interpreterLangB,
                  interpreterLangB: settings.interpreterLangA,
                })
              }
            >
              <Icon name="swap" size={16} />
            </button>
            <Select
              ariaLabel={t('beh.interpreterLangs')}
              value={settings.interpreterLangB}
              onChange={(v) => void patch({ interpreterLangB: v })}
              options={INTERPRETER_LANGS.filter(
                (l) => l.code === settings.interpreterLangB || l.code !== settings.interpreterLangA
              ).map((l) => ({ value: l.code, label: l[settings.uiLanguage] }))}
            />
          </div>
        </Row>
      </section>

      {/*
        The two settings that only matter once you're solving the screen instead
        of the conversation. Scroll capture in particular had nothing to do with
        the rows it used to sit between.
      */}
      <section className="card">
        <div className="card__title">{t('beh.cardScreen')}</div>
        <div className="card__hint">{t('beh.cardScreenHint')}</div>

        {/*
          Shown always, not only with the "Code" profile set: the normal path to
          code mode is Ctrl+Alt+C, which solves the screen WITHOUT touching the
          profile. Hiding this setting behind the profile would leave it invisible
          exactly for whoever's going to use it most.
        */}
        <Row icon="type" label={t('beh.codeLang')} desc={t('beh.codeLangDesc')}>
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
          <Select
            ariaLabel={t('scroll.title')}
            value={settings.scrollCaptureMode}
            onChange={(v) => void patch({ scrollCaptureMode: v as Settings['scrollCaptureMode'] })}
            options={[
              { value: 'manual', label: t('scroll.manual') },
              { value: 'auto', label: t('scroll.auto') },
            ]}
          />
        </Row>
      </section>

      <ProfileManager settings={settings} patch={patch} />
    </>
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
  const prof = useProfileSelect(settings, patch);

  // Which tile is open in the editor: a profile slot (by kind) or an own pack
  // (by id). `null` = just the grid.
  const [sel, setSel] = useState<
    { type: 'slot'; kind: ContextKind } | { type: 'pack'; id: string } | null
  >(null);

  // The editor opens BELOW the grid; on a short window it lands off-screen and
  // the user had to scroll down to reach it. Clicking a tile now brings it into
  // view — the point of clicking a tile is to edit it.
  const editorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (sel) editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [sel]);

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
        {/* The active profile is switchable right here: preparing context for
            another profile shouldn't mean a trip to the overlay and back. */}
        <Select variant="inline" ariaLabel={t('ctx.preparingFor')} {...prof} />
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

      <div ref={editorRef}>
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
            <Select
              value={editing.kind}
              onChange={(v) => update(editing.id, { kind: v as ContextKind })}
              options={(Object.keys(CONTEXT_KIND_KEY) as ContextKind[]).map((k) => ({
                value: k,
                label: t(CONTEXT_KIND_KEY[k]),
              }))}
            />
            <Switch on={editing.enabled} onChange={(v) => update(editing.id, { enabled: v })} />
            <span className="ctxbar__spacer" />
            <button className="btn btn--danger" onClick={() => remove(editing.id)}>
              {t('ctx.remove')}
            </button>
            <button className="btn" onClick={() => setSel(null)}>
              {t('ctx.close')}
            </button>
          </div>
          <p className="pack__profileshint">{t('ctx.profilesHint')}</p>
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
      </div>
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

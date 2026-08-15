import { useCallback, useEffect, useRef, useState } from 'react';
import { useChromeMouse, useOverlayDrag } from './useChromeMouse';
import { parseAnswerBlocks, parseInline, type AnswerBlock } from '@shared/answer-format';
import { toLines } from './teleprompter';
import {
  clampFontScale,
  isScreenTrigger,
  LLM_LABEL,
  LLM_PROVIDER_IDS,
  llmProviderReady,
  OVERLAY_SIZES,
  providerIsReady,
} from '@shared/types';
import { LangProvider, useT } from '@renderer/i18n';
import { DEFAULT_UI_LANG, translate, type UIKey } from '@shared/i18n';
import { matchSkills, skillName } from '@shared/skills';
import type {
  Answer,
  AudioLevels,
  AudioSourceMode,
  CaptureStatus,
  ImageAttachment,
  LLMProviderId,
  ModelInfo,
  OverlaySize,
  ScreenTask,
  SecretsPresence,
  Settings,
  Skill,
  TranscriptSegment,
} from '@shared/types';
import type { ScrollCaptureState } from '@shared/ipc';

/** How many transcript lines we show; the overlay must take little space. */
const VISIBLE_LINES = 6;

/** Gear and X, drawn inline so we don't depend on an icon font. */
function GearIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 10.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Zm0-1.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
      />
      <path
        fill="currentColor"
        d="M6.94 1.5a.75.75 0 0 0-.74.63l-.19 1.15a4.9 4.9 0 0 0-.83.48l-1.09-.42a.75.75 0 0 0-.92.33l-1.06 1.84a.75.75 0 0 0 .18.95l.9.73a4.98 4.98 0 0 0 0 .96l-.9.73a.75.75 0 0 0-.18.95l1.06 1.84c.19.32.57.46.92.33l1.09-.42c.26.19.54.35.83.48l.19 1.15c.06.36.38.63.74.63h2.12c.36 0 .68-.27.74-.63l.19-1.15c.29-.13.57-.29.83-.48l1.09.42c.35.13.73-.01.92-.33l1.06-1.84a.75.75 0 0 0-.18-.95l-.9-.73a4.98 4.98 0 0 0 0-.96l.9-.73a.75.75 0 0 0 .18-.95L13.8 3.67a.75.75 0 0 0-.92-.33l-1.09.42a4.9 4.9 0 0 0-.83-.48l-.19-1.15a.75.75 0 0 0-.74-.63H6.94Z"
        opacity=".55"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <path stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

/**
 * A door with an arrow leaving it: quit the app.
 *
 * The X read as "close this menu/panel", not "close the program" — the same
 * glyph the menu uses to dismiss things. A sign-out door says "leave" and
 * nothing else, which is what the danger-red item at the bottom actually does.
 */
function QuitIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6.2 2.5H4A1.5 1.5 0 0 0 2.5 4v8A1.5 1.5 0 0 0 4 13.5h2.2" />
      <path d="M10 11l3-3-3-3M13 8H6" />
    </svg>
  );
}

/** The classic angle brackets: solve what's on the screen. */
function CodeIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        d="M6 11 3 8l3-3m4 0 3 3-3 3"
      />
    </svg>
  );
}

/**
 * List with check marks: answer the quiz on the screen.
 *
 * It used to be a question mark in a circle, and that icon read as "help", not
 * "answer the quiz". A list with checks says exactly what the button does.
 */
function QuizIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        d="M2.4 4.6l1.3 1.3 2.2-2.5M2.4 10.9l1.3 1.3 2.2-2.5M8.6 4.6h5M8.6 10.9h5"
      />
    </svg>
  );
}

/** Arrows in and out: collapse and expand the panel. */
function CompactIcon({ compact }: { compact: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        d={
          compact
            ? // Expand: arrows moving apart.
              'M6.5 9.5 3 13m0 0h2.8M3 13v-2.8M9.5 6.5 13 3m0 0h-2.8M13 3v2.8'
            : // Collapse: arrows moving together.
              'M3 13l3.5-3.5m0 0H3.7m2.8 0v2.8M13 3L9.5 6.5m0 0h2.8m-2.8 0V3.7'
        }
      />
    </svg>
  );
}

/** Blank sheet: start a new conversation. */
function NewChatIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        d="M13.5 8.2v3.1a1.4 1.4 0 0 1-1.4 1.4H6l-3 2.2v-2.2a1.4 1.4 0 0 1-1.4-1.4v-6A1.4 1.4 0 0 1 3 3.7h4.6"
      />
      <path
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        d="M12 1.8v4.4M9.8 4h4.4"
      />
    </svg>
  );
}

/**
 * The listen switch, in the overlay.
 *
 * It used to exist only in the dashboard and on `Ctrl+Shift+M`. That forced you
 * to open the settings —which steal the focus, exactly what the app avoids— for
 * the most frequent thing you do with it. The state and the control are the
 * same element on purpose: the green dot already said whether it was listening,
 * but it couldn't be pressed, and two distinct elements for "what's happening"
 * and "change it" cost room in a bar that's already full.
 */
function ListenButton({ status }: { status: CaptureStatus }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const listening = status.state === 'listening';
  const starting = status.state === 'starting' || busy;

  const toggle = (): void => {
    setBusy(true);
    const done = listening ? window.api.capture.stop() : window.api.capture.start();
    void done.finally(() => setBusy(false));
  };

  // The error state is actionable: press it and it retries. Leaving it as a
  // dead label would force a trip to the dashboard to start again.
  const label = starting
    ? t('overlay.starting')
    : status.state === 'error'
      ? t('overlay.retry')
      : listening
        ? t('overlay.listening')
        : t('overlay.listen');

  const state = starting ? 'starting' : status.state;

  return (
    <button
      type="button"
      className={`listen listen--${state}`}
      disabled={starting}
      title={
        status.state === 'error'
          ? (status.error ?? t('overlay.captureError'))
          : t('overlay.listenTitle')
      }
      onClick={toggle}
    >
      <span className="listen__dot" />
      {label}
    </button>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 1.8a1.9 1.9 0 0 0-1.9 1.9v4a1.9 1.9 0 0 0 3.8 0v-4A1.9 1.9 0 0 0 8 1.8Z"
      />
      <path
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        fill="none"
        d="M3.8 7.2a4.2 4.2 0 0 0 8.4 0M8 11.5v2.2"
      />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
      <path fill="currentColor" d="M7.4 2.6 4.3 5.1H2.2v5.8h2.1l3.1 2.5V2.6Z" />
      <path
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
        d="M10.3 5.9a3 3 0 0 1 0 4.2M12.4 3.8a6 6 0 0 1 0 8.4"
      />
    </svg>
  );
}

/**
 * What's being listened to: one of three, not two switches.
 *
 * They used to be two independent buttons, and pressing "Them" with both
 * sources active **turned off** that source. Nobody reads it that way: it reads
 * as "listen to them". The result was the worst possible one — the user pressed
 * to hear the other party and got exactly the opposite, left with only their
 * mic, and silent at that, because the auto-trigger waits for "them" and
 * without that lane it never fires.
 *
 * `AudioSourceMode` was always a three-value enum; painting it as two switches
 * was the source of the ambiguity. With three segments, pressing "Them" can
 * only mean one thing.
 *
 * What is kept is the double reading the chips had: what's *supposed* to be
 * heard (the active segment) and what's *actually* coming in (the bar, and the
 * amber when the source was requested but never opened — which gives exactly
 * the same screen as a silent room).
 */
const SOURCE_MODES: { mode: AudioSourceMode; label: UIKey; hint: UIKey }[] = [
  { mode: 'mic', label: 'overlay.sourceMe', hint: 'overlay.sourceMeHint' },
  { mode: 'system', label: 'overlay.sourceThem', hint: 'overlay.sourceThemHint' },
  { mode: 'both', label: 'overlay.sourceBoth', hint: 'overlay.sourceBothHint' },
];

function SourcePicker({
  mode,
  levels,
  status,
  onChange,
}: {
  mode: AudioSourceMode;
  levels: AudioLevels;
  status: CaptureStatus;
  onChange: (next: AudioSourceMode) => void;
}) {
  const t = useT();
  const listening = status.state === 'listening';

  /** Requested but not opened: the state that otherwise shows up nowhere. */
  const mute =
    listening &&
    ((mode !== 'system' && !status.micActive) || (mode !== 'mic' && !status.loopbackActive));

  return (
    <div className="sources" role="group" aria-label={t('overlay.sources')}>
      {SOURCE_MODES.map((source) => {
        const active = source.mode === mode;
        const level =
          source.mode === 'mic' ? levels.me : source.mode === 'system' ? levels.them : 0;

        return (
          <button
            key={source.mode}
            type="button"
            className={`source${active ? ' source--on' : ''}${active && mute ? ' source--mute' : ''}`}
            aria-pressed={active}
            title={
              active && mute ? `${t(source.hint)}${t('overlay.sourceMuteSuffix')}` : t(source.hint)
            }
            onClick={() => onChange(source.mode)}
          >
            {source.mode === 'mic' ? (
              <MicIcon />
            ) : source.mode === 'system' ? (
              <SpeakerIcon />
            ) : null}
            {/*
              The "Both" label never hides: it's the only segment without an
              icon, and with no text it would be an empty button. The other two
              drop to just the icon when width is tight — a microphone and a
              speaker are told apart without reading them.
            */}
            <span
              className={`source__label${source.mode === 'both' ? ' source__label--keep' : ''}`}
            >
              {t(source.label)}
            </span>
            {/* The meter only on the concrete sources: on "Both" you'd have to
                show two and the bar would stop telling which one moves. */}
            {source.mode !== 'both' && (
              <span className="source__bar">
                <span
                  className={`source__fill source__fill--${source.mode === 'mic' ? 'me' : 'them'}`}
                  style={{
                    width:
                      listening && (active || mode === 'both')
                        ? `${Math.min(level * 140, 100)}%`
                        : 0,
                  }}
                />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The listen toggle and the audio sources, folded into one split control.
 *
 * They were two side-by-side widgets —a text toggle and a three-segment
 * picker— and the picker's width was the bulk of the bar's left half. Folding
 * the sources into a caret popover reclaims that room.
 *
 * It's a **split** control, not a single dropdown, and that's deliberate:
 * stopping the listen has to stay at ONE click, because during a call the bar
 * is the only place to do it (there's no central mic then). So the body still
 * toggles listening as before; only the sources move behind the caret.
 *
 * What the closed state keeps saying: the caret carries a tiny glyph of the
 * current routing (mic, speaker, or both), and it turns amber when a requested
 * source never opened —the "listening into a closed mic" trap— so that warning
 * doesn't vanish just because the picker is now tucked away.
 */
function ListenControl({
  status,
  levels,
  settings,
}: {
  status: CaptureStatus;
  levels: AudioLevels;
  settings: Settings | null;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const mode = settings?.audioSources ?? 'both';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: PointerEvent): void => {
      if (!(e.target as Element | null)?.closest('.listenctl')) setOpen(false);
    };
    const onLeave = (): void => setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    document.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, [open]);

  // Same reading as the picker's amber segment: a source requested but never
  // opened. Surfaced on the caret so the closed control still warns.
  const listening = status.state === 'listening';
  const mute =
    listening &&
    ((mode !== 'system' && !status.micActive) || (mode !== 'mic' && !status.loopbackActive));

  return (
    <div className="listenctl" data-interactive>
      <ListenButton status={status} />
      <button
        type="button"
        className={`listenctl__caret${open ? ' listenctl__caret--on' : ''}${
          mute ? ' listenctl__caret--mute' : ''
        }`}
        aria-expanded={open}
        aria-label={t('overlay.sources')}
        title={t('overlay.sources')}
        onClick={() => setOpen((v) => !v)}
      >
        {/* Just the mic: the caret is a "listen / audio input" affordance. The
            speaker read as audio OUTPUT (TTS), which doesn't exist yet; the
            actual source routing (me/them/both) lives inside the popover. */}
        <span className="listenctl__glyph" aria-hidden="true">
          <MicIcon />
        </span>
        <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
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
        <div className="listenctl__menu" role="group" aria-label={t('overlay.sources')}>
          <SourcePicker
            mode={mode}
            levels={levels}
            status={status}
            onChange={(audioSources) => void window.api.settings.update({ audioSources })}
          />
        </div>
      )}
    </div>
  );
}

/** An eye, open or struck through: whether the overlay shows in screen shares. */
function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1.5 8S3.8 3.9 8 3.9 14.5 8 14.5 8 12.2 12.1 8 12.1 1.5 8 1.5 8Z" />
      <circle cx="8" cy="8" r="1.7" />
      {off && <path d="M2.8 2.8l10.4 10.4" />}
    </svg>
  );
}

/**
 * Toggle the overlay's visibility in screen shares, from the bar.
 *
 * It replaces the read-only "VISIBLE" flag, which only appeared in the
 * dangerous state and couldn't be pressed: turning stealth back on meant a trip
 * to the dashboard. Now the state and the switch are the same control, like the
 * listen button. Visible (stealth off) is the risky state, so it wears the
 * warning red; hidden is the safe default and stays quiet.
 */
function VisibleToggle({ stealthEnabled }: { stealthEnabled: boolean }) {
  const t = useT();
  const visible = !stealthEnabled;
  return (
    <button
      type="button"
      className={`visbtn${visible ? ' visbtn--shown' : ''}`}
      aria-pressed={visible}
      aria-label={visible ? t('overlay.visShown') : t('overlay.visHidden')}
      title={visible ? t('overlay.visShownHint') : t('overlay.visHiddenHint')}
      onClick={() => void window.api.window.setStealth(!stealthEnabled)}
    >
      <EyeIcon off={!visible} />
    </button>
  );
}

function StatusBar({
  status,
  levels,
  settings,
  onDragStart,
  onNewConversation,
  onSolveScreen,
  onToggleCompact,
}: {
  status: CaptureStatus;
  levels: AudioLevels;
  settings: Settings | null;
  onDragStart: (event: React.MouseEvent) => void;
  onNewConversation: () => void;
  onSolveScreen: (task: ScreenTask) => void;
  onToggleCompact: () => void;
}) {
  const language = settings?.language ?? 'auto';
  const compact = settings?.overlayCompact ?? false;

  return (
    // `data-interactive` is what makes the window stop ignoring the mouse while
    // the cursor is here; without it, with click-through active, you couldn't
    // drag or press the buttons.
    <div className="statusbar" data-interactive onMouseDown={onDragStart}>
      <ListenControl status={status} levels={levels} settings={settings} />

      {/* In compact the profile dropdown rides in the bar, since the row below
          (where it lives when expanded) is folded away. */}
      {compact && settings && (
        <ProfileMenu settings={settings} onPatch={(patch) => void window.api.settings.update(patch)} />
      )}

      {/*
        The state sits RIGHT NEXT to the listen control, not by the buttons.

        It used to live on the right, between the spacer and the icons, and that
        placed it visually in the actions group: two labels you can't press in
        the middle of a row of things you can. Here they form a single "what's
        happening" block with the listen dot and the sources.
      */}
      {/*
        A forced language that doesn't match what's being spoken produces no
        error: the recognizer returns invented text in that language. With it
        not shown anywhere, it was impossible to suspect. `auto` isn't shown
        because it can't be wrong.
      */}
      {language !== 'auto' && (
        <span className="statusbar__lang" title={`Transcribiendo como "${language}"`}>
          {language.toUpperCase()}
        </span>
      )}

      <span className="statusbar__spacer" />

      {/*
        Only what's used WITH SOMEONE IN FRONT OF YOU, and with its name spelled
        out.

        There used to be six unlabeled icons all the same size; four of them
        —collapse, start fresh, settings and close— are for before or after the
        call and have moved to the `⋯` menu. The room they leave is exactly what
        was needed to spell out what each of the two remaining ones does: they
        were the most used and the least understood.

        They stay grouped: at size S the content doesn't fit (measured: 407 px
        in 354 available) and the first thing that got clipped was the last
        button. As a block the bar drops them whole to a second line instead of
        cutting them.
      */}
      <div className="statusbar__actions">
        {/* Quick visibility toggle: state + switch in one, replacing the
            read-only VISIBLE flag. Red when visible (the dangerous state). */}
        {settings && <VisibleToggle stealthEnabled={settings.stealthEnabled} />}

        {/* Solve screen lives in the bar in both modes: the top row has room to
            spare now, and it reads better up here than tucked in the footer. */}
        <SolveScreenMenu onSolveScreen={onSolveScreen} />

        <MoreMenu
          compact={compact}
          onToggleCompact={onToggleCompact}
          onNewConversation={onNewConversation}
        />
      </div>
    </div>
  );
}

/** Three dots: what isn't used in the middle of a call. */
function MoreIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <circle cx="3.6" cy="8" r="1.25" fill="currentColor" />
      <circle cx="8" cy="8" r="1.25" fill="currentColor" />
      <circle cx="12.4" cy="8" r="1.25" fill="currentColor" />
    </svg>
  );
}

/**
 * What isn't used during a call, out of the bar.
 *
 * ## Why it exists
 *
 * The bar had six icons with the same visual weight, and only two —solve code
 * and solve a quiz— are used with someone in front of you. The other four are
 * for before or after: collapse, start fresh, open the settings (which steal
 * the focus, so they aren't touched mid-call) and close the app. They competed
 * for the same room as the two that matter, and at size S they didn't fit: the
 * content measured 407 px in 354 available and the first thing clipped was the
 * X.
 *
 * Taking them out of here, the two that remain can carry a **text label**,
 * which is what was needed for them to be understood without guessing.
 *
 * ## The closings, which is the tricky part
 *
 * The overlay is `focusable: false`, so **there's no blur event** to close on:
 * an open menu would stay open forever covering the answer. It closes by three
 * routes:
 *
 * - On **clicking outside** the menu, within the window.
 * - On **moving the mouse out of the whole window**, which is returning to the
 *   call.
 * - With **Escape**, or on **choosing** anything.
 *
 * What is NOT used is closing when the mouse leaves the menu, and that was a
 * real bug: between the button and the menu there are a few pixels of visual
 * gap, so moving the cursor down toward the options **left** `.more` for an
 * instant and the menu closed just as you were about to choose. A menu that
 * depends on the mouse never crossing a gap is a broken menu; the gap is kept
 * because it looks better, and the gap is covered with a bridge in the CSS.
 *
 * And with `data-interactive`, without which click-through would make it
 * unclickable right in the mode recommended during a call.
 */
/** A monitor, to say "this acts on your screen". */
function ScreenIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="1.75" y="2.75" width="12.5" height="8.5" rx="1.5" />
      <path d="M5.5 14h5M8 11.5v2.5" />
    </svg>
  );
}

/** A lightbulb, for "help me with whatever this is". */
function HelpIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6.2 13.5h3.6M6.8 15h2.4" />
      <path d="M8 1.5a4.5 4.5 0 0 0-2.8 8c.6.5.9 1.1.9 1.8v.2h3.8v-.2c0-.7.3-1.3.9-1.8A4.5 4.5 0 0 0 8 1.5Z" />
    </svg>
  );
}

/**
 * PROTOTYPE: the screen actions folded into one button.
 *
 * "Code" and "Quiz" as bare labels didn't say they capture the screen, and
 * collided with the profile chips of the same name. This reads as an action on
 * your screen (monitor icon) and asks what to solve only on click. "Anything
 * else" is the general case: an error, logs, a diagram, a config screen…
 */
function SolveScreenMenu({ onSolveScreen }: { onSolveScreen: (task: ScreenTask) => void }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: PointerEvent): void => {
      if (!(e.target as Element | null)?.closest('.solve')) setOpen(false);
    };
    const onLeave = (): void => setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    document.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, [open]);

  const pick = (task: ScreenTask) => () => {
    setOpen(false);
    onSolveScreen(task);
  };

  return (
    <div className="solve" data-interactive>
      <button
        type="button"
        className={`actionbtn${open ? ' actionbtn--on' : ''}`}
        title="Solve what's on your screen"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <ScreenIcon />
        <span className="actionbtn__label">Solve screen</span>
        <svg className="solve__caret" width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="solve__menu" role="menu">
          <button type="button" className="more__item" role="menuitem" onClick={pick('code')}>
            <CodeIcon />
            Code problem
          </button>
          <button type="button" className="more__item" role="menuitem" onClick={pick('quiz')}>
            <QuizIcon />
            Quiz question
          </button>
          <button type="button" className="more__item" role="menuitem" onClick={pick('general')}>
            <HelpIcon />
            Anything else
          </button>
        </div>
      )}
    </div>
  );
}

function MoreMenu({
  compact,
  onToggleCompact,
  onNewConversation,
}: {
  compact: boolean;
  onToggleCompact: () => void;
  onNewConversation: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    // Click outside. In capture phase, to catch it even if the target stops the event.
    const onDown = (event: PointerEvent): void => {
      if (!(event.target as Element | null)?.closest('.more')) setOpen(false);
    };
    // Leaving the window is returning to the call: the menu doesn't stay
    // covering the answer. It also serves as a net in case the outside click
    // doesn't arrive, which with click-through is exactly what happens.
    const onLeaveWindow = (): void => setOpen(false);

    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    document.addEventListener('mouseleave', onLeaveWindow);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('mouseleave', onLeaveWindow);
    };
  }, [open]);

  /** Each entry closes the menu, whatever it does afterwards. */
  const pick = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div className="more" data-interactive>
      <button
        type="button"
        className={`iconbtn${open ? ' iconbtn--on' : ''}`}
        title={t('overlay.more')}
        aria-label={t('overlay.more')}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreIcon />
      </button>

      {open && (
        <div className="more__menu" role="menu">
          <button
            type="button"
            className="more__item"
            role="menuitem"
            onClick={pick(onToggleCompact)}
          >
            <CompactIcon compact={compact} />
            {compact ? t('overlay.expandShort') : t('overlay.compactShort')}
          </button>
          <button
            type="button"
            className="more__item"
            role="menuitem"
            onClick={pick(() => void window.api.window.openDashboard())}
          >
            <GearIcon />
            {t('overlay.settingsShort')}
          </button>

          {/*
            The two that can't be undone, set apart and at the end. New
            conversation clears the transcript and the memory; the X closes the
            app. They were a pixel away from «collapse», which costs nothing.
          */}
          <div className="more__sep" />
          <button
            type="button"
            className="more__item"
            role="menuitem"
            onClick={pick(onNewConversation)}
          >
            <NewChatIcon />
            {t('overlay.newChatShort')}
          </button>
          <button
            type="button"
            className="more__item more__item--danger"
            role="menuitem"
            onClick={pick(() => void window.api.window.quit())}
          >
            <QuitIcon />
            {t('overlay.quitShort')}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Minutes:seconds since the conversation started, not the clock time.
 * When reviewing, what matters is "how long ago this was said", and an absolute
 * time forces you to subtract in your head.
 */
function elapsed(startedAt: number, at: number): string {
  const total = Math.max(0, Math.round((at - startedAt) / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function TranscriptPane({ segments }: { segments: TranscriptSegment[] }) {
  const t = useT();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [segments]);

  // The first segment is at once the "there's something" condition and the time
  // origin, so it's resolved in one go: a fallback `?? Date.now()` would be an
  // impure call in render (and eslint's `purity` rule catches it).
  const first = segments[0];
  if (!first) {
    return <p className="empty">{t('overlay.waitingAudio')}</p>;
  }

  return (
    <div className="transcript">
      {segments.slice(-VISIBLE_LINES).map((seg) => (
        <div className="transcript__line" key={seg.id}>
          <span className="transcript__time">{elapsed(first.startedAt, seg.startedAt)}</span>
          <span className={`transcript__who transcript__who--${seg.speaker}`}>
            {seg.speaker === 'me' ? t('overlay.me') : t('overlay.them')}
          </span>
          <span className={`transcript__text${seg.isFinal ? '' : ' transcript__text--partial'}`}>
            {seg.text}
          </span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

/**
 * Answer profiles as chips.
 *
 * `promptProfileId` already existed, but it could only be changed from the
 * dashboard, which you open with the gear and which steals the focus. Switching
 * register mid-call is exactly the moment when you can do neither of those.
 * `custom` isn't here: it's edited with a textarea and that one does need the
 * dashboard.
 */
/**
 * The profile icons.
 *
 * Recognizing a shape is faster than reading a word, and here you glance at it
 * with someone in front of you: the icon does the work and the label breaks the
 * tie. They're drawn inline, like the rest of the overlay's, so as not to
 * depend on any icon font.
 */
function ProfileIcon({ id }: { id: Settings['promptProfileId'] }) {
  const paths: Partial<Record<Settings['promptProfileId'], string>> = {
    // One person: the interview is one on one.
    interview:
      'M8 8.2a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8Zm-4.3 5.4c0-2.2 1.9-3.5 4.3-3.5s4.3 1.3 4.3 3.5',
    // Two people: the meeting is of several.
    meeting:
      'M6 7.6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm5 .4a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4ZM2.4 13c0-1.9 1.6-3 3.6-3s3.6 1.1 3.6 3m.7-2.8c1.6.1 2.9 1 2.9 2.8',
    // Mortarboard: a class or a talk.
    lecture: 'M8 3 1.8 6.1 8 9.2l6.2-3.1L8 3Zm-3.6 4.6v3c0 1 1.6 1.8 3.6 1.8s3.6-.8 3.6-1.8v-3',
    // Headset with mic: support.
    support:
      'M3.2 10.4V8a4.8 4.8 0 0 1 9.6 0v2.4M2 9.6h1.6v3.2H2Zm10.4 0H14v3.2h-1.6Zm0 3.2c0 .9-1 1.4-2.2 1.4',
    // Globe: languages, the interpreter.
    interpreter:
      'M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8ZM1.8 8h12.4M8 1.8c1.7 1.7 2.6 3.9 2.6 6.2s-.9 4.5-2.6 6.2M8 1.8C6.3 3.5 5.4 5.7 5.4 8s.9 4.5 2.6 6.2',
  };
  const d = paths[id];
  if (!d) return null;

  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        d={d}
      />
    </svg>
  );
}

const PROFILE_CHIPS = [
  ['interview', 'overlay.profileInterview'],
  ['meeting', 'overlay.profileMeeting'],
  ['lecture', 'overlay.profileLecture'],
  ['support', 'overlay.profileSupport'],
  ['coding', 'overlay.profileCoding'],
  // Also as a chip, not just as a screen button: it's for an oral exam or a
  // certification that someone reads aloud, and its rules already account for
  // the open question.
  ['quiz', 'overlay.profileQuiz'],
  // Translates instead of answering; the languages are set in the dashboard.
  ['interpreter', 'beh.profInterpreter'],
] as const satisfies readonly (readonly [Settings['promptProfileId'], UIKey])[];

/** Code and quiz reuse the bar's icons: it's the SAME action seen elsewhere. */
function profileIcon(id: Settings['promptProfileId']) {
  return id === 'coding' ? <CodeIcon /> : id === 'quiz' ? <QuizIcon /> : <ProfileIcon id={id} />;
}

/** A pencil: a user-made profile, told apart from the built-in ones. */
function CustomIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11.4 2.6a1.3 1.3 0 0 1 1.9 1.9l-8 8-2.8.9.9-2.8 8-8Z" />
    </svg>
  );
}

/**
 * Answer profile as a dropdown, where a row of seven chips used to be.
 *
 * The register is switched mid-call —the one moment you can't open the
 * dashboard, which steals the focus— so the control has to live here; but seven
 * chips took a whole line of a panel that exists to read. One control that
 * names the current profile and opens the rest on click says the same in a
 * fraction of the room.
 *
 * It lists the built-ins the user kept visible (`hiddenProfiles`) plus every
 * custom profile they made. Picking a built-in sets `promptProfileId`; picking
 * a custom sets `promptProfileId: 'custom'` and `activeCustomId`, so the single
 * `custom` id carries any number of user profiles without touching the type.
 */
function ProfileMenu({
  settings,
  onPatch,
}: {
  settings: Settings;
  onPatch: (patch: Partial<Settings>) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: PointerEvent): void => {
      if (!(e.target as Element | null)?.closest('.profilemenu')) setOpen(false);
    };
    const onLeave = (): void => setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    document.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, [open]);

  const active = settings.promptProfileId;
  const isCustom = active === 'custom';
  const activeCustom = settings.customProfiles.find((p) => p.id === settings.activeCustomId);
  const builtins = PROFILE_CHIPS.filter(
    ([id]) => !settings.hiddenProfiles.includes(id) && !settings.deletedProfiles.includes(id)
  );

  const builtin = PROFILE_CHIPS.find(([id]) => id === active);
  const triggerLabel = isCustom
    ? (activeCustom?.name ?? t('overlay.profileCustom'))
    : builtin
      ? t(builtin[1])
      : t('overlay.profileCustom');

  const pickBuiltin = (id: Settings['promptProfileId']) => () => {
    setOpen(false);
    onPatch({ promptProfileId: id });
  };
  const pickCustom = (id: string) => () => {
    setOpen(false);
    onPatch({ promptProfileId: 'custom', activeCustomId: id });
  };

  return (
    <div className="profilemenu" data-interactive>
      <button
        type="button"
        className={`profilebtn${open ? ' profilebtn--on' : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {isCustom ? <CustomIcon /> : profileIcon(active)}
        <span className="profilebtn__label">{triggerLabel}</span>
        <svg className="profilebtn__caret" width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
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
        <div className="profilemenu__menu" role="menu">
          {builtins.map(([id, plabel]) => {
            const on = !isCustom && active === id;
            return (
              <button
                key={id}
                type="button"
                className={`more__item${on ? ' more__item--on' : ''}`}
                role="menuitemradio"
                aria-checked={on}
                onClick={pickBuiltin(id)}
              >
                {profileIcon(id)}
                {t(plabel)}
              </button>
            );
          })}

          {settings.customProfiles.length > 0 && <div className="more__sep" />}
          {settings.customProfiles.map((p) => {
            const on = isCustom && settings.activeCustomId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                className={`more__item${on ? ' more__item--on' : ''}`}
                role="menuitemradio"
                aria-checked={on}
                onClick={pickCustom(p.id)}
              >
                <CustomIcon />
                {p.name || t('overlay.profileCustom')}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** A provider and its answer models, for the cross-provider picker. */
type ModelGroup = { provider: LLMProviderId; models: ModelInfo[] };

/**
 * The answering model, as a cross-provider dropdown, on the profile row.
 *
 * Which model answers used to be visible only in the answer header (and only
 * once there was an answer), and changeable only from the dashboard — which
 * steals the focus. Here it names the current model at rest and lets you swap
 * it mid-call, across providers: picking a model sets its provider AND the
 * model in one move, so you can jump from Claude to Gemini without leaving the
 * overlay. Only providers that can actually answer are listed (a cloud one with
 * its key, Ollama with a model), read from the same `llmProviderReady` the rest
 * of the app uses. This is the ANSWER model only: the screen and transcription
 * models stay a dashboard decision on purpose. The lists are fetched lazily,
 * on open, and the provider tag guards against a slow response painting a stale
 * list.
 */
function ModelMenu({ settings }: { settings: Settings }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<ModelGroup[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const presence: SecretsPresence = await window.api.secrets.getPresence();
      const ready = LLM_PROVIDER_IDS.filter((id) => llmProviderReady(id, settings, presence));
      const lists = await Promise.all(
        ready.map((provider) =>
          window.api.llm
            .listModelsFor(provider)
            .then((models) => ({ provider, models }))
            .catch(() => ({ provider, models: [] as ModelInfo[] }))
        )
      );
      if (!cancelled) setGroups(lists);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, settings]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: PointerEvent): void => {
      if (!(e.target as Element | null)?.closest('.modelmenu')) setOpen(false);
    };
    const onLeave = (): void => setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    document.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, [open]);

  const currentProvider = settings.llmProviderId;
  const currentModel = settings.llmModels[currentProvider] || currentProvider;

  // Sets provider AND model together: a cloud model is useless under the wrong
  // provider, and leaving the provider behind is the classic half-switch bug.
  const pick = (provider: LLMProviderId, id: string) => () => {
    setOpen(false);
    void window.api.settings.update({
      llmProviderId: provider,
      llmModels: { ...settings.llmModels, [provider]: id },
    });
  };

  return (
    <div className="modelmenu" data-interactive>
      <button
        type="button"
        className={`modelbtn${open ? ' modelbtn--on' : ''}`}
        aria-expanded={open}
        title={t('overlay.modelTitle')}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="modelbtn__label">{currentModel}</span>
        <svg className="modelbtn__caret" width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
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
        <div className="modelmenu__menu" role="menu">
          {groups === null ? (
            <span className="modelmenu__empty">{t('overlay.loadingModels')}</span>
          ) : groups.length === 0 ? (
            <span className="modelmenu__empty">{t('overlay.noModels')}</span>
          ) : (
            groups.map(({ provider, models }) => (
              <div key={provider} className="modelmenu__group">
                <div className="modelmenu__grouphead">{LLM_LABEL[provider]}</div>
                {models.length === 0 ? (
                  <span className="modelmenu__empty">{t('overlay.noModels')}</span>
                ) : (
                  models.map((model) => {
                    const active = provider === currentProvider && model.id === currentModel;
                    return (
                      <button
                        key={model.id}
                        type="button"
                        className={`more__item${active ? ' more__item--on' : ''}`}
                        role="menuitemradio"
                        aria-checked={active}
                        onClick={pick(provider, model.id)}
                      >
                        {model.label}
                      </button>
                    );
                  })
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/*
 * There was a skills dropdown here, and it was removed.
 *
 * It passed the "would you need it mid-call?" test but failed the other one,
 * which weighs more in this panel: **every control that rises to the overlay
 * takes room from what you came to read**. The active skill is chosen once and
 * forgotten —it's not like the profile, which you toggle— so its place is the
 * dashboard, and for the odd case there's `/skill` in the write tab, which
 * takes up not a pixel until you type the slash.
 */

/**
 * Quick actions on the last answer.
 *
 * They're canned prompts that go through `askWithText`, the same route as the
 * write tab: there's no new path to the LLM to maintain. Each is something you'd
 * otherwise have to type out in full while someone watches you.
 */
/** The button's label and the canned prompt it sends. */
type QuickAction = readonly [label: UIKey, prompt: UIKey];

const QUICK_ACTIONS: readonly QuickAction[] = [
  ['overlay.qaMore', 'overlay.qaMorePrompt'],
  ['overlay.qaShorter', 'overlay.qaShorterPrompt'],
  ['overlay.qaFollowUp', 'overlay.qaFollowUpPrompt'],
  ['overlay.qaSummary', 'overlay.qaSummaryPrompt'],
] as const;

/**
 * The same actions, but for code.
 *
 * "Shorter" or "Follow-up" mean nothing in front of a solution; what you ask
 * for next is always the same: explain it aloud —which is exactly what you'll
 * be asked for after writing it—, optimize it, or test it.
 */
const CODE_ACTIONS: readonly QuickAction[] = [
  ['overlay.qaExplain', 'overlay.qaExplainPrompt'],
  ['overlay.qaOptimise', 'overlay.qaOptimisePrompt'],
  ['overlay.qaEdge', 'overlay.qaEdgePrompt'],
  ['overlay.qaTests', 'overlay.qaTestsPrompt'],
] as const;

/**
 * The quiz ones, and they're the flip side of the answer no longer explaining
 * anything.
 *
 * Quiz mode returns one line per question and that's it, because that's what's
 * needed with the exam in front of you. The why doesn't disappear: it's asked
 * for here, once you've answered and want to understand —or check— what you
 * marked.
 */
const QUIZ_ACTIONS: readonly QuickAction[] = [
  ['overlay.qaWhy', 'overlay.qaWhyPrompt'],
  ['overlay.qaDistractors', 'overlay.qaDistractorsPrompt'],
  ['overlay.qaDoubts', 'overlay.qaDoubtsPrompt'],
  ['overlay.qaReview', 'overlay.qaReviewPrompt'],
];

function QuickActions({
  onAsk,
  kind,
}: {
  onAsk: (prompt: string) => void;
  kind: 'chat' | 'code' | 'quiz';
}) {
  const t = useT();
  const actions = kind === 'code' ? CODE_ACTIONS : kind === 'quiz' ? QUIZ_ACTIONS : QUICK_ACTIONS;

  return (
    <div className="quick" data-interactive>
      {actions.map(([label, prompt]) => (
        <button key={label} type="button" className="quick__btn" onClick={() => onAsk(prompt)}>
          {t(label)}
        </button>
      ))}
    </div>
  );
}

const SIZES: OverlaySize[] = ['S', 'M', 'L', 'XL'];

function SizePicker({
  active,
  onChange,
}: {
  active: OverlaySize;
  onChange: (size: OverlaySize) => void;
}) {
  const t = useT();
  return (
    <div className="sizes" data-interactive>
      {SIZES.map((size) => (
        <button
          key={size}
          type="button"
          className={`sizes__btn${active === size ? ' sizes__btn--active' : ''}`}
          aria-pressed={active === size}
          title={t('overlay.size', { size })}
          onClick={() => onChange(size)}
        >
          {size}
        </button>
      ))}
    </div>
  );
}

/** The microphone of the central state. Large and single-stroke, no fill. */
function MicGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <rect
        x="9"
        y="2.5"
        width="6"
        height="11"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.7"
        fill="none"
      />
      <path
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        fill="none"
        d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"
      />
    </svg>
  );
}

/** Wrench: a provider still needs configuring. */
function SetupGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        d="M14.7 6.3a4 4 0 0 0 5.2 5.2l-8 8a2.3 2.3 0 0 1-3.3-3.3l8-8Z"
      />
      <circle cx="6.5" cy="17.5" r="1" fill="currentColor" />
    </svg>
  );
}

/**
 * The panel's state when there's still nothing to read.
 *
 * It replaces the two empties there used to be —"Waiting for audio…" in the
 * transcript and "Ctrl+Enter to ask for an answer" in the suggestion—, which
 * were two small italic texts competing to say the same thing: that nothing is
 * happening yet. Now a single thing says it, centered and large.
 *
 * The microphone **is** the main button, not an ornament on top of it. Fusing
 * them removes an element from the screen and eliminates the "do I press the
 * icon or the button?" ambiguity: there's only one thing to press, and it's the
 * only one with a color fill in the whole overlay.
 */
function IdleHero({
  status,
  configured,
  onWrite,
}: {
  status: CaptureStatus;
  configured: boolean;
  onWrite: () => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);

  const listening = status.state === 'listening';
  const starting = status.state === 'starting' || busy;
  const state = !configured
    ? 'setup'
    : starting
      ? 'starting'
      : status.state === 'error'
        ? 'error'
        : listening
          ? 'listening'
          : 'idle';

  const copy = {
    // With no provider there's nothing to listen to: the state's spot is taken
    // by the only thing you can do, instead of a separate warning above the panel.
    setup: {
      title: t('overlay.setupTitle'),
      sub: t('overlay.setupSub'),
      action: t('overlay.setupAction'),
    },
    idle: {
      title: t('overlay.idleTitle'),
      sub: t('overlay.idleSub'),
      action: t('overlay.listen'),
    },
    starting: {
      title: t('overlay.connectingTitle'),
      sub: t('overlay.connectingSub'),
      action: t('overlay.connectingAction'),
    },
    listening: {
      title: t('overlay.listeningTitle'),
      sub: t('overlay.listeningSub'),
      action: t('overlay.listeningAction'),
    },
    error: {
      title: t('overlay.errorTitle'),
      sub: status.error ?? t('overlay.errorSub'),
      action: t('overlay.retry'),
    },
  }[state];

  const press = (): void => {
    if (state === 'setup') {
      void window.api.window.openDashboard();
      return;
    }
    setBusy(true);
    const done = listening ? window.api.capture.stop() : window.api.capture.start();
    void done.finally(() => setBusy(false));
  };

  return (
    <div className="hero" data-interactive>
      <button
        type="button"
        className={`hero__mic hero__mic--${state}`}
        disabled={starting}
        aria-label={copy.action}
        title={copy.action}
        onClick={press}
      >
        {/*
          The ring is a separate element and not an animated `box-shadow`: this
          way it can scale and fade without moving a single pixel of the button,
          which is what separates a calm pulse from an element that jumps around.
        */}
        <span className="hero__ring" aria-hidden="true" />
        {state === 'setup' ? <SetupGlyph /> : <MicGlyph />}
      </button>

      <h1 className="hero__title">{copy.title}</h1>
      <p className="hero__sub">{copy.sub}</p>

      {/*
        The second way, spelled out as what it is: a place to type.
        You can use the whole app without a microphone —writing, or solving
        what's on the screen— and the plain link that said so read as an
        afterthought. An input-shaped launcher says "you can also type here"
        without a word. It's not a live field: focusing one would make the
        overlay steal the call's focus (CONTEXT §4), so pressing it switches to
        the write tab, which is the one place that focus is taken on purpose.
      */}
      {state !== 'setup' && (
        <button type="button" className="hero__askbox" onClick={onWrite}>
          <span className="hero__askph">{t('overlay.writeQuestion')}…</span>
          <span className="hero__askkbd">
            <kbd>Ctrl</kbd>
            <kbd>↵</kbd>
          </span>
        </button>
      )}
    </div>
  );
}

/**
 * First-run state. The dashboard no longer opens by itself, so without this a
 * new user would be left staring at an overlay that does nothing and with no
 * clue where to configure the keys.
 *
 * It still exists for when there's ALREADY content on screen: there the central
 * state isn't shown, and the warning has to fit on one line.
 */
function SetupPrompt() {
  return (
    <div className="setup" data-interactive>
      <p className="setup__text">
        Falta configurar un proveedor de IA. Ábrelo con el engranaje de arriba.
      </p>
      <button
        type="button"
        className="setup__btn"
        onClick={() => void window.api.window.openDashboard()}
      >
        Abrir configuración
      </button>
    </div>
  );
}

/** The two ways of giving the assistant a question. */
type InputTab = 'listen' | 'write';

function Tabs({ tab, onChange }: { tab: InputTab; onChange: (t: InputTab) => void }) {
  const t = useT();
  return (
    // `data-interactive`: without this the tabs would be unclickable with
    // click-through active, which is the mode recommended during a call.
    <div className="tabs" data-interactive>
      {(
        [
          ['listen', t('overlay.tabListen')],
          ['write', t('overlay.tabWrite')],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          className={`tab${tab === id ? ' tab--active' : ''}`}
          aria-pressed={tab === id}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Write tab: asking without depending on audio.
 *
 * It requires the overlay to be focusable, which only happens while this tab is
 * open — hence the `setInteractive` effect in `OverlayApp`. It's the only
 * situation in which the app takes the focus, and the footer warning says so
 * because it's exactly the behavior the rest of the program avoids.
 */
function ComposePane({ skills, onSend }: { skills: Skill[]; onSend: (text: string) => void }) {
  const t = useT();
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // The window is already focusable when this mounts; focusing here saves the
  // user an extra click to start writing.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /*
   * `null` while nothing is being invoked; a list —even an empty one— as soon
   * as the text starts with `/` or `$`. The difference is what lets it say
   * "there's none by that name" instead of saying nothing, which is
   * indistinguishable from the autocomplete being broken.
   */
  const matches = matchSkills(draft, skills);

  const complete = (id: string): void => {
    setDraft(`/${id} `);
    inputRef.current?.focus();
  };

  const send = (): void => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    onSend(text);
  };

  return (
    <div className="compose" data-interactive>
      {matches && (
        <div className="skillmenu">
          {matches.length === 0 ? (
            <span className="skillmenu__empty">{t('overlay.noSkill')}</span>
          ) : (
            matches.map((skill) => (
              <button
                key={skill.id}
                type="button"
                className="skillmenu__item"
                onClick={() => complete(skill.id)}
              >
                <code className="skillmenu__id">/{skill.id}</code>
                <span className="skillmenu__name">{skillName(t, skill)}</span>
              </button>
            ))
          )}
        </div>
      )}

      <textarea
        ref={inputRef}
        className="compose__input"
        placeholder={t('overlay.composePlaceholder')}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends; Shift+Enter adds a line break. Ctrl+Enter isn't used
          // because it's a GLOBAL hotkey: the main process intercepts it and it
          // would never reach here.
          if (e.key !== 'Enter' || e.shiftKey) return;
          e.preventDefault();

          /*
           * With the menu open, Enter **completes** instead of sending. It's
           * what any chat does, and here it also avoids the silly case: sending
           * a half-typed "/hum" invokes nothing —the prefix only counts if it
           * matches a real skill— so the model would receive that stray word as
           * if it were the question. The second Enter does send.
           */
          const first = matches?.[0];
          if (first) {
            complete(first.id);
            return;
          }
          send();
        }}
      />
      <div className="compose__foot">
        <span className="compose__hint">{t('overlay.composeHint')}</span>
        <button type="button" className="compose__btn" disabled={!draft.trim()} onClick={send}>
          {t('overlay.send')}
        </button>
      </div>
      <p className="compose__warn">{t('overlay.composeWarn')}</p>
    </div>
  );
}

/**
 * Explains a detector skip in plain language.
 *
 * The internal reason ("filler word or audio check") is precise but doesn't
 * say what to do. These texts do, and the audio-check one is affirmative on
 * purpose: someone who asks "can you hear me?" wants to know if the chain
 * works, and the honest answer is yes — it just doesn't trigger a suggestion.
 */
function explainSkip(reason: string): UIKey {
  if (reason.includes('muletilla')) {
    return 'overlay.skipFiller';
  }
  if (reason.includes('corto')) {
    return 'overlay.skipShort';
  }
  if (reason.includes('estricto')) {
    return 'overlay.skipStrict';
  }
  return 'overlay.skipNone';
}

/**
 * A code block with its copy button.
 *
 * Copying is the main action here: nobody transcribes a solution by hand from
 * an overlay while being watched. `data-interactive` isn't optional — without
 * it the button would be unclickable with click-through active, which is the
 * mode recommended during a call.
 */
function CodeBlock({ block }: { block: AnswerBlock }) {
  const t = useT();
  const [copied, setCopied] = useState<'no' | 'sí' | 'falló'>('no');

  // The notice turns off by itself; without the cleanup, a block that
  // disappears mid-timer would leave a setState on an already-unmounted component.
  useEffect(() => {
    if (copied === 'no') return;
    const timer = setTimeout(() => setCopied('no'), 1_200);
    return () => clearTimeout(timer);
  }, [copied]);

  /*
   * Through the main process, not through `navigator.clipboard`.
   *
   * The browser API requires the document to have the focus and the overlay is
   * `focusable: false` on purpose, so it always rejected with "Document is not
   * focused" — and the rejection was lost without a `catch`, so the button
   * simply did nothing. The permissions handler, which only grants
   * `clipboard-read`, would have blocked it anyway.
   */
  const copy = (): void => {
    window.api.clipboard
      .write(block.content)
      .then(() => setCopied('sí'))
      .catch(() => setCopied('falló'));
  };

  return (
    <div className="code" data-interactive>
      <div className="code__head">
        <span className="code__lang">{block.lang || t('overlay.code')}</span>
        {/* While the fence is still open the code is half-written: offering to
            copy it would hand over an unclosed function without any warning. */}
        {block.open ? (
          <span className="code__writing">{t('overlay.writing')}</span>
        ) : (
          <button type="button" className="code__copy" onClick={copy}>
            {copied === 'sí'
              ? t('overlay.copied')
              : copied === 'falló'
                ? t('overlay.copyFailed')
                : t('overlay.copy')}
          </button>
        )}
      </div>
      <pre className="code__body">
        <code>{block.content}</code>
      </pre>
    </div>
  );
}

/**
 * An answer's text, with the bold and inline code interpreted.
 *
 * Models mark things in bold no matter what you do —Claude highlighted the
 * correct option of each quiz that way— and without this the panel showed the
 * asterisks.
 */
function InlineText({ text }: { text: string }) {
  const spans = parseInline(text);

  return (
    <div className="answer__text">
      {spans.map((span, index) =>
        span.type === 'bold' ? (
          <strong key={index}>{span.text}</strong>
        ) : span.type === 'code' ? (
          <code className="answer__code" key={index}>
            {span.text}
          </code>
        ) : (
          <span key={index}>{span.text}</span>
        )
      )}
    </div>
  );
}

/**
 * Teleprompter mode: the answer, one sentence per line.
 *
 * ## Why it looks like this
 *
 * What gives away that someone is reading **isn't the font size**, it's the
 * horizontal movement of the eyes: sweeping a long line and returning to the
 * start of the next is visible from the other side of a video call. Hence the
 * three decisions that define this view, and none is aesthetic:
 *
 * - **Narrow column**, so the eyes barely move. Setting the answer "large"
 *   makes this worse, because a large line is wider.
 * - **The active line always in the same spot**, with the neighbors dimmed.
 *   You don't have to hunt for where you were: it's where it was.
 * - **You advance by hand**, with a global shortcut. In a conversation you
 *   don't know at what pace you'll speak; an automatic scroll drifts off right
 *   when you're interrupted, and chasing it means looking at the screen.
 *
 * It shows the previous and the next, not just the current one: seeing what's
 * coming is what lets you chain on without the pause of reading.
 */
function Teleprompter({ text }: { text: string }) {
  const t = useT();
  const lines = toLines(text);
  const [at, setAt] = useState(0);

  const move = useCallback(
    (step: number) => {
      setAt((current) => Math.min(Math.max(current + step, 0), Math.max(lines.length - 1, 0)));
    },
    [lines.length]
  );

  // The shortcut is global because the overlay doesn't have the focus: the key
  // is picked up by the main process and forwarded over IPC.
  useEffect(() => window.api.teleprompter.onMove(move), [move]);

  if (lines.length === 0) return null;

  return (
    <div
      className="prompter"
      data-interactive
      role="button"
      tabIndex={-1}
      title={t('overlay.prompterHint')}
      onClick={() => move(1)}
      onContextMenu={(event) => {
        // Right-click to go back: it's the shortest gesture there is to correct
        // an over-advance, and there's no context menu to get in the way.
        event.preventDefault();
        move(-1);
      }}
    >
      <div className="prompter__line prompter__line--past">{lines[at - 1] ?? ''}</div>
      <div className="prompter__line prompter__line--now">{lines[at]}</div>
      <div className="prompter__line prompter__line--next">{lines[at + 1] ?? ''}</div>
      <div className="prompter__rail">
        {lines.map((_, index) => (
          <span
            key={index}
            className={`prompter__tick${index === at ? ' prompter__tick--now' : ''}${
              index < at ? ' prompter__tick--done' : ''
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Copies the answer's full text to the clipboard.
 *
 * Like the copy of a code block, it goes through the main process
 * (`clipboard.write`): `navigator.clipboard` requires focus and the overlay is
 * `focusable: false`, so it would always fail. It gives a brief «Copied» as
 * confirmation.
 */
function CopyAnswerButton({ text }: { text: string }) {
  const t = useT();
  const [copied, setCopied] = useState<'no' | 'sí' | 'falló'>('no');

  useEffect(() => {
    if (copied === 'no') return;
    const timer = setTimeout(() => setCopied('no'), 1_200);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = (): void => {
    window.api.clipboard
      .write(text)
      .then(() => setCopied('sí'))
      .catch(() => setCopied('falló'));
  };

  return (
    <button
      type="button"
      className="section__copy"
      data-interactive
      title={t('overlay.copyAnswer')}
      onClick={copy}
    >
      {copied === 'sí'
        ? t('overlay.copied')
        : copied === 'falló'
          ? t('overlay.copyFailed')
          : t('overlay.copy')}
    </button>
  );
}

/** The body of an answer: text, except for what comes between fences. */
function AnswerBody({ text }: { text: string }) {
  const blocks = parseAnswerBlocks(text);

  return (
    <div className="answer">
      {blocks.map((block, index) =>
        block.type === 'code' ? (
          <CodeBlock key={index} block={block} />
        ) : (
          <InlineText key={index} text={block.content} />
        )
      )}
    </div>
  );
}

/**
 * The question that produced the answer, shown above it.
 *
 * You could always read it in the transcript, but by the time the answer is up
 * the line that prompted it has often scrolled away, and a typed question was
 * never in the transcript at all. Pairing them —what was asked, what came
 * back— is what the reference cards call the "answer state".
 *
 * Only for what was **asked**: a typed or dictated question. The screen actions
 * carry a canned instruction as their question ("solve the code on screen"),
 * which is noise here, so `isScreenTrigger` ones don't show it.
 */
function QuestionLine({ text }: { text: string }) {
  const t = useT();
  return (
    <div className="qline" data-interactive>
      <span className="qline__label">{t('overlay.questionLabel')}</span>
      <p className="qline__text">{text}</p>
    </div>
  );
}

function AnswerPane({
  answer,
  skip,
  listening,
  teleprompter,
}: {
  answer: Answer | null;
  skip: { text: string; reason: string } | null;
  listening: boolean;
  teleprompter: boolean;
}) {
  const t = useT();
  if (!answer) {
    // The skip is only shown while there's no answer: if there's already one on
    // screen, covering it with a warning about a stray sentence would be worse.
    if (skip) {
      return (
        <div className="skip">
          <span className="skip__what">«{skip.text}»</span>
          <span className="skip__why">{t(explainSkip(skip.reason))}</span>
        </div>
      );
    }
    // The empty state says what can be done NOW. It used to always say
    // "Ctrl+Enter to ask for an answer", which with listening stopped is
    // useless: there's no transcript to draw a question from.
    return (
      <p className="empty">{listening ? t('overlay.emptyIdle') : t('overlay.emptyStopped')}</p>
    );
  }
  if (answer.status === 'thinking') {
    // Code mode takes longer and for a different reason —the image is uploaded
    // and read in full before the first token—, so saying it keeps it from
    // looking like it's hung just when there's the most hurry.
    return (
      <p className="empty">
        {answer.trigger === 'code' ? t('overlay.readingScreen') : t('overlay.thinking')}
      </p>
    );
  }
  if (answer.status === 'error') {
    return <div className="answer answer--error">{answer.error ?? t('overlay.unknownError')}</div>;
  }
  /*
   * The teleprompter only kicks in with the answer FINISHED.
   *
   * During streaming the lines are recomputed with each token and the one
   * you're reading moves under your eyes, which is the opposite of what this
   * mode comes to solve. While it arrives the normal answer is shown.
   */
  /*
   * `key` with the answer's id, and not an effect that sets the index to zero.
   *
   * A new answer has to start at its first line; otherwise you start where you
   * left off in the previous one and the first thing you do when reading is
   * realize you're in the wrong place. Remounting achieves it without a
   * `setState` inside an effect, which is what this project already avoids.
   */
  if (teleprompter && answer.status === 'done') {
    return <Teleprompter key={answer.id} text={answer.text} />;
  }
  return <AnswerBody text={answer.text} />;
}

/**
 * Navigation through this conversation's answers.
 *
 * Until now an answer was erased by the next one and only recovered by opening
 * the dashboard's history — with all that implies: gear, new window and stolen
 * focus. It's the last frequent thing that forced you out of the overlay.
 */
function AnswerNav({
  total,
  index,
  onGo,
}: {
  total: number;
  index: number;
  onGo: (next: number) => void;
}) {
  const t = useT();
  if (total < 2) return null;

  return (
    <div className="nav" data-interactive>
      <button
        type="button"
        className="nav__btn"
        disabled={index === 0}
        title={t('overlay.prevAnswer')}
        aria-label={t('overlay.prevAnswer')}
        onClick={() => onGo(index - 1)}
      >
        ‹
      </button>
      <span className="nav__count">
        {index + 1}/{total}
      </span>
      <button
        type="button"
        className="nav__btn"
        disabled={index === total - 1}
        title={t('overlay.nextAnswer')}
        aria-label={t('overlay.nextAnswer')}
        onClick={() => onGo(index + 1)}
      >
        ›
      </button>
    </div>
  );
}

/**
 * The assistant's memory, with its button to clear it.
 *
 * Each remembered turn is resent **whole** on the next query, and that showed
 * up nowhere. It matters above all with a local model: Ollama applies its own
 * context window and discards what doesn't fit **without any error**, so the
 * symptom of having filled it is that the model starts forgetting recent
 * things, which is exactly what keeps you from suspecting the context.
 *
 * It's different from "new conversation", which also clears the transcript and
 * closes the conversation on disk. Here all of that is kept.
 */
/**
 * State of the chunk capture, next to "Suggestion".
 *
 * It appears only when there's something to show: chunks on the stack or the
 * automatic loop recording. The two buttons —Solve and ✕— do the same as the
 * shortcuts, for anyone who doesn't remember them. `data-interactive` is
 * essential: without it, with click-through active, the mouse would pass on by.
 */
function ScrollChip({ state }: { state: ScrollCaptureState }) {
  const t = useT();
  if (!state.capturing && state.frames === 0) return null;

  return (
    <span className="scrollchip" data-interactive>
      <span className={`scrollchip__label${state.capturing ? ' scrollchip__label--rec' : ''}`}>
        {state.capturing
          ? t('scroll.capturing', { count: state.frames })
          : t('scroll.pieces', { count: state.frames })}
      </span>
      {state.frames > 0 && (
        <>
          <button
            type="button"
            className="scrollchip__btn"
            onClick={() => void window.api.scrollCapture.solve()}
          >
            {t('scroll.solve')}
          </button>
          <button
            type="button"
            className="scrollchip__x"
            aria-label={t('scroll.clear')}
            title={t('scroll.clear')}
            onClick={() => void window.api.scrollCapture.clear()}
          >
            ✕
          </button>
        </>
      )}
    </span>
  );
}

function MemoryChip({ turns, max }: { turns: number; max: number }) {
  const t = useT();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(false), 1_400);
    return () => clearTimeout(timer);
  }, [done]);

  // With no memory there's nothing to show or to forget: the chip only appears
  // once the assistant already remembers something. The exception is the moment
  // right after clearing it — otherwise, on pressing the chip it vanishes
  // without saying anything and the "forgotten" is never seen.
  if (turns === 0 && !done) return null;

  return (
    <button
      type="button"
      className={`memory${turns >= max ? ' memory--full' : ''}`}
      data-interactive
      title={t('overlay.memoryTitle', { turns, max })}
      onClick={() => {
        // Marked BEFORE calling, and not in the `.then`. Clearing the memory
        // leaves the counter at zero, and with zero the chip isn't drawn: by
        // the time the response arrived, this component would already be
        // unmounted and the notice would never be seen. Both state changes fall
        // in the same render, so the chip survives to say it did it.
        setDone(true);
        void window.api.ask.forgetContext().catch(() => setDone(false));
      }}
    >
      {done ? t('overlay.forgotten') : t('overlay.memory', { turns, max })}
    </button>
  );
}

/**
 * Which quick actions apply based on what's on screen.
 *
 * The answer being looked at rules, not the configured profile: a Ctrl+Alt+Q
 * with the profile on "Interview" leaves a list of quiz answers in front of
 * you, and what you'll want to ask about is those.
 */
function quickActionKind(answer: Answer, settings: Settings | null): 'chat' | 'code' | 'quiz' {
  if (answer.trigger === 'code' || settings?.promptProfileId === 'coding') return 'code';
  if (answer.trigger === 'quiz' || settings?.promptProfileId === 'quiz') return 'quiz';
  return 'chat';
}

/** How many answers are kept so you can go back. */
const ANSWER_MEMORY = 20;

/**
 * The overlay's dropdown menus, for the compact auto-fit.
 *
 * When compact shrinks the window to the bar, an open menu spills past the
 * bottom edge; the fit has to grow the window to include whichever of these is
 * open. Keep this in sync when a new bar dropdown is added.
 */
const OVERLAY_MENUS =
  '.more__menu, .solve__menu, .profilemenu__menu, .modelmenu__menu, .listenctl__menu';

export function OverlayApp() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<CaptureStatus>({
    state: 'idle',
    micActive: false,
    loopbackActive: false,
  });
  const [levels, setLevels] = useState<AudioLevels>({ me: 0, them: 0 });
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  /**
   * The conversation's answers, from oldest to most recent, and which one is
   * being looked at. `null` in `viewing` means "the last one", which is what
   * makes a streaming answer follow along by itself without jumping around when
   * the user is reading an earlier one.
   */
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [viewing, setViewing] = useState<number | null>(null);
  const [shot, setShot] = useState<ImageAttachment | null>(null);
  const [configured, setConfigured] = useState(true);
  const [tab, setTab] = useState<InputTab>('listen');
  const [sttError, setSttError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [memory, setMemory] = useState({ turns: 0, max: 8 });
  const [scroll, setScroll] = useState<ScrollCaptureState>({
    frames: 0,
    capturing: false,
    mode: 'manual',
  });
  const [skip, setSkip] = useState<{ text: string; reason: string } | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);

  useChromeMouse();
  const onDragStart = useOverlayDrag();

  /**
   * The window follows the content ONLY in compact.
   *
   * The overlay's height is otherwise fixed by the size preset (`OVERLAY_SIZES`)
   * and the renderer never touched it. Compact wants the opposite: a rectangle
   * that's as small as what it shows —just the bar when idle, bar + answer when
   * there's one— which is what makes it read as "out of the way". So while
   * compact, the panel is content-sized (`.panel--compact { height: auto }`),
   * a `ResizeObserver` measures it and reports the height through the existing
   * `resizeOverlay` IPC (the main clamps it to 120–900). The answer is capped in
   * CSS so a long one scrolls inside instead of growing the window without end.
   */
  const panelRef = useRef<HTMLDivElement>(null);
  const reportedHeight = useRef(0);

  /*
   * This component **provides** the language, so it can't consume it with
   * `useT()`: a context isn't read in the same component that sets it. For its
   * own strings it translates directly against the settings, which is where the
   * value came from anyway.
   */
  const t = (key: UIKey, vars?: Record<string, string | number>): string =>
    translate(settings?.uiLanguage ?? DEFAULT_UI_LANG, key, vars);

  /**
   * The overlay is only focusable while writing.
   *
   * The effect's cleanup isn't optional: if the window stayed focusable it
   * would end up stealing the video call's focus, which is exactly what the app
   * exists to avoid (CONTEXT §4). That's why it's reverted on switching tabs
   * and also on unmount.
   */
  useEffect(() => {
    if (tab !== 'write') return;
    void window.api.window.setInteractive(true);
    return () => {
      void window.api.window.setInteractive(false);
    };
  }, [tab]);

  /*
   * The skills list refreshes on opening the write tab, in addition to on
   * startup.
   *
   * There's no "the folder changed" event and none has been added: that would
   * force watching a user directory forever for a change that happens twice a
   * month. Re-reading on entry covers the real case —create a skill and use it
   * without restarting— and costs one disk read at the moment the user has just
   * decided to write, not in the middle of an answer.
   */
  useEffect(() => {
    if (tab === 'write') void window.api.skills.list().then(setSkills);
  }, [tab]);

  useEffect(() => {
    const { api } = window;

    void api.settings.get().then(setSettings);
    void api.capture.getStatus().then(setStatus);
    void api.memory.get().then(setMemory);
    void api.skills.list().then(setSkills);

    /*
     * "Is the AI configured?" is asked again on EVERY change, not just on
     * startup.
     *
     * The bug it fixes shows on screen and in no log: it was enough to try
     * another provider for a moment —one without a key— for the panel to be
     * stuck with «The AI needs configuring» **forever**, even after switching
     * back. The warning was computed once on mount and nothing revisited it.
     *
     * And it's recomputed from both sides, because the verdict depends on two
     * things that change separately: the chosen provider (settings) and whether
     * its key works (secrets). Listening to only one left half the cases lying —
     * pasting the missing key and having the warning still there is the more
     * frustrating of the two.
     */
    const recheck = (current?: Settings): void => {
      void Promise.all([
        current ? Promise.resolve(current) : api.settings.get(),
        api.secrets.getPresence(),
      ]).then(([settingsNow, presence]) => setConfigured(providerIsReady(settingsNow, presence)));
    };
    recheck();

    const unsubs = [
      api.settings.onChange((next) => {
        setSettings(next);
        recheck(next);
      }),
      // No argument on purpose: what arrives there is the presence, not the
      // settings, and `recheck` would request them again anyway.
      api.secrets.onChange(() => recheck()),
      api.capture.onStatus(setStatus),
      api.capture.onLevels(setLevels),
      api.screenshot.onCaptured(setShot),
      // A skip stops mattering as soon as a real answer arrives.
      api.transcript.onAutoSkip(setSkip),
      api.ask.onAnswer((next) => {
        // `answer` is emitted on EVERY streaming update, so the same answer
        // arrives dozens of times: it's replaced by id rather than accumulated.
        // An aborted one stays in the list only if it got to write something;
        // otherwise it would be an empty gap to navigate through.
        setAnswers((prev) => {
          const idx = prev.findIndex((a) => a.id === next.id);
          if (idx !== -1) {
            const copy = [...prev];
            copy[idx] = next;
            return copy;
          }
          return [...prev, next].slice(-ANSWER_MEMORY);
        });
        setSkip(null);
        // The capture is consumed with the answer: leaving the thumbnail
        // visible would make you think it's still attached to the next question.
        if (next.status === 'streaming' || next.status === 'done') setShot(null);
      }),
      api.transcript.onSegment((seg) => {
        // A partial segment is replaced in place; a new one is appended.
        // Without this, the transcript would fill with intermediate versions.
        setSegments((prev) => {
          const idx = prev.findIndex((s) => s.id === seg.id);
          if (idx === -1) return [...prev.slice(-80), seg];
          const next = [...prev];
          next[idx] = seg;
          return next;
        });
      }),
      // The main process already cleared its buffer; the overlay has its own
      // copy in React state and would keep showing the previous conversation.
      api.history.onReset(() => {
        setSegments([]);
        setAnswers([]);
        setViewing(null);
        setShot(null);
      }),
      // An engine that fails lane by lane looked exactly like a silent room:
      // the overlay said "Listening" and nothing arrived.
      api.transcript.onError(setSttError),
      api.notices.on(setNotice),
      api.memory.onChange(setMemory),
      api.scrollCapture.onChange(setScroll),
    ];

    return () => unsubs.forEach((off) => off());
  }, []);

  const compact = settings?.overlayCompact ?? false;

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;

    // Not compact: give the fixed preset height back, but only if a compact
    // session actually shrank it — otherwise every unrelated settings change
    // would fire a redundant resize. Only the height was ever touched (width is
    // untouched), so restoring it is enough and the anchor stays.
    if (!compact) {
      if (reportedHeight.current !== 0 && settings) {
        void window.api.window.resizeOverlay(OVERLAY_SIZES[settings.overlaySize].height);
      }
      reportedHeight.current = 0;
      return;
    }

    // Compact: fit the window to the content — INCLUDING any open dropdown.
    //
    // The window shrinks to the bar, so a menu opening downward would spill past
    // the window's bottom edge and the OS would clip it (its last items became
    // unreachable). The menus are `position: absolute`, out of flow, so
    // `offsetHeight` doesn't see them; instead we take the lowest bottom edge of
    // the panel OR any open menu. A `MutationObserver` re-measures when a menu is
    // added or removed (the ResizeObserver can't see it — the panel's own box
    // doesn't change when an absolute child appears).
    const measure = (): number => {
      let bottom = el.getBoundingClientRect().bottom;
      el.querySelectorAll(OVERLAY_MENUS).forEach((menu) => {
        bottom = Math.max(bottom, menu.getBoundingClientRect().bottom);
      });
      // From the window's top (0) to the lowest edge, plus the panel's 4px
      // bottom margin. getBoundingClientRect is layout, not paint, so a menu
      // currently clipped by the window still reports its full extent.
      return Math.ceil(bottom) + 4;
    };

    // The forced first measurement of each effect run matters: toggling stealth
    // (or anything in settings) doesn't change the content height, so without it
    // the window would keep whatever height it had drifted to.
    const report = (force: boolean): void => {
      const height = measure();
      if (!force && height === reportedHeight.current) return;
      reportedHeight.current = height;
      void window.api.window.resizeOverlay(height);
    };
    report(true);
    const resize = new ResizeObserver(() => report(false));
    resize.observe(el);
    const mutate = new MutationObserver(() => report(false));
    mutate.observe(el, { childList: true, subtree: true });
    return () => {
      resize.disconnect();
      mutate.disconnect();
    };
  }, [compact, settings]);

  // Which answer is shown: the one being looked at, or the last. Following the
  // last by default is what keeps the usual behavior — a new answer replaces
  // the previous one — without losing the earlier ones.
  const index = viewing ?? answers.length - 1;
  const answer = answers[index] ?? null;

  /*
   * The central state rules while there's nothing to read.
   *
   * "Nothing to read" is literal: no transcript and no answers. As soon as the
   * first thing arrives, the panel returns to its normal layout and the content
   * takes the spot — the empty is a state, not a separate screen. The write tab
   * disables it because there the user has already chosen what to do.
   */
  // Compact never shows the central state: it exists to be a small bar, and the
  // big idle mic would defeat that. Idle + compact is then just the bar, which
  // is exactly the "out of the way" rectangle the mode is for.
  const hero = tab === 'listen' && segments.length === 0 && answers.length === 0 && !compact;

  return (
    <LangProvider lang={settings?.uiLanguage}>
      <div
        ref={panelRef}
        className={`panel${compact ? ' panel--compact' : ''}`}
        style={{
          opacity: settings?.overlayOpacity ?? 1,
          // Only the CONTENT scales: the bar and the chips stay as they are, or
          // with large text the controls would eat the whole panel.
          ['--font-scale' as string]: clampFontScale(settings?.overlayFontScale ?? 1),
        }}
      >
        {/* Dashed red frame when stealth is off: the overlay DOES show in the
            capture right now, and the border shouts it on the window's own edge,
            not just with the «VISIBLE» in the bar. */}
        {settings && !settings.stealthEnabled && (
          <div className="detectable-frame" aria-hidden="true" />
        )}
        <StatusBar
          status={status}
          levels={levels}
          settings={settings}
          onDragStart={onDragStart}
          onNewConversation={() => void window.api.history.newConversation()}
          onSolveScreen={(task) => void window.api.ask.solveOnScreen(task)}
          onToggleCompact={() => void window.api.settings.update({ overlayCompact: !compact })}
        />

        {/* With the central state visible, the setup warning lives inside it:
          two places saying the same thing is exactly the noise this redesign
          removes. */}
        {!configured && !hero && <SetupPrompt />}

        {sttError && (
          <div className="sttError" data-interactive>
            <span className="sttError__text">
              {t('overlay.transcription')}: {sttError}
            </span>
            <button
              type="button"
              className="sttError__close"
              aria-label={t('overlay.dismiss')}
              onClick={() => setSttError(null)}
            >
              <CloseIcon />
            </button>
          </div>
        )}

        {notice && (
          <div className="sttError" data-interactive>
            <span className="sttError__text">{notice}</span>
            <button
              type="button"
              className="sttError__close"
              aria-label={t('overlay.dismiss')}
              onClick={() => setNotice(null)}
            >
              <CloseIcon />
            </button>
          </div>
        )}

        {/*
        What compact mode folds away: profiles, transcript and the shortcut
        footer. It's everything that serves to PREPARE or CHECK; what's left is
        what serves to read. The bar stays whole because it's from there that
        you expand again —hiding the button that brings back what's hidden would
        be a trap—, and because stopping listening has to always be at hand.
      */}
        {!compact && settings && (
          <div className="proferow">
            <ProfileMenu
              settings={settings}
              onPatch={(patch) => void window.api.settings.update(patch)}
            />
            <ModelMenu settings={settings} />
          </div>
        )}

        {/*
        With the central state the tabs aren't drawn: at that moment there's a
        single thing to do, and a row of tabs on top of an empty panel is just
        what makes an empty look unfinished rather than deliberate. The other
        way —writing— is offered by the central state itself.
      */}
        {hero ? (
          <IdleHero status={status} configured={configured} onWrite={() => setTab('write')} />
        ) : (
          !compact && (
            <div className="section">
              <Tabs tab={tab} onChange={setTab} />
              {tab === 'listen' ? (
                <TranscriptPane segments={segments} />
              ) : (
                <ComposePane
                  skills={skills}
                  onSend={(text) => void window.api.ask.withText(text)}
                />
              )}
            </div>
          )
        )}

        {shot && (
          <div className="shot">
            <img className="shot__img" src={`data:${shot.mime};base64,${shot.base64}`} alt="" />
            <span className="shot__label">{t('overlay.attached')}</span>
          </div>
        )}

        {/* The answer section disappears with the central state: its header and
          its "nothing yet" text were the second competing empty. In compact it
          only appears once there's actually an answer, so idle + compact stays a
          bare bar; and it doesn't grow to fill —the panel is content-sized
          there— so its `flex: 1` is dropped. */}
        {!hero && (!compact || answers.length > 0) && (
          <div className="section" style={compact ? undefined : { flex: 1 }}>
            <div className="section__head">
              <span className="section__title">{t('overlay.suggestion')}</span>
              <AnswerNav
                total={answers.length}
                index={index}
                // Going back to the last unhooks the navigation: from there on
                // new answers follow along by themselves again.
                onGo={(next) => setViewing(next === answers.length - 1 ? null : next)}
              />
              {/*
            What it's answering with. It's worth one line and saves the trip to
            the dashboard: when reading a weak answer, the first thing you want
            to know is which model it came out of, and with three configurable
            providers it's easy to believe you're on one and be on another.
          */}
              {settings && (
                <span
                  className="section__meta"
                  title={
                    // With a dedicated model for the screen, knowing which one
                    // answered stops being obvious: the label follows the answer
                    // in front of you, not the settings.
                    answer
                      ? t('overlay.generatedBy', {
                          provider: answer.providerId,
                          model: answer.model,
                        })
                      : t('overlay.answeringWith', { model: settings.llmProviderId })
                  }
                >
                  {answer?.model ||
                    settings.llmModels[settings.llmProviderId] ||
                    settings.llmProviderId}
                </span>
              )}
              <MemoryChip turns={memory.turns} max={memory.max} />
              <ScrollChip state={scroll} />
              {/* Copy the whole answer. It appears once it's finished (with
                  generation in progress there's the «Stop» button), for any kind
                  of answer, not just code. */}
              {answer && answer.status === 'done' && answer.text.trim() && (
                <CopyAnswerButton text={answer.text} />
              )}
              {/* Stopping a generation already existed in the IPC but had no
              button: it was only cancelled by asking something else, which is an
              expensive way to say "stop". */}
              {answer && (answer.status === 'thinking' || answer.status === 'streaming') && (
                <button
                  type="button"
                  className="section__stop"
                  data-interactive
                  onClick={() => void window.api.ask.abort()}
                >
                  Parar
                </button>
              )}
              {/* Extends a code solution that got cut off. Only on the last
                  answer (the engine continues the one it has in flight) and only
                  on code, which is where the cap bites. */}
              {answer &&
                answer.status === 'done' &&
                answer.trigger === 'code' &&
                viewing === null && (
                  <button
                    type="button"
                    className="section__continue"
                    data-interactive
                    title={t('overlay.continueHint')}
                    onClick={() => void window.api.ask.continue()}
                  >
                    {t('overlay.continue')}
                  </button>
                )}
            </div>
            {/* What was asked, above what came back. Only for a typed or
                dictated question: the screen actions' canned instruction is
                noise here. */}
            {answer && answer.question.trim() && !isScreenTrigger(answer.trigger) && (
              <QuestionLine text={answer.question} />
            )}
            <AnswerPane
              answer={answer}
              skip={skip}
              listening={status.state === 'listening'}
              teleprompter={settings?.teleprompterEnabled ?? false}
            />
          </div>
        )}

        {/*
        They only make sense when there's an answer to act on: "Continue" or
        "Shorter" with nothing prior would ask the model to expand the void.

        And they disappear while navigating back, even if there's an answer on
        screen: these prompts say "your last answer", and the last for the model
        is its own, not the one being looked at. Offering them there would
        promise to act on what's read and would act on something else.
      */}
        {viewing === null &&
          answer &&
          (answer.status === 'done' || answer.status === 'streaming') && (
            <QuickActions
              onAsk={(prompt) => void window.api.ask.withText(prompt)}
              // What was just answered rules, not the configured profile: after
              // a Ctrl+Alt+C with the profile on "Interview", what's on screen
              // is a solution and what you'll want to ask about is that.
              kind={quickActionKind(answer, settings)}
            />
          )}

        {!compact && (
          <div className="hints">
            {/* With the central state the ask shortcut is already stated up
              there, and repeating it below is the kind of filler that makes a
              panel look like a form. Only the size remains. */}
            {!hero && (
              <span>
                <kbd>Ctrl</kbd>+<kbd>Enter</kbd> {t('overlay.footAsk')}
              </span>
            )}
            <span className="hints__spacer" />
            <SizePicker
              active={settings?.overlaySize ?? 'M'}
              onChange={(overlaySize) => void window.api.settings.update({ overlaySize })}
            />
          </div>
        )}
      </div>
    </LangProvider>
  );
}

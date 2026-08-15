import type { UIKey, UILang } from './i18n';

/**
 * Types shared between main, preload and renderer.
 * Single source of truth: if a type crosses the IPC bridge, it lives here.
 */

// ─────────────────────────── Audio and transcription ─────────────────────────

/**
 * Who's speaking. Derived from the source stream, not from diarization:
 * `me` comes from the microphone, `them` from the system loopback.
 */
export type Speaker = 'me' | 'them';

/**
 * Which audio sources are listened to.
 *
 * `system` (system output only) is what you want if it bothers you that the
 * assistant processes your own answers. Note: auto-trigger already ignores what
 * you say — it only evaluates the other party's utterances — so this affects the
 * context sent to the model, not when it triggers.
 */
export type AudioSourceMode = 'both' | 'system' | 'mic';

/** Translates the mode to the speakers that will be active. */
export function speakersFor(mode: AudioSourceMode): Speaker[] {
  if (mode === 'system') return ['them'];
  if (mode === 'mic') return ['me'];
  return ['me', 'them'];
}

/** Sample rate we normalize all audio to before the STT. */
export const TARGET_SAMPLE_RATE = 16_000 as const;

export interface TranscriptSegment {
  id: string;
  speaker: Speaker;
  text: string;
  /** `false` while the STT can still revise the text. */
  isFinal: boolean;
  /** Epoch ms of the start of speech. */
  startedAt: number;
  endedAt?: number;
}

/** Signal level per stream, for the overlay's visual meter. */
export interface AudioLevels {
  me: number;
  them: number;
}

export type CaptureState = 'idle' | 'starting' | 'listening' | 'error';

export interface CaptureStatus {
  state: CaptureState;
  micActive: boolean;
  loopbackActive: boolean;
  error?: string;
}

// ──────────────────────────────── Providers ─────────────────────────────────

export type LLMProviderId = 'claude' | 'gemini' | 'openai' | 'deepseek' | 'ollama';
export type STTProviderId =
  'gemini-live' | 'whisper-local' | 'gemini-audio' | 'openai-live' | 'openai-transcribe';

export interface ModelInfo {
  id: string;
  label: string;
  /** Whether it accepts images; controls whether we attach screenshots. */
  supportsVision: boolean;
  /**
   * The "(fast)", "(more capable)" that accompanies the name, as a key.
   *
   * It's separate from `label` because the model name is a **proper noun**
   * —"Claude Sonnet 5" isn't translated— and the qualifier is. Keeping them
   * glued left half a label in Spanish inside an English dropdown, which is one
   * of the things that stands out most because it's visible without opening
   * anything.
   */
  note?: UIKey;
}

export interface ImageAttachment {
  mime: 'image/jpeg' | 'image/png';
  /** Without the `data:` prefix. */
  base64: string;
}

// ────────────────────────────────── Skills ──────────────────────────────────

/**
 * A standalone instruction that refines **how** the model answers.
 *
 * Anthropic's format: a folder with a `SKILL.md` carrying frontmatter and the
 * body in Markdown. See `shared/skills.ts` for the parser and `main/skills/`
 * for the loading.
 *
 * Not to be confused with the other two things that end up in the same prompt:
 * the profile says **what shape** the answer has and the context packs provide
 * **material**. A skill changes the **way** — the tone, the words it avoids, the
 * rhythm — and that's why it adds to a profile instead of replacing it.
 */
export interface Skill {
  /** Comes from the folder name, which is what you type after `/` or `$`. */
  id: string;
  /** From the frontmatter. If missing, the id. */
  name: string;
  description: string;
  /** The body of the SKILL.md: what's actually sent to the model. */
  instructions: string;
  /** The ones that ship with the app. Can't be deleted, can be replaced. */
  builtIn: boolean;
  /**
   * Built-in ones only: their name and description, as keys.
   *
   * User skills carry the text in the frontmatter and there's nothing to
   * translate; the ones we write do, and they're the only ones someone who
   * hasn't created any will see. `name` and `description` are still there
   * because the prompt needs a string —and prompts aren't translated—, so the
   * UI paints the key if there is one and the text otherwise.
   */
  nameKey?: UIKey;
  descriptionKey?: UIKey;
  /**
   * Why it can't be used, as a key.
   *
   * A broken skill is listed anyway, with its reason. Disappearing without
   * saying anything would leave someone staring at a folder that does exist,
   * wondering why the app doesn't see it. It's a key and not a sentence because
   * the one reading the reason is a person, and they may have the app in either
   * language.
   */
  error?: UIKey;
  /** What the system said, when the reason comes from `readFile` and not us. */
  errorDetail?: string;
}

// ──────────────────────────────── Answers ───────────────────────────────────

export type AnswerStatus = 'idle' | 'thinking' | 'streaming' | 'done' | 'aborted' | 'error';

/**
 * What originated the query; useful for debugging and metrics.
 *
 * `code` is the only one that also changes HOW it's answered: it forces the
 * coding profile and a higher token cap, because an algorithm doesn't fit in
 * the four bullets that work for speaking.
 */
export type AnswerTrigger = 'hotkey' | 'auto' | 'manual-input' | 'code' | 'quiz' | 'general';

/** `true` if the trigger comes from solving the screen. */
export function isScreenTrigger(trigger: AnswerTrigger): trigger is ScreenTask {
  return trigger === 'code' || trigger === 'quiz' || trigger === 'general';
}

export interface Answer {
  id: string;
  status: AnswerStatus;
  trigger: AnswerTrigger;
  /** The detected or typed question that originated the answer. */
  question: string;
  /** Text accumulated so far. */
  text: string;
  providerId: LLMProviderId;
  model: string;
  createdAt: number;
  error?: string;
}

// ──────────────────────────────── History ───────────────────────────────────

/**
 * A question and its answer, already closed.
 *
 * The provider and model are stored alongside the text: when reviewing a weak
 * answer the first thing you want to know is what you generated it with, and
 * that information is no longer anywhere else once you switch models.
 */
export interface ConversationTurn {
  id: string;
  question: string;
  answer: string;
  trigger: AnswerTrigger;
  providerId: LLMProviderId;
  model: string;
  createdAt: number;
  /** Present if generation failed; the turn is saved anyway. */
  error?: string;
}

export interface Conversation {
  id: string;
  /** Derived from the first question; the user doesn't have to name it. */
  title: string;
  startedAt: number;
  endedAt?: number;
  profileId: PromptProfileId;
  /** Full transcript, closed segments only. */
  segments: TranscriptSegment[];
  turns: ConversationTurn[];
}

/**
 * Header to paint the list without reading each file's whole body.
 * With 200 conversations, loading them all to show a list would be absurd.
 */
export interface ConversationSummary {
  id: string;
  title: string;
  startedAt: number;
  turnCount: number;
  segmentCount: number;
  /**
   * Set when the title came from a screen action (code/quiz): the stored title
   * is the model's Spanish instruction, so the dashboard shows a localized label
   * instead. Covers conversations saved before screen actions stopped seeding
   * the title, and screen-only ones saved after (which have no title at all).
   */
  screenTitle?: ScreenTask;
}

/**
 * Title from the first useful utterance.
 *
 * With nothing usable it returns an **empty string**, not an already-written
 * "untitled": the title is stored on disk and painted in the dashboard, so a
 * literal here would be a sentence in one language inside a UI that may be in
 * the other. The gap is filled by the UI with its key (`hist.untitled`), which
 * is the only one that knows which language someone is looking at.
 */
export function conversationTitle(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (!clean) return '';
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
}

// ───────────────────────────────── Settings ─────────────────────────────────

/**
 * Overlay sizes.
 *
 * Four presets instead of free resizing: the window is `frameless`, so there
 * are no borders to drag, and building custom handles for a setting touched
 * twice isn't worth it.
 */
export type OverlaySize = 'S' | 'M' | 'L' | 'XL';

export const OVERLAY_SIZES: Record<OverlaySize, { width: number; height: number }> = {
  S: { width: 380, height: 420 },
  M: { width: 460, height: 560 },
  L: { width: 560, height: 700 },
  XL: { width: 680, height: 820 },
};

/** Auto-trigger ladder, from cheapest to most expensive. */
export type AutoTriggerMode = 'off' | 'heuristic' | 'heuristic+classifier';

/**
 * Which speaker can trigger an automatic answer.
 *
 * The default is and stays `them`: in an interview, answering your own voice
 * makes no sense, and the detector is tuned for precision over recall. It's
 * configurable because the `audioSources: 'mic'` + `them` combination leaves
 * auto-trigger dead silent — there's no `them` lane to evaluate — and whoever
 * uses the app to dictate questions needs `me`.
 */
export type AutoTriggerSpeaker = 'them' | 'me' | 'any';

/**
 * How much the question detector gambles.
 *
 * It exists because the right balance **depends on what you use the app for**,
 * and there's no single right answer:
 *
 * - `strict`: unambiguous signals only (question word at the start, question
 *   mark, imperative opening). It's the original behavior, meant for a real
 *   interview where an ill-timed suggestion distracts.
 * - `balanced`: adds accented question words in any position and query phrasing.
 *   It recovers the questions the ASR delivers without punctuation.
 * - `all`: answers every closed utterance that isn't a filler. It's what you
 *   want when you're the one dictating the questions on purpose, because there
 *   there's no noise to protect against.
 */
export type AutoTriggerSensitivity = 'strict' | 'balanced' | 'all';

/**
 * What a context IS, not just what it's called.
 *
 * Before, all packs were free text and the prompt dumped them the same way,
 * under a `## Name`. But a CV, a job offer and an answer you prepared ask for
 * different instructions: the CV is the source of truth about you, the offer
 * says where to align the discourse, and a prepared answer has to be **reused**,
 * not paraphrased. Without the kind, the model couldn't know.
 */
export type ContextKind = 'cv' | 'job' | 'qa' | 'vocabulary' | 'notes';

export interface ContextPack {
  id: string;
  name: string;
  /** E.g. the CV, the job description, technical notes. */
  content: string;
  enabled: boolean;
  /** What kind of context it is. Old packs are `notes`. */
  kind: ContextKind;
  /**
   * Profiles it applies to. **Empty means always**, which is what keeps packs
   * created before this existed working.
   */
  profiles: PromptProfileId[];
}

export type PromptProfileId =
  | 'interview'
  | 'meeting'
  | 'lecture'
  | 'support'
  | 'coding'
  | 'quiz'
  // Screen-only: forced by the "Anything else" screen action, never a chip.
  | 'general'
  | 'interpreter'
  | 'custom';

/**
 * A user-made answer profile: a name and a free-text instruction.
 *
 * It behaves like the built-in `custom` always did —BASE_RULES plus the
 * prompt— but there can be several, so the register you switch to mid-call
 * doesn't have to be whichever factory profile fits closest. They all live
 * under the single `custom` id (which one is active is `Settings.activeCustomId`),
 * so the exhaustive `Record<PromptProfileId, …>` maps stay intact.
 */
export interface CustomProfile {
  id: string;
  name: string;
  prompt: string;
  /** Hidden from the overlay picker, exactly like a hidden built-in. */
  hidden?: boolean;
}

/**
 * The built-in profiles offered in the overlay's picker — the ones the user can
 * hide. `general` is screen-only (never a chip) and `custom` is the umbrella for
 * user profiles, so neither is here.
 */
export const DROPDOWN_PROFILES: readonly PromptProfileId[] = [
  'interview',
  'meeting',
  'lecture',
  'support',
  'coding',
  'quiz',
  'interpreter',
];

/**
 * Which Windows tool the taskbar entry (icon + window title) masquerades as.
 *
 * A privacy layer, not a trick played on anyone else: the overlay is already
 * invisible in screen captures, but its taskbar icon and title still say what
 * the app is to someone glancing at the machine. `off` is the real Tayori. The
 * icon files live in `resources/icons` (see its README); a missing one still
 * changes the title, so the app never breaks on a not-yet-added file.
 */
export type DecoyIcon = 'off' | 'terminal' | 'settings' | 'taskmanager';

export const DECOY_ICONS: readonly DecoyIcon[] = ['off', 'terminal', 'settings', 'taskmanager'];

/**
 * A model mini-profile: the combination of engines and models for a case.
 *
 * It stores **only** engines+models and the prompt profile, not the whole
 * session: it doesn't touch language, audio sources, sensitivity or skill,
 * which are settings you want stable across cases. `llmModel` is the model of
 * the preset's answer provider; applying it only overwrites that one, respecting
 * the rest of `Settings.llmModels`'s `Record<LLMProviderId, string>`.
 */
export interface ModelPreset {
  id: string;
  name: string;
  sttProviderId: STTProviderId;
  whisperModel: string;
  llmProviderId: LLMProviderId;
  llmModel: string;
  screenProviderId: LLMProviderId | 'same';
  screenModel: string;
  promptProfileId: PromptProfileId;
}

/**
 * Interpreter-mode languages. Stored by code; the name is resolved to the UI
 * language for the dashboard and to Spanish for the prompt (which is in
 * Spanish). The model understands the name in any language, but naming them in
 * the prompt's language reads better.
 */
export const INTERPRETER_LANGS = [
  { code: 'es', es: 'español', en: 'Spanish' },
  { code: 'en', es: 'inglés', en: 'English' },
  { code: 'fr', es: 'francés', en: 'French' },
  { code: 'de', es: 'alemán', en: 'German' },
  { code: 'pt', es: 'portugués', en: 'Portuguese' },
  { code: 'it', es: 'italiano', en: 'Italian' },
  { code: 'zh', es: 'chino', en: 'Chinese' },
  { code: 'ja', es: 'japonés', en: 'Japanese' },
] as const;

export function interpreterLangName(code: string, ui: 'es' | 'en'): string {
  return INTERPRETER_LANGS.find((l) => l.code === code)?.[ui] ?? code;
}

/**
 * The actions that solve what's on the screen.
 *
 * They share a path —high-quality capture, forced profile, vision-capable
 * model— and differ in the prompt: a multiple-choice quiz isn't answered like a
 * programming exercise.
 */
export type ScreenTask = 'code' | 'quiz' | 'general';

/** Kind labels, shared between the prompt and the dashboard. */
export const CONTEXT_KIND_LABEL: Record<ContextKind, string> = {
  cv: 'Tu CV o experiencia',
  job: 'Descripción del puesto',
  qa: 'Respuestas preparadas',
  vocabulary: 'Vocabulario',
  notes: 'Notas',
};

/**
 * Which slots the dashboard offers for each profile.
 *
 * It's not a restriction: the user can add any kind to any profile. It's what's
 * shown pre-filled so they don't have to guess what's worth preparing for an
 * interview.
 */
export const PROFILE_SLOTS: Record<PromptProfileId, ContextKind[]> = {
  interview: ['cv', 'job', 'qa', 'vocabulary'],
  meeting: ['notes', 'vocabulary'],
  lecture: ['notes', 'vocabulary'],
  support: ['notes', 'vocabulary'],
  coding: ['notes', 'vocabulary'],
  quiz: ['notes', 'vocabulary'],
  general: ['notes', 'vocabulary'],
  interpreter: ['vocabulary'],
  custom: ['notes', 'vocabulary'],
};

/** The packs that apply to the active profile. Empty `profiles` = always. */
export function packsForProfile(packs: ContextPack[], profile: PromptProfileId): ContextPack[] {
  return packs.filter(
    (pack) => pack.enabled && (pack.profiles.length === 0 || pack.profiles.includes(profile))
  );
}

/**
 * There's no shortcut for the dashboard on purpose: it opens only with the
 * overlay's gear button. If the overlay is hidden, `toggleOverlay` brings it
 * back.
 */
export interface HotkeyMap {
  askNow: string;
  screenshotAndAsk: string;
  /** Captures the screen and solves the coding problem on it. */
  solveOnScreen: string;
  /** Captures the screen and answers the quiz question on it. */
  solveQuiz: string;
  /**
   * Chunk capture: collects a frame (manual mode) or starts/stops the loop
   * (automatic mode). See `Settings.scrollCaptureMode`.
   */
  captureFrame: string;
  /** Reconstructs and solves the stack of captured chunks. */
  solveCapture: string;
  toggleOverlay: string;
  toggleListening: string;
  toggleClickThrough: string;
  moveUp: string;
  moveDown: string;
  moveLeft: string;
  moveRight: string;
  /**
   * Advance and rewind the teleprompter line.
   *
   * Only registered with the teleprompter on — see `activeHotkeys`. A global
   * accelerator takes the combination away from whatever app has focus, and
   * holding two for a disabled feature is exactly what the per-shortcut switch
   * exists to avoid.
   */
  teleprompterNext: string;
  teleprompterPrev: string;
}

export interface Settings {
  /**
   * `true` = invisible when sharing the screen (setContentProtection on).
   * The dashboard switch inverts this to make the app detectable again.
   */
  stealthEnabled: boolean;
  /** Which Windows tool the taskbar icon and title masquerade as. See `DecoyIcon`. */
  decoyIcon: DecoyIcon;
  /** Whether the overlay ignores clicks and forwards them to the window below. */
  clickThrough: boolean;
  overlayOpacity: number;
  /** Panel size. See `OVERLAY_SIZES`. */
  overlaySize: OverlaySize;

  /**
   * Scale of the overlay's CONTENT text: answer, code and transcript.
   *
   * It deliberately doesn't touch the bar or the chips. The four size presets
   * enlarge the window, not the text, so on a 4K monitor the panel grew and the
   * text stayed just as small. Scaling only the content is what fixes that
   * without the controls eating the panel.
   */
  overlayFontScale: number;

  /**
   * Compact mode: the answer only.
   *
   * It folds away the profile chips, the transcript and the shortcut footer.
   * It's the state you want once everything is set up and the overlay is only
   * for reading. It's saved because whoever prefers it prefers it always.
   */
  overlayCompact: boolean;

  /**
   * Whether conversations are saved to disk.
   *
   * It breaks the original "the app records nothing" promise: while it's on,
   * transcripts are written to `userData/conversations`. It's a switch and not
   * a constant precisely so you can go back to the previous behavior without
   * uninstalling anything.
   */
  historyEnabled: boolean;

  llmProviderId: LLMProviderId;
  /** Model chosen per provider, so the selection isn't lost when switching. */
  llmModels: Record<LLMProviderId, string>;

  /**
   * Provider for the screen actions (code and quiz), or `same` to use the one
   * above.
   *
   * It exists because the two tasks ask for different things and used to share
   * a single model. Speech needs **latency**: the answer is read while someone
   * looks at you. The screen needs **vision and brains**: reading a prompt in a
   * capture and not getting it wrong. A small local model works for the first
   * and not the second; a big paid one, the reverse, is expensive for every
   * stray sentence in a meeting.
   *
   * The default is `same`, which reproduces exactly the previous behavior.
   */
  screenProviderId: LLMProviderId | 'same';

  /**
   * Model for the screen actions. Ignored with `screenProviderId: same`.
   *
   * It's a standalone field and not another `Record` per provider: when you
   * pick "Ollama for the screen" what you want is a **specific** model —the
   * multimodal one you downloaded—, different from the one you use to converse
   * even if the provider is the same.
   */
  screenModel: string;

  sttProviderId: STTProviderId;
  /** BCP-47 code; `auto` lets the provider decide. */
  language: string;
  whisperModel: string;

  /**
   * Local transcription models marked as favorites, by id.
   *
   * Pure Model Manager convenience: a star raises them to the top of the list
   * so you don't dig for the one you usually use among the whole Whisper family.
   * It doesn't change which one is active —that's `whisperModel`—, only the
   * order they're painted in. It's a list and not a `Set` because it has to
   * cross the IPC and survive `settings.json`.
   */
  favoriteLocalModels: string[];

  /** What's listened to: microphone, system output, or both. */
  audioSources: AudioSourceMode;

  autoTriggerMode: AutoTriggerMode;
  /** Who can trigger an automatic answer. */
  autoTriggerSpeaker: AutoTriggerSpeaker;
  /** How much the detector gambles when deciding if something is a question. */
  autoTriggerSensitivity: AutoTriggerSensitivity;
  /** Seconds of transcript sent with the manual hotkey. */
  manualContextSeconds: number;
  /** Maximum segments the rolling buffer retains. */
  transcriptWindowSize: number;

  /**
   * Idle shutoff: if no one speaks for `idleShutoffMinutes`, the app stops
   * listening on its own.
   *
   * "Activity" is **only transcribable speech** (a new segment), not the user
   * asking for an answer by hand: the case this solves is the meeting that
   * ended and the assistant kept listening to an empty room. Off by default.
   * It's two fields —and not a `0 = off`— to keep the chosen minutes when you
   * turn the switch off and back on.
   */
  idleShutoffEnabled: boolean;
  idleShutoffMinutes: number;

  /**
   * The INTERFACE language.
   *
   * Not to be confused with `language`, which is the speech recognizer's and is
   * in BCP-47. They're two things that sound alike and aren't: someone can have
   * the app in English and be interviewing in Spanish, and in fact that's a
   * normal case. That's why they're two settings and not one.
   */
  uiLanguage: UILang;

  promptProfileId: PromptProfileId;

  /**
   * Model mini-profiles: named presets that pin, in one click, which engines
   * and models to use for a case (interview, meeting, interpreter…).
   *
   * It's a separate entity and does NOT activate when `promptProfileId`
   * changes: that one still decides the **shape** of the answer, and a preset
   * also stores **which models** to have loaded. It's applied by hand with
   * `applyModelPreset`.
   */
  modelPresets: ModelPreset[];

  /** The two Interpreter-mode languages (codes from `INTERPRETER_LANGS`). */
  interpreterLangA: string;
  interpreterLangB: string;

  /**
   * User-made answer profiles (name + prompt). The active one is chosen by
   * `activeCustomId` when `promptProfileId` is `'custom'`.
   */
  customProfiles: CustomProfile[];
  /** Which custom profile is active (its id), used when promptProfileId === 'custom'. */
  activeCustomId: string;
  /**
   * Built-in dropdown profiles the user hid from the overlay picker. Most people
   * use two or three; hiding the rest keeps the list short. See DROPDOWN_PROFILES
   * for which ones are hideable.
   */
  hiddenProfiles: PromptProfileId[];
  /**
   * Built-in profiles the user removed outright — gone from the overlay AND from
   * the dashboard's list, not just hidden. It's reversible (a "restore" brings
   * them back), so a built-in is never lost for good. The prompts still exist in
   * code; this only decides what's offered.
   */
  deletedProfiles: PromptProfileId[];

  contextPacks: ContextPack[];

  /**
   * Skill applied to all answers. Empty = none.
   *
   * It's a single id and not a list **on purpose**. Two instructions about how
   * to write contradict each other quickly —one asks for short sentences and
   * another for a careful register— and the model breaks the tie silently, so
   * the result would depend on the order they were enabled in. With a single
   * one, what's read on screen is what was asked for.
   *
   * It stays set between queries because the case that justifies it —"don't
   * sound like AI"— isn't something you want for one message: you want it for
   * the whole conversation. For a single message there's the `/skill` prefix.
   */
  activeSkillId: string;

  /**
   * Programming language for code-mode solutions.
   *
   * `auto` lets it infer from the screen, which is right when there's an editor
   * in front with the language already chosen. It's pinned by hand for the
   * opposite case: a blank prompt, or a test that demands a specific language
   * that isn't visible in the capture.
   */
  codeLanguage: string;

  /**
   * Language the model must answer in. `auto` (the default) keeps the built-in
   * behaviour — the answer follows the conversation, or, for a screen action,
   * what's on the screen. A code from `INTERPRETER_LANGS` forces every answer
   * into that language regardless of the content, which the auto rule can't do
   * reliably for a screenshot in another language.
   */
  answerLanguage: string;

  /**
   * How chunks are collected in "chunk capture" —for a test on a shared screen
   * that's revealed by scrolling—:
   * - `manual`: each press of the shortcut adds a frame to the stack.
   * - `auto`: the shortcut starts/stops a loop that captures on its own and
   *   deduplicates.
   */
  scrollCaptureMode: 'manual' | 'auto';

  hotkeys: HotkeyMap;

  /**
   * Disabled shortcuts, by action.
   *
   * A global accelerator **takes it away from whatever app has focus**, so
   * whoever doesn't use one of these prefers to reclaim the combination for
   * their editor rather than leave it taken by an app that ignores it. Disabled
   * isn't the same as empty: the accelerator is kept so you can turn it back on
   * without typing it again.
   *
   * The list of **disabled** ones is stored, and not a map of enabled ones, on
   * purpose. A `Record<keyof HotkeyMap, boolean>` read from a `settings.json`
   * older than this feature would arrive with no keys, each one would come out
   * `undefined`, and that's falsy: updating the app would silently disable all
   * eleven shortcuts at once. With a list, what's missing is the empty array and
   * everything stays on.
   */
  disabledHotkeys: (keyof HotkeyMap)[];

  /**
   * Teleprompter mode: the answer, one sentence per line.
   *
   * What gives away that someone is reading isn't the font size, it's the
   * horizontal movement of the eyes. This mode puts a narrow column with the
   * active line always at the same height, so the eyes barely move. See
   * `renderer/overlay/teleprompter.ts`.
   */
  teleprompterEnabled: boolean;
  ollamaBaseUrl: string;

  /**
   * Ollama context window, in tokens (`num_ctx`).
   *
   * Ollama **doesn't use the model's**: it applies its own default, 2048
   * tokens, and what doesn't fit is dropped from the start **with no error at
   * all**. With a system prompt with CV, the transcript and eight turns of
   * memory, those 2048 run out fast and the symptom is the model "forgetting"
   * things you just told it.
   *
   * It raises memory: the attention cache grows with this number, so it isn't
   * maxed out by default.
   */
  ollamaContextTokens: number;

  /**
   * The first-steps guide is no longer needed.
   *
   * It checks itself off when the steps are done, and also by hand: whoever
   * knows what they're doing shouldn't have to carry a task list on top of their
   * settings forever.
   */
  onboardingDone: boolean;

  /**
   * Phone mirror: serves the answers to a phone browser.
   *
   * It solves the case the overlay can't solve by definition: when you **share
   * the whole screen**, what's on your monitor is seen by the other side.
   * Invisible mode covers the window capture, but not a camera, nor a secondary
   * monitor someone watches, nor the doubt of reading something that isn't where
   * you think. A second device takes the answer off the shared screen entirely.
   *
   * **Off by default, and it's not symmetry with the other settings**: it opens
   * a port and serves the text of your answers over HTTP. That's turned on on
   * purpose or it isn't turned on.
   */
  phoneMirrorEnabled: boolean;

  /**
   * Whether the mirror listens on the local network or only on `127.0.0.1`.
   *
   * With `false` —the default— only **this same machine** can connect, which is
   * useless for a phone but works to test it and for SSH tunnels. With `true`
   * anyone on your network who has the link can read the answers, and that's why
   * it's a separate switch and not a consequence of turning the mirror on:
   * they're two different decisions and the second is the one with reach.
   */
  phoneMirrorLan: boolean;

  /**
   * Publish the answers to an MQTT broker.
   *
   * It's not a feature of the app for the app: it's an **output toward something
   * else**. The case that motivated it is an ESP32 subscribed to the topic,
   * which receives a quiz answer and does whatever its owner programmed. Our
   * responsibility ends here: we publish, and what happens on the other side
   * belongs to whoever built the device.
   *
   * Off by default, and with more reason than the phone mirror: a broker can be
   * on the internet, so this can take the text of your answers out of your
   * network entirely.
   */
  mqttEnabled: boolean;

  /**
   * The broker URL, with the scheme up front.
   *
   * It's a single field and not host/port/TLS separately because the scheme
   * already says it all: `mqtt://` goes in the clear and `mqtts://` encrypted.
   * Splitting it into three boxes would force inventing a TLS checkbox that
   * means the same as four letters.
   */
  mqttUrl: string;

  /** Base topic. See `mqttTopics()` for the two that are published. */
  mqttTopic: string;

  /** Broker user; empty if the broker is anonymous. The password is encrypted. */
  mqttUsername: string;
}

/**
 * The two topics that are published, derived from the base topic.
 *
 * Publishing **two** isn't indecision: they're two different consumers.
 * `<base>` carries the full JSON —id, question, model, trigger— for whoever
 * wants context; `<base>/text` carries **only the answer text**, which is what
 * a microcontroller can use without putting a JSON parser in 320 KB of RAM. The
 * case that motivated this is exactly that: a subscribed board that wants the
 * quiz letters and nothing else.
 *
 * It lives in `shared/` because both sides need it: main to publish and the
 * dashboard to show what to subscribe to. If they were computed separately, the
 * screen would end up saying one topic and the broker receiving another.
 */
export function mqttTopics(base: string): { json: string; text: string } {
  // A trailing slash from the user must not become a topic with `//`, which in
  // MQTT is an empty level and perfectly legal — and therefore another topic.
  const clean = base.trim().replace(/\/+$/, '') || 'tayori/answer';
  return { json: clean, text: `${clean}/text` };
}

/** State of the connection to the broker, as the dashboard shows it. */
export interface MqttStatus {
  state: 'off' | 'connecting' | 'connected' | 'error';
  error?: string;
  /**
   * Answers published in this session.
   *
   * It's the only honest confirmation that the thing works: a misconfigured
   * broker and a well-configured one look the same from here until this number
   * moves.
   */
  published: number;
  /** Topic to subscribe to, already resolved. Empty if it's off. */
  topic: string;
}

/**
 * `true` if the settings leave auto-trigger inert: the speaker that should
 * trigger it isn't among those being listened to, so it can never fire.
 *
 * It's a silent failure —the whole pipeline works and the last gate closes with
 * no trace—, so main logs it when starting transcription and the dashboard
 * warns about it. Both use this function so as not to duplicate the rule.
 */
export function autoTriggerIsInert(
  settings: Pick<Settings, 'autoTriggerMode' | 'autoTriggerSpeaker' | 'audioSources'>
): boolean {
  if (settings.autoTriggerMode === 'off') return false;
  if (settings.autoTriggerSpeaker === 'any') return false;
  return !speakersFor(settings.audioSources).includes(settings.autoTriggerSpeaker);
}

/**
 * `true` if it's time to stop listening for inactivity: it's enabled and more
 * than `idleShutoffMinutes` have passed with no transcribable speech
 * (`silentMs`).
 *
 * Pure and in `shared/` so it can be pinned with a test: the orchestrator calls
 * it from its watchdog. `minutes > 0` guards against a hand-edited JSON with a
 * zero, which would otherwise stop listening on the spot.
 */
export function idleShutoffDue(
  settings: Pick<Settings, 'idleShutoffEnabled' | 'idleShutoffMinutes'>,
  silentMs: number
): boolean {
  if (!settings.idleShutoffEnabled) return false;
  if (settings.idleShutoffMinutes <= 0) return false;
  return silentMs >= settings.idleShutoffMinutes * 60_000;
}

/**
 * Adjusts the patch so that switching source doesn't leave the trigger mute.
 *
 * Choosing "Them" means one thing: I want to hear the other party and have it
 * answer me. But auto-trigger waits for a specific speaker, and if that speaker
 * stops being listened to the combination goes **inert**: the whole pipeline
 * works, the transcript comes in, and the last gate closes without a trace. It
 * happened to a real person: they pressed "Them", no answer came, and it was
 * only fixed by going into the dashboard to change by hand a setting whose
 * relation to the button they'd pressed isn't obvious.
 *
 * So the trigger speaker follows the source. It is changing a setting the user
 * didn't ask for, yes — but the alternative is a silence that looks just like a
 * broken app, and the change is told to them on screen.
 *
 * It only acts in that direction. Changing the speaker by hand from the
 * dashboard does NOT touch the sources: there the user is choosing the speaker
 * on purpose, and the dashboard itself already warns if the combination can't
 * fire.
 */
export function alignAutoTrigger(current: Settings, patch: Partial<Settings>): Partial<Settings> {
  if (!patch.audioSources || patch.audioSources === current.audioSources) return patch;

  const merged = { ...current, ...patch };
  if (!autoTriggerIsInert(merged)) return patch;

  // Inert implies only one speaker is listened to and it's not the expected one.
  const heard = speakersFor(merged.audioSources)[0];
  return heard ? { ...patch, autoTriggerSpeaker: heard } : patch;
}

export const DEFAULT_HOTKEYS: HotkeyMap = {
  askNow: 'Control+Enter',
  screenshotAndAsk: 'Control+Shift+S',
  // Control+Alt+C and not Control+Shift+C —which is already click-through— nor
  // Control+Shift+X, which would steal VS Code's extensions shortcut: a global
  // accelerator beats the focused app's, and whoever uses this usually has the
  // editor in front.
  solveOnScreen: 'Control+Alt+C',
  // Q for "quiz", in the same family as the code one.
  solveQuiz: 'Control+Alt+Q',
  // A for "accumulate" a chunk, S for "solve" the stack. Ctrl+Alt+A/S were
  // free, and stay in the same family as code and quiz.
  captureFrame: 'Control+Alt+A',
  solveCapture: 'Control+Alt+S',
  toggleOverlay: 'Control+Shift+H',
  toggleListening: 'Control+Shift+M',
  toggleClickThrough: 'Control+Shift+C',
  moveUp: 'Control+Alt+Up',
  moveDown: 'Control+Alt+Down',
  moveLeft: 'Control+Alt+Left',
  moveRight: 'Control+Alt+Right',
  /*
   * X advances, Z rewinds: adjacent, left hand and no Fn.
   *
   * This shortcut is pressed many times in a row WHILE YOU SPEAK, a demand no
   * other one on the list has: it has to come out without looking and without
   * moving the hand. Z is to the left of X, so the position matches the
   * direction.
   *
   * The obvious one —Ctrl+Shift+Down/Up— was tried and Windows REJECTS it on a
   * normal machine: another app already had it taken. Ctrl+Alt+arrows move the
   * overlay, and Ctrl+Alt+Space, Ctrl+Shift+Enter and Ctrl+Alt+comma/period also
   * came out taken when checked.
   */
  teleprompterNext: 'Control+Alt+X',
  teleprompterPrev: 'Control+Alt+Z',
};

export const DEFAULT_SETTINGS: Settings = {
  stealthEnabled: true,
  decoyIcon: 'off',
  clickThrough: true,
  // Opaque by default: legibility rules. It can be lowered from the dashboard.
  overlayOpacity: 1,
  overlaySize: 'M',
  overlayFontScale: 1,
  overlayCompact: false,
  historyEnabled: true,

  llmProviderId: 'claude',
  llmModels: {
    claude: 'claude-sonnet-5',
    gemini: 'gemini-3.6-flash',
    openai: 'gpt-5.6-terra',
    deepseek: 'deepseek-v4-flash',
    ollama: '',
  },
  // `same` reproduces the behavior from before this existed.
  screenProviderId: 'same',
  screenModel: '',

  sttProviderId: 'gemini-live',
  language: 'auto',
  whisperModel: 'base',
  // No factory favorites: the star is set by whoever has a preferred model.
  favoriteLocalModels: [],
  audioSources: 'both',

  autoTriggerMode: 'heuristic',
  autoTriggerSpeaker: 'them',
  autoTriggerSensitivity: 'balanced',
  manualContextSeconds: 30,
  transcriptWindowSize: 40,
  // Off: stopping listening on its own is a behavior you choose, not a factory
  // value. The 10 minutes are kept for when it's turned on.
  idleShutoffEnabled: false,
  idleShutoffMinutes: 10,

  // English by default. The first launch adjusts it to the system language if it
  // happens to be Spanish; from there on whatever the user picks rules.
  uiLanguage: 'en',

  promptProfileId: 'interview',
  // No factory presets: the user creates them from their configuration.
  modelPresets: [],
  interpreterLangA: 'es',
  interpreterLangB: 'en',
  customProfiles: [],
  activeCustomId: '',
  hiddenProfiles: [],
  deletedProfiles: [],
  contextPacks: [],
  // No active skill: an instruction that changes the tone of every answer is
  // turned on on purpose, it doesn't come set from the factory.
  activeSkillId: '',
  codeLanguage: 'auto',
  answerLanguage: 'auto',
  // Manual stack by default: the user chooses on purpose which chunks go in.
  scrollCaptureMode: 'manual',

  hotkeys: DEFAULT_HOTKEYS,
  // All eleven on, which is how the app behaved before this existed. Disabling
  // one is a decision, not a factory value.
  disabledHotkeys: [],
  // Off: it completely changes how the answer is read, so it's a decision, not a
  // factory value.
  teleprompterEnabled: false,
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  // 8192 and not 2048: it's the minimum where prompt, transcript and memory fit
  // without Ollama starting to drop context silently.
  ollamaContextTokens: 8192,
  onboardingDone: false,
  // Both off: opening a port and publishing the text of the answers is a user
  // decision, not a factory value.
  phoneMirrorEnabled: false,
  phoneMirrorLan: false,
  // Off, and with the topic already set: whoever turns it on only has to fill in
  // their broker's address.
  mqttEnabled: false,
  mqttUrl: 'mqtt://192.168.1.100:1883',
  mqttTopic: 'tayori/answer',
  mqttUsername: '',
};

/**
 * Which provider and model solve the screen.
 *
 * It lives here and not in main because both sides need it: main to build the
 * provider, and the dashboard and overlay to show what's answering. If
 * `screenProviderId` is `same`, everything resolves as it did before this
 * setting existed.
 */
export function screenModelFor(settings: Settings): {
  providerId: LLMProviderId;
  model: string;
  /** `true` if it inherits from the main provider. */
  inherited: boolean;
} {
  if (settings.screenProviderId === 'same') {
    return {
      providerId: settings.llmProviderId,
      model: settings.llmModels[settings.llmProviderId],
      inherited: true,
    };
  }
  return {
    providerId: settings.screenProviderId,
    // With no model chosen it falls back to the provider's: better to answer
    // with something than fail on an empty field the user doesn't know exists.
    model: settings.screenModel || settings.llmModels[settings.screenProviderId],
    inherited: false,
  };
}

/**
 * The patch that a model mini-profile applies.
 *
 * Returns only the fields the preset governs. The delicate one is `llmModels`:
 * it's a `Record` per provider, so it's **merged** instead of replaced
 * —overwrite the model of the preset's provider and keep the rest— so as not to
 * lose the model the user chose in the other providers.
 */
export function applyModelPreset(current: Settings, preset: ModelPreset): Partial<Settings> {
  return {
    sttProviderId: preset.sttProviderId,
    whisperModel: preset.whisperModel,
    llmProviderId: preset.llmProviderId,
    llmModels: { ...current.llmModels, [preset.llmProviderId]: preset.llmModel },
    screenProviderId: preset.screenProviderId,
    screenModel: preset.screenModel,
    promptProfileId: preset.promptProfileId,
  };
}

/**
 * Captures the current configuration as a preset, without id or name (set by
 * whoever saves it). It's the inverse of `applyModelPreset`: what a preset pins
 * is what's read from here.
 */
export function presetFromSettings(settings: Settings): Omit<ModelPreset, 'id' | 'name'> {
  return {
    sttProviderId: settings.sttProviderId,
    whisperModel: settings.whisperModel,
    llmProviderId: settings.llmProviderId,
    llmModel: settings.llmModels[settings.llmProviderId],
    screenProviderId: settings.screenProviderId,
    screenModel: settings.screenModel,
    promptProfileId: settings.promptProfileId,
  };
}

/** Text-scale limits, shared by the setting and whoever applies it. */
export const FONT_SCALE = { min: 0.8, max: 1.8, step: 0.05 } as const;

/** Clamps the scale to a usable value; a hand-edited JSON can bring anything. */
export function clampFontScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(FONT_SCALE.max, Math.max(FONT_SCALE.min, value));
}

/**
 * The shortcuts that will actually be registered.
 *
 * The disabled ones come out with the accelerator **blank**, not out of the
 * map, and that's not an implementation detail: `registerHotkeys` and
 * `duplicateAccelerators` already skipped the empty ones from day one, so
 * disabling one reuses that path instead of opening a second concept of
 * "shortcut that doesn't count" in every place that iterates over them.
 *
 * Intended consequence: a disabled shortcut isn't registered —the combination
 * is left free for another app, which is exactly what the switch exists for—
 * nor can it clash with another or show up as rejected by Windows.
 */
export function activeHotkeys(settings: Settings): HotkeyMap {
  const off = new Set<string>(settings.disabledHotkeys);
  // With the teleprompter off its two shortcuts don't exist: there's no line to
  // advance, and the combination is left free for whoever wants it.
  if (!settings.teleprompterEnabled) {
    off.add('teleprompterNext');
    off.add('teleprompterPrev');
  }
  // Start from a copy and blank out the disabled ones, instead of rebuilding the
  // object with `fromEntries`: that returns a `Record<string, string>` that has
  // to be cast to `HotkeyMap`, and the cast is exactly what would stop warning
  // the day `HotkeyMap` is missing a key.
  const active: HotkeyMap = { ...settings.hotkeys };
  for (const action of Object.keys(active) as (keyof HotkeyMap)[]) {
    if (off.has(action)) active[action] = '';
  }
  return active;
}

/**
 * Shortcut labels, so they can be listed without repeating the texts in every
 * place that shows them. The order is the one in the README table.
 */
export const HOTKEY_LABEL: Record<keyof HotkeyMap, UIKey> = {
  askNow: 'hk.askNow',
  screenshotAndAsk: 'hk.screenshotAndAsk',
  solveOnScreen: 'hk.solveOnScreen',
  solveQuiz: 'hk.solveQuiz',
  captureFrame: 'hk.captureFrame',
  solveCapture: 'hk.solveCapture',
  toggleOverlay: 'hk.toggleOverlay',
  toggleListening: 'hk.toggleListening',
  toggleClickThrough: 'hk.toggleClickThrough',
  moveUp: 'hk.moveUp',
  moveDown: 'hk.moveDown',
  moveLeft: 'hk.moveLeft',
  moveRight: 'hk.moveRight',
  teleprompterNext: 'hk.teleprompterNext',
  teleprompterPrev: 'hk.teleprompterPrev',
};

/**
 * The machine the app runs on, to recommend a local model with judgment.
 *
 * It deliberately doesn't include VRAM: it's the number that really decides
 * whether a model fits in the GPU and there's no reliable way to read it from
 * Electron. Giving a made-up figure would be worse than not giving one.
 */
export interface SystemSpecs {
  totalMemoryGB: number;
  cpuModel: string;
  cpuCores: number;
  /** Commercial GPU name, if it could be figured out. */
  gpu?: string;
}

/**
 * Local-model recommendation for a machine.
 *
 * It's computed in the renderer because it's a table, not a measurement: the
 * part that is measuring lives in `system-specs.ts`.
 */
export interface LocalModelAdvice {
  /** How this machine is summarized in one line. Carries the `{ram}` slot. */
  tier: UIKey;
  /** For conversing: the one that answers what's heard. Latency comes first. */
  chat: { model: string; note: UIKey };
  /** For the screen: it has to SEE. Reading a capture comes first. */
  vision: { model: string; note: UIKey };
  /** Honest warning about what it will cost on this machine. */
  caveat: UIKey;
}

/**
 * What to recommend based on RAM, which is the only thing measured with
 * certainty.
 *
 * The tiers come from a simple rule: a model quantized to 4 bits takes roughly
 * 0.6 GB per billion parameters, and you have to leave room for the system and
 * the context window. Hence a 7B asks for ~8 GB free and a 14B lands around
 * 16 GB.
 *
 * The names are from Ollama's library and may change over time; that's why the
 * dashboard also shows the command and links to the library instead of
 * promising they exist forever.
 *
 * The texts come out as **keys**, not sentences: this is consumed by the
 * dashboard, the assistant and the model guide, and all three paint in the
 * language of whoever's looking. The `tier` carries the `{ram}` slot.
 */
export function adviseLocalModels(specs: SystemSpecs): LocalModelAdvice {
  const ram = specs.totalMemoryGB;

  if (ram < 8) {
    return {
      tier: 'local.tierTight',
      chat: { model: 'llama3.2:1b', note: 'local.noteLlama1b' },
      vision: { model: 'moondream', note: 'local.noteMoondream' },
      caveat: 'local.caveatTight',
    };
  }

  if (ram < 16) {
    return {
      tier: 'local.tierSmall',
      chat: { model: 'llama3.2:3b', note: 'local.noteLlama3b' },
      vision: { model: 'qwen2.5vl:3b', note: 'local.noteQwenVl3b' },
      caveat: 'local.caveatSmall',
    };
  }

  if (ram < 32) {
    return {
      tier: 'local.tierComfy',
      chat: { model: 'llama3.1:8b', note: 'local.noteLlama8b' },
      vision: { model: 'qwen2.5vl:7b', note: 'local.noteQwenVl7b' },
      caveat: 'local.caveatComfy',
    };
  }

  return {
    tier: 'local.tierBig',
    chat: { model: 'qwen2.5:14b', note: 'local.noteQwen14b' },
    vision: { model: 'qwen2.5vl:32b', note: 'local.noteQwenVl32b' },
    caveat: 'local.caveatBig',
  };
}

/** State of the local Ollama server, probed on demand. */
export interface OllamaStatus {
  /** `false` if Ollama isn't installed or isn't running. */
  reachable: boolean;
  version?: string;
  /** Models already downloaded on the machine. */
  models: ModelInfo[];
  error?: string;
}

/**
 * Progress of what the setup wizard installs on its own.
 *
 * A single type for the two phases because the user sees one bar: they don't
 * care whether what takes time is winget or a three-gig download, and splitting
 * it into two shapes would force the UI to know which one it's in to read the
 * right field.
 */
export interface SetupProgress {
  phase: 'install' | 'pull';
  /** Which model is downloading. Empty during Ollama's installation. */
  model?: string;
  /** Human-readable line as-is, along the lines of "downloading manifest". */
  message: string;
  /** Only during a model download; `0` while the total isn't known. */
  receivedBytes?: number;
  totalBytes?: number;
}

/**
 * State of the phone mirror, as the dashboard shows it.
 *
 * The QR travels as a **module matrix**, not as an image: drawing it is an
 * `<svg>` of rectangles in the renderer, so there's no need for a `data:` URI
 * the CSP has to allow, it comes out crisp at any size and adapts to the theme
 * without regenerating it.
 */
export interface PhoneMirrorStatus {
  running: boolean;
  /** `true` if it listens on the LAN; `false` if only on loopback. */
  lan: boolean;
  /** Primary link, with the token in place. Empty if it's not running. */
  url: string;
  /**
   * Other, equally valid links.
   *
   * It's not a luxury: a machine with VPN, Docker or VirtualBox has several
   * IPv4s and the first one isn't always the right one. Guessing wrong and not
   * offering an alternative leaves the user with a QR that leads nowhere.
   */
  alternates: string[];
  /** Modules of the `url` QR, row by row. Empty if it's not running. */
  qr: boolean[][];
  /** Phones connected right now. It's the only confirmation that it works. */
  clients: number;
  /** Why it didn't start, if it didn't. */
  error?: string;
}

/**
 * Cleans up a model id typed or pasted by hand.
 *
 * It exists because of a concrete, very hard-to-see failure: an id copied from
 * a documentation page is pasted with a trailing space —or a line break, or a
 * non-breaking space— and the provider responds 404. The message that arrives
 * is "the given model doesn't exist", which sends you looking for the right
 * model when the model was already right. A model id has no spaces in any of the
 * providers, so removing them can't break anything.
 */
export function normalizeModelId(raw: string): string {
  return raw.replace(/\s+/g, '').trim();
}

/**
 * Result of checking whether there's a new version on GitHub.
 *
 * It crosses the IPC (the dashboard asks for it, main resolves it by querying
 * the releases API), so it lives here. `downloadUrl` may come empty if the
 * release doesn't carry the portable `.exe`; the UI then falls back to "View
 * release".
 */
export interface UpdateInfo {
  current: string;
  latest: string;
  isNewer: boolean;
  /** Release notes (raw Markdown), to show a summary. */
  notes: string;
  releaseUrl: string;
  downloadUrl: string;
}

/**
 * `true` if `latest` is a version after `current` (simple semver).
 *
 * Compares major.minor.patch numerically, tolerates the leading `v` of tags,
 * and any suffix (`-beta`) is ignored by falling back to the base. Pure so it
 * can be pinned with a test: string comparison ("1.10.0" < "1.9.0"
 * alphabetically) is exactly the bug this avoids.
 */
export function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/i, '')
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < 3; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/**
 * Whether the chosen provider can answer right now.
 *
 * It lives here, and in `shared/`, because **three screens did this same
 * calculation separately**: the dashboard warning, the overlay's central state
 * and the wizard step. Each was an `if` chain with the providers of when it was
 * written, and none broke the build when a new one was added — the chain simply
 * fell to the last case and answered for the wrong provider. Adding ChatGPT
 * exposed it: ask about Ollama and have the Google key answer.
 *
 * The `Record` is what actually fixes it: a new id in `LLMProviderId` **doesn't
 * compile** until someone decides what that provider needs to be able to answer.
 */
const READY_BY_PROVIDER: Record<
  LLMProviderId,
  (settings: Settings, presence: SecretsPresence) => boolean
> = {
  // Ollama needs no credential, but it DOES need a chosen model: without it
  // every question fails with "no model is selected".
  ollama: (settings) => Boolean(settings.llmModels.ollama),
  claude: (_settings, presence) => presence.anthropic,
  gemini: (_settings, presence) => presence.google,
  openai: (_settings, presence) => presence.openai,
  deepseek: (_settings, presence) => presence.deepseek,
};

export function providerIsReady(settings: Settings, presence: SecretsPresence): boolean {
  return llmProviderReady(settings.llmProviderId, settings, presence);
}

/** Whether a SPECIFIC provider —not just the active one— could answer now. */
export function llmProviderReady(
  id: LLMProviderId,
  settings: Settings,
  presence: SecretsPresence
): boolean {
  return READY_BY_PROVIDER[id](settings, presence);
}

/** Answer-provider names: proper nouns, not translated. */
export const LLM_LABEL: Record<LLMProviderId, string> = {
  claude: 'Claude',
  gemini: 'Gemini',
  openai: 'ChatGPT',
  deepseek: 'DeepSeek',
  ollama: 'Ollama',
};

/** Every answer provider, in the order they're offered. */
export const LLM_PROVIDER_IDS: readonly LLMProviderId[] = [
  'claude',
  'gemini',
  'openai',
  'deepseek',
  'ollama',
];

/** The custom profile currently active — only meaningful when profile is 'custom'. */
export function activeCustomProfile(settings: Settings): CustomProfile | undefined {
  return settings.customProfiles.find((p) => p.id === settings.activeCustomId);
}

/** The keys never travel to the renderer; only whether they're present or not. */
export interface SecretsPresence {
  anthropic: boolean;
  google: boolean;
  /**
   * OpenAI API key.
   *
   * It works for answering and for transcribing, like Google's: the
   * `openai-live` and `openai-transcribe` engines use this same one. Anthropic's
   * is the only one that only answers.
   */
  openai: boolean;
  /**
   * DeepSeek API key.
   *
   * Answers only: they have no transcription models, so speech is still handled
   * by another engine.
   */
  deepseek: boolean;
  /**
   * MQTT broker password.
   *
   * It lives here and not in `settings.json` because it's a credential, and the
   * project's rule on credentials doesn't distinguish expensive from cheap ones:
   * they're encrypted with DPAPI and don't come back to the renderer. A home
   * broker seems harmless until the same password opens something else.
   */
  mqtt: boolean;
}

export type SecretKey = keyof SecretsPresence;

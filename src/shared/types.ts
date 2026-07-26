/**
 * Tipos compartidos entre main, preload y renderer.
 * Fuente única de verdad: si un tipo cruza el puente IPC, vive aquí.
 */

// ─────────────────────────── Audio y transcripción ───────────────────────────

/**
 * Quién habla. Se deriva del stream de origen, no de diarización:
 * `me` viene del micrófono, `them` del loopback del sistema.
 */
export type Speaker = 'me' | 'them';

/** Frecuencia de muestreo a la que normalizamos todo el audio antes del STT. */
export const TARGET_SAMPLE_RATE = 16_000 as const;

export interface TranscriptSegment {
  id: string;
  speaker: Speaker;
  text: string;
  /** `false` mientras el STT aún puede revisar el texto. */
  isFinal: boolean;
  /** Epoch ms del inicio del habla. */
  startedAt: number;
  endedAt?: number;
}

/** Nivel de señal por stream, para el indicador visual del overlay. */
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

export type LLMProviderId = 'claude' | 'gemini' | 'ollama';
export type STTProviderId = 'gemini-live' | 'whisper-local';

export interface ModelInfo {
  id: string;
  label: string;
  /** Si acepta imágenes; controla si adjuntamos screenshots. */
  supportsVision: boolean;
}

export interface ImageAttachment {
  mime: 'image/jpeg' | 'image/png';
  /** Sin el prefijo `data:`. */
  base64: string;
}

// ──────────────────────────────── Respuestas ────────────────────────────────

export type AnswerStatus = 'idle' | 'thinking' | 'streaming' | 'done' | 'aborted' | 'error';

/** Qué originó la consulta; útil para depurar y para métricas. */
export type AnswerTrigger = 'hotkey' | 'auto' | 'manual-input';

export interface Answer {
  id: string;
  status: AnswerStatus;
  trigger: AnswerTrigger;
  /** La pregunta detectada o escrita que originó la respuesta. */
  question: string;
  /** Texto acumulado hasta ahora. */
  text: string;
  providerId: LLMProviderId;
  model: string;
  createdAt: number;
  error?: string;
}

// ───────────────────────────────── Settings ─────────────────────────────────

/** Escalera de auto-disparo, de más barato a más costoso. */
export type AutoTriggerMode = 'off' | 'heuristic' | 'heuristic+classifier';

export interface ContextPack {
  id: string;
  name: string;
  /** Ej. el CV, la descripción del puesto, notas técnicas. */
  content: string;
  enabled: boolean;
}

export type PromptProfileId = 'interview' | 'meeting' | 'lecture' | 'support' | 'custom';

export interface HotkeyMap {
  askNow: string;
  screenshotAndAsk: string;
  toggleOverlay: string;
  toggleListening: string;
  toggleClickThrough: string;
  openDashboard: string;
  moveUp: string;
  moveDown: string;
  moveLeft: string;
  moveRight: string;
}

export interface Settings {
  /**
   * `true` = invisible al compartir pantalla (setContentProtection activo).
   * El switch del dashboard invierte esto para volver la app detectable.
   */
  stealthEnabled: boolean;
  /** Si el overlay ignora clics y los reenvía a la ventana de abajo. */
  clickThrough: boolean;
  overlayOpacity: number;

  llmProviderId: LLMProviderId;
  /** Modelo elegido por provider, para no perder la selección al cambiar. */
  llmModels: Record<LLMProviderId, string>;

  sttProviderId: STTProviderId;
  /** Código BCP-47; `auto` deja que el provider decida. */
  language: string;
  whisperModel: string;

  autoTriggerMode: AutoTriggerMode;
  /** Segundos de transcript que se envían con el hotkey manual. */
  manualContextSeconds: number;
  /** Máximo de segmentos que retiene el buffer rodante. */
  transcriptWindowSize: number;

  promptProfileId: PromptProfileId;
  customPrompt: string;
  contextPacks: ContextPack[];

  hotkeys: HotkeyMap;
  ollamaBaseUrl: string;
}

export const DEFAULT_HOTKEYS: HotkeyMap = {
  askNow: 'Control+Enter',
  screenshotAndAsk: 'Control+Shift+S',
  toggleOverlay: 'Control+Shift+H',
  toggleListening: 'Control+Shift+M',
  toggleClickThrough: 'Control+Shift+C',
  openDashboard: 'Control+Shift+D',
  moveUp: 'Control+Alt+Up',
  moveDown: 'Control+Alt+Down',
  moveLeft: 'Control+Alt+Left',
  moveRight: 'Control+Alt+Right',
};

export const DEFAULT_SETTINGS: Settings = {
  stealthEnabled: true,
  clickThrough: true,
  // Opaco por defecto: la legibilidad manda. Se puede bajar desde el dashboard.
  overlayOpacity: 1,

  llmProviderId: 'claude',
  llmModels: {
    claude: 'claude-sonnet-5',
    gemini: 'gemini-2.5-flash',
    ollama: '',
  },

  sttProviderId: 'gemini-live',
  language: 'auto',
  whisperModel: 'base',

  autoTriggerMode: 'heuristic',
  manualContextSeconds: 30,
  transcriptWindowSize: 40,

  promptProfileId: 'interview',
  customPrompt: '',
  contextPacks: [],

  hotkeys: DEFAULT_HOTKEYS,
  ollamaBaseUrl: 'http://127.0.0.1:11434',
};

/** Las keys nunca viajan al renderer; solo si están presentes o no. */
export interface SecretsPresence {
  anthropic: boolean;
  google: boolean;
}

export type SecretKey = keyof SecretsPresence;

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

/**
 * Qué fuentes de audio se escuchan.
 *
 * `system` (solo la salida del sistema) es lo que quieres si te molesta que el
 * asistente procese tus propias respuestas. Nota: el auto-disparo ya ignora lo
 * que dices tú — solo evalúa intervenciones del interlocutor — así que esto
 * afecta al contexto que se envía al modelo, no a cuándo se dispara.
 */
export type AudioSourceMode = 'both' | 'system' | 'mic';

/** Traduce el modo a los hablantes que estarán activos. */
export function speakersFor(mode: AudioSourceMode): Speaker[] {
  if (mode === 'system') return ['them'];
  if (mode === 'mic') return ['me'];
  return ['me', 'them'];
}

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

/**
 * Qué hablante puede disparar una respuesta automática.
 *
 * El default es y sigue siendo `them`: en una entrevista responder a tu propia
 * voz no tiene sentido, y el detector está afinado para precisión sobre recall.
 * Es configurable porque la combinación `audioSources: 'mic'` + `them` deja el
 * auto-disparo muerto en silencio — no hay carril `them` que evaluar — y quien
 * usa la app para dictar preguntas necesita `me`.
 */
export type AutoTriggerSpeaker = 'them' | 'me' | 'any';

export interface ContextPack {
  id: string;
  name: string;
  /** Ej. el CV, la descripción del puesto, notas técnicas. */
  content: string;
  enabled: boolean;
}

export type PromptProfileId = 'interview' | 'meeting' | 'lecture' | 'support' | 'custom';

/**
 * No hay atajo para el dashboard a propósito: se abre únicamente con el botón
 * de engranaje del overlay. Si el overlay está oculto, `toggleOverlay` lo
 * recupera.
 */
export interface HotkeyMap {
  askNow: string;
  screenshotAndAsk: string;
  toggleOverlay: string;
  toggleListening: string;
  toggleClickThrough: string;
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

  /** Qué se escucha: micrófono, salida del sistema, o ambas. */
  audioSources: AudioSourceMode;

  autoTriggerMode: AutoTriggerMode;
  /** Quién puede disparar una respuesta automática. */
  autoTriggerSpeaker: AutoTriggerSpeaker;
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

/**
 * `true` si los ajustes dejan el auto-disparo inerte: el hablante que debería
 * dispararlo no está entre los que se escuchan, así que no puede saltar nunca.
 *
 * Es un fallo silencioso —todo el pipeline funciona y la última puerta se cierra
 * sin traza—, así que el main lo registra al arrancar la transcripción y el
 * dashboard lo avisa. Ambos usan esta función para no duplicar la regla.
 */
export function autoTriggerIsInert(
  settings: Pick<Settings, 'autoTriggerMode' | 'autoTriggerSpeaker' | 'audioSources'>
): boolean {
  if (settings.autoTriggerMode === 'off') return false;
  if (settings.autoTriggerSpeaker === 'any') return false;
  return !speakersFor(settings.audioSources).includes(settings.autoTriggerSpeaker);
}

export const DEFAULT_HOTKEYS: HotkeyMap = {
  askNow: 'Control+Enter',
  screenshotAndAsk: 'Control+Shift+S',
  toggleOverlay: 'Control+Shift+H',
  toggleListening: 'Control+Shift+M',
  toggleClickThrough: 'Control+Shift+C',
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
  audioSources: 'both',

  autoTriggerMode: 'heuristic',
  autoTriggerSpeaker: 'them',
  manualContextSeconds: 30,
  transcriptWindowSize: 40,

  promptProfileId: 'interview',
  customPrompt: '',
  contextPacks: [],

  hotkeys: DEFAULT_HOTKEYS,
  ollamaBaseUrl: 'http://127.0.0.1:11434',
};

/** Estado del servidor local de Ollama, sondeado bajo demanda. */
export interface OllamaStatus {
  /** `false` si Ollama no está instalado o no está corriendo. */
  reachable: boolean;
  version?: string;
  /** Modelos ya descargados en la máquina. */
  models: ModelInfo[];
  error?: string;
}

/** Las keys nunca viajan al renderer; solo si están presentes o no. */
export interface SecretsPresence {
  anthropic: boolean;
  google: boolean;
}

export type SecretKey = keyof SecretsPresence;

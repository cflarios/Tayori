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
export type STTProviderId = 'gemini-live' | 'whisper-local' | 'gemini-audio';

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

// ──────────────────────────────── Historial ─────────────────────────────────

/**
 * Una pregunta y su respuesta, ya cerradas.
 *
 * Se guarda el proveedor y el modelo junto al texto: al repasar una respuesta
 * floja lo primero que quieres saber es con qué la generaste, y esa información
 * ya no está en ningún otro sitio una vez cambias de modelo.
 */
export interface ConversationTurn {
  id: string;
  question: string;
  answer: string;
  trigger: AnswerTrigger;
  providerId: LLMProviderId;
  model: string;
  createdAt: number;
  /** Presente si la generación falló; el turno se guarda igual. */
  error?: string;
}

export interface Conversation {
  id: string;
  /** Derivado de la primera pregunta; el usuario no tiene que ponerle nombre. */
  title: string;
  startedAt: number;
  endedAt?: number;
  profileId: PromptProfileId;
  /** Transcripción completa, sólo segmentos cerrados. */
  segments: TranscriptSegment[];
  turns: ConversationTurn[];
}

/**
 * Cabecera para pintar la lista sin leer el cuerpo entero de cada archivo.
 * Con 200 conversaciones, cargar todas para mostrar una lista sería absurdo.
 */
export interface ConversationSummary {
  id: string;
  title: string;
  startedAt: number;
  turnCount: number;
  segmentCount: number;
}

/** Título a partir de la primera intervención útil. */
export function conversationTitle(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (!clean) return 'Conversación sin título';
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
}

// ───────────────────────────────── Settings ─────────────────────────────────

/**
 * Tamaños del overlay.
 *
 * Cuatro presets en vez de un redimensionado libre: la ventana es `frameless`,
 * así que no hay bordes que arrastrar, y montar asas propias por un ajuste que
 * se toca dos veces no compensa.
 */
export type OverlaySize = 'S' | 'M' | 'L' | 'XL';

export const OVERLAY_SIZES: Record<OverlaySize, { width: number; height: number }> = {
  S: { width: 380, height: 420 },
  M: { width: 460, height: 560 },
  L: { width: 560, height: 700 },
  XL: { width: 680, height: 820 },
};

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

/**
 * Cuánto se arriesga el detector de preguntas.
 *
 * Existe porque el equilibrio correcto **depende de para qué uses la app**, y no
 * hay un único acierto:
 *
 * - `strict`: sólo señales inequívocas (interrogativo al principio, signo de
 *   interrogación, apertura imperativa). Es el comportamiento original, pensado
 *   para una entrevista real donde una sugerencia a destiempo distrae.
 * - `balanced`: añade interrogativos acentuados en cualquier posición y
 *   fórmulas de consulta. Recupera las preguntas que el ASR entrega sin signos.
 * - `all`: responde a toda intervención cerrada que no sea una muletilla. Es lo
 *   que quieres cuando eres tú quien le dicta las preguntas a propósito, porque
 *   ahí no hay ruido del que protegerse.
 */
export type AutoTriggerSensitivity = 'strict' | 'balanced' | 'all';

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
  /** Tamaño del panel. Ver `OVERLAY_SIZES`. */
  overlaySize: OverlaySize;

  /**
   * Si las conversaciones se guardan en disco.
   *
   * Rompe la promesa original de "la app no graba nada": mientras esté activo
   * se escriben transcripciones a `userData/conversations`. Es un interruptor y
   * no una constante justamente para que se pueda volver al comportamiento
   * anterior sin desinstalar nada.
   */
  historyEnabled: boolean;

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
  /** Cuánto se arriesga el detector al decidir si algo es una pregunta. */
  autoTriggerSensitivity: AutoTriggerSensitivity;
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
  overlaySize: 'M',
  historyEnabled: true,

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
  autoTriggerSensitivity: 'balanced',
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

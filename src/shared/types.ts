import type { UIKey, UILang } from './i18n';

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

export type LLMProviderId = 'claude' | 'gemini' | 'openai' | 'deepseek' | 'ollama';
export type STTProviderId =
  | 'gemini-live'
  | 'whisper-local'
  | 'gemini-audio'
  | 'openai-live'
  | 'openai-transcribe';

export interface ModelInfo {
  id: string;
  label: string;
  /** Si acepta imágenes; controla si adjuntamos screenshots. */
  supportsVision: boolean;
  /**
   * El «(rápido)», «(más capaz)» que acompaña al nombre, como clave.
   *
   * Va aparte del `label` porque el nombre del modelo es un **nombre propio**
   * —«Claude Sonnet 5» no se traduce— y el cualificador sí. Tenerlos pegados
   * dejaba media etiqueta en español dentro de un desplegable en inglés, que es
   * de las cosas que más cantan porque se ven sin abrir nada.
   */
  note?: UIKey;
}

export interface ImageAttachment {
  mime: 'image/jpeg' | 'image/png';
  /** Sin el prefijo `data:`. */
  base64: string;
}

// ────────────────────────────────── Skills ──────────────────────────────────

/**
 * Una instrucción suelta que refina **cómo** responde el modelo.
 *
 * Formato de Anthropic: una carpeta con un `SKILL.md` que lleva frontmatter y
 * el cuerpo en Markdown. Ver `shared/skills.ts` para el parser y
 * `main/skills/` para la carga.
 *
 * No se confunde con las otras dos cosas que acaban en el mismo prompt: el
 * perfil dice **qué forma** tiene la respuesta y los context packs aportan
 * **material**. Una skill cambia la **manera** — el tono, las palabras que
 * evita, el ritmo — y por eso se suma a un perfil en lugar de sustituirlo.
 */
export interface Skill {
  /** Sale del nombre de la carpeta, que es lo que se escribe tras `/` o `$`. */
  id: string;
  /** Del frontmatter. Si falta, el id. */
  name: string;
  description: string;
  /** El cuerpo del SKILL.md: lo que de verdad se le manda al modelo. */
  instructions: string;
  /** Las que vienen con la app. No se pueden borrar, sí sustituir. */
  builtIn: boolean;
  /**
   * Sólo las de serie: su nombre y su descripción, como claves.
   *
   * Las del usuario traen el texto en el frontmatter y no hay nada que
   * traducir; las que escribimos nosotros sí, y son las únicas que ve alguien
   * que no ha creado ninguna. `name` y `description` siguen ahí porque el
   * prompt necesita una cadena —y los prompts no se traducen—, así que la UI
   * pinta la clave si la hay y el texto si no.
   */
  nameKey?: UIKey;
  descriptionKey?: UIKey;
  /**
   * Por qué no se puede usar, como clave.
   *
   * Una skill rota se lista igualmente, con su motivo. Desaparecer sin decir
   * nada dejaría a alguien mirando una carpeta que sí existe y preguntándose
   * por qué la app no la ve. Es una clave y no una frase porque quien lee el
   * motivo es una persona, y puede tener la app en cualquiera de los dos
   * idiomas.
   */
  error?: UIKey;
  /** Lo que dijo el sistema, cuando el motivo lo trae `readFile` y no nosotros. */
  errorDetail?: string;
}

// ──────────────────────────────── Respuestas ────────────────────────────────

export type AnswerStatus = 'idle' | 'thinking' | 'streaming' | 'done' | 'aborted' | 'error';

/**
 * Qué originó la consulta; útil para depurar y para métricas.
 *
 * `code` es el único que además cambia CÓMO se responde: fuerza el perfil de
 * programación y un tope de tokens mayor, porque un algoritmo no cabe en las
 * cuatro viñetas que sirven para hablar.
 */
export type AnswerTrigger = 'hotkey' | 'auto' | 'manual-input' | 'code' | 'quiz';

/** `true` si el disparo viene de resolver la pantalla. */
export function isScreenTrigger(trigger: AnswerTrigger): trigger is ScreenTask {
  return trigger === 'code' || trigger === 'quiz';
}

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

/**
 * Título a partir de la primera intervención útil.
 *
 * Sin nada aprovechable devuelve **cadena vacía**, y no un «sin título» ya
 * escrito: el título se guarda en disco y se pinta en el dashboard, así que un
 * literal aquí sería una frase en un idioma dentro de una interfaz que puede
 * estar en el otro. El hueco lo rellena la UI con su clave (`hist.untitled`),
 * que es la única que sabe en qué idioma está mirando alguien.
 */
export function conversationTitle(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (!clean) return '';
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

/**
 * Qué ES un contexto, no sólo cómo se llama.
 *
 * Antes todos los packs eran texto libre y el prompt los volcaba igual, bajo un
 * `## Nombre`. Pero un CV, una oferta y una respuesta que has preparado piden
 * instrucciones distintas: el CV es la fuente de verdad sobre ti, la oferta
 * dice hacia dónde alinear el discurso, y una respuesta preparada hay que
 * **reutilizarla**, no parafrasearla. Sin el tipo, el modelo no podía saberlo.
 */
export type ContextKind = 'cv' | 'job' | 'qa' | 'vocabulary' | 'notes';

export interface ContextPack {
  id: string;
  name: string;
  /** Ej. el CV, la descripción del puesto, notas técnicas. */
  content: string;
  enabled: boolean;
  /** Qué clase de contexto es. Los packs antiguos son `notes`. */
  kind: ContextKind;
  /**
   * Perfiles en los que aplica. **Vacío significa siempre**, que es lo que
   * mantiene funcionando a los packs creados antes de que esto existiera.
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
  | 'custom';

/**
 * Las acciones que resuelven lo que hay en la pantalla.
 *
 * Comparten camino —captura de alta calidad, perfil forzado, modelo con visión—
 * y se diferencian en el prompt: un test de opción múltiple no se responde como
 * un ejercicio de programación.
 */
export type ScreenTask = 'code' | 'quiz';

/** Etiquetas de los tipos, compartidas entre el prompt y el dashboard. */
export const CONTEXT_KIND_LABEL: Record<ContextKind, string> = {
  cv: 'Tu CV o experiencia',
  job: 'Descripción del puesto',
  qa: 'Respuestas preparadas',
  vocabulary: 'Vocabulario',
  notes: 'Notas',
};

/**
 * Qué huecos ofrece el dashboard para cada perfil.
 *
 * No es una restricción: el usuario puede añadir cualquier tipo a cualquier
 * perfil. Es lo que se le enseña relleno de antemano para que no tenga que
 * adivinar qué conviene preparar para una entrevista.
 */
export const PROFILE_SLOTS: Record<PromptProfileId, ContextKind[]> = {
  interview: ['cv', 'job', 'qa', 'vocabulary'],
  meeting: ['notes', 'vocabulary'],
  lecture: ['notes', 'vocabulary'],
  support: ['notes', 'vocabulary'],
  coding: ['notes', 'vocabulary'],
  quiz: ['notes', 'vocabulary'],
  custom: ['notes', 'vocabulary'],
};

/** Los packs que aplican al perfil activo. Vacío en `profiles` = siempre. */
export function packsForProfile(
  packs: ContextPack[],
  profile: PromptProfileId
): ContextPack[] {
  return packs.filter(
    (pack) => pack.enabled && (pack.profiles.length === 0 || pack.profiles.includes(profile))
  );
}

/**
 * No hay atajo para el dashboard a propósito: se abre únicamente con el botón
 * de engranaje del overlay. Si el overlay está oculto, `toggleOverlay` lo
 * recupera.
 */
export interface HotkeyMap {
  askNow: string;
  screenshotAndAsk: string;
  /** Captura la pantalla y resuelve el problema de código que haya en ella. */
  solveOnScreen: string;
  /** Captura la pantalla y responde la pregunta de test que haya en ella. */
  solveQuiz: string;
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
   * Escala del texto de CONTENIDO del overlay: respuesta, código y transcripción.
   *
   * No toca la barra ni los chips a propósito. Los cuatro presets de tamaño
   * agrandan la ventana, no la letra, así que en un monitor 4K el panel crecía y
   * el texto seguía igual de pequeño. Escalar sólo el contenido es lo que
   * resuelve eso sin que los controles se coman el panel.
   */
  overlayFontScale: number;

  /**
   * Modo compacto: sólo la respuesta.
   *
   * Pliega los chips de perfil, la transcripción y el pie de atajos. Es el
   * estado que quieres cuando ya está todo configurado y el overlay sólo sirve
   * para leer. Se guarda porque quien lo prefiere lo prefiere siempre.
   */
  overlayCompact: boolean;

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

  /**
   * Proveedor para las acciones de pantalla (código y test), o `same` para usar
   * el de arriba.
   *
   * Existe porque las dos tareas piden cosas distintas y antes compartían un
   * único modelo. Lo hablado necesita **latencia**: la respuesta se lee mientras
   * alguien te mira. Lo de la pantalla necesita **vista y cabeza**: leer un
   * enunciado en una captura y no equivocarse. Un modelo local pequeño vale para
   * lo primero y no para lo segundo; uno grande de pago, al revés, es caro para
   * cada frase suelta de una reunión.
   *
   * El default es `same`, que reproduce exactamente el comportamiento anterior.
   */
  screenProviderId: LLMProviderId | 'same';

  /**
   * Modelo de las acciones de pantalla. Se ignora con `screenProviderId: same`.
   *
   * Es un campo suelto y no otro `Record` por provider: al elegir "Ollama para
   * la pantalla" lo que se quiere es un modelo **concreto** —el multimodal que
   * tengas descargado—, distinto del que uses para conversar aunque el
   * proveedor sea el mismo.
   */
  screenModel: string;

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

  /**
   * Idioma de la INTERFAZ.
   *
   * No confundir con `language`, que es el del reconocedor de voz y va en
   * BCP-47. Son dos cosas que suenan igual y no lo son: alguien puede tener la
   * app en inglés y estar entrevistándose en español, y de hecho es un caso
   * normal. Por eso son dos ajustes y no uno.
   */
  uiLanguage: UILang;

  promptProfileId: PromptProfileId;
  customPrompt: string;
  contextPacks: ContextPack[];

  /**
   * Skill aplicada a todas las respuestas. Vacío = ninguna.
   *
   * Es un solo id y no una lista **a propósito**. Dos instrucciones sobre cómo
   * escribir se contradicen enseguida —una pide frases cortas y otra un registro
   * cuidado— y el modelo resuelve el empate en silencio, así que el resultado
   * dependería del orden en que estuvieran encendidas. Con una sola, lo que se
   * lee en pantalla es lo que se le pidió.
   *
   * Se queda puesta entre consultas porque el caso que la justifica —«que no
   * suene a IA»— no es algo que se quiera para un mensaje: se quiere para toda
   * la conversación. Para un mensaje suelto está el prefijo `/skill`.
   */
  activeSkillId: string;

  /**
   * Lenguaje de programación de las soluciones del modo código.
   *
   * `auto` deja que lo deduzca de la pantalla, que es lo correcto cuando hay un
   * editor delante con el lenguaje ya elegido. Se fija a mano para el caso
   * contrario: un enunciado en blanco, o una prueba que exige un lenguaje
   * concreto que no se ve en la captura.
   */
  codeLanguage: string;

  hotkeys: HotkeyMap;
  ollamaBaseUrl: string;

  /**
   * Ventana de contexto de Ollama, en tokens (`num_ctx`).
   *
   * Ollama **no usa la del modelo**: aplica su propio valor por defecto, 2048
   * tokens, y lo que no cabe se descarta por el principio **sin ningún error**.
   * Con un system prompt con CV, la transcripción y ocho turnos de memoria, esos
   * 2048 se agotan enseguida y el síntoma es que el modelo "olvida" cosas que
   * acabas de decirle.
   *
   * Sube memoria: el caché de atención crece con este número, así que no se pone
   * al máximo por defecto.
   */
  ollamaContextTokens: number;

  /**
   * La guía de primeros pasos ya no hace falta.
   *
   * Se marca sola cuando los pasos están cumplidos, y también a mano: quien
   * sabe lo que hace no tiene por qué cargar con una lista de tareas encima de
   * su configuración para siempre.
   */
  onboardingDone: boolean;

  /**
   * Espejo en el teléfono: sirve las respuestas a un navegador del móvil.
   *
   * Resuelve el caso que el overlay no puede resolver por definición: cuando
   * **compartes la pantalla entera**, lo que se ve en tu monitor lo ve el otro
   * lado. El modo invisible cubre la captura de la ventana, pero no una cámara,
   * ni un monitor secundario que alguien mire, ni la duda de estar leyendo algo
   * que no está donde crees. Un segundo dispositivo saca la respuesta de la
   * pantalla compartida del todo.
   *
   * **Apagado por defecto, y no es simetría con los demás ajustes**: abre un
   * puerto y sirve por HTTP el texto de tus respuestas. Eso se enciende a
   * propósito o no se enciende.
   */
  phoneMirrorEnabled: boolean;

  /**
   * Si el espejo escucha en la red local o sólo en `127.0.0.1`.
   *
   * Con `false` —el defecto— sólo puede conectarse **esta misma máquina**, que
   * no sirve para un teléfono pero sí para probarlo y para túneles SSH. Con
   * `true` cualquiera de tu red que tenga el enlace puede leer las respuestas,
   * y por eso es un interruptor aparte y no una consecuencia de encender el
   * espejo: son dos decisiones distintas y la segunda es la que tiene alcance.
   */
  phoneMirrorLan: boolean;

  /**
   * Publicar las respuestas en un broker MQTT.
   *
   * No es una función de la app para la app: es una **salida hacia otra cosa**.
   * El caso que la motivó es un ESP32 suscrito al tema, que recibe la respuesta
   * de un test y hace lo que su dueño haya programado. Aquí se acaba nuestra
   * responsabilidad: publicamos, y lo que pase al otro lado es de quien montó
   * el dispositivo.
   *
   * Apagado por defecto, y con más motivo que el espejo del móvil: un broker
   * puede estar en internet, así que esto puede sacar el texto de tus
   * respuestas de tu red por completo.
   */
  mqttEnabled: boolean;

  /**
   * URL del broker, con el esquema por delante.
   *
   * Es un solo campo y no host/puerto/TLS por separado porque el esquema ya lo
   * dice todo: `mqtt://` va en claro y `mqtts://` cifrado. Partirlo en tres
   * casillas obligaría a inventar una checkbox de TLS que significa lo mismo
   * que cuatro letras.
   */
  mqttUrl: string;

  /** Tema base. Ver `mqttTopics()` para los dos que se publican. */
  mqttTopic: string;

  /** Usuario del broker; vacío si el broker es anónimo. La contraseña va cifrada. */
  mqttUsername: string;
}

/**
 * Los dos temas que se publican, derivados del tema base.
 *
 * Publicar **dos** no es indecisión: son dos consumidores distintos.
 * `<base>` lleva el JSON completo —id, pregunta, modelo, disparo— para quien
 * quiera contexto; `<base>/text` lleva **sólo el texto de la respuesta**, que es
 * lo que un microcontrolador puede usar sin meter un parser de JSON en 320 KB
 * de RAM. El caso que motivó esto es exactamente ése: una placa suscrita que
 * quiere las letras del test y nada más.
 *
 * Vive en `shared/` porque lo necesitan los dos lados: el main para publicar y
 * el dashboard para enseñar a qué suscribirse. Si se calcularan por separado,
 * la pantalla acabaría diciendo un tema y el broker recibiendo otro.
 */
export function mqttTopics(base: string): { json: string; text: string } {
  // Una barra final del usuario no debe convertirse en un tema con `//`, que
  // en MQTT es un nivel vacío y perfectamente legal — y por tanto otro tema.
  const clean = base.trim().replace(/\/+$/, '') || 'tayori/answer';
  return { json: clean, text: `${clean}/text` };
}

/** Estado de la conexión con el broker, tal y como lo enseña el dashboard. */
export interface MqttStatus {
  state: 'off' | 'connecting' | 'connected' | 'error';
  error?: string;
  /**
   * Respuestas publicadas en esta sesión.
   *
   * Es la única confirmación honesta de que la cosa funciona: un broker mal
   * puesto y uno bien puesto se ven igual desde aquí hasta que este número se
   * mueve.
   */
  published: number;
  /** Tema al que suscribirse, ya resuelto. Vacío si está apagado. */
  topic: string;
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

/**
 * Ajusta el patch para que cambiar de fuente no deje el disparo mudo.
 *
 * Elegir "Ellos" significa una cosa: quiero oír al interlocutor y que me
 * responda. Pero el disparo automático espera a un hablante concreto, y si ese
 * hablante deja de escucharse la combinación queda **inerte**: todo el pipeline
 * funciona, la transcripción entra, y la última puerta se cierra sin dejar
 * rastro. Le pasó a alguien de verdad: pulsó "Ellos", no llegó ninguna
 * respuesta, y sólo se arregló entrando al dashboard a cambiar a mano un ajuste
 * cuya relación con el botón que había pulsado no es evidente.
 *
 * Así que el hablante del disparo sigue a la fuente. Es cambiar un ajuste que
 * el usuario no pidió, sí — pero la alternativa es un silencio que se ve igual
 * que una app rota, y el cambio se le dice por pantalla.
 *
 * Sólo actúa en esa dirección. Cambiar el hablante a mano desde el dashboard NO
 * toca las fuentes: ahí el usuario está eligiendo el hablante a propósito, y el
 * propio dashboard ya avisa si la combinación no puede saltar.
 */
export function alignAutoTrigger(
  current: Settings,
  patch: Partial<Settings>
): Partial<Settings> {
  if (!patch.audioSources || patch.audioSources === current.audioSources) return patch;

  const merged = { ...current, ...patch };
  if (!autoTriggerIsInert(merged)) return patch;

  // Inerte implica que sólo se escucha un hablante y no es el esperado.
  const heard = speakersFor(merged.audioSources)[0];
  return heard ? { ...patch, autoTriggerSpeaker: heard } : patch;
}

export const DEFAULT_HOTKEYS: HotkeyMap = {
  askNow: 'Control+Enter',
  screenshotAndAsk: 'Control+Shift+S',
  // Control+Alt+C y no Control+Shift+C —que ya es el de los clics atravesables—
  // ni Control+Shift+X, que le quitaría el atajo de extensiones a VS Code: un
  // acelerador global gana al de la app que tenga el foco, y quien usa esto
  // suele tener el editor delante.
  solveOnScreen: 'Control+Alt+C',
  // Q de "quiz", en la misma familia que el de código.
  solveQuiz: 'Control+Alt+Q',
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
  overlayFontScale: 1,
  overlayCompact: false,
  historyEnabled: true,

  llmProviderId: 'claude',
  llmModels: {
    claude: 'claude-sonnet-5',
    gemini: 'gemini-2.5-flash',
    openai: 'gpt-5.6-terra',
    deepseek: 'deepseek-v4-flash',
    ollama: '',
  },
  // `same` reproduce el comportamiento de antes de que esto existiera.
  screenProviderId: 'same',
  screenModel: '',

  sttProviderId: 'gemini-live',
  language: 'auto',
  whisperModel: 'base',
  audioSources: 'both',

  autoTriggerMode: 'heuristic',
  autoTriggerSpeaker: 'them',
  autoTriggerSensitivity: 'balanced',
  manualContextSeconds: 30,
  transcriptWindowSize: 40,

  // Inglés por defecto. El primer arranque lo ajusta al idioma del sistema si
  // resulta ser español; a partir de ahí manda lo que el usuario elija.
  uiLanguage: 'en',

  promptProfileId: 'interview',
  customPrompt: '',
  contextPacks: [],
  // Ninguna skill activa: una instrucción que cambia el tono de todas las
  // respuestas se enciende a propósito, no viene puesta de fábrica.
  activeSkillId: '',
  codeLanguage: 'auto',

  hotkeys: DEFAULT_HOTKEYS,
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  // 8192 y no 2048: es el mínimo con el que caben prompt, transcripción y
  // memoria sin que Ollama empiece a tirar contexto en silencio.
  ollamaContextTokens: 8192,
  onboardingDone: false,
  // Los dos apagados: abrir un puerto y publicar el texto de las respuestas es
  // una decisión del usuario, no un valor de fábrica.
  phoneMirrorEnabled: false,
  phoneMirrorLan: false,
  // Apagado, y con el tema ya puesto: quien lo encienda sólo tiene que rellenar
  // la dirección de su broker.
  mqttEnabled: false,
  mqttUrl: 'mqtt://192.168.1.100:1883',
  mqttTopic: 'tayori/answer',
  mqttUsername: '',
};

/**
 * Qué proveedor y modelo resuelven la pantalla.
 *
 * Vive aquí y no en el main porque lo necesitan los dos lados: el main para
 * construir el proveedor, y el dashboard y el overlay para enseñar con qué se
 * está respondiendo. Si `screenProviderId` es `same`, todo se resuelve como
 * antes de que este ajuste existiera.
 */
export function screenModelFor(settings: Settings): {
  providerId: LLMProviderId;
  model: string;
  /** `true` si hereda del proveedor principal. */
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
    // Sin modelo elegido se cae al del proveedor: es mejor responder con algo
    // que fallar por un campo vacío que el usuario no sabe que existe.
    model: settings.screenModel || settings.llmModels[settings.screenProviderId],
    inherited: false,
  };
}

/** Límites de la escala de texto, compartidos por el ajuste y quien lo aplica. */
export const FONT_SCALE = { min: 0.8, max: 1.8, step: 0.05 } as const;

/** Recorta la escala a un valor usable; un JSON editado a mano puede traer cualquier cosa. */
export function clampFontScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(FONT_SCALE.max, Math.max(FONT_SCALE.min, value));
}

/**
 * Etiquetas de los atajos, para poder listarlos sin repetir los textos en cada
 * sitio que los enseñe. El orden es el de la tabla del README.
 */
export const HOTKEY_LABEL: Record<keyof HotkeyMap, UIKey> = {
  askNow: 'hk.askNow',
  screenshotAndAsk: 'hk.screenshotAndAsk',
  solveOnScreen: 'hk.solveOnScreen',
  solveQuiz: 'hk.solveQuiz',
  toggleOverlay: 'hk.toggleOverlay',
  toggleListening: 'hk.toggleListening',
  toggleClickThrough: 'hk.toggleClickThrough',
  moveUp: 'hk.moveUp',
  moveDown: 'hk.moveDown',
  moveLeft: 'hk.moveLeft',
  moveRight: 'hk.moveRight',
};

/**
 * La máquina donde corre la app, para recomendar un modelo local con criterio.
 *
 * No incluye VRAM a propósito: es el número que de verdad decide si un modelo
 * cabe en la GPU y no hay forma fiable de leerlo desde Electron. Dar una cifra
 * inventada sería peor que no darla.
 */
export interface SystemSpecs {
  totalMemoryGB: number;
  cpuModel: string;
  cpuCores: number;
  /** Nombre comercial de la GPU, si se pudo averiguar. */
  gpu?: string;
}

/**
 * Recomendación de modelos locales para una máquina.
 *
 * Se calcula en el renderer porque es una tabla, no una medida: la parte que sí
 * es medir vive en `system-specs.ts`.
 */
export interface LocalModelAdvice {
  /** Cómo se resume esta máquina en una línea. Lleva el hueco `{ram}`. */
  tier: UIKey;
  /** Para conversar: el que responde a lo que se oye. Prima la latencia. */
  chat: { model: string; note: UIKey };
  /** Para la pantalla: tiene que VER. Prima la capacidad de leer una captura. */
  vision: { model: string; note: UIKey };
  /** Advertencia honesta sobre lo que va a costar en esta máquina. */
  caveat: UIKey;
}

/**
 * Qué recomendar según la RAM, que es lo único que se mide con certeza.
 *
 * Los tramos salen de una regla sencilla: un modelo cuantizado a 4 bits ocupa
 * más o menos 0,6 GB por cada mil millones de parámetros, y hace falta dejarle
 * sitio al sistema y a la ventana de contexto. De ahí que un 7B pida ~8 GB
 * libres y un 14B ronde los 16 GB.
 *
 * Los nombres son de la biblioteca de Ollama y pueden cambiar con el tiempo;
 * por eso el dashboard enseña también el comando y enlaza a la biblioteca en
 * lugar de prometer que existen para siempre.
 *
 * Los textos salen como **claves**, no como frases: esto lo consumen el
 * dashboard, el asistente y la guía de modelos, y los tres pintan en el idioma
 * que tenga puesto quien mira. El `tier` lleva el hueco `{ram}`.
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

/** Estado del servidor local de Ollama, sondeado bajo demanda. */
export interface OllamaStatus {
  /** `false` si Ollama no está instalado o no está corriendo. */
  reachable: boolean;
  version?: string;
  /** Modelos ya descargados en la máquina. */
  models: ModelInfo[];
  error?: string;
}

/**
 * Progreso de lo que el asistente de configuración instala por su cuenta.
 *
 * Un solo tipo para las dos fases porque el usuario ve una sola barra: le da
 * igual si lo que tarda es winget o una descarga de tres gigas, y separarlo en
 * dos formas obligaría a la UI a saber en cuál está para leer el campo bueno.
 */
export interface SetupProgress {
  phase: 'install' | 'pull';
  /** Qué modelo se está bajando. Vacío durante la instalación de Ollama. */
  model?: string;
  /** Línea legible tal cual, del estilo «descargando manifest». */
  message: string;
  /** Sólo durante la descarga de un modelo; `0` mientras no se sepa el total. */
  receivedBytes?: number;
  totalBytes?: number;
}

/**
 * Estado del espejo del teléfono, tal y como lo enseña el dashboard.
 *
 * El QR viaja como **matriz de módulos**, no como imagen: dibujarlo es un
 * `<svg>` de rectángulos en el renderer, así que no hace falta un `data:` URI
 * que la CSP tenga que permitir, sale nítido a cualquier tamaño y se adapta al
 * tema sin regenerarlo.
 */
export interface PhoneMirrorStatus {
  running: boolean;
  /** `true` si escucha en la LAN; `false` si sólo en loopback. */
  lan: boolean;
  /** Enlace principal, con el token puesto. Vacío si no corre. */
  url: string;
  /**
   * Otros enlaces igual de válidos.
   *
   * No es un lujo: una máquina con VPN, Docker o VirtualBox tiene varias IPv4
   * y la primera no siempre es la buena. Adivinar mal y no ofrecer alternativa
   * deja al usuario con un QR que no lleva a ninguna parte.
   */
  alternates: string[];
  /** Módulos del QR de `url`, fila por fila. Vacío si no corre. */
  qr: boolean[][];
  /** Teléfonos conectados ahora mismo. Es la única confirmación de que funciona. */
  clients: number;
  /** Por qué no arrancó, si no arrancó. */
  error?: string;
}

/**
 * Limpia un id de modelo escrito o pegado a mano.
 *
 * Existe por un fallo concreto y muy difícil de ver: un id copiado de una
 * página de documentación se pega con un espacio al final —o con un salto de
 * línea, o con un espacio duro— y el proveedor responde 404. El mensaje que
 * llega es "el modelo indicado no existe", que manda a buscar el modelo bueno
 * cuando el modelo ya era el bueno. Un id de modelo no lleva espacios en
 * ninguno de los proveedores, así que quitarlos no puede romper nada.
 */
export function normalizeModelId(raw: string): string {
  return raw.replace(/\s+/g, '').trim();
}

/**
 * Si el proveedor elegido puede responder ahora mismo.
 *
 * Vive aquí, y en `shared/`, porque **tres pantallas hacían esta misma cuenta
 * por separado**: el aviso del dashboard, el estado central del overlay y el
 * paso del asistente. Cada una era una cadena de `if` con los proveedores de
 * cuando se escribió, y ninguna rompía el build al añadir uno nuevo — la
 * cadena simplemente caía al último caso y contestaba por el proveedor
 * equivocado. Añadir ChatGPT lo dejó a la vista: preguntar por Ollama y que
 * respondiera la clave de Google.
 *
 * El `Record` es lo que lo arregla de verdad: un id nuevo en `LLMProviderId`
 * **no compila** hasta que alguien decida qué necesita ese proveedor para
 * poder responder.
 */
const READY_BY_PROVIDER: Record<
  LLMProviderId,
  (settings: Settings, presence: SecretsPresence) => boolean
> = {
  // Ollama no necesita credencial, pero SÍ un modelo elegido: sin él cada
  // pregunta falla con "no hay ningún modelo seleccionado".
  ollama: (settings) => Boolean(settings.llmModels.ollama),
  claude: (_settings, presence) => presence.anthropic,
  gemini: (_settings, presence) => presence.google,
  openai: (_settings, presence) => presence.openai,
  deepseek: (_settings, presence) => presence.deepseek,
};

export function providerIsReady(settings: Settings, presence: SecretsPresence): boolean {
  return READY_BY_PROVIDER[settings.llmProviderId](settings, presence);
}

/** Las keys nunca viajan al renderer; solo si están presentes o no. */
export interface SecretsPresence {
  anthropic: boolean;
  google: boolean;
  /**
   * API key de OpenAI.
   *
   * Vale para responder y para transcribir, igual que la de Google: los motores
   * `openai-live` y `openai-transcribe` usan ésta misma. La de Anthropic es la
   * única que sólo sirve para responder.
   */
  openai: boolean;
  /**
   * API key de DeepSeek.
   *
   * Sólo responde: no tienen modelos de transcripción, así que la voz la sigue
   * resolviendo otro motor.
   */
  deepseek: boolean;
  /**
   * Contraseña del broker MQTT.
   *
   * Vive aquí y no en `settings.json` porque es una credencial, y la regla del
   * proyecto sobre credenciales no distingue entre las caras y las baratas: se
   * cifran con DPAPI y no vuelven al renderer. Un broker de la red de casa
   * parece inofensivo hasta que la misma contraseña abre otra cosa.
   */
  mqtt: boolean;
}

export type SecretKey = keyof SecretsPresence;

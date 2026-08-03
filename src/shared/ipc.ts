/**
 * Contrato IPC. Los nombres de canal viven aquí para que main y preload
 * no puedan desincronizarse con un string mal escrito.
 *
 * Convención:
 *   - `invoke`: renderer → main, con respuesta (request/response).
 *   - `send`:   renderer → main, sin respuesta (fire-and-forget, alta frecuencia).
 *   - `event`:  main → renderer (broadcast).
 */

export const IPC = {
  // ── invoke ──
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  secretsGetPresence: 'secrets:get-presence',
  secretsSet: 'secrets:set',
  secretsClear: 'secrets:clear',

  stealthSet: 'stealth:set',
  clickThroughSet: 'click-through:set',
  overlayHide: 'overlay:hide',
  overlayResize: 'overlay:resize',
  overlayMouseIgnore: 'overlay:mouse-ignore',
  /** Vuelve el overlay enfocable para poder escribir en él. Ver `overlay.ts`. */
  overlayInteractive: 'overlay:interactive',
  overlayDragStart: 'overlay:drag-start',
  overlayDragEnd: 'overlay:drag-end',
  overlayQuit: 'overlay:quit',
  dashboardOpen: 'dashboard:open',

  captureStart: 'capture:start',
  captureStop: 'capture:stop',
  captureGetStatus: 'capture:get-status',

  askNow: 'ask:now',
  askAbort: 'ask:abort',
  askWithText: 'ask:with-text',
  /** Captura la pantalla y resuelve lo que haya en ella: código o test. */
  askSolveScreen: 'ask:solve-screen',
  /** Vacía la memoria de la conversación sin tocar nada más. */
  askForgetContext: 'ask:forget-context',
  /** Cuántos intercambios lleva el modelo en la cabeza. */
  memoryGet: 'memory:get',

  screenshotTake: 'screenshot:take',

  /**
   * Copiar texto al portapapeles, desde el main.
   *
   * `navigator.clipboard` no sirve en el overlay, y no por un descuido: exige
   * que el documento tenga el foco, y el overlay es `focusable: false` a
   * propósito para no robárselo a la videollamada. Además, `setPermissionRequest
   * Handler` sólo concede `clipboard-read`, así que la escritura tampoco
   * pasaría el filtro. El módulo `clipboard` de Electron no tiene ninguna de las
   * dos restricciones.
   */
  clipboardWrite: 'clipboard:write',

  conversationNew: 'conversation:new',
  historyList: 'history:list',
  historyGet: 'history:get',
  historyDelete: 'history:delete',
  historyClear: 'history:clear',
  historyLocation: 'history:location',

  llmListModels: 'llm:list-models',
  llmTestConnection: 'llm:test-connection',

  /**
   * Las skills que hay ahora mismo en disco.
   *
   * Lo piden los dos renderers y por motivos distintos: el dashboard para
   * listarlas, y el overlay para poder autocompletar `/nombre` y para su
   * selector. Un `invoke` y no un evento porque el disco no cambia solo —
   * cambia cuando alguien edita una carpeta, y para eso está `skillsReload`.
   */
  skillsList: 'skills:list',
  /** Relee la carpeta. Es lo que hace que editar un SKILL.md se note sin reiniciar. */
  skillsReload: 'skills:reload',
  /** Crea la carpeta si hace falta y la abre en el explorador. */
  skillsOpenFolder: 'skills:open-folder',
  /** Dónde vive la carpeta, para poder enseñar la ruta como hace el historial. */
  skillsFolder: 'skills:folder',

  whisperGetStatus: 'whisper:get-status',
  whisperInstall: 'whisper:install',

  /** Conecta de verdad con el motor de transcripción y dice qué falló. */
  sttTestConnection: 'stt:test-connection',

  /** Aceleradores que Windows rechazó, normalmente por estar ya en uso. */
  hotkeysGetFailed: 'hotkeys:get-failed',

  logsRead: 'logs:read',
  logsLocation: 'logs:location',

  ollamaGetStatus: 'ollama:get-status',

  /** RAM, CPU y GPU de la máquina, para recomendar un modelo local. */
  systemGetSpecs: 'system:get-specs',

  /**
   * Genera la guía de modelos y la abre en el navegador.
   *
   * Va a un documento y no a una ventana de la app por la regla de oro del
   * proyecto: cada ventana nueva de Electron es una ventana más que registrar en
   * la protección de captura, y el modo invisible se verifica, no se asume. Un
   * HTML además se guarda, se imprime y se lee con la app cerrada.
   */
  guideOpen: 'guide:open',

  /** Enlace, QR y teléfonos conectados del espejo. Ver `main/bridge/phone.ts`. */
  phoneGetStatus: 'phone:get-status',

  /**
   * El asistente de configuración pone Ollama y un modelo en la máquina.
   *
   * Van por IPC y no por un script suelto porque hay que **pedir permiso**: uno
   * instala software con winget y el otro descarga varios gigas. Los dos avisan
   * de lo que van a hacer antes de hacerlo, y los dos informan por
   * `onSetupProgress`, que es lo que impide que una descarga de tres minutos se
   * viva como una app colgada.
   */
  /** Estado de la conexión con el broker MQTT. Ver `main/bridge/mqtt.ts`. */
  mqttGetStatus: 'mqtt:get-status',
  /** Publica una respuesta de prueba para comprobar el montaje de una vez. */
  mqttTest: 'mqtt:test',

  setupCanInstall: 'setup:can-install',
  /**
   * Si Ollama está instalado, corra o no.
   *
   * Distinto de `ollamaGetStatus`, que pregunta por el **servidor**. Confundir
   * los dos hacía que el asistente ofreciera instalar Ollama a quien ya lo
   * tenía y sólo lo tenía parado.
   */
  setupOllamaInstalled: 'setup:ollama-installed',
  setupInstallOllama: 'setup:install-ollama',
  setupPullModel: 'setup:pull-model',

  // ── send (renderer → main, sin respuesta) ──
  audioChunk: 'audio:chunk',
  audioLevels: 'audio:levels',
  audioWorkerReady: 'audio:worker-ready',
  audioWorkerStarted: 'audio:worker-started',
  audioWorkerStopped: 'audio:worker-stopped',
  audioWorkerError: 'audio:worker-error',

  // ── event (main → renderer) ──
  onTranscript: 'event:transcript',
  onAnswer: 'event:answer',
  onCaptureStatus: 'event:capture-status',
  onSettings: 'event:settings',
  onAudioLevels: 'event:audio-levels',
  onScreenshot: 'event:screenshot',
  onWhisperProgress: 'event:whisper-progress',
  /** Se empezó una conversación nueva: los renderers deben limpiar su estado. */
  onConversationReset: 'event:conversation-reset',
  /** Fallo del motor de transcripción. La captura sigue viva; hay que enseñarlo. */
  onSTTError: 'event:stt-error',
  /**
   * El detector decidió no responder a una intervención.
   *
   * Sin esto el descarte es invisible: aparece la transcripción y no pasa nada
   * más, que desde fuera es indistinguible de una app rota. Pasó de verdad —
   * alguien probó cinco veces con "¿me escuchas?" y concluyó que ningún modelo
   * respondía, cuando cada descarte había sido correcto.
   */
  onAutoSkip: 'event:auto-skip',
  /**
   * Algo falló fuera del audio y hay que enseñarlo tal cual.
   *
   * Existe porque el único canal para "avisar de un fallo" era `onSTTError`, y
   * el overlay lo pinta con el prefijo "Transcripción:". Mandar por ahí un fallo
   * de captura de pantalla habría producido un mensaje que culpa al motor
   * equivocado, que es peor que no avisar: manda a depurar donde no es.
   */
  onNotice: 'event:notice',
  /**
   * Cambió el resultado de registrar los atajos.
   *
   * `registerHotkeys` ya devolvía los rechazados y nadie recogía la lista: sólo
   * salía por el log, que en el `.exe` empaquetado no mira nadie. Un atajo que
   * otra aplicación tiene tomado no falla al pulsarlo — simplemente no pasa
   * nada, que es indistinguible de que la app esté rota.
   */
  onHotkeyFailures: 'event:hotkey-failures',
  /**
   * Cambió la memoria de la conversación.
   *
   * Se difunde porque es lo único del coste de cada consulta que el usuario
   * puede controlar: cada turno recordado se reenvía entero en la siguiente
   * pregunta, y con Ollama eso choca contra `num_ctx` sin dar ningún error.
   */
  onMemory: 'event:memory',
  /**
   * Cambió algo del espejo del teléfono: arrancó, paró, o entró o salió un
   * teléfono.
   *
   * Lo último es lo que justifica que sea un evento y no sólo un `invoke`: la
   * pregunta real del usuario es "¿lo estoy viendo en el móvil?", y la única
   * respuesta honesta es un contador que se mueve solo cuando el teléfono se
   * conecta de verdad.
   */
  onPhoneStatus: 'event:phone-status',

  /** Avance de la instalación de Ollama o de la descarga de un modelo. */
  onSetupProgress: 'event:setup-progress',

  /** Cambió la conexión con el broker, o se publicó algo. */
  onMqttStatus: 'event:mqtt-status',

  /**
   * Se guardó o se borró una API key.
   *
   * Existe porque el overlay decide con esto si enseña «Falta configurar la
   * IA», y sin el evento ese aviso sólo se calculaba al arrancar: pegabas la
   * clave que faltaba en el dashboard y el panel seguía diciendo que faltaba.
   * Viaja la **presencia**, nunca la clave.
   */
  onSecrets: 'event:secrets',

  /** main pide al audio-worker que arranque o pare la captura. */
  onCaptureCommand: 'event:capture-command',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

/** Orden que main envía al audio-worker. */
export interface CaptureCommand {
  action: 'start' | 'stop';
  /** Qué fuentes abrir. Ignorado cuando `action` es `stop`. */
  sources: 'both' | 'system' | 'mic';
}

/**
 * Chunk de audio del worker a main.
 * El PCM va como ArrayBuffer (Int16 little-endian) para cruzar el puente
 * con structured clone y sin copiar a base64.
 */
export interface AudioChunkMessage {
  speaker: 'me' | 'them';
  pcm: ArrayBuffer;
  sampleRate: number;
}

/** Progreso de descarga de los assets de Whisper local. */
export interface WhisperProgress {
  target: 'binary' | 'model';
  receivedBytes: number;
  /** `0` si el servidor no envía Content-Length. */
  totalBytes: number;
}

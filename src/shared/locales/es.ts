import type { UIKey } from './en';

/**
 * Los textos en español.
 *
 * El tipo es lo importante: `Record<UIKey, string>` obliga a que estén **todas**
 * las claves del inglés y sólo ésas. Falta una y el build se cae; sobra una que
 * ya nadie usa, y también. Es lo que evita que una traducción olvidada llegue a
 * producción disfrazada de frase en inglés en mitad de una pantalla en español.
 */
export const es: Record<UIKey, string> = {
  // ─────────────────────────────── Overlay ───────────────────────────────
  'overlay.listen': 'Escuchar',
  'overlay.listening': 'Escuchando',
  'overlay.starting': 'Iniciando…',
  'overlay.retry': 'Reintentar',
  'overlay.captureError': 'Error de captura',
  'overlay.listenTitle': 'Empezar o parar de escuchar (Ctrl+Shift+M)',

  'overlay.sources': 'Qué se escucha',
  'overlay.sourceMe': 'Yo',
  'overlay.sourceThem': 'Ellos',
  'overlay.sourceBoth': 'Ambos',
  'overlay.sourceMeHint': 'Sólo tu micrófono',
  'overlay.sourceThemHint': 'Sólo la salida del sistema: la voz del interlocutor',
  'overlay.sourceBothHint': 'Tu micrófono y la salida del sistema',

  'overlay.visible': 'El overlay SÍ aparece al compartir pantalla',
  'overlay.visShown': 'Visible',
  'overlay.visHidden': 'Oculto',
  'overlay.visShownHint': 'Se ve al compartir pantalla — clic para ocultar',
  'overlay.visHiddenHint': 'Oculto al compartir pantalla — clic para mostrar',
  'overlay.solveCode': 'Resolver el problema de código que hay en pantalla (Ctrl+Alt+C)',
  'overlay.solveCodeShort': 'Resolver el código de la pantalla',
  'overlay.solveQuiz': 'Responder la pregunta de test que hay en pantalla (Ctrl+Alt+Q)',
  'overlay.solveQuizShort': 'Responder el test de la pantalla',
  'overlay.expand': 'Desplegar: vuelve la transcripción y los perfiles',
  'overlay.expandShort': 'Desplegar el panel',
  'overlay.compact': 'Modo compacto: deja sólo la respuesta',
  'overlay.compactShort': 'Modo compacto',
  'overlay.newChat': 'Nueva conversación (limpia la transcripción y el contexto)',
  'overlay.newChatShort': 'Nueva conversación',
  'overlay.settings': 'Configuración',
  'overlay.settingsShort': 'Configuración',
  'overlay.quit': 'Cerrar Tayori (Ctrl+Shift+H solo lo oculta)',
  'overlay.quitShort': 'Cerrar',

  'overlay.waitingAudio': 'Esperando audio…',
  'overlay.me': 'Yo',
  'overlay.them': 'Ellos',

  'overlay.profileInterview': 'Entrevista',
  'overlay.profileMeeting': 'Reunión',
  'overlay.profileLecture': 'Clase',
  'overlay.profileSupport': 'Soporte',
  'overlay.profileCoding': 'Código',
  'overlay.profileQuiz': 'Test',
  'overlay.profileCustom': 'Personalizado',

  'overlay.setupTitle': 'Falta configurar la IA',
  'overlay.setupSub': 'Pega una API key de Anthropic, Google, OpenAI o DeepSeek para empezar',
  'overlay.setupAction': 'Abrir configuración',
  'overlay.idleTitle': 'Listo para escuchar',
  'overlay.idleSub': 'Pulsa el micrófono para comenzar',
  'overlay.connectingTitle': 'Conectando…',
  'overlay.connectingSub': 'Abriendo el micrófono y la salida del sistema',
  'overlay.connectingAction': 'Iniciando',
  'overlay.listeningTitle': 'Esperando que hables',
  'overlay.listeningSub': 'Habla cuando quieras',
  'overlay.listeningAction': 'Parar de escuchar',
  'overlay.errorTitle': 'No se pudo escuchar',
  'overlay.errorSub': 'Revisa el dispositivo de entrada y vuelve a intentarlo',

  'overlay.writeQuestion': 'Escribir la pregunta',
  'overlay.hotkeyHint': '{keys} resolver la pantalla',
  'overlay.tabListen': 'Escucha',
  'overlay.tabWrite': 'Escritura',
  'overlay.noSkill': 'Ninguna skill con ese nombre',
  'overlay.composePlaceholder': 'Pregunta lo que sea…',
  'overlay.attach': 'Adjuntar imagen',
  'overlay.writeEmptyTitle': 'Modo escritura',
  'overlay.writeEmptySub': 'Pregunta lo que sea, usa una skill o resuelve tu pantalla.',
  'overlay.composeHint': 'Enter envía · Shift+Enter salta línea',
  'overlay.send': 'Enviar',
  'overlay.composeWarn': 'Escribir toma el foco del teclado — vuelve a «Escucha» antes de compartir pantalla.',
  'overlay.tipTitle': 'Consejo',
  'overlay.tipListen': 'Pulsa «Escucha» para seguir la conversación.',
  'overlay.tipSolve': 'Resuelve lo que haya en tu pantalla.',
  'overlay.dragMove': 'Arrastra para mover',
  'overlay.attachShot': 'Adjuntar captura',
  'overlay.attachFile': 'Adjuntar imagen de tu equipo',

  'overlay.skipFiller':
    'Te escucho, pero un saludo o una prueba de sonido no dispara respuesta. Prueba con una pregunta real.',
  'overlay.skipShort': 'Demasiado corto para tomarlo por una pregunta.',
  'overlay.skipStrict':
    'No parecía una pregunta. En modo estricto sólo cuentan las señales claras; súbelo a «Equilibrado» o «Todo» en el dashboard.',
  'overlay.skipNone':
    'No parecía una pregunta. Si quieres que responda a todo, pon la sensibilidad en «Todo».',

  'overlay.codeAction': 'Código',
  'overlay.quizAction': 'Test',
  'overlay.more': 'Más opciones',
  'overlay.code': 'código',
  'overlay.writing': 'escribiendo…',
  'overlay.copied': 'Copiado',
  'overlay.copyFailed': 'No se pudo',
  'overlay.copy': 'Copiar',
  'overlay.copyAnswer': 'Copiar la respuesta',
  'overlay.ttsPlay': 'Leer en voz alta',
  'overlay.ttsStop': 'Detener lectura',

  'overlay.readingScreen': 'Leyendo la pantalla…',
  'overlay.thinking': 'Pensando…',
  'overlay.unknownError': 'Error desconocido',
  'overlay.prevAnswer': 'Respuesta anterior',
  'overlay.nextAnswer': 'Respuesta siguiente',
  'overlay.forgotten': 'olvidado',
  'overlay.memory': 'memoria {turns}/{max}',
  'overlay.memoryTitle':
    'El asistente recuerda {turns} de {max} intercambios y los reenvía en cada consulta. Pulsa para que los olvide; la transcripción y el historial se quedan como están.',
  'overlay.stop': 'Parar la generación',
  'overlay.dismiss': 'Descartar',
  'overlay.transcription': 'Transcripción',
  'overlay.attached': 'Captura adjunta',
  'overlay.size': 'Tamaño {size}',
  'overlay.questionLabel': 'Pregunta',
  'overlay.modelTitle': 'Modelo que responde — clic para cambiar',
  'overlay.noModels': 'Sin modelos disponibles',
  'overlay.loadingModels': 'Cargando…',
  'overlay.continue': 'Continuar',
  'overlay.continueHint': 'Sigue la solución donde se cortó, sin repetir',
  'overlay.emptyIdle':
    'Ctrl+Enter para pedir una respuesta · Ctrl+Alt+C para resolver la pantalla.',
  'overlay.emptyStopped':
    'Pulsa «Escuchar» para que siga la conversación, o Ctrl+Alt+C para resolver lo que tengas en pantalla.',
  'overlay.footAsk': 'preguntar',
  'overlay.footScreen': 'resolver pantalla',

  'overlay.qaMore': 'Sigue',
  'overlay.qaMorePrompt': 'Amplía tu última respuesta con un ejemplo concreto y breve.',
  'overlay.qaShorter': 'Más corto',
  'overlay.qaShorterPrompt': 'Reformula tu última respuesta en dos viñetas, más directa.',
  'overlay.qaFollowUp': 'Seguimiento',
  'overlay.qaFollowUpPrompt': 'Dame 3 preguntas de seguimiento que YO pueda hacer ahora.',
  'overlay.qaSummary': 'Resumen',
  'overlay.qaSummaryPrompt': 'Resume la conversación hasta ahora en 4 viñetas.',
  'overlay.qaExplain': 'Explícalo',
  'overlay.qaExplainPrompt':
    'Explica tu última solución en 4 viñetas, como si se lo contara en voz alta a un entrevistador.',
  'overlay.qaOptimise': 'Optimiza',
  'overlay.qaOptimisePrompt':
    '¿Se puede mejorar la complejidad de tu última solución? Si sí, dame el código.',
  'overlay.qaEdge': 'Casos límite',
  'overlay.qaEdgePrompt':
    'Dame los casos límite que romperían tu última solución y cómo los cubre.',
  'overlay.qaTests': 'Tests',
  'overlay.qaTestsPrompt': 'Escribe tests para tu última solución, en el mismo lenguaje.',
  'overlay.qaWhy': '¿Por qué?',
  'overlay.qaWhyPrompt': 'Explica en una línea por qué cada respuesta que diste es la correcta.',
  'overlay.qaDistractors': 'Las descartadas',
  'overlay.qaDistractorsPrompt':
    'Para cada pregunta, di en una línea por qué la opción más tentadora de las que descartaste es incorrecta.',
  'overlay.qaDoubts': 'Revisa las dudas',
  'overlay.qaDoubtsPrompt':
    'Vuelve sobre las preguntas que marcaste con DUDA. Para cada una, di si mantienes la opción o la cambias, y por cuál.',
  'overlay.qaReview': 'Repasa todo',
  'overlay.qaReviewPrompt':
    'Revisa tus respuestas anteriores. Di sólo las que cambiarías y por cuál.',

  'mqtt.password': 'Contraseña del broker',
  'mqtt.passwordHint':
    'Se guarda cifrada con DPAPI, igual que las API keys, y no vuelve a mostrarse.',
  'mqtt.passwordPlaceholder': 'Pega la contraseña del broker',

  // ───────────────────── Ajustes · modelo ─────────────────────
  'presets.title': 'Perfiles de modelos',
  'presets.hint':
    'Guarda un conjunto de modelos para un caso (entrevista, reunión, intérprete…) y cámbialo de un clic. Un perfil fija el motor y modelo de transcripción, el proveedor y modelo de respuestas, el modelo de pantalla y el perfil de prompt — nada más.',
  'presets.empty': 'Aún no hay perfiles. Configura tus modelos abajo y guárdalos aquí.',
  'presets.saveCurrent': 'Guardar la configuración actual como perfil',
  'presets.apply': 'Aplicar',
  'presets.delete': 'Borrar perfil',
  'presets.nameLabel': 'Nombre del perfil',

  'model.title': 'Modelo de respuestas',
  'model.hint': 'Quién genera las sugerencias que ves en el overlay.',
  'model.provider': 'Proveedor',
  'model.model': 'Modelo',
  'model.answerLang': 'Idioma de la respuesta',
  'model.answerLangDesc':
    'Automático sigue el contenido —la conversación, o lo que hay en la pantalla—. Elige un idioma para forzar todas las respuestas en él.',
  'model.answerLangAuto': 'Automático',
  'model.pick': '— elige un modelo —',
  'model.none': '—',
  'model.other': 'Otro… (escribir el id)',
  'model.idPlaceholder': 'p. ej. claude-opus-4-8',
  'model.noneAvailable': 'Sin modelos disponibles. Mira el estado de Ollama más abajo.',
  'model.catalogHint':
    'La lista son los modelos que la app conoce. Si tu cuenta tiene acceso a otro, elige «Otro…» y escribe su id; un id que no existe da error en la primera pregunta, así que comprueba con «Probar conexión».',
  'model.test': 'Probar conexión',
  'model.ollamaContext': 'Ventana de contexto de Ollama',
  'model.ollamaContextDesc':
    'Ollama NO usa la del modelo: aplica 2048 tokens por defecto y descarta lo que no cabe SIN dar ningún error, empezando por el principio. El síntoma es que el modelo olvida lo que le acabas de decir. Subirlo gasta más memoria.',
  'model.ctxDefault': '2048 · el defecto de Ollama',
  'model.ctxRecommended': '8192 · recomendado',
  'model.ctxLongCv': '16384 · con CV largo o capturas',
  'model.ctxHeavy': '32768 · pide bastante memoria',

  // ───────────────────── Ajustes · modelo de pantalla ─────────────────────
  'screen.title': 'Modelo para la pantalla',
  'screen.hint':
    'El que resuelve `Ctrl+Alt+C` (código) y `Ctrl+Alt+Q` (tests). Puede ser distinto del que responde a lo que se habla: aquello pide rapidez, y esto pide leer bien una captura. **Tiene que admitir imágenes.**',
  'screen.providerDesc':
    '«El mismo» usa el modelo de respuestas de arriba, que es como funcionaba antes.',
  'screen.same': 'El mismo que para responder',
  'screen.claude': 'Claude (nube)',
  'screen.gemini': 'Gemini (nube)',
  'screen.openai': 'ChatGPT (nube)',
  'screen.ollama': 'Ollama (local)',
  'screen.noModels':
    'Sin modelos disponibles. Si es Ollama, comprueba que el servidor está corriendo.',
  'screen.visionOnly': 'Sólo los que admiten imágenes pueden leer tu pantalla.',
  'screen.visionOnlyCloud':
    'Sólo los que admiten imágenes pueden leer tu pantalla. Si tu cuenta tiene acceso a otro modelo, elige «Otro…» y escribe su id.',
  'screen.seesImages': ' · ve imágenes',
  'screen.noVision': ' · sin visión',
  'screen.blind':
    '**{model}** no admite imágenes, así que no puede leer la pantalla: los botones de código y de test fallarán con un aviso en lugar de responder. Elige un multimodal — con Ollama, `qwen2.5vl`, `llava` o `gemma3`.',
  'screen.allOllama':
    'Estás usando Ollama para todo. Si el modelo elegido no ve imágenes, las acciones de pantalla no funcionarán: aquí es donde conviene separarlas y dejar un multimodal sólo para esto.',

  // ───────────────────── Ajustes · general ─────────────────────
  'gen.stealth': 'Modo invisible',
  'gen.stealthDesc':
    'El overlay se excluye de la captura de pantalla a nivel del compositor de Windows. Desactívalo para grabar demos o depurar la interfaz.',
  'gen.clickThrough': 'Clics atravesables',
  'gen.clickThroughDesc':
    'El overlay ignora el ratón y los clics llegan a la ventana de abajo. Recomendado durante una llamada.',
  'gen.stealthWarn':
    'El modo invisible está desactivado: el overlay **sí** aparecerá si compartes pantalla.',
  'gen.decoy': 'Disfraz en la barra de tareas',
  'gen.decoyDesc':
    'De qué se disfraza el ícono y el título de la ventana. El overlay es invisible en las capturas, pero su entrada en la barra de tareas aún nombra la app — esto la hace parecer una herramienta común de Windows.',
  'gen.decoyOff': 'Desactivado (Tayori)',
  'gen.lookTitle': 'Aspecto del overlay',
  'gen.lookHint':
    'Cómo se ve el panel flotante. Se aplica al momento, así que conviene ajustarlo con el overlay a la vista.',
  'gen.opacity': 'Opacidad',
  'gen.opacityDesc':
    'Bajarla deja entrever lo que hay debajo. Por debajo del 60 % el texto empieza a costar de leer sobre fondos claros.',
  'gen.textSize': 'Tamaño del texto',
  'gen.textSizeDesc':
    'Afecta a la respuesta, al código y a la transcripción; los controles se quedan igual. Los tamaños S/M/L/XL agrandan la ventana, no la letra: esto es lo que hace falta en un monitor 4K.',
  'gen.compact': 'Modo compacto',
  'gen.compactDesc':
    'Deja sólo la respuesta: pliega los perfiles, la transcripción y el pie de atajos. También se activa con el botón de plegar del overlay.',

  'gen.teleprompter': 'Modo teleprompter',
  'gen.teleprompterDesc':
    'Enseña la respuesta terminada a una frase por línea, en columna estrecha y con la línea activa siempre en el mismo sitio. Lo que delata que estás leyendo es el movimiento horizontal de los ojos, no el tamaño del texto.',
  'gen.teleprompterHint':
    'Avanza con **{next}** y retrocede con **{prev}** — son atajos globales, así que funcionan con la videollamada en primer plano. También puedes hacer clic en el panel para avanzar y clic derecho para retroceder. Los dos atajos sólo se registran con este modo encendido, y se cambian en *Atajos de teclado*.',
  'gen.protects':
    '**Qué protege y qué no.** El modo invisible excluye la ventana del pipeline de captura (screen share, OBS, grabadores). No te protege de una cámara apuntando a la pantalla, no oculta el proceso frente a software de proctoring que enumere ventanas, y no oculta lo que digas por el micrófono.',

  // ───────────────────── Ajustes · transcripción ─────────────────────
  'stt.engine': 'Motor',
  'stt.engineDesc': 'Qué fuentes de audio se abren se decide aparte.',
  'stt.goAudio': 'Ir a Audio',
  'stt.openaiLive': 'OpenAI en directo (nube, el mejor para reuniones)',
  'stt.openaiTranscribe': 'OpenAI por turnos (nube, más preciso)',
  'stt.geminiLive': 'Gemini Live (nube, más rápido)',
  'stt.geminiAudio': 'Gemini audio directo (el modelo oye tu voz)',
  'stt.whisperLocal': 'Whisper local (offline, privado)',
  'stt.openaiLiveHint':
    '`gpt-live-transcribe`, el modelo que OpenAI recomienda para audio en directo. Abre una sesión por hablante y va escribiendo mientras hablan.',
  'stt.openaiTranscribeHint':
    '`gpt-transcribe`, el que OpenAI recomienda para voz ya grabada. Espera a que termines la frase y la transcribe entera, así que acierta más en nombres propios a cambio de aproximadamente un segundo de latencia.',
  'stt.openaiKeyNote': 'Usa la API key de OpenAI, la misma que las respuestas.',
  'stt.geminiAudioNote':
    'El audio va **directo al modelo**, sin pasar por un reconocedor. Una mala transcripción deja de poder estropear la respuesta, porque el modelo oye tu voz en lugar de leer lo que otro entendió. Usa el modelo de Gemini que elijas más arriba, y el detector de preguntas no interviene: decide el propio modelo si lo que dijiste pedía respuesta.',
  'stt.language': 'Idioma',
  'stt.languageDesc': 'Automático detecta el idioma; fijarlo mejora la precisión cuando aciertas.',
  'stt.auto': 'Automático',
  'stt.langEs': 'Español',
  'stt.langEn': 'Inglés',
  'stt.langPt': 'Portugués',
  'stt.langFr': 'Francés',
  'stt.langDe': 'Alemán',
  'stt.forcedWarn':
    'Estás forzando **{lang}**. Si hablas en otro idioma **no verás ningún error**: el reconocedor devuelve texto plausible en el idioma que le impongas, inventado a partir de los sonidos. Si las respuestas no tienen nada que ver con lo que preguntaste, esto es lo primero que hay que mirar.',
  'stt.whisperModel': 'Modelo de Whisper',
  'stt.whisperModelDesc': 'Modelos más grandes transcriben mejor y tardan más.',
  'stt.whisperModelDescNonEn':
    'Modelos más grandes transcriben mejor y tardan más. Fuera del inglés la diferencia entre Base y Small es grande: si las palabras salen cambiadas, es lo primero que conviene subir.',
  'stt.whisperReady': 'Whisper listo',
  'stt.whisperMissing': 'Whisper sin instalar',
  'stt.whisperReadyDesc': 'Ejecutable y modelo descargados. Funciona sin conexión.',
  'stt.whisperMissingDesc': 'Falta {what}. Se descargan una sola vez.',
  'stt.whisperBinary': 'el ejecutable (7,6 MB)',
  'stt.whisperModelPart': 'el modelo',
  'stt.and': ' y ',
  'stt.download': 'Descargar',
  'stt.install': 'Instalar',
  'stt.use': 'Usar',
  'stt.inUse': 'En uso',
  'stt.recommended': 'Recomendado',
  'stt.favorite': 'Marcar como favorito',
  'stt.unfavorite': 'Quitar de favoritos',
  'stt.recForPc': 'Recomendado para tu equipo',
  'stt.downloading': 'Descargando…',
  'stt.installed': 'instalado',
  'stt.downloadFailed': 'Falló la descarga.',
  'stt.progressBinary': 'Ejecutable',
  'stt.progressModel': 'Modelo',

  // ───────────────────── Ajustes · comportamiento ─────────────────────
  'beh.auto': 'Respuestas automáticas',
  'beh.autoDesc':
    'Con la heurística activa, detecta preguntas dirigidas a ti y responde sin que pulses nada. El hotkey manual funciona en todos los modos.',
  'beh.autoOff': 'Solo con hotkey',
  'beh.autoHeuristic': 'Automático (heurística local)',
  'beh.autoClassifier': 'Automático + clasificador (usa el modelo)',
  'beh.classifierWarn':
    'Cuando la heurística no vea ningún marcador, le preguntará al modelo si esa intervención pedía respuesta. Es lo que caza las preguntas que llegan como afirmaciones —*«una persona que sepa DevOps tendría que saber de seguridad»*— y que ninguna lista de palabras puede detectar.',
  'beh.classifierCost':
    '**Cuesta una consulta más** por cada intervención ambigua, aunque al final no se responda. Con Ollama es gratis; con un modelo de pago, no.',
  'beh.speaker': 'Quién dispara la respuesta',
  'beh.speakerDesc':
    'Por defecto solo el interlocutor: responder a lo que dices tú no tiene sentido en una entrevista. Cámbialo si usas la app para dictar las preguntas tú mismo.',
  'beh.speakerThem': 'El interlocutor',
  'beh.speakerMe': 'Mi micrófono',
  'beh.speakerAny': 'Cualquiera de los dos',
  'beh.sensitivity': 'Cuándo considera que es una pregunta',
  'beh.sensStrict': 'Estricto · solo señales claras',
  'beh.sensBalanced': 'Equilibrado · recomendado',
  'beh.sensAll': 'Todo · cualquier intervención',
  'beh.sensStrictHint':
    'Solo dispara con interrogativo al principio, signo de interrogación o "cuéntame…". Casi nunca molesta, pero se le escapan preguntas que el reconocedor entrega sin signos.',
  'beh.sensBalancedHint':
    'Añade interrogativos acentuados en cualquier posición y fórmulas como "me recomiendas". Recupera la mayoría de preguntas reales a cambio de algún disparo de más.',
  'beh.sensAllHint':
    'Responde a todo lo que no sea un saludo o una prueba de audio. Es lo que quieres si eres tú quien dicta las preguntas; en una entrevista real interrumpirá constantemente.',
  'beh.inertWarn':
    'El auto-disparo espera a **{wanted}**, pero «Qué se escucha» solo abre {heard}: **nunca se disparará ninguna respuesta automática**. Cambia una de las dos cosas, o usa Ctrl+Enter para preguntar a mano.',
  'beh.changeSources': 'Cambiar qué se escucha',
  'beh.idle': 'Dejar de escuchar por inactividad',
  'beh.idleDesc':
    'Si nadie habla durante un rato, la app deja de escuchar sola. Útil para la reunión que terminó y el asistente se quedó escuchando una sala vacía. Apagado por defecto.',
  'beh.idleMinutes': 'Tiempo de inactividad (minutos)',
  'beh.idleMinutesDesc': 'Minutos de silencio antes de apagarse. Solo la voz cuenta como actividad.',
  'beh.window': 'Ventana de voz',
  'beh.windowDesc':
    'Segundos de TRANSCRIPCIÓN que acompañan a cada pregunta. No afecta a la memoria del asistente: sus propias respuestas anteriores se envían siempre. Por debajo de 30 s se pierde el hilo de lo que dijo el interlocutor.',
  'beh.profile': 'Perfil de respuesta',
  'beh.profileDesc': 'Adapta el tono y la estructura al tipo de reunión.',
  'beh.profInterview': 'Entrevista de trabajo',
  'beh.profMeeting': 'Reunión genérica',
  'beh.profLecture': 'Clase o charla',
  'beh.profSupport': 'Soporte técnico',
  'beh.profCoding': 'Código (resolver ejercicios)',
  'beh.profQuiz': 'Test (opción múltiple)',
  'beh.profGeneral': 'General (pantalla)',
  'beh.profInterpreter': 'Intérprete',
  'beh.interpreterLangs': 'Idiomas del intérprete',
  'beh.interpreterLangsDesc':
    'Traduce cada intervención al otro idioma, en los dos carriles. Necesita la escucha y el disparo automático encendidos.',
  'beh.profCustom': 'Personalizado',
  'beh.codeLang': 'Lenguaje del modo código',
  'beh.codeLangDesc':
    'En qué lenguaje se escriben las soluciones de Ctrl+Alt+C. Con «auto» lo deduce de lo que se vea en la pantalla, que es lo correcto si el editor ya tiene uno elegido.',
  'beh.customPlaceholder': 'Describe cómo debe comportarse el asistente…',
  'beh.profVisible': 'Mostrar en el selector del overlay',
  'beh.profCustomTitle': 'Tus perfiles',
  'beh.profCustomEmpty': 'Aún no tienes perfiles propios. Crea uno para adaptar el asistente a un caso que los de fábrica no cubren.',
  'beh.profNamePlaceholder': 'Nombre del perfil',
  'beh.profAdd': 'Nuevo perfil',
  'beh.profDelete': 'Eliminar perfil',
  'beh.profRemove': 'Quitar de la lista',
  'beh.profRestore': 'Restaurar quitados',
  'beh.profTitle': 'Perfiles de respuesta',
  'beh.profReset': 'Volver al de fábrica',
  'beh.profRemovedTitle': 'Removidos',
  'beh.profRestoreOne': 'Restaurar',
  'beh.profRestoreAll': 'Restaurar todo',
  'beh.speakerThemShort': 'el interlocutor',
  'beh.speakerMeShort': 'tú',
  'beh.speakerAnyShort': 'cualquiera de los dos',

  // ───────────────────── Ajustes · contexto ─────────────────────
  'ctx.preparingFor': 'Preparando para',
  'ctx.inUse': '{count} en uso: {names}',
  'ctx.nothingActive': 'nada activo todavía',
  'ctx.remove': 'Quitar',
  'ctx.addOwn': 'Añadir contexto propio',
  'ctx.pasteHere': 'Pega aquí el texto…',
  'ctx.newName': 'Nuevo contexto',
  'ctx.loadFile': 'Cargar un archivo',
  'ctx.kindCv': 'Tu CV o experiencia',
  'ctx.kindJob': 'Descripción del puesto',
  'ctx.kindQa': 'Respuestas preparadas',
  'ctx.kindVocabulary': 'Vocabulario',
  'ctx.kindNotes': 'Notas',
  'ctx.cvPlaceholder':
    'Pega tu CV, o un resumen de tu experiencia: empresas, años, tecnologías, logros con cifras…',
  'ctx.cvHint':
    'La única fuente de datos concretos sobre ti. Sin esto las respuestas son correctas pero genéricas, y el modelo tiene prohibido inventarse experiencia.',
  'ctx.jobPlaceholder': 'Pega la oferta: responsabilidades, stack, requisitos…',
  'ctx.jobHint':
    'Decide QUÉ destacar de tu experiencia y con qué vocabulario. No se usa para atribuirte nada que no esté en tu CV.',
  'ctx.qaPlaceholder':
    '¿Cuál es tu mayor debilidad?\n— Tiendo a meterme en el detalle; lo compenso con revisiones a mitad de sprint.\n\n¿Por qué dejaste tu último trabajo?\n— …',
  'ctx.qaHint':
    'Preguntas que ya sabes que van a caer, con tu respuesta. Si la pregunta encaja, el modelo la reutiliza casi literal en vez de improvisar una versión aguada.',
  'ctx.vocabularyPlaceholder': 'Kubernetes, Grafana, Docker, Linux, CI/CD…',
  'ctx.vocabularyHint':
    'Separados por comas o saltos de línea. Van directos al reconocedor de voz: es lo que arregla los nombres propios y las siglas que salen mal transcritas.',
  'ctx.notesPlaceholder': 'Cualquier cosa que convenga que el modelo sepa.',
  'ctx.notesHint': 'Notas de apoyo sin tratamiento especial.',

  // ───────────────────── Ajustes · skills ─────────────────────
  'sk.folderTitle': 'Carpeta de skills',
  'sk.folderHint':
    'Cada skill es una carpeta con un archivo `SKILL.md` dentro: frontmatter con `name` y `description`, y debajo las instrucciones. Los scripts y los assets que admite el formato **se ignoran** — ver la nota de abajo.',
  'sk.reload': 'Recargar',
  'sk.reloading': 'Releyendo…',
  'sk.addHere': 'Añade aquí tus skills',
  'sk.openFolder': 'Abrir carpeta',
  'sk.promptWarn':
    'Lo que pongas ahí acaba **dentro del prompt** que se manda a tu proveedor. No es código que se ejecute —los scripts se ignoran a propósito— pero sí es texto que sale de tu máquina en cada consulta, así que trata una skill de terceros como tratarías cualquier otra cosa que vayas a pegar en un chat.',
  'sk.activeTitle': 'Skill activa',
  'sk.activeHint':
    'Se aplica a **todas** las respuestas hasta que la quites, incluidas las que dispara la escucha automática. Para usar una sólo en un mensaje, escribe `/nombre` al principio en la pestaña de escritura del overlay.',
  'sk.instruction': 'Instrucción',
  'sk.activeDesc': 'Manda sobre el tono y las palabras. El formato lo sigue decidiendo el perfil.',
  'sk.noneDesc': 'Sin ninguna puesta, el modelo responde como siempre.',
  'sk.none': 'Ninguna',
  'sk.empty':
    'No hay ninguna skill todavía. Crea una carpeta con un `SKILL.md` dentro y pulsa «Recargar».',
  'sk.builtIn': 'De serie',
  'sk.noDescription': 'Sin description en el frontmatter.',
  'ctx.import': 'PDF · Word · Markdown · texto',
  'ctx.badgeInUse': 'En uso',
  'ctx.tileEmpty': 'Vacío — pega o importa el texto',
  'ctx.dropHint': 'Arrastra o haz clic para subir',
  'ctx.close': 'Cerrar',
  'ctx.parsing': 'Leyendo…',
  'ctx.parseFailed': 'No se pudo leer el archivo',

  // ───────────────────── Ajustes · historial ─────────────────────
  'hist.save': 'Guardar conversaciones',
  'hist.on': 'Activo. Se escriben en {where}.',
  'hist.off': 'Apagado. Nada toca el disco: la app vuelve a escuchar sin guardar.',
  'hist.yourFolder': 'tu carpeta de datos',
  'hist.emptyOn': 'Todavía no hay ninguna conversación guardada.',
  'hist.emptyOff': 'No hay nada guardado.',
  'hist.meta': '{date} · {turns} respuestas · {segments} intervenciones',
  'hist.delete': 'Borrar',
  'hist.noQuestion': '(sin pregunta aislada)',
  'hist.screenCode': 'Resolver código en pantalla',
  'hist.screenQuiz': 'Responder test en pantalla',
  'hist.screenGeneral': 'Ayuda con la pantalla',
  'hist.search': 'Buscar en las conversaciones…',
  'hist.searchNone': 'Ninguna conversación coincide con «{query}».',
  'hist.transcript': 'Transcripción',
  'hist.showLast': 'Mostrar solo las {count} últimas',
  'hist.showAll': 'Ver las {count} conversaciones',
  'hist.clearConfirm': 'Se borran las {count} conversaciones. No hay deshacer.',
  'hist.clearYes': 'Sí, borrar todo',
  'hist.cancel': 'Cancelar',
  'hist.clearAll': 'Borrar todo el historial',

  // ───────────────────── Ajustes · atajos ─────────────────────
  'hk.rejectedOne':
    'Windows rechazó este atajo: **{keys}**. Otra aplicación lo tiene tomado, así que **no hará nada** hasta que elijas otro.',
  'hk.rejectedMany':
    'Windows rechazó estos atajos: **{keys}**. Otra aplicación los tiene tomados, así que **no harán nada** hasta que elijas otros.',
  'hk.teleprompterNext': 'Teleprompter: línea siguiente',
  'hk.teleprompterPrev': 'Teleprompter: línea anterior',
  'hk.reset': 'Restablecer',
  'hk.resetDesc': 'Devuelve cada atajo a su combinación de fábrica, y los vuelve a encender todos.',
  'hk.resetButton': 'Valores por defecto',
  'hk.askNow': 'Responder ahora',
  'hk.screenshotAndAsk': 'Capturar pantalla y responder',
  'hk.solveOnScreen': 'Resolver el código de la pantalla',
  'hk.solveQuiz': 'Responder el test de la pantalla',
  'hk.captureFrame': 'Captura por trozos (recolectar)',
  'hk.solveCapture': 'Resolver la captura por trozos',
  'scroll.title': 'Captura por trozos',
  'scroll.hint':
    'Para una prueba en una pantalla compartida que se revela con scroll: recolecta varios trozos con el atajo y se unen para resolver el enunciado completo. Consejo: fija a pantalla completa el contenido compartido para que el texto se lea.',
  'scroll.manual': 'Manual',
  'scroll.manualHint': 'Una pulsación del atajo = un trozo. Tú eliges qué entra.',
  'scroll.auto': 'Automático',
  'scroll.autoHint':
    'El atajo arranca y para un bucle que captura solo y descarta los trozos repetidos.',
  'scroll.pieces': 'Trozos: {count}',
  'scroll.capturing': 'Capturando… {count}',
  'scroll.solve': 'Resolver',
  'scroll.clear': 'Vaciar',
  'notice.scrollFull': 'Pila llena: resuelve los trozos o vacíala.',
  'err.noFrames': 'No hay trozos capturados todavía.',
  'hk.toggleOverlay': 'Mostrar u ocultar el overlay',
  'hk.toggleListening': 'Empezar o parar de escuchar',
  'hk.toggleClickThrough': 'Alternar clics atravesables',
  'hk.moveUp': 'Mover el overlay arriba',
  'hk.moveDown': 'Mover el overlay abajo',
  'hk.moveLeft': 'Mover el overlay a la izquierda',
  'hk.moveRight': 'Mover el overlay a la derecha',

  // ───────────────────── Ajustes · diagnóstico ─────────────────────
  'diag.testStt': 'Probar la transcripción',
  'diag.testSttDesc':
    'Conecta de verdad con el motor configurado: con un motor de nube negocia el modelo, con Whisper ejecuta el binario sobre un audio de prueba.',
  'diag.works': 'Funciona.',
  'diag.failed': 'Falló.',
  'diag.copy': 'Copiar',
  'diag.copied': 'Copiado',
  'diag.emptyLog': 'Todavía no hay nada registrado en esta sesión.',

  // ───────────────────── Ajustes · acerca de ─────────────────────
  'about.what':
    'Un asistente que escucha una reunión o una entrevista, transcribe quién dice qué y te sugiere respuestas en un panel flotante que **no aparece cuando compartes pantalla**. También resuelve el código o el test que tengas delante, leyéndolo de una captura.',
  'about.version': 'Versión',
  'about.author': 'Autor',
  'about.license': 'Licencia',
  'about.licenseDesc': 'Código abierto, sin monetización.',
  'about.web': 'Web',
  'about.webDesc': 'La landing page de Tayori.',
  'about.updateTitle': 'Actualizaciones',
  'about.updateHint': 'Comprueba en GitHub si hay una versión más nueva. No se descarga nada solo.',
  'about.checkUpdate': 'Comprobar actualizaciones',
  'about.checking': 'Comprobando…',
  'about.upToDate': 'Estás al día (v{version}).',
  'about.updateAvailable': 'Hay una versión nueva: **v{latest}** (tienes v{current}).',
  'about.download': 'Descargar',
  'about.viewRelease': 'Ver release',
  'about.dataTitle': 'Qué hace con lo que oye',
  'about.dataHint': 'Es lo que conviene tener claro antes de dejarlo escuchando algo importante.',
  'about.audio':
    '**El audio nunca toca el disco.** Los fragmentos van al motor de transcripción y se descartan en el acto. No hay archivos de audio, ni siquiera temporales.',
  'about.text':
    '**El texto sí se guarda, si tú quieres.** Con el historial activo, las respuestas y la transcripción completa —incluido lo que dijo la otra persona— van a un JSON en tu carpeta de datos. Se apaga entero desde *Historial*, y con él apagado no se escribe nada.',
  'about.noServer':
    '**No hay servidor intermedio.** Las llamadas van directas al proveedor que elijas, con tu clave. Las claves se guardan cifradas con DPAPI y nunca salen hacia el renderer.',
  'about.offline':
    '**Puede funcionar sin conexión.** Con Whisper local y Ollama no sale nada de tu máquina.',
  'about.legal':
    'Usarlo es cosa tuya: muchas empresas restringen los asistentes de IA en sus procesos de selección, y las plataformas de evaluación técnica suelen prohibirlos en sus condiciones. En varias jurisdicciones, además, guardar la transcripción de una conversación cuenta igual que grabarla.',

  // ───────────────────── Ajustes · espejo del móvil ─────────────────────
  'ph.turnOn': 'Encender el espejo',
  'ph.onLan': 'Sirviendo en tu red local. El enlace caduca al apagarlo.',
  'ph.onLocal': 'Sirviendo en tu máquina. El enlace caduca al apagarlo.',
  'ph.offDesc': 'Apagado: no hay ningún puerto abierto ni nada que leer desde fuera.',
  'ph.allowLan': 'Permitir acceso desde la red local',
  'ph.lanOn': 'Cualquier dispositivo de tu red que tenga el enlace puede leer las respuestas.',
  'ph.lanOff': 'Sólo esta máquina puede conectarse. Un teléfono necesita esto encendido.',
  'ph.lanWarn':
    'El enlace lleva un token que caduca al apagar el espejo, pero mientras esté encendido **quien tenga ese enlace y esté en tu red puede leer tus respuestas**. En una red de invitados o de una oficina, esto es una decisión, no un detalle. La primera vez Windows puede pedirte permiso del firewall: sin concederlo, el teléfono no conecta.',
  'ph.offHint':
    'Enciende el espejo para generar el enlace y el código QR. Se genera uno nuevo cada vez, así que un enlace guardado en el móvil deja de valer solo.',
  'ph.scan': 'Escanea esto con el teléfono',
  'ph.copyLink': 'Copiar el enlace',
  'ph.copied': '¡Copiado!',
  'ph.noClients': 'Ningún teléfono conectado todavía.',
  'ph.clients': '{count} teléfono(s) conectado(s).',
  'ph.loopbackWarn':
    'El espejo sólo escucha en `127.0.0.1`, así que este enlace únicamente funciona en este ordenador. Enciende «Permitir acceso desde la red local» para que lo alcance el teléfono.',
  'ph.altsTitle': 'Si ese enlace no carga',
  'ph.altsHint':
    'Tu equipo tiene más de una dirección de red. Prueba con estas; sólo una llega al teléfono.',
  'ph.sentTitle': 'Qué se manda y qué no',
  'ph.sentHint':
    'Van las **respuestas** y si la escucha está activa. **No va la transcripción**: lo que dijo la otra persona no se duplica en un segundo dispositivo por comodidad. Todo se queda en tu red — el puente lo sirve tu propio ordenador, sin ninguna nube por medio, y se apaga con la app.',

  // ───────────────────── Ajustes · MQTT ─────────────────────
  'mq.publish': 'Publicar en un broker',
  'mq.brokerTitle': 'Broker',
  'mq.brokerHint': 'El esquema decide el cifrado: `mqtt://` va en claro y `mqtts://` cifrado.',
  'mq.address': 'Dirección',
  'mq.addressDesc': 'Incluye el puerto: 1883 en claro, 8883 con TLS.',
  'mq.topic': 'Tema',
  'mq.topicDesc': 'Se publica en este tema y en su hijo «/text».',
  'mq.user': 'Usuario',
  'mq.userDesc': 'Déjalo vacío si tu broker acepta conexiones anónimas.',
  'mq.subscribeTitle': 'A qué se suscribe tu dispositivo',
  'mq.esp32Title': 'Un consumidor listo para usar',
  'mq.esp32Post':
    'es una librería Arduino/ESP32 que se suscribe a los temas que publica Tayori y reacciona con hardware (LEDs, semáforo, OLED).',
  'mq.esp32Open': 'Ver en GitHub',
  'mq.qos':
    'Se publican con QoS 1 y **sin retener**: un mensaje retenido se entrega al suscribirse, así que una placa que arranca por la mañana ejecutaría la respuesta de ayer.',
  'mq.published': 'publicado',
  'mq.outWarn':
    '**Esto saca tus respuestas de la app.** Si el broker está en internet, el texto sale de tu red; si está en tu LAN, cualquiera con acceso al tema puede leerlo. Un broker sin usuario ni TLS es un tablón de anuncios — usa `mqtts://` fuera de tu red.',
  'mq.connected': 'Conectado al broker',
  'mq.connecting': 'Conectando…',
  'mq.noConnection': 'Sin conexión',
  'mq.off': 'Apagado',
  'mq.publishedCount': '{count} respuesta(s) publicada(s) en esta sesión.',
  'mq.nothingPublished': 'Todavía no se ha publicado nada.',

  'mq.publishDesc':
    'Cada respuesta terminada se publica en MQTT. Las que fallan o se cancelan no: un dispositivo no puede distinguir un error de una respuesta.',
  'mq.brokerHint2': 'En una red que no sea la tuya, esto último no es opcional.',
  'mq.twoTopics':
    'Dos temas, porque son dos consumidores distintos. Si tu placa sólo quiere las letras de un test, el segundo le ahorra meter un parser de JSON.',
  'mq.jsonTopic': 'JSON con id, pregunta, respuesta, modelo y disparo',
  'mq.textTopic': 'sólo el texto de la respuesta, en crudo',
  'mq.testPublish': 'Publicar un mensaje de prueba',
  'mq.yourDevice':
    'Y lo que haga tu dispositivo con lo que reciba es cosa tuya: aquí se publica y ahí se acaba nuestra parte.',

  // ───────────────────── Ajustes · audio y flecos ─────────────────────
  'aud.captureTitle': 'Captura de audio',
  'aud.listening': 'Escuchando',
  'aud.paused': 'En pausa',
  'aud.devices': 'Micrófono: {mic} · Sistema: {system}',
  'aud.active': 'activo',
  'aud.inactive': 'inactivo',
  'aud.stop': 'Detener',
  'aud.start': 'Empezar a escuchar',
  'aud.sourcesTitle': 'Qué se escucha',
  'aud.sourcesHint':
    'Decide qué entra en el contexto que se manda al modelo. Con «solo la salida del sistema» tu micrófono ni siquiera se abre.',
  'aud.sources': 'Fuentes de audio',
  'aud.both': 'Micrófono y salida del sistema',
  'aud.systemOnly': 'Solo la salida del sistema',
  'aud.micOnly': 'Solo el micrófono',
  'aud.devicesTitle': 'Dispositivos',
  'aud.devicesHint':
    'Qué micrófono graba la app y por qué salida suena. Útil cuando tienes más de uno de cualquiera.',
  'aud.inputLabel': 'Micrófono (entrada)',
  'aud.inputHint': 'La entrada que abre la captura. Al cambiarla se reabre el micrófono si ya estaba escuchando.',
  'aud.outputLabel': 'Salida',
  'aud.outputHint':
    'Por dónde suena la app. No cambia lo que se captura; es donde sonarán las respuestas habladas (próximamente).',
  'aud.deviceDefault': 'Predeterminado del sistema',
  'aud.inputFallback': 'Micrófono {n}',
  'aud.outputFallback': 'Salida {n}',
  'aud.testOutput': 'Probar salida',
  'aud.testing': 'Sonando…',
  'tts.title': 'Respuestas habladas',
  'tts.hint': 'Lee en voz alta las respuestas del asistente. Gratis y offline con las voces del sistema, o un motor en la nube para una voz más natural.',
  'tts.enable': 'Leer respuestas en voz alta',
  'tts.enableHint': 'Interruptor maestro. Apagado no hay lectura ni botones de hablar.',
  'tts.provider': 'Motor',
  'tts.providerHint': 'Qué motor convierte la respuesta en voz.',
  'tts.webspeech': 'Voces del sistema (offline)',
  'tts.webspeechNote': 'Instantáneo y offline, pero suena siempre por la salida por defecto.',
  'tts.openai': 'OpenAI',
  'tts.piper': 'Piper (local)',
  'tts.kokoro': 'Kokoro (local)',
  'tts.soon': 'próximamente',
  'tts.needsKey': 'El texto a voz de OpenAI necesita la API key de OpenAI.',
  'tts.goKeys': 'Configurar la key de OpenAI',
  'tts.voice': 'Voz',
  'tts.voiceDefault': 'Por defecto',
  'tts.rate': 'Velocidad',
  'tts.autoRead': 'Leer respuestas nuevas automáticamente',
  'tts.autoReadHint': 'Con esto apagado, usa el botón de hablar en las respuestas que quieras.',
  'tts.test': 'Probar voz',
  'tts.testing': 'Sonando…',
  'tts.sample': 'Así sonarán las respuestas.',
  'tts.err.noOpenaiKey': 'El texto a voz de OpenAI necesita la API key de OpenAI.',
  'tts.err.openaiRequest': 'Falló la síntesis de OpenAI ({status}). {detail}',
  'aud.inertWarn':
    'Con esta combinación **no se disparará ninguna respuesta automática**: el disparo espera a {wanted} y aquí no se abre esa fuente.',
  'aud.seeTrigger': 'Ver el disparo automático',
  'nav.attention': 'Algo requiere tu atención',
  'nav.wizard': 'Configuración guiada',
  'nav.quit': 'Cerrar Tayori',
  'nav.footer': 'Todo se guarda en tu equipo. Nada se sube a ningún servidor propio.',
  'ph.qrAlt': 'Código QR con el enlace del espejo',
  'local.title': 'Qué modelo local le pega a tu equipo',
  'local.hint':
    'Ollama no cuesta dinero y no envía nada fuera de tu máquina, pero elegir mal cuesta una descarga de varios gigas para acabar con respuestas de un minuto. Esto es lo que encaja con lo que tienes.',
  'local.ram': 'de RAM',
  'local.cores': '{cores} núcleos · {cpu}',
  'local.gpu': 'GPU:',
  'local.forChat': 'Para conversar',
  'local.forScreen': 'Para leer la pantalla',
  'local.alreadyInstalled': 'ya instalado',
  'local.copied': '¡copiado!',
  'local.guide': 'Guía completa',
  'local.guideDesc':
    'Todos los modelos locales por tramo de memoria, los multimodales que pueden leer tu pantalla, los de pago ordenados por precio y cuánto cuesta de verdad cada pulsación. Se genera para tu equipo y se abre en el navegador.',
  'local.openGuide': 'Abrir la guía',
  'local.guideFailed': 'No se pudo abrir la guía.',

  'aud.hintBoth':
    'El modelo sabe lo que ya has respondido, así que no te sugiere repetirlo. Por defecto el auto-disparo no reacciona a tu propia voz.',
  'aud.hintSystem':
    'Tu micrófono no se abre siquiera. Evita cualquier posibilidad de que tus respuestas entren en el contexto, a cambio de que el modelo no sepa qué has dicho ya.',
  'aud.hintMic':
    'Solo se transcribe lo que dices tú. Útil para dictar notas, no para una entrevista: el interlocutor no se escucha, así que el auto-disparo por defecto no puede saltar.',

  'aud.captureHint':
    'Dos fuentes independientes: tu micrófono y la salida del sistema. Mantenerlas separadas es lo que permite distinguir quién habla sin diarización.',

  // ───────────────────── Errores del proceso principal ─────────────────────
  'err.noKeyAnthropic':
    'Falta la API key de Anthropic. Configúrala en el dashboard o cambia de proveedor.',
  'err.noKeyGoogle':
    'Falta la API key de Google. Configúrala en el dashboard o cambia de proveedor.',
  'err.noKeyOpenai':
    'Falta la API key de OpenAI. Configúrala en el dashboard o cambia de proveedor.',
  'err.noKeyDeepseek':
    'Falta la API key de DeepSeek. Configúrala en el dashboard o cambia de proveedor.',
  'err.badKeyAnthropic': 'La API key de Anthropic no es válida.',
  'err.badKeyGoogle': 'La API key de Google no es válida.',
  'err.badKeyOpenai': 'La API key de OpenAI no es válida.',
  'err.badKeyDeepseek': 'La API key de DeepSeek no es válida.',
  'err.rateAnthropic': 'Límite de peticiones de Anthropic alcanzado.',
  'err.rateGoogle': 'Cuota de Gemini agotada o límite de peticiones alcanzado.',
  'err.rateOpenai':
    'Límite de peticiones de OpenAI alcanzado, o tu cuenta se ha quedado sin saldo.',
  'err.rateDeepseek':
    'Límite de peticiones de DeepSeek alcanzado, o la cuenta se ha quedado sin saldo.',
  'err.noModel':
    'El modelo indicado no existe o tu cuenta no tiene acceso. Elige otro en el dashboard.',
  'err.noModelGemini': 'El modelo de Gemini indicado no existe o no tienes acceso.',
  'err.noModelDeepseek': 'El modelo indicado no existe en DeepSeek. Elige otro en el dashboard.',
  'err.noAccessOpenai':
    'Tu cuenta de OpenAI no tiene acceso a este modelo. Elige otro en el dashboard.',
  'err.offlineAnthropic': 'Sin conexión con la API de Anthropic.',
  'err.offlineOpenai': 'Sin conexión con la API de OpenAI.',
  'err.offlineDeepseek': 'Sin conexión con la API de DeepSeek.',
  'err.refusedClaude':
    'Claude declinó responder a este contenido. Prueba con otro proveedor o reformula la pregunta.',
  'err.refusedOpenai': 'OpenAI declinó responder a este contenido: {detail}',
  'err.apiError': 'Error de {provider} ({status}): {message}',
  'err.geminiError': 'Error de Gemini: {message}',
  'err.unknownProvider': 'Proveedor desconocido: {id}',
  'err.noOllamaModel': 'No hay ningún modelo de Ollama seleccionado. Elige uno en el dashboard.',
  'err.ollamaOffline':
    'No se pudo conectar con Ollama. Comprueba que esté corriendo (ollama serve).',
  'err.ollamaError': 'Error de Ollama: {message}',
  'err.ollamaTimeout': 'Ollama no respondió a tiempo.',
  'err.ollamaNotFound': 'No se encontró ningún servidor de Ollama escuchando.',
  'err.ollamaHttp': 'Ollama respondió HTTP {status}.',
  'err.ollamaNoModels':
    'Ollama responde pero no tiene modelos. Descarga uno con: ollama pull llama3.2',
  'err.budgetOllama':
    '"{model}" gastó todo su presupuesto razonando y no llegó a escribir la respuesta. Es un modelo de razonamiento sobre un problema demasiado grande: elige uno sin "thinking" en el dashboard → Modelo para la pantalla, o recorta la captura a lo que hay que resolver.',
  'err.budgetOpenai':
    '"{model}" gastó todo su presupuesto razonando y no llegó a escribir la respuesta. Elige un modelo más pequeño en el dashboard, o recorta la captura a lo que hay que resolver.',
  'err.sttNoKeyGoogle': 'Falta la API key de Google. Configúrala más arriba.',
  'err.sttNoKeyOpenai': 'Falta la API key de OpenAI. Configúrala más arriba.',
  'err.sttNoKeyGoogleLive':
    'Falta la API key de Google. Configúrala en el dashboard para usar Gemini Live, o cambia la transcripción a Whisper local.',
  'err.sttNoKeyGoogleAudio':
    'Falta la API key de Google. El modo de audio directo manda el sonido al propio modelo de Gemini, así que la necesita.',
  'err.sttNoKeyOpenaiEngine':
    'Falta la API key de OpenAI. Configúrala en el dashboard para transcribir con ella, o cambia la transcripción a Whisper local.',
  'err.sttNoContext': 'El motor de audio directo requiere el contexto de respuesta.',
  'err.sttUnknown': 'Motor de transcripción desconocido: {id}',
  'err.openaiBadKeyStt': 'La API key de OpenAI no es válida.',
  'err.openaiNoAccessStt': 'Tu cuenta de OpenAI no tiene acceso a este modelo de transcripción.',
  'err.openaiNoModelStt': 'El modelo de transcripción no existe o tu cuenta no tiene acceso.',

  'mdl.fast': 'rápido',
  'mdl.speedVeryFast': 'muy rápido',
  'mdl.speedFast': 'rápido',
  'mdl.speedMedium': 'velocidad media',
  'mdl.speedSlow': 'lento',
  'mdl.accDecent': 'precisión aceptable',
  'mdl.accGood': 'buena precisión',
  'mdl.accHigh': 'precisión alta',
  'mdl.accVeryHigh': 'precisión muy alta',
  'mdl.capable': 'más capaz',
  'mdl.lowLatency': 'mínima latencia',
  'mdl.balanced': 'equilibrado',
  'mdl.cheapest': 'el más barato',
  'mdl.fastCheap': 'rápido y barato',

  // ───────────────────── Asistente de configuración ─────────────────────
  'wiz.eyebrow': 'Configuración guiada',
  'wiz.back': '← Atrás',
  'wiz.skip': 'Saltar →',
  'wiz.pickFirst': 'Elige primero si quieres la nube o tu equipo',
  'wiz.skipTitle': 'Pasar al siguiente paso sin hacer éste',
  'wiz.exit': 'Salir del asistente',
  'wiz.titleWelcome': '¿Quién va a responder?',
  'wiz.titleBrain': 'Configurando el modelo',
  'wiz.titleVoice': '¿Cómo se convierte la voz en texto?',
  'wiz.titleContext': 'Lo que el modelo debe saber de ti',
  'wiz.titleDone': 'Listo',
  'wiz.measuring': 'Midiendo tu equipo…',
  'wiz.lead':
    'La app necesita un modelo que redacte las respuestas. Hay dos formas, y la diferencia real es dónde corre y quién paga.',
  'wiz.cloud': 'En la nube',
  'wiz.cloudB1': 'Nada que instalar: pegas una API key y ya responde.',
  'wiz.cloudB2': 'La mejor calidad, y responde en uno o dos segundos.',
  'wiz.cloudB3': 'Pagas por uso al proveedor. Tu voz transcrita sale de tu equipo.',
  'wiz.cloudCta': 'Usar un proveedor de pago',
  'wiz.local': 'En tu equipo',
  'wiz.localB1': 'Gratis y sin cuenta. Nada de lo que digas sale de la máquina.',
  'wiz.localB2': 'Hay que instalar Ollama y descargar varios GB de modelos.',
  'wiz.localB3': 'La calidad y la velocidad dependen de tu hardware.',
  'wiz.localCta': 'Instalarlo todo aquí',
  'wiz.recommended': 'recomendado',
  'wiz.localViable':
    'Tu equipo da la talla para lo local, así que es lo que te recomiendo: sale gratis y no envías nada. Puedes cambiar de idea después sin perder nada.',
  'wiz.localWeak':
    'Con este equipo lo local iría lento y se equivocaría leyendo capturas, así que te recomiendo la nube. Puedes probar lo local igualmente: el asistente te dirá qué modelos te pegan.',
  'wiz.cloudLead':
    'Elige el proveedor y pega su clave. Se guarda cifrada en tu perfil de Windows y no se muestra de vuelta.',
  'wiz.claudeNote': 'La mejor calidad de respuesta y de lectura de pantalla.',
  'wiz.geminiNote': 'Más barato, y la misma clave sirve para transcribir en directo.',
  'wiz.openaiNote': 'Si ya pagas OpenAI. Responde y también transcribe.',
  'wiz.deepseekNote':
    'El más barato con diferencia. No lee imágenes, así que la pantalla pide otro.',
  'wiz.apiKey': 'API key',
  'wiz.alreadyHave': 'ya tienes una',
  'wiz.keepExisting': 'Déjalo vacío para usar la que ya guardaste',
  'wiz.pasteKey': 'Pega aquí la clave',
  'wiz.testingKey': 'Probando la clave…',
  'wiz.saveAndTest': 'Guardar y probar',
  'wiz.connectionFailed': 'La conexión falló.',
  'wiz.installing': 'Instalando Ollama…',
  'wiz.installFailed': 'No se pudo instalar.',
  'wiz.configuring': 'Configurando…',
  'wiz.downloadingModels': 'Descargando modelos…',
  'wiz.downloadFailed': 'No se pudo descargar {model}.',
  'wiz.ollamaIs': 'Ollama es el programa que ejecuta los modelos en tu equipo.',
  'wiz.installedNotRunning': 'Ya lo tienes instalado, pero su servidor no está respondiendo.',
  'wiz.notInstalled': 'No lo tienes instalado.',
  'wiz.openItOnce':
    'Ábrelo desde el menú de inicio y vuelve aquí. Se queda corriendo en segundo plano, así que esto sólo hay que hacerlo una vez.',
  'wiz.recheck': 'Volver a comprobar',
  'wiz.wingetNote':
    'Lo instalo con `winget`, el gestor de paquetes de Windows — así no descargo ningún ejecutable por mi cuenta. Windows te pedirá permiso con su propio aviso.',
  'wiz.installOllama': 'Instalar Ollama',
  'wiz.noWinget':
    'Este equipo no tiene `winget`, así que no puedo instalarlo sin descargarme un ejecutable por mi cuenta — y eso no lo voy a hacer. Instálalo desde **ollama.com/download** y pulsa «Volver a comprobar».',
  'wiz.ollamaReadyAll':
    'Ollama está listo y ya tienes descargados los dos modelos que le pegan a tu equipo. No hay nada que bajar: sólo queda dejarlos elegidos.',
  'wiz.ollamaReady':
    'Ollama está listo. Estos son los dos modelos que le pegan a tu equipo: uno para conversar y otro para leer la pantalla.',
  'wiz.forChat': 'Para conversar',
  'wiz.forScreen': 'Para leer la pantalla',
  'wiz.alreadyDownloaded': '· ya descargado',
  'wiz.sizeNote':
    'Son varios GB entre los dos y se descargan una sola vez. Verás el tamaño exacto en cuanto empiece. Si alguno ya lo tienes, se salta.',
  'wiz.useThese': 'Usar estos modelos',
  'wiz.downloadAndSet': 'Descargar y configurar',
  'wiz.lookingForOllama': 'Buscando Ollama en tu equipo…',
  'wiz.voiceBoth':
    'Para saber qué te preguntan hay que convertir el audio en texto. La diferencia entre las opciones es dónde va tu voz.',
  'wiz.voiceLocal':
    'Para saber qué te preguntan hay que convertir el audio en texto. Elegiste que todo corra en tu equipo, así que aquí sólo está la opción que no manda tu voz a ningún sitio.',
  'wiz.voiceCloud':
    'Para saber qué te preguntan hay que convertir el audio en texto. Elegiste la nube, así que éstas son las que no te obligan a descargar nada.',
  'wiz.openaiLiveTitle': 'OpenAI en directo · ~300 ms',
  'wiz.recommendedSuffix': '· recomendado',
  'wiz.openaiLiveOk':
    'El modelo que OpenAI recomienda para audio en vivo. Usa la clave que ya has puesto; el audio se envía a OpenAI.',
  'wiz.openaiLiveNoKey': 'Necesita una clave de OpenAI, y no has configurado ninguna.',
  'wiz.geminiLiveTitle': 'Gemini Live · ~300 ms',
  'wiz.geminiLiveOk':
    'Igual de rápido. Usa la clave de Google que ya has puesto; el audio se envía a Google.',
  'wiz.geminiLiveNoKey': 'Necesita una clave de Google, y no has configurado ninguna.',
  'wiz.whisperTitle': 'Whisper local · ~1–2 s',
  'wiz.whisperReady': 'Ya instalado. Funciona sin conexión y tu voz no sale del equipo.',
  'wiz.whisperNew': 'Tu voz no sale del equipo. Hay que descargar unos 150 MB una sola vez.',
  'wiz.noSttKey':
    'No hay ninguna clave que sirva para transcribir. Vuelve atrás y pon la de OpenAI o la de Google, o usa **Whisper local** desde el dashboard: funciona sin ninguna clave.',
  'wiz.geminiLiveStuck':
    'Ahora mismo está puesto Gemini Live y no hay clave de Google: si sales sin elegir, la app no transcribirá nada.',
  'wiz.cvLead':
    'Pega tu CV, o un resumen: empresas, años, tecnologías, logros con cifras. Es la única fuente de datos concretos sobre ti que el modelo puede citar.',
  'wiz.cvNote':
    'Sin esto las respuestas son correctas pero genéricas — el modelo tiene prohibido inventarse experiencia. Puedes dejarlo para luego y pegarlo en «Contexto».',
  'wiz.cvPlaceholder': 'Pega tu CV o un resumen de tu experiencia…',
  'wiz.notNow': 'Ahora no',
  'wiz.saveAndFinish': 'Guardar y terminar',
  'wiz.doneLead': 'Ya está todo puesto. Esto es lo que ha quedado configurado:',
  'wiz.answers': 'Responde',
  'wiz.transcribes': 'Transcribe',
  'wiz.cvLoaded': 'Tu CV está cargado',
  'wiz.noCv': 'Sin CV: las respuestas serán genéricas hasta que lo pegues en «Contexto»',
  'wiz.doneNote':
    'El overlay ya está en pantalla, arriba a la derecha. Pulsa el punto de la izquierda para empezar a escuchar, o Ctrl+Alt+C para resolver lo que tengas en pantalla. Todo esto se cambia luego desde este mismo dashboard.',
  'wiz.startUsing': 'Empezar a usar la app',
  'wiz.sttGeminiLive': 'Gemini Live (en la nube)',
  'wiz.sttGeminiAudio': 'Gemini audio directo',
  'wiz.sttOpenaiLive': 'OpenAI en directo (en la nube)',
  'wiz.sttOpenaiTranscribe': 'OpenAI por turnos (en la nube)',
  'wiz.sttWhisper': 'Whisper local (sin conexión)',

  'ol.status': 'Estado de Ollama',
  'ol.checking': 'comprobando…',
  'ol.detected': 'detectado',
  'ol.notDetected': 'no detectado',
  'ol.recheck': 'Volver a comprobar',
  'ol.installHint':
    '{error} Instálalo desde **ollama.com** y déjalo corriendo; el servidor arranca solo tras la instalación.',
  'ol.noModels':
    'Ollama está corriendo pero no tiene ningún modelo descargado. Descarga uno desde una terminal, por ejemplo: `ollama pull llama3.2`',
  'ol.detectedCount': '{count} modelo(s) detectado(s) automáticamente:',
  'ol.vision': 'visión',
  'mdl.providerOllama': 'Ollama (local)',

  // ───────────────────── Ajustes · claves ─────────────────────
  'keys.title': 'API keys',
  'keys.hint':
    'Se guardan cifradas con DPAPI en tu perfil de Windows y sólo las lee el proceso principal. Nunca se muestran de vuelta ni salen de esta máquina salvo hacia el proveedor que elijas.',
  'keys.configured': 'configurada',
  'keys.missing': 'sin configurar',
  'keys.placeholder': 'Pega tu API key',
  'keys.replace': '•••••••• (escribe para reemplazar)',
  'keys.save': 'Guardar',
  'keys.test': 'Probar',
  'keys.testing': 'Probando…',
  'keys.clear': 'Borrar',
  'keys.ok': 'conexión correcta',
  'keys.failed': 'falló',
  'keys.anthropic': 'Anthropic (Claude)',
  'keys.anthropicHint': 'console.anthropic.com → API Keys',
  'keys.google': 'Google (Gemini)',
  'keys.googleHint':
    'aistudio.google.com → Get API key. Necesaria también para la transcripción con Gemini Live.',
  'keys.openai': 'OpenAI (ChatGPT)',
  'keys.openaiHint':
    'platform.openai.com → API keys. Sirve para las respuestas y también para transcribir con los motores de OpenAI.',
  'keys.deepseek': 'DeepSeek',
  'keys.deepseekHint':
    'platform.deepseek.com → API keys. Sólo responde: no tienen modelos de transcripción, y sus modelos no leen imágenes.',
  'keys.ollama': 'Ollama (local)',
  'keys.ollamaBadge': 'no necesita clave',
  'keys.ollamaHint':
    'Corre en tu máquina, así que aquí no hay nada que pegar. Lo que sí conviene comprobar es que el servidor está vivo y tiene algún modelo descargado.',

  // ───────────────────── Ajustes · secciones ─────────────────────
  'sec.general': 'General',
  'sec.generalHint': 'Si el overlay aparece al compartir pantalla, y cómo se ve mientras tanto.',
  'sec.audio': 'Audio',
  'sec.audioHint': 'Qué se escucha, y la comprobación de que las dos fuentes llegan por separado.',
  'sec.phone': 'Espejo en el móvil',
  'sec.phoneHint':
    'Manda las respuestas al navegador de tu teléfono. Sirve para lo que el modo invisible no puede cubrir: cuando compartes la pantalla entera, lo que está en tu monitor está al otro lado.',
  'sec.mqtt': 'MQTT',
  'sec.mqttHint':
    'Publica cada respuesta terminada en un broker, para que la recoja otra cosa: un ESP32, un script, lo que montes.',
  'sec.models': 'Modelos de IA',
  'sec.modelsHint': 'Las claves, quién genera las respuestas y quién lee tu pantalla.',
  'sec.transcription': 'Transcripción',
  'sec.transcriptionHint':
    'Los motores de nube transcriben en ~300 ms pero envían el audio a su proveedor. Whisper local no sale de tu máquina, a cambio de ~1–2 s de latencia.',
  'sec.behaviour': 'Comportamiento',
  'sec.behaviourHint': 'Cuándo responde el asistente y con cuánto contexto.',
  'sec.context': 'Contexto',
  'sec.contextHint':
    'Lo que preparas aquí es lo que separa una respuesta genérica de una tuya. Cada tipo se le explica al modelo de forma distinta, así que una respuesta preparada se reutiliza en vez de parafrasearse.',
  'sec.skills': 'Skills',
  'sec.skillsHint':
    'Instrucciones locales en formato SKILL.md que refinan CÓMO responde el modelo: el tono y las palabras, no el formato. Se activan aquí o escribiendo /nombre en la pestaña de escritura.',
  'sec.history': 'Historial',
  'sec.historyHint':
    'Se guarda en tu máquina, en texto plano, y no se envía a ningún sitio. Incluye la transcripción completa: lo que dijo la otra persona, no sólo lo que preguntaste tú.',
  'sec.hotkeys': 'Atajos',
  'sec.hotkeysHint':
    'Son **globales**: funcionan con el foco en la videollamada, y por eso se los quitan a la aplicación que lo tenga. Pulsa un campo y teclea la combinación que quieras.',
  'sec.diagnostics': 'Diagnóstico',
  'sec.diagnosticsHint': 'Si algo no funciona, esto es lo que hay que mirar antes que nada.',
  'sec.about': 'Acerca de',
  'sec.aboutHint': 'Qué es Tayori, qué versión tienes y qué hace con tus datos.',

  // ────────────────────────────── Ajustes ──────────────────────────────
  'dash.language': 'Idioma',
  'dash.languageDesc':
    'El idioma de la interfaz. No tiene nada que ver con el idioma en el que hablas en la reunión — ése se elige en Transcripción.',

  // ───────────────────── Dashboard · rótulos sueltos ─────────────────────
  'nav.eyebrow': 'Ajustes',
  'aud.startTitle': 'Empezar a escuchar',
  'aud.stopTitle': 'Detener la escucha',
  'aud.meterMe': 'Yo (micrófono)',
  'aud.meterThem': 'Ellos (sistema)',
  'hist.untitled': 'Conversación sin título',
  'hist.inferredQuestion': '(pregunta deducida de la transcripción)',
  'stt.whisperTiny': 'Tiny (74 MB) — el más rápido',
  'stt.whisperBase': 'Base (141 MB) — justo fuera del inglés',
  'stt.whisperSmall': 'Small (465 MB) — recomendado fuera del inglés',

  // ───────────────────── Ajustes · atajos ─────────────────────
  'hk.needsModifier':
    'Un atajo global necesita al menos Ctrl, Alt o Shift: sin modificador, esa tecla dejaría de funcionar en todo el sistema.',
  'hk.taken': 'Windows rechazó este atajo: otra aplicación ya lo tiene tomado. Elige otro.',
  'hk.duplicated': 'Repetido: dos acciones con el mismo atajo hacen que sólo funcione una.',
  'hk.pressCombo': 'Pulsa la combinación…',
  'hk.unassigned': 'Sin asignar',
  'hk.switchHint':
    'El interruptor de cada fila apaga ese atajo. Un atajo global le quita la combinación a la aplicación que tenga el foco, así que apagar uno que no uses se la devuelve: deja de registrarse y tu editor, tu juego u otra app pueden volver a usarla. La combinación se conserva, así que volver a encenderlo no obliga a teclearla otra vez.',
  'hk.offDesc': 'Apagado: la combinación queda libre para otras aplicaciones.',

  // ───────────────────── Ajustes · diagnóstico ─────────────────────
  'diag.logAt': 'El registro del proceso principal se guarda en `{where}`.',
  'diag.dataFolder': 'tu carpeta de datos',
  'diag.refresh': 'Actualizar registro',
  // Lo que devuelve «Probar la transcripción». Se lee en la misma tarjeta.
  'diag.whisperNoBinary': 'No se encuentra whisper-cli.exe. Descárgalo desde arriba.',
  'diag.whisperNoModel': 'El modelo "{model}" no está descargado.',
  'diag.whisperOk': 'Whisper funciona. Ejecutable: {binary}',
  'diag.whisperFailed': 'Falló al ejecutar {binary}\n{detail}',
  'diag.geminiLiveOk': 'Conectado con "{model}" (salida {modality}).',
  'diag.geminiLiveAudioOut':
    'Este modelo obliga a devolver audio, que se descarta: transcribe bien, pero esa salida se paga.',
  'diag.geminiAudioOk': 'Conectado con "{model}" (audio directo).',
  'diag.openaiLiveOk': 'Sesión abierta con "{model}".',
  'diag.openaiTranscribeOk': 'Conectado con "{model}".',

  // ───────────────────── Ajustes · espejo del móvil ─────────────────────
  'ph.serverFailed': 'No se pudo abrir el servidor:',
  'ph.scanHint':
    'Abre la cámara del móvil y apunta. Si prefieres, escribe el enlace a mano — es el mismo.',
  // La página que se sirve al teléfono. Van a nodos de texto, sin marcado.
  'ph.pgTitle': 'Espejo',
  'ph.pgConnecting': 'Conectando…',
  'ph.pgConnected': 'Conectado',
  'ph.pgReconnecting': 'Reconectando…',
  'ph.pgExpired': 'Enlace caducado — vuelve a escanear el código',
  'ph.pgEmpty': 'Aquí aparecerán las respuestas.\nMantén la pantalla encendida.',
  'ph.pgFoot': 'Sólo mientras el ordenador esté encendido y en la misma red.',
  'ph.pgThinking': 'Pensando…',
  'ph.pgFailed': 'Falló la respuesta.',
  'ph.pgCancelled': 'Cancelada.',
  'ph.pgWriting': 'escribiendo…',
  'ph.pgListening': 'escuchando',
  'ph.pgCaptureError': 'error de captura',
  'ph.pgPaused': 'en pausa',
  'ph.pgCopy': 'Copiar',
  'ph.pgCopied': 'Copiado',
  'ph.pgExpiredPlain': 'Enlace caducado. Vuelve a escanear el código QR del dashboard.',
  'ph.pgNotFound': 'No hay nada aquí.',

  // ───────────────────── Ajustes · MQTT ─────────────────────
  'mq.errNoConnection': 'No hay conexión con el broker.',
  'mq.testQuestion': 'Mensaje de prueba del asistente',
  'mq.testText': 'Si ves esto en tu dispositivo, el montaje funciona.',
  'mq.errRefused':
    'El broker rechazó la conexión. Comprueba la dirección y que esté escuchando en ese puerto.',
  'mq.errNoHost': 'No se encontró ese host. Revisa la dirección del broker.',
  'mq.errAuth': 'El broker rechazó el usuario o la contraseña.',
  'mq.errBadUrl': 'La URL no vale. Tiene que empezar por mqtt:// o mqtts:// e incluir el puerto.',

  // ───────────────────── Modelos locales · recomendación ─────────────────────
  'local.tierTight': '{ram} GB de RAM: justo para modelos locales',
  'local.tierSmall': '{ram} GB de RAM: alcanza para modelos de 3B–7B',
  'local.tierComfy': '{ram} GB de RAM: cómodo para 7B–8B, justo para 14B',
  'local.tierBig': '{ram} GB de RAM: da para modelos grandes',
  'local.noteLlama1b': 'Lo más pequeño que sigue siendo útil.',
  'local.noteMoondream': 'Visión mínima; lee capturas simples, no enunciados largos.',
  'local.noteLlama3b': 'Rápido de verdad en CPU; suficiente para sugerir respuestas.',
  'local.noteQwenVl3b': 'Multimodal pequeño. Lee un enunciado con buena captura.',
  'local.noteLlama8b': 'El equilibrio habitual entre calidad y velocidad.',
  'local.noteQwenVl7b': 'Lee capturas de código y tests con soltura.',
  'local.noteQwen14b': 'Calidad alta manteniendo una latencia razonable.',
  'local.noteQwenVl32b': 'De lo mejor que se puede tener en local para leer pantallas.',
  'local.caveatTight':
    'Con esta memoria, un modelo local va a ir lento y a equivocarse en las capturas. Para las acciones de pantalla merece la pena usar un modelo en la nube y dejar lo local para conversar.',
  'local.caveatSmall':
    'Cabe, pero con la ventana de contexto grande la memoria se va enseguida. Si el equipo no tiene GPU dedicada, cuenta con varios segundos por respuesta.',
  'local.caveatComfy':
    'Sin GPU dedicada, un 8B en CPU ronda los 5–15 s por respuesta: sirve para la pantalla, se queda corto para seguir una conversación en directo.',
  'local.caveatBig':
    'La RAM sobra; el límite pasa a ser la GPU. Si el modelo no cabe en la VRAM, Ollama lo reparte con la CPU y la velocidad se desploma — ahí conviene bajar de tamaño aunque quepa en memoria.',
  'local.vramNote':
    'La VRAM de la tarjeta gráfica —el dato que de verdad decide si un modelo va rápido— no se puede leer de forma fiable desde aquí, así que **no se estima**: estas recomendaciones se basan en la RAM. Si el modelo no cabe en la GPU, Ollama lo reparte con la CPU y va mucho más lento, aunque quepa en memoria. Los nombres pueden cambiar con el tiempo; la lista viva está en `ollama.com/library`.',

  // ───────────────────── Asistente · instalación ─────────────────────
  'wiz.whereToGet': 'Dónde sacarla: {where}',
  'wiz.backPlain': 'Atrás',
  'setup.noWinget':
    'No hay winget en este equipo, así que no puedo instalarlo por ti sin descargar un ejecutable por mi cuenta, y eso no lo voy a hacer. Instala Ollama desde ollama.com y vuelve aquí: el asistente lo detectará solo.',
  'setup.installing': 'Instalando Ollama con winget…',
  'setup.waitingServer': 'Instalado. Esperando a que arranque el servidor…',
  'setup.running': 'Ollama está corriendo.',
  'setup.serverSilent':
    'Ollama se instaló pero su servidor no respondió. Suele arreglarse abriendo Ollama una vez desde el menú de inicio; después vuelve aquí.',
  'setup.tooLong': 'La instalación tardó más de 10 minutos y se canceló.',
  'setup.wingetFailedToRun': 'No se pudo ejecutar winget: {detail}',
  'setup.wingetFailed': 'winget falló (código {code}). {detail}',
  'setup.tryManually': 'Prueba a instalarlo desde ollama.com.',
  'setup.modelNotFound':
    'Ollama no encuentra el modelo "{model}". Puede que haya cambiado de nombre; búscalo en ollama.com/library.',
  'setup.pullFailed': 'No se pudo descargar "{model}": {detail}',

  // ───────────────────── Skills ─────────────────────
  'sk.humanizeName': 'Que no suene a IA',
  'sk.humanizeDesc':
    'Quita las marcas de texto generado: las fórmulas de relleno, el ritmo uniforme y el vocabulario que delata a un modelo. Para cuando la respuesta se va a leer en voz alta y tiene que sonar tuya.',
  'sk.errNoFrontmatter':
    'SKILL.md no empieza por un bloque de frontmatter entre "---". Añade al menos un name y una description.',
  'sk.errNoBody': 'El SKILL.md no tiene instrucciones debajo del frontmatter.',
  'sk.errNoFile': 'La carpeta no tiene ningún SKILL.md.',
  'sk.errUnreadable': 'No se pudo leer el SKILL.md:',

  // ───────────────────── Más errores del proceso principal ─────────────────────
  'err.noFirstToken':
    '{provider} no respondió en {seconds} s. Si es Ollama, comprueba que el servidor sigue vivo (ollama ps).',
  'err.generationTimeout': 'La generación excedió el tiempo límite.',
  'err.noVision':
    'El modelo "{model}" no admite imágenes, así que no puede leer tu pantalla. Elige uno con visión en el dashboard → Modelo para la pantalla (Claude, Gemini, o un multimodal de Ollama como qwen2.5vl o llava).',
  'err.emptyAnswer': 'El modelo no devolvió texto.',
  'err.noScreenshot': 'No se pudo capturar la pantalla, así que no hay nada que resolver.',
  'err.whisperNoBinary':
    'El ejecutable de Whisper no está instalado. Descárgalo desde el dashboard (7,6 MB).',
  'err.whisperNoModel':
    'El modelo de Whisper "{model}" no está descargado. Hazlo desde el dashboard.',
  'err.geminiLiveNoModel':
    'Ningún modelo de Gemini Live está disponible para esta API key.\n{failures}',
  'err.openaiStreamFailed': 'Error de OpenAI: {message}',
  'err.noReason': 'la respuesta falló sin motivo.',
  'err.noEncryption':
    'El cifrado del sistema no está disponible; no se guardará la API key en texto plano.',
  'err.audioWorker': 'No se pudo iniciar el worker de audio.',
  'err.workletFailed': 'El procesador de audio de "{speaker}" falló.',
  'err.noLoopbackAudio':
    'La captura de pantalla no devolvió audio. Comprueba que Windows tenga un dispositivo de salida activo.',
  'err.micDegraded': 'No se pudo abrir el micrófono (se sigue escuchando la reunión): {detail}',
  'err.micFailed': 'No se pudo abrir el micrófono: {detail}',
  'err.captureUnknown': 'Fallo desconocido al iniciar la captura.',
  'notice.nowThem': 'Ahora respondo a lo que diga el interlocutor.',
  'notice.nowMe': 'Ahora respondo a lo que digas tú.',
  'notice.idleStop': 'Escucha detenida por inactividad.',

  /*
   * ───────────────────── La guía de modelos ─────────────────────
   *
   * Ver la nota equivalente en `en.ts`: es un documento, no una pantalla, y las
   * claves que lleva marcado dentro lo llevan a propósito.
   */
  'guide.docTitle': 'Qué modelo usar',
  'guide.lead':
    'Guía generada para tu equipo el {date}. Elegir mal un modelo local cuesta una descarga de varios gigas para acabar con respuestas de un minuto; elegir mal uno de pago cuesta dinero por cada frase de una reunión. Esto es lo que encaja con lo que tienes.',
  'guide.yourMachine': 'Tu equipo',
  'guide.gpuUnknown': 'GPU: no identificada',
  'guide.gpuKnownNote':
    'Ese consejo habla de la RAM, que es lo único que se mide con certeza. Tu tarjeta gráfica aparece ahí arriba, pero <strong>no sabemos cuánta memoria tiene</strong>, y es justo el dato que decide si un modelo vuela o se arrastra — ver «Lo que esta guía no sabe», al final.',
  'guide.gpuMissingNote':
    'No se pudo identificar la tarjeta gráfica, así que da por hecho el caso lento: sin GPU que lo sostenga, un modelo local tarda segundos por respuesta.',
  'guide.h2Decision': 'La decisión son dos, no una',
  'guide.decisionIntro':
    'La app usa un modelo para <strong>conversar</strong> —lo que oye por el micrófono y por el sistema— y puede usar <strong>otro distinto</strong> para las acciones de pantalla (<code>Ctrl+Alt+C</code> resolver código, <code>Ctrl+Alt+Q</code> responder un test). Se separan en <em>dashboard → Modelo para la pantalla</em>, y conviene separarlos porque piden cosas opuestas:',
  'guide.thTask': 'Tarea',
  'guide.thNeeds': 'Qué necesita',
  'guide.thWhy': 'Por qué',
  'guide.taskChat': 'Conversar',
  'guide.taskScreen': 'Pantalla',
  'guide.needsLatency': 'Latencia',
  'guide.needsEyes': 'Vista y cabeza',
  'guide.whyChat':
    'La respuesta se lee de reojo mientras alguien te mira a la cara. Llega muchas veces por sesión.',
  'guide.whyScreen':
    'Hay que leer un enunciado en una captura y no equivocarse. Llega pocas veces, y cada una importa.',
  'guide.decisionOutro':
    'De ahí que la combinación más razonable para mucha gente sea un modelo local pequeño para hablar y uno bueno de pago para la pantalla: lo frecuente sale gratis y lo difícil sale bien.',
  'guide.visionWarn':
    '<strong>El modelo de pantalla tiene que admitir imágenes.</strong> Si eliges uno sin visión, los dos botones fallan con un aviso en lugar de inventarse el enunciado. En Ollama eso descarta a <code>llama3.2</code>, <code>qwen2.5</code> y <code>mistral</code> —son de texto— y deja a los de la tabla de multimodales.',
  'guide.h2Local': 'Modelos locales (Ollama)',
  'guide.localIntro':
    'No cuestan dinero y no envían nada fuera de tu máquina. El coste es la velocidad, y depende de si el modelo cabe en la GPU: si no cabe, Ollama lo reparte con la CPU y la velocidad se desploma aunque quepa en memoria. Regla de bolsillo: un modelo cuantizado a 4 bits ocupa unos <strong>0,6 GB por cada mil millones de parámetros</strong>.',
  'guide.h3Vision': 'Para leer la pantalla (multimodales)',
  'guide.thModel': 'Modelo',
  'guide.thDownload': 'Descarga',
  'guide.thRam': 'RAM recomendada',
  'guide.thNotes': 'Notas',
  'guide.pullNote':
    'Se instalan con <code>ollama pull &lt;modelo&gt;</code> desde una terminal. Para tu equipo, la app recomienda <code>{chat}</code> para conversar y <code>{vision}</code> para la pantalla.',
  'guide.h2Cloud': 'Modelos de pago, de más barato a más caro',
  'guide.cloudIntro':
    'Los precios de Anthropic, OpenAI y DeepSeek están verificados contra la referencia oficial de cada uno y son por millón de tokens. Un token viene a ser tres cuartos de palabra; lo que se paga en cada consulta es el contexto que envías (tu CV, la transcripción, la captura) más lo que responde.',
  'guide.cloudGoogleNote':
    'Los de Google <strong>no se reproducen aquí</strong>: no se pudieron verificar contra una referencia con la misma fiabilidad, y en una tabla de precios una cifra inventada hace más daño que un hueco. Esa columna remite a la página del proveedor a propósito.',
  'guide.thPrice': 'Precio',
  'guide.thSeesImages': 'Ve imágenes',
  'guide.h3Cost': 'Cuánto cuesta de verdad una pulsación de pantalla',
  'guide.costIntro':
    'Una captura no es gratis: la app la manda a 1600 px de ancho, y a esa resolución un modelo con visión de alta resolución la cobra como <strong>unos 4.800 tokens de entrada</strong>. Con una respuesta de tamaño normal, y contando el prompt del sistema, sale aproximadamente:',
  'guide.thScreenModel': 'Modelo de pantalla',
  'guide.thCostEach': 'Coste aproximado por pulsación',
  'guide.costLuna': 'dos décimas de céntimo',
  'guide.costHaiku': 'medio céntimo',
  'guide.costTerra': 'céntimo y medio',
  'guide.costSonnet': 'unos 2 céntimos',
  'guide.costOpus': 'unos 4 céntimos',
  'guide.costSol': 'unos 4 céntimos',
  'guide.costOutro':
    'Son órdenes de magnitud, no una factura: el coste real depende de cuánto contexto tengas cargado. La conclusión práctica es que el modo pantalla es barato aunque uses el modelo caro — <strong>lo que suma es la escucha automática</strong>, que dispara una consulta por cada pregunta que oye.',
  'guide.costHaikuNote':
    'Haiku 4.5 aparece más barato de lo que su precio sugiere porque además lee las imágenes a menor resolución, así que gasta menos tokens por captura. Es la misma razón por la que falla antes con letra pequeña: <em>está viendo menos</em>.',
  'guide.h2Recipes': 'Combinaciones recomendadas',
  'guide.dtCost': 'Coste',
  'guide.recipe1Title': 'Todo local, sin conexión y sin coste',
  'guide.recipe1Who': 'Te preocupa que salga algo de tu máquina, o no quieres pagar nada.',
  'guide.recipe1Cost': '0 €, a cambio de latencia y de acertar menos leyendo capturas.',
  'guide.recipe2Title': 'Local para hablar, nube para la pantalla',
  'guide.recipe2Who':
    'La combinación que más gente querría: barata en lo frecuente, buena en lo difícil.',
  'guide.recipe2Cost':
    'Sólo pagas las pulsaciones de Ctrl+Alt+C y Ctrl+Alt+Q. Céntimos por sesión.',
  'guide.recipe3Title': 'Todo nube, lo más barato que funciona',
  'guide.recipe3Who': 'No quieres instalar nada y tu máquina no da para modelos locales.',
  'guide.recipe3Cost':
    'Lo más barato que funciona. Conversar sale casi gratis y sólo se paga de verdad cada pulsación de pantalla. Ojo: el de conversar tiene que ser uno cualquiera, pero el de la pantalla TIENE que leer imágenes, y DeepSeek no lee.',
  'guide.recipe4Title': 'Sin concesiones',
  'guide.recipe4Who': 'Una prueba técnica de verdad y prefieres no arriesgar.',
  'guide.recipe4Cost': 'El más caro de la lista, y aun así son céntimos por ejercicio.',
  'guide.h2Unknown': 'Lo que esta guía no sabe',
  'guide.unknownVram':
    '<strong>La VRAM de tu tarjeta gráfica.</strong> Es el número que de verdad decide si un modelo local va rápido, y no hay forma fiable de leerlo desde la app sin invocar utilidades del sistema. Por eso las recomendaciones se apoyan en la RAM, que sí se mide. Si tu GPU tiene menos memoria de la que ocupa el modelo, irá mucho más lento de lo que esta guía sugiere.',
  'guide.unknownPrices':
    '<strong>Los precios cambian y los modelos también.</strong> Los de Anthropic y OpenAI están verificados a la fecha de arriba; los nombres de los modelos de Ollama envejecen. Antes de descargar varios gigas, la lista viva está en <code>ollama.com/library</code>, y los precios en <code>platform.claude.com/docs/en/pricing</code>, <code>developers.openai.com/api/docs/pricing</code> y <code>ai.google.dev/pricing</code>.',
  'guide.unknownYourExam':
    '<strong>Qué tal se le da a un modelo TU examen.</strong> Nada sustituye a probarlo: haz una captura de un ejercicio que ya sepas resolver y compara. Es el único dato que importa y se consigue en dos minutos.',
  'guide.footer':
    'Generado por Tayori para este equipo. Este documento no se envía a ningún sitio: se ha escrito en tu carpeta de datos y se ha abierto en tu navegador.',
  // Notas de los modelos locales.
  'guide.llama1b': 'El mínimo viable. Sirve para reformular y resumir, no para razonar.',
  'guide.llama3b': 'El equilibrio para una máquina modesta. Responde rápido en CPU.',
  'guide.qwen7b': 'Mejor en preguntas técnicas que llama3.2:3b, a cambio de latencia.',
  'guide.llama8b': 'El caballo de batalla. Buen equilibrio si hay GPU que lo sostenga.',
  'guide.qwen14b': 'Calidad alta. Sin GPU dedicada, demasiado lento para conversar.',
  'guide.moondream':
    'Visión mínima. Describe una pantalla; no lee un enunciado largo con fiabilidad.',
  'guide.qwenvl3b': 'El multimodal pequeño que mejor lee texto de pantalla.',
  'guide.gemma3': 'Multimodal de propósito general. Alternativa si qwen2.5vl no convence.',
  'guide.qwenvl7b': 'El punto dulce para las acciones de pantalla en local.',
  'guide.llava13b': 'Veterano y muy probado. Peor con texto pequeño que qwen2.5vl.',
  'guide.qwenvl32b': 'Lo mejor en local para leer pantallas. Pide máquina de verdad.',
  // Precios, visión y notas de los de pago.
  'guide.priceHaiku45': '1 $ / 5 $ por millón de tokens (entrada / salida)',
  'guide.priceSonnet5': '3 $ / 15 $ (introductorio 2 $ / 10 $ hasta el 31-08-2026)',
  'guide.priceOpus5': '5 $ / 25 $',
  'guide.priceGemini': 'Consulta ai.google.dev/pricing para el precio actual',
  'guide.priceLuna': '0,20 $ / 1,20 $ por millón de tokens (entrada / salida)',
  'guide.priceTerra': '2 $ / 12 $',
  'guide.priceDsFlash': '0,28 $ / 0,28 $ (0,14 $ la entrada ya cacheada)',
  'guide.priceDsPro': '0,87 $ / 0,87 $ (0,435 $ la entrada ya cacheada)',
  'guide.priceSol': '5 $ / 30 $',
  'guide.visionStd': 'Sí, en resolución estándar',
  'guide.visionHigh': 'Sí, alta resolución (2576 px)',
  'guide.visionYes': 'Sí',
  'guide.visionNo': 'NO',
  'guide.haiku45':
    'El más barato de Anthropic y el de menor latencia. Lee capturas, pero a menor resolución que los Claude 5: para un enunciado con letra pequeña es el primero que falla.',
  'guide.sonnet5':
    'La opción por defecto de esta app, y con razón: lee bien una captura y responde rápido. Si sólo vas a configurar un modelo, éste.',
  'guide.opus5':
    'Para los ejercicios que Sonnet no saca. Cuesta el doble por token y responde más despacio: tiene sentido como modelo SÓLO de pantalla, no para conversar.',
  'guide.gemini36flash':
    'La misma clave sirve para la transcripción con Gemini Live, así que con una sola credencial tienes oído y respuesta. El precio no se reproduce aquí porque no se pudo verificar con la misma fuente que los de Anthropic.',
  'guide.luna':
    'El más barato de toda esta tabla, por un orden de magnitud. Es el modelo de OpenAI para cargas sensibles al precio: la opción obvia si lo que te preocupa es lo que gasta la escucha automática.',
  'guide.terra':
    'El equilibrio entre capacidad y coste, y el que la app pone por defecto en OpenAI. Razona antes de responder; la app le pide el esfuerzo más bajo para que eso no se note en la latencia.',
  'guide.dsFlash':
    'El más barato de toda la tabla, y por bastante. Ventana de 1M de tokens. No lee imágenes, así que NO sirve para las acciones de pantalla: es la opción de conversar cuando lo que preocupa es lo que gasta la escucha automática.',
  'guide.dsPro':
    'El grande de DeepSeek, todavía por debajo de lo que cuesta el más barato de Anthropic. Tampoco lee imágenes.',
  'guide.sol':
    'El modelo de frontera de OpenAI, para trabajo complejo. La salida es la más cara de la tabla: como Opus, tiene más sentido SÓLO para la pantalla que para contestar cada frase de una reunión.',

  // Fallos que se leen en Diagnóstico o en el overlay, no en el log.
  'diag.logUnreadable': 'No se pudo leer el log: {detail}',
  'err.whisperUnzip': 'No se pudo descomprimir el binario de Whisper: {detail}',
  'err.whisperNoExe': 'El zip de whisper.cpp se descomprimió pero no contenía el ejecutable.',
  'err.sessionError': 'error de la sesión',
  'err.handshakeTimeout': '{label}: sin respuesta en {seconds} s',
  'err.closedWithReason': '{reason} (código {code})',
  'err.closedWithCode': 'cerrado con código {code}',
};

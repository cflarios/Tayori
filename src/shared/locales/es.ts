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
  'overlay.sourceMuteSuffix': ': pedido pero NO se abrió. Revisa el dispositivo o los permisos.',

  'overlay.visible': 'El overlay SÍ aparece al compartir pantalla',
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
  'overlay.settingsShort': 'Abrir configuración',
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
  'overlay.composePlaceholder': 'Escribe tu pregunta y pulsa Enter… · /skill para invocar una',
  'overlay.composeHint': 'Enter envía · Shift+Enter salta línea',
  'overlay.send': 'Enviar',
  'overlay.composeWarn':
    'Mientras esta pestaña esté abierta el overlay toma el foco del teclado. Vuelve a «Escucha» antes de compartir pantalla.',

  'overlay.skipFiller':
    'Te escucho, pero un saludo o una prueba de sonido no dispara respuesta. Prueba con una pregunta real.',
  'overlay.skipShort': 'Demasiado corto para tomarlo por una pregunta.',
  'overlay.skipStrict':
    'No parecía una pregunta. En modo estricto sólo cuentan las señales claras; súbelo a «Equilibrado» o «Todo» en el dashboard.',
  'overlay.skipNone':
    'No parecía una pregunta. Si quieres que responda a todo, pon la sensibilidad en «Todo».',

  'overlay.code': 'código',
  'overlay.writing': 'escribiendo…',
  'overlay.copied': 'Copiado',
  'overlay.copyFailed': 'No se pudo',
  'overlay.copy': 'Copiar',

  'overlay.readingScreen': 'Leyendo la pantalla…',
  'overlay.thinking': 'Pensando…',
  'overlay.unknownError': 'Error desconocido',
  'overlay.prevAnswer': 'Respuesta anterior',
  'overlay.nextAnswer': 'Respuesta siguiente',
  'overlay.forgotten': 'olvidado',
  'overlay.memory': 'memoria {turns}/{max}',
  'overlay.memoryTitle':
    'Pulsa para que los olvide; la transcripción y el historial se quedan como están.',
  'overlay.stop': 'Parar la generación',
  'overlay.dismiss': 'Descartar',
  'overlay.transcription': 'Transcripción',
  'overlay.attached': 'Captura adjunta',
  'overlay.size': 'Tamaño {size}',
  'overlay.suggestion': 'Sugerencia',
  'overlay.answeringWith': 'Respondiendo con {model}',
  'overlay.generatedBy': 'Esta respuesta la generó {provider} · {model}',
  'overlay.emptyIdle': 'Ctrl+Enter para pedir una respuesta · Ctrl+Alt+C para resolver la pantalla.',
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
  'mqtt.passwordHint': 'Se guarda cifrada con DPAPI, igual que las API keys, y no vuelve a mostrarse.',
  'mqtt.passwordPlaceholder': 'Pega la contraseña del broker',

  // ───────────────────── Ajustes · modelo ─────────────────────
  'model.title': 'Modelo de respuestas',
  'model.hint': 'Quién genera las sugerencias que ves en el overlay.',
  'model.provider': 'Proveedor',
  'model.model': 'Modelo',
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
  'screen.providerDesc': '«El mismo» usa el modelo de respuestas de arriba, que es como funcionaba antes.',
  'screen.same': 'El mismo que para responder',
  'screen.claude': 'Claude (nube)',
  'screen.gemini': 'Gemini (nube)',
  'screen.openai': 'ChatGPT (nube)',
  'screen.ollama': 'Ollama (local)',
  'screen.noModels': 'Sin modelos disponibles. Si es Ollama, comprueba que el servidor está corriendo.',
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
  'beh.profCustom': 'Personalizado',
  'beh.codeLang': 'Lenguaje del modo código',
  'beh.codeLangDesc':
    'En qué lenguaje se escriben las soluciones de Ctrl+Alt+C. Con «auto» lo deduce de lo que se vea en la pantalla, que es lo correcto si el editor ya tiene uno elegido.',
  'beh.customPlaceholder': 'Describe cómo debe comportarse el asistente…',
  'beh.speakerThemShort': 'el interlocutor',
  'beh.speakerMeShort': 'tú',
  'beh.speakerAnyShort': 'cualquiera de los dos',

  // ───────────────────── Ajustes · contexto ─────────────────────
  'ctx.preparingFor': 'Preparando para',
  'ctx.inUse': '{count} en uso: {names}',
  'ctx.nothingActive': 'nada activo todavía',
  'ctx.others': 'Otros contextos',
  'ctx.othersNote': 'Sin perfil marcado, se aplican siempre',
  'ctx.noOthers': 'Ninguno. Los huecos de arriba cubren lo habitual.',
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
  'ctx.vocabularyPlaceholder': 'Kubernetes, Grafana, EmployeeBridge, Marta Ibáñez, CI/CD…',
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
  'sk.empty': 'No hay ninguna skill todavía. Crea una carpeta con un `SKILL.md` dentro y pulsa «Recargar».',
  'sk.builtIn': 'De serie',
  'sk.noDescription': 'Sin description en el frontmatter.',
  'ctx.import': 'Importar .txt / .md',

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
  'hk.reset': 'Restablecer',
  'hk.resetDesc': 'Devuelve los diez atajos a sus valores de fábrica.',
  'hk.resetButton': 'Valores por defecto',
  'hk.askNow': 'Responder ahora',
  'hk.screenshotAndAsk': 'Capturar pantalla y responder',
  'hk.solveOnScreen': 'Resolver el código de la pantalla',
  'hk.solveQuiz': 'Responder el test de la pantalla',
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
  'mq.brokerHint':
    'El esquema decide el cifrado: `mqtt://` va en claro y `mqtts://` cifrado.',
  'mq.address': 'Dirección',
  'mq.addressDesc': 'Incluye el puerto: 1883 en claro, 8883 con TLS.',
  'mq.topic': 'Tema',
  'mq.topicDesc': 'Se publica en este tema y en su hijo «/text».',
  'mq.user': 'Usuario',
  'mq.userDesc': 'Déjalo vacío si tu broker acepta conexiones anónimas.',
  'mq.subscribeTitle': 'A qué se suscribe tu dispositivo',
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
  'aud.inertWarn':
    'Con esta combinación **no se disparará ninguna respuesta automática**: el disparo espera a {wanted} y aquí no se abre esa fuente.',
  'aud.seeTrigger': 'Ver el disparo automático',
  'nav.attention': 'Algo requiere tu atención',
  'nav.wizard': 'Configuración guiada',
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
  'sec.phoneHint': 'Manda las respuestas al navegador de tu teléfono. Sirve para lo que el modo invisible no puede cubrir: cuando compartes la pantalla entera, lo que está en tu monitor está al otro lado.',
  'sec.mqtt': 'MQTT',
  'sec.mqttHint': 'Publica cada respuesta terminada en un broker, para que la recoja otra cosa: un ESP32, un script, lo que montes.',
  'sec.models': 'Modelos de IA',
  'sec.modelsHint': 'Las claves, quién genera las respuestas y quién lee tu pantalla.',
  'sec.transcription': 'Transcripción',
  'sec.transcriptionHint': 'Los motores de nube transcriben en ~300 ms pero envían el audio a su proveedor. Whisper local no sale de tu máquina, a cambio de ~1–2 s de latencia.',
  'sec.behaviour': 'Comportamiento',
  'sec.behaviourHint': 'Cuándo responde el asistente y con cuánto contexto.',
  'sec.context': 'Contexto',
  'sec.contextHint': 'Lo que preparas aquí es lo que separa una respuesta genérica de una tuya. Cada tipo se le explica al modelo de forma distinta, así que una respuesta preparada se reutiliza en vez de parafrasearse.',
  'sec.skills': 'Skills',
  'sec.skillsHint': 'Instrucciones locales en formato SKILL.md que refinan CÓMO responde el modelo: el tono y las palabras, no el formato. Se activan aquí o escribiendo /nombre en la pestaña de escritura.',
  'sec.history': 'Historial',
  'sec.historyHint': 'Se guarda en tu máquina, en texto plano, y no se envía a ningún sitio. Incluye la transcripción completa: lo que dijo la otra persona, no sólo lo que preguntaste tú.',
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
};

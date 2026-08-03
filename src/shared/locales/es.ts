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

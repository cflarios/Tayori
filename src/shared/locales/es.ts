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

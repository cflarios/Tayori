/**
 * Los textos de la interfaz, en inglés. **Ésta es la fuente.**
 *
 * ## Por qué un módulo de TypeScript y no un `.json`
 *
 * Se valoró JSON, que es lo estándar, y se eligió esto por una razón concreta:
 * con un objeto tipado, el archivo español se declara como
 * `Record<keyof typeof en, string>` y **una traducción que falte no compila**.
 * Con JSON, una clave sin traducir cae al idioma de reserva y nadie se entera
 * hasta que un usuario ve una frase suelta en otro idioma — que es exactamente
 * la clase de fallo mudo que este proyecto persigue.
 *
 * Lo demás es idéntico a tener dos JSON: los componentes quedan limpios, las
 * traducciones viven juntas y se puede ver la cobertura de un vistazo. Y no hay
 * que tocar `resolveJsonModule` ni la configuración de dos bundlers.
 *
 * ## Convenciones
 *
 * - Las claves se agrupan por pantalla con puntos: `overlay.*`, `dash.*`,
 *   `wiz.*`, `err.*`. No es jerarquía real, es orden alfabético útil.
 * - `{algo}` son huecos que rellena `t()`. El mismo hueco tiene que existir en
 *   las dos versiones o la frase saldrá coja en un idioma.
 * - `**negrita**` y `` `código` `` sólo funcionan en las claves que se pintan
 *   con `<Tx>`. En un `title` o un `placeholder` saldrían los asteriscos tal
 *   cual, igual que pasaba en el overlay antes de `parseInline`.
 */
export const en = {
  // ─────────────────────────────── Overlay ───────────────────────────────
  'overlay.listen': 'Listen',
  'overlay.listening': 'Listening',
  'overlay.starting': 'Starting…',
  'overlay.retry': 'Retry',
  'overlay.captureError': 'Capture error',
  'overlay.listenTitle': 'Start or stop listening (Ctrl+Shift+M)',

  'overlay.sources': 'What it listens to',
  'overlay.sourceMe': 'Me',
  'overlay.sourceThem': 'Them',
  'overlay.sourceBoth': 'Both',
  'overlay.sourceMeHint': 'Your microphone only',
  'overlay.sourceThemHint': "System output only: the other person's voice",
  'overlay.sourceBothHint': 'Your microphone and the system output',
  'overlay.sourceMuteSuffix': ': requested but did NOT open. Check the device or the permissions.',

  'overlay.visible': 'The overlay DOES show up when you share your screen',
  'overlay.solveCode': 'Solve the coding problem on screen (Ctrl+Alt+C)',
  'overlay.solveCodeShort': 'Solve the code on screen',
  'overlay.solveQuiz': 'Answer the quiz question on screen (Ctrl+Alt+Q)',
  'overlay.solveQuizShort': 'Answer the quiz on screen',
  'overlay.expand': 'Expand: brings back the transcript and the profiles',
  'overlay.expandShort': 'Expand the panel',
  'overlay.compact': 'Compact mode: leaves only the answer',
  'overlay.compactShort': 'Compact mode',
  'overlay.newChat': 'New conversation (clears the transcript and the context)',
  'overlay.newChatShort': 'New conversation',
  'overlay.settings': 'Settings',
  'overlay.settingsShort': 'Open settings',
  'overlay.quit': 'Quit Tayori (Ctrl+Shift+H only hides it)',
  'overlay.quitShort': 'Quit',

  'overlay.waitingAudio': 'Waiting for audio…',
  'overlay.me': 'Me',
  'overlay.them': 'Them',

  'overlay.profileInterview': 'Interview',
  'overlay.profileMeeting': 'Meeting',
  'overlay.profileLecture': 'Lecture',
  'overlay.profileSupport': 'Support',
  'overlay.profileCoding': 'Code',
  'overlay.profileQuiz': 'Quiz',
  'overlay.profileCustom': 'Custom',

  'overlay.setupTitle': 'The AI is not set up yet',
  'overlay.setupSub': 'Paste an Anthropic, Google, OpenAI or DeepSeek API key to start',
  'overlay.setupAction': 'Open settings',
  'overlay.idleTitle': 'Ready to listen',
  'overlay.idleSub': 'Press the microphone to begin',
  'overlay.connectingTitle': 'Connecting…',
  'overlay.connectingSub': 'Opening the microphone and the system output',
  'overlay.connectingAction': 'Starting',
  'overlay.listeningTitle': 'Waiting for you to speak',
  'overlay.listeningSub': 'Talk whenever you want',
  'overlay.listeningAction': 'Stop listening',
  'overlay.errorTitle': "Couldn't listen",
  'overlay.errorSub': 'Check your input device and try again',

  'overlay.writeQuestion': 'Type your question',
  'overlay.hotkeyHint': '{keys} to solve the screen',
  'overlay.tabListen': 'Listen',
  'overlay.tabWrite': 'Write',
  'overlay.noSkill': 'No skill by that name',
  'overlay.composePlaceholder': 'Type your question and press Enter… · /skill to invoke one',
  'overlay.composeHint': 'Enter sends · Shift+Enter adds a line',
  'overlay.send': 'Send',
  'overlay.composeWarn':
    'While this tab is open the overlay takes keyboard focus. Go back to «Listen» before sharing your screen.',

  'overlay.skipFiller':
    "I can hear you, but a greeting or a sound check doesn't trigger an answer. Try a real question.",
  'overlay.skipShort': 'Too short to take it for a question.',
  'overlay.skipStrict':
    "That didn't look like a question. In strict mode only clear signals count; move it up to «Balanced» or «All» in the dashboard.",
  'overlay.skipNone':
    "That didn't look like a question. If you want it to answer everything, set the sensitivity to «All».",

  'overlay.code': 'code',
  'overlay.writing': 'writing…',
  'overlay.copied': 'Copied',
  'overlay.copyFailed': "Couldn't copy",
  'overlay.copy': 'Copy',

  'overlay.readingScreen': 'Reading the screen…',
  'overlay.thinking': 'Thinking…',
  'overlay.unknownError': 'Unknown error',
  'overlay.prevAnswer': 'Previous answer',
  'overlay.nextAnswer': 'Next answer',
  'overlay.forgotten': 'forgotten',
  'overlay.memory': 'memory {turns}/{max}',
  'overlay.memoryTitle':
    'Press to make it forget them; the transcript and the history stay as they are.',
  'overlay.stop': 'Stop generating',
  'overlay.dismiss': 'Dismiss',
  'overlay.transcription': 'Transcription',
  'overlay.attached': 'Screenshot attached',
  'overlay.size': 'Size {size}',
  'overlay.suggestion': 'Suggestion',
  'overlay.answeringWith': 'Answering with {model}',
  'overlay.generatedBy': 'This answer was generated by {provider} · {model}',
  'overlay.emptyIdle': 'Ctrl+Enter to ask for an answer · Ctrl+Alt+C to solve the screen.',
  'overlay.emptyStopped':
    'Press «Listen» so it follows the conversation, or Ctrl+Alt+C to solve whatever is on your screen.',
  'overlay.footAsk': 'ask',
  'overlay.footScreen': 'solve screen',

  // Acciones rápidas. La etiqueta se lee; el texto de abajo se le manda al
  // modelo, y va traducido por coherencia — el idioma de la RESPUESTA lo
  // gobierna la regla del system prompt, no el idioma de la petición.
  'overlay.qaMore': 'Go on',
  'overlay.qaMorePrompt': 'Expand your last answer with one short, concrete example.',
  'overlay.qaShorter': 'Shorter',
  'overlay.qaShorterPrompt': 'Rewrite your last answer as two bullets, more direct.',
  'overlay.qaFollowUp': 'Follow-up',
  'overlay.qaFollowUpPrompt': 'Give me 3 follow-up questions that I could ask right now.',
  'overlay.qaSummary': 'Summary',
  'overlay.qaSummaryPrompt': 'Summarise the conversation so far in 4 bullets.',
  'overlay.qaExplain': 'Explain it',
  'overlay.qaExplainPrompt':
    'Explain your last solution in 4 bullets, as if you were saying it out loud to an interviewer.',
  'overlay.qaOptimise': 'Optimise',
  'overlay.qaOptimisePrompt':
    'Can the complexity of your last solution be improved? If so, give me the code.',
  'overlay.qaEdge': 'Edge cases',
  'overlay.qaEdgePrompt':
    'Give me the edge cases that would break your last solution and how it covers them.',
  'overlay.qaTests': 'Tests',
  'overlay.qaTestsPrompt': 'Write tests for your last solution, in the same language.',
  'overlay.qaWhy': 'Why?',
  'overlay.qaWhyPrompt': 'Explain in one line why each answer you gave is the right one.',
  'overlay.qaDistractors': 'The ones you ruled out',
  'overlay.qaDistractorsPrompt':
    'For each question, say in one line why the most tempting option you ruled out is wrong.',
  'overlay.qaDoubts': 'Review the doubts',
  'overlay.qaDoubtsPrompt':
    'Go back over the questions you marked with UNSURE. For each one, say whether you keep the option or change it, and to which.',
  'overlay.qaReview': 'Review everything',
  'overlay.qaReviewPrompt':
    'Review your previous answers. Say only the ones you would change, and to which.',

  // ───────────────────── Ajustes · secciones ─────────────────────
  'sec.general': 'General',
  'sec.generalHint': 'Whether the overlay shows up when you share your screen, and how it looks meanwhile.',
  'sec.audio': 'Audio',
  'sec.audioHint': 'What it listens to, and the check that both sources arrive separately.',
  'sec.phone': 'Phone mirror',
  'sec.phoneHint': "Sends the answers to your phone's browser. It covers what stealth mode cannot: when you share your whole screen, whatever is on your monitor is on the other side too.",
  'sec.mqtt': 'MQTT',
  'sec.mqttHint': 'Publishes every finished answer to a broker so something else can pick it up: an ESP32, a script, whatever you build.',
  'sec.models': 'AI models',
  'sec.modelsHint': 'The keys, who writes the answers and who reads your screen.',
  'sec.transcription': 'Transcription',
  'sec.transcriptionHint': 'Cloud engines transcribe in ~300 ms but send the audio to their provider. Whisper local never leaves your machine, in exchange for ~1–2 s of latency.',
  'sec.behaviour': 'Behaviour',
  'sec.behaviourHint': 'When the assistant answers, and with how much context.',
  'sec.context': 'Context',
  'sec.contextHint': 'What you prepare here is what separates a generic answer from one of yours. Each kind is explained to the model differently, so a prepared answer gets reused instead of paraphrased.',
  'sec.skills': 'Skills',
  'sec.skillsHint': 'Local SKILL.md instructions that refine HOW the model answers: the tone and the words, not the format. You turn them on here or by typing /name in the write tab.',
  'sec.history': 'History',
  'sec.historyHint': 'Stored on your machine, in plain text, and never sent anywhere. It includes the full transcript: what the other person said, not just what you asked.',
  'sec.hotkeys': 'Shortcuts',
  'sec.hotkeysHint':
    'They are **global**: they work with the video call focused, which is exactly why they take the shortcut away from whatever app has focus. Click a field and type the combination you want.',
  'sec.diagnostics': 'Diagnostics',
  'sec.diagnosticsHint': 'If something is not working, this is what to look at before anything else.',
  'sec.about': 'About',
  'sec.aboutHint': 'What Tayori is, which version you have and what it does with your data.',

  // ────────────────────────────── Ajustes ──────────────────────────────
  'dash.language': 'Language',
  'dash.languageDesc':
    "The interface language. It has nothing to do with the language you speak in the meeting — that one is set under Transcription.",
} as const;

export type UIKey = keyof typeof en;

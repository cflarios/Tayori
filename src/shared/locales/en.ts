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

  'mqtt.password': 'Broker password',
  'mqtt.passwordHint': 'Stored encrypted with DPAPI, same as the API keys, and never shown again.',
  'mqtt.passwordPlaceholder': 'Paste the broker password',

  // ───────────────────── Ajustes · modelo ─────────────────────
  'model.title': 'Answering model',
  'model.hint': 'Who writes the suggestions you see in the overlay.',
  'model.provider': 'Provider',
  'model.model': 'Model',
  'model.pick': '— pick a model —',
  'model.none': '—',
  'model.other': 'Other… (type the id)',
  'model.idPlaceholder': 'e.g. claude-opus-4-8',
  'model.noneAvailable': 'No models available. Check the Ollama status further down.',
  'model.catalogHint':
    'The list is the models the app knows about. If your account has access to another one, pick «Other…» and type its id; an id that does not exist fails on the first question, so confirm it with «Test connection».',
  'model.test': 'Test connection',
  'model.ollamaContext': 'Ollama context window',
  'model.ollamaContextDesc':
    'Ollama does NOT use the model’s: it applies 2048 tokens by default and drops whatever does not fit WITHOUT any error, starting from the beginning. The symptom is the model forgetting what you just told it. Raising it uses more memory.',
  'model.ctxDefault': '2048 · Ollama’s default',
  'model.ctxRecommended': '8192 · recommended',
  'model.ctxLongCv': '16384 · with a long CV or screenshots',
  'model.ctxHeavy': '32768 · asks for a fair bit of memory',

  // ───────────────────── Ajustes · modelo de pantalla ─────────────────────
  'screen.title': 'Screen model',
  'screen.hint':
    'The one that solves `Ctrl+Alt+C` (code) and `Ctrl+Alt+Q` (quizzes). It can be different from the one that answers what is being said: that one needs speed, this one needs to read a screenshot properly. **It has to accept images.**',
  'screen.providerDesc': '«The same one» uses the answering model above, which is how it worked before.',
  'screen.same': 'The same one that answers',
  'screen.claude': 'Claude (cloud)',
  'screen.gemini': 'Gemini (cloud)',
  'screen.openai': 'ChatGPT (cloud)',
  'screen.ollama': 'Ollama (local)',
  'screen.noModels': 'No models available. If it is Ollama, check that the server is running.',
  'screen.visionOnly': 'Only the ones that accept images can read your screen.',
  'screen.visionOnlyCloud':
    'Only the ones that accept images can read your screen. If your account has access to another model, pick «Other…» and type its id.',
  'screen.seesImages': ' · sees images',
  'screen.noVision': ' · no vision',
  'screen.blind':
    '**{model}** does not accept images, so it cannot read the screen: the code and quiz buttons will fail with a warning instead of answering. Pick a multimodal one — with Ollama, `qwen2.5vl`, `llava` or `gemma3`.',
  'screen.allOllama':
    'You are using Ollama for everything. If the chosen model does not see images, the screen actions will not work: this is where it pays off to split them and leave a multimodal one just for this.',

  // ───────────────────── Ajustes · general ─────────────────────
  'gen.stealth': 'Stealth mode',
  'gen.stealthDesc':
    'The overlay is excluded from screen capture at the Windows compositor level. Turn it off to record demos or debug the interface.',
  'gen.clickThrough': 'Click-through',
  'gen.clickThroughDesc':
    'The overlay ignores the mouse and clicks reach the window underneath. Recommended during a call.',
  'gen.stealthWarn':
    'Stealth mode is off: the overlay **will** show up if you share your screen.',
  'gen.lookTitle': 'Overlay appearance',
  'gen.lookHint':
    'How the floating panel looks. It applies immediately, so it is worth adjusting with the overlay in sight.',
  'gen.opacity': 'Opacity',
  'gen.opacityDesc':
    'Lowering it lets you glimpse what is underneath. Below 60 % the text starts to be hard to read over light backgrounds.',
  'gen.textSize': 'Text size',
  'gen.textSizeDesc':
    'It affects the answer, the code and the transcript; the controls stay the same. The S/M/L/XL sizes make the window bigger, not the letters: this is what you need on a 4K monitor.',
  'gen.compact': 'Compact mode',
  'gen.compactDesc':
    'Leaves only the answer: it folds the profiles, the transcript and the shortcut footer. It is also toggled with the fold button in the overlay.',

  'gen.protects':
    '**What it protects and what it does not.** Stealth mode excludes the window from the capture pipeline (screen share, OBS, recorders). It does not protect you from a camera pointed at the screen, it does not hide the process from proctoring software that enumerates windows, and it does not hide what you say into the microphone.',

  // ───────────────────── Ajustes · transcripción ─────────────────────
  'stt.engine': 'Engine',
  'stt.engineDesc': 'Which audio sources get opened is decided separately.',
  'stt.goAudio': 'Go to Audio',
  'stt.openaiLive': 'OpenAI live (cloud, best for meetings)',
  'stt.openaiTranscribe': 'OpenAI per turn (cloud, more accurate)',
  'stt.geminiLive': 'Gemini Live (cloud, fastest)',
  'stt.geminiAudio': 'Gemini direct audio (the model hears your voice)',
  'stt.whisperLocal': 'Whisper local (offline, private)',
  'stt.openaiLiveHint':
    '`gpt-live-transcribe`, the model OpenAI recommends for live audio. It opens one session per speaker and writes while they talk.',
  'stt.openaiTranscribeHint':
    '`gpt-transcribe`, the one OpenAI recommends for recorded speech. It waits until you finish the sentence and transcribes it whole, so it gets proper nouns right more often in exchange for about a second of latency.',
  'stt.openaiKeyNote': 'It uses the OpenAI API key, the same one as the answers.',
  'stt.geminiAudioNote':
    'The audio goes **straight to the model**, without passing through a recogniser. A bad transcription can no longer spoil the answer, because the model hears your voice instead of reading what somebody else understood. It uses the Gemini model you pick above, and the question detector stays out of it: the model itself decides whether what you said asked for an answer.',
  'stt.language': 'Language',
  'stt.languageDesc': 'Automatic detects the language; fixing it improves accuracy when you get it right.',
  'stt.auto': 'Automatic',
  'stt.langEs': 'Spanish',
  'stt.langEn': 'English',
  'stt.langPt': 'Portuguese',
  'stt.langFr': 'French',
  'stt.langDe': 'German',
  'stt.forcedWarn':
    'You are forcing **{lang}**. If you speak another language **you will not see any error**: the recogniser returns plausible text in the language you impose on it, invented from the sounds. If the answers have nothing to do with what you asked, this is the first thing to check.',
  'stt.whisperModel': 'Whisper model',
  'stt.whisperModelDesc': 'Bigger models transcribe better and take longer.',
  'stt.whisperModelDescNonEn':
    'Bigger models transcribe better and take longer. Outside English the gap between Base and Small is wide: if words come out wrong, this is the first thing to raise.',
  'stt.whisperReady': 'Whisper ready',
  'stt.whisperMissing': 'Whisper not installed',
  'stt.whisperReadyDesc': 'Executable and model downloaded. It works offline.',
  'stt.whisperMissingDesc': 'Missing {what}. They are downloaded only once.',
  'stt.whisperBinary': 'the executable (7.6 MB)',
  'stt.whisperModelPart': 'the model',
  'stt.and': ' and ',
  'stt.download': 'Download',
  'stt.downloading': 'Downloading…',
  'stt.installed': 'installed',
  'stt.downloadFailed': 'The download failed.',
  'stt.progressBinary': 'Executable',
  'stt.progressModel': 'Model',

  // ───────────────────── Ajustes · comportamiento ─────────────────────
  'beh.auto': 'Automatic answers',
  'beh.autoDesc':
    'With the heuristic on, it detects questions aimed at you and answers without you pressing anything. The manual hotkey works in every mode.',
  'beh.autoOff': 'Hotkey only',
  'beh.autoHeuristic': 'Automatic (local heuristic)',
  'beh.autoClassifier': 'Automatic + classifier (uses the model)',
  'beh.classifierWarn':
    'When the heuristic sees no marker, it will ask the model whether that remark was asking for an answer. That is what catches questions phrased as statements — *«someone who knows DevOps would have to know security»* — which no word list can detect.',
  'beh.classifierCost':
    '**It costs one extra query** for every ambiguous remark, even when nothing gets answered in the end. With Ollama it is free; with a paid model it is not.',
  'beh.speaker': 'Who triggers the answer',
  'beh.speakerDesc':
    'By default only the other person: answering what you say yourself makes no sense in an interview. Change it if you use the app to dictate the questions yourself.',
  'beh.speakerThem': 'The other person',
  'beh.speakerMe': 'My microphone',
  'beh.speakerAny': 'Either of the two',
  'beh.sensitivity': 'When it counts as a question',
  'beh.sensStrict': 'Strict · clear signals only',
  'beh.sensBalanced': 'Balanced · recommended',
  'beh.sensAll': 'All · any remark',
  'beh.sensStrictHint':
    'Only fires with an interrogative up front, a question mark or "tell me about…". It almost never gets in the way, but it misses questions the recogniser hands over without punctuation.',
  'beh.sensBalancedHint':
    'Adds accented interrogatives anywhere and formulas like "what would you recommend". It recovers most real questions in exchange for the odd extra trigger.',
  'beh.sensAllHint':
    'Answers everything that is not a greeting or a sound check. This is what you want if you are the one dictating the questions; in a real interview it will interrupt constantly.',
  'beh.inertWarn':
    'The auto-trigger is waiting for **{wanted}**, but «What it listens to» only opens {heard}: **no automatic answer will ever fire**. Change one of the two things, or use Ctrl+Enter to ask by hand.',
  'beh.changeSources': 'Change what it listens to',
  'beh.window': 'Voice window',
  'beh.windowDesc':
    'Seconds of TRANSCRIPT that go with every question. It does not affect the assistant’s memory: its own previous answers are always sent. Below 30 s you lose the thread of what the other person said.',
  'beh.profile': 'Answer profile',
  'beh.profileDesc': 'Adapts the tone and the structure to the kind of meeting.',
  'beh.profInterview': 'Job interview',
  'beh.profMeeting': 'General meeting',
  'beh.profLecture': 'Lecture or talk',
  'beh.profSupport': 'Technical support',
  'beh.profCoding': 'Code (solve exercises)',
  'beh.profQuiz': 'Quiz (multiple choice)',
  'beh.profCustom': 'Custom',
  'beh.codeLang': 'Code mode language',
  'beh.codeLangDesc':
    'Which language the Ctrl+Alt+C solutions are written in. With «auto» it works it out from what is on screen, which is the right thing when the editor already has one selected.',
  'beh.customPlaceholder': 'Describe how the assistant should behave…',
  'beh.speakerThemShort': 'the other person',
  'beh.speakerMeShort': 'you',
  'beh.speakerAnyShort': 'either of the two',

  // ───────────────────── Ajustes · contexto ─────────────────────
  'ctx.preparingFor': 'Preparing for',
  'ctx.inUse': '{count} in use: {names}',
  'ctx.nothingActive': 'nothing active yet',
  'ctx.others': 'Other contexts',
  'ctx.othersNote': 'With no profile ticked, they always apply',
  'ctx.noOthers': 'None. The slots above cover the usual cases.',
  'ctx.remove': 'Remove',
  'ctx.addOwn': 'Add your own context',
  'ctx.pasteHere': 'Paste the text here…',
  'ctx.newName': 'New context',
  'ctx.loadFile': 'Load a file',
  'ctx.kindCv': 'Your CV or experience',
  'ctx.kindJob': 'Job description',
  'ctx.kindQa': 'Prepared answers',
  'ctx.kindVocabulary': 'Vocabulary',
  'ctx.kindNotes': 'Notes',
  'ctx.cvPlaceholder':
    'Paste your CV, or a summary of your experience: companies, years, technologies, achievements with numbers…',
  'ctx.cvHint':
    'The only source of concrete facts about you. Without it the answers are correct but generic, and the model is forbidden from inventing experience.',
  'ctx.jobPlaceholder': 'Paste the job ad: responsibilities, stack, requirements…',
  'ctx.jobHint':
    'It decides WHAT to highlight from your experience and with which vocabulary. It is never used to credit you with anything that is not in your CV.',
  'ctx.qaPlaceholder':
    'What is your greatest weakness?\n— I tend to dig into the detail; I make up for it with mid-sprint reviews.\n\nWhy did you leave your last job?\n— …',
  'ctx.qaHint':
    'Questions you already know are coming, with your answer. If the question matches, the model reuses it almost verbatim instead of improvising a watered-down version.',
  'ctx.vocabularyPlaceholder': 'Kubernetes, Grafana, EmployeeBridge, Marta Ibáñez, CI/CD…',
  'ctx.vocabularyHint':
    'Separated by commas or line breaks. They go straight to the speech recogniser: this is what fixes proper nouns and acronyms that come out wrong.',
  'ctx.notesPlaceholder': 'Anything the model had better know.',
  'ctx.notesHint': 'Supporting notes with no special treatment.',

  // ───────────────────── Ajustes · skills ─────────────────────
  'sk.folderTitle': 'Skills folder',
  'sk.folderHint':
    'Each skill is a folder with a `SKILL.md` file inside: frontmatter with `name` and `description`, and the instructions below. The scripts and assets the format allows are **ignored** — see the note below.',
  'sk.reload': 'Reload',
  'sk.reloading': 'Reloading…',
  'sk.addHere': 'Add your skills here',
  'sk.openFolder': 'Open folder',
  'sk.promptWarn':
    'Whatever you put there ends up **inside the prompt** that is sent to your provider. It is not code that runs —the scripts are ignored on purpose— but it is text leaving your machine on every query, so treat a third-party skill the way you would treat anything else you are about to paste into a chat.',
  'sk.activeTitle': 'Active skill',
  'sk.activeHint':
    'It applies to **every** answer until you remove it, including the ones the automatic listening fires. To use one for a single message, type `/name` at the start in the overlay write tab.',
  'sk.instruction': 'Instruction',
  'sk.activeDesc': 'It rules the tone and the words. The format is still decided by the profile.',
  'sk.noneDesc': 'With none set, the model answers as usual.',
  'sk.none': 'None',
  'sk.empty': 'No skills yet. Create a folder with a `SKILL.md` inside and press «Reload».',
  'sk.builtIn': 'Built-in',
  'sk.noDescription': 'No description in the frontmatter.',
  'ctx.import': 'Import .txt / .md',

  // ───────────────────── Ajustes · historial ─────────────────────
  'hist.save': 'Save conversations',
  'hist.on': 'On. They are written to {where}.',
  'hist.off': 'Off. Nothing touches the disk: the app goes back to listening without saving.',
  'hist.yourFolder': 'your data folder',
  'hist.emptyOn': 'No conversation saved yet.',
  'hist.emptyOff': 'Nothing saved.',
  'hist.meta': '{date} · {turns} answers · {segments} remarks',
  'hist.delete': 'Delete',
  'hist.noQuestion': '(no isolated question)',
  'hist.transcript': 'Transcript',
  'hist.showLast': 'Show only the last {count}',
  'hist.showAll': 'See all {count} conversations',
  'hist.clearConfirm': 'All {count} conversations get deleted. There is no undo.',
  'hist.clearYes': 'Yes, delete everything',
  'hist.cancel': 'Cancel',
  'hist.clearAll': 'Delete the whole history',

  // ───────────────────── Ajustes · atajos ─────────────────────
  'hk.rejectedOne':
    'Windows rejected this shortcut: **{keys}**. Another application has it taken, so **it will do nothing** until you pick a different one.',
  'hk.rejectedMany':
    'Windows rejected these shortcuts: **{keys}**. Another application has them taken, so **they will do nothing** until you pick different ones.',
  'hk.reset': 'Reset',
  'hk.resetDesc': 'Puts the ten shortcuts back to their factory values.',
  'hk.resetButton': 'Default values',
  'hk.askNow': 'Answer now',
  'hk.screenshotAndAsk': 'Capture the screen and answer',
  'hk.solveOnScreen': 'Solve the code on screen',
  'hk.solveQuiz': 'Answer the quiz on screen',
  'hk.toggleOverlay': 'Show or hide the overlay',
  'hk.toggleListening': 'Start or stop listening',
  'hk.toggleClickThrough': 'Toggle click-through',
  'hk.moveUp': 'Move the overlay up',
  'hk.moveDown': 'Move the overlay down',
  'hk.moveLeft': 'Move the overlay left',
  'hk.moveRight': 'Move the overlay right',

  // ───────────────────── Ajustes · diagnóstico ─────────────────────
  'diag.testStt': 'Test the transcription',
  'diag.testSttDesc':
    'It really connects to the configured engine: with a cloud engine it negotiates the model, with Whisper it runs the binary over a test audio clip.',
  'diag.works': 'It works.',
  'diag.failed': 'It failed.',
  'diag.copy': 'Copy',
  'diag.copied': 'Copied',
  'diag.emptyLog': 'Nothing logged in this session yet.',

  // ───────────────────── Ajustes · acerca de ─────────────────────
  'about.what':
    'An assistant that listens to a meeting or an interview, transcribes who says what and suggests answers in a floating panel that **does not show up when you share your screen**. It also solves the code or the quiz in front of you, reading it from a screenshot.',
  'about.version': 'Version',
  'about.author': 'Author',
  'about.license': 'License',
  'about.licenseDesc': 'Open source, no monetisation.',
  'about.dataTitle': 'What it does with what it hears',
  'about.dataHint': 'This is what is worth being clear about before leaving it listening to something important.',
  'about.audio':
    '**Audio never touches the disk.** The chunks go to the transcription engine and are dropped on the spot. There are no audio files, not even temporary ones.',
  'about.text':
    '**Text is saved, if you want it to be.** With the history on, the answers and the full transcript —including what the other person said— go to a JSON in your data folder. It is turned off entirely from *History*, and with it off nothing gets written.',
  'about.noServer':
    '**There is no server in between.** The calls go straight to the provider you choose, with your key. The keys are stored encrypted with DPAPI and never travel to the renderer.',
  'about.offline':
    '**It can work offline.** With Whisper local and Ollama nothing leaves your machine.',
  'about.legal':
    'Using it is on you: many companies restrict AI assistants in their hiring processes, and technical assessment platforms usually forbid them in their terms. In several jurisdictions, on top of that, keeping the transcript of a conversation counts the same as recording it.',

  // ───────────────────── Ajustes · espejo del móvil ─────────────────────
  'ph.turnOn': 'Turn the mirror on',
  'ph.onLan': 'Serving on your local network. The link expires when you turn it off.',
  'ph.onLocal': 'Serving on this machine. The link expires when you turn it off.',
  'ph.offDesc': 'Off: no port open and nothing to read from outside.',
  'ph.allowLan': 'Allow access from the local network',
  'ph.lanOn': 'Any device on your network holding the link can read the answers.',
  'ph.lanOff': 'Only this machine can connect. A phone needs this turned on.',
  'ph.lanWarn':
    'The link carries a token that expires when you turn the mirror off, but while it is on **anyone holding that link and sitting on your network can read your answers**. On a guest or office network, that is a decision, not a detail. The first time, Windows may ask you for firewall permission: without granting it, the phone will not connect.',
  'ph.offHint':
    'Turn the mirror on to generate the link and the QR code. A new one is generated every time, so a link saved on the phone stops working by itself.',
  'ph.scan': 'Scan this with your phone',
  'ph.copyLink': 'Copy the link',
  'ph.copied': 'Copied!',
  'ph.noClients': 'No phone connected yet.',
  'ph.clients': '{count} phone(s) connected.',
  'ph.loopbackWarn':
    'The mirror only listens on `127.0.0.1`, so this link works on this computer only. Turn on «Allow access from the local network» so the phone can reach it.',
  'ph.altsTitle': 'If that link does not load',
  'ph.altsHint':
    'Your machine has more than one network address. Try these; only one of them reaches the phone.',
  'ph.sentTitle': 'What gets sent and what does not',
  'ph.sentHint':
    'The **answers** go, and whether listening is active. **The transcript does not go**: what the other person said is not duplicated onto a second device for convenience. Everything stays on your network — the bridge is served by your own computer, with no cloud in between, and it shuts down with the app.',

  // ───────────────────── Ajustes · MQTT ─────────────────────
  'mq.publish': 'Publish to a broker',
  'mq.brokerTitle': 'Broker',
  'mq.brokerHint':
    'The scheme decides the encryption: `mqtt://` goes in the clear and `mqtts://` encrypted.',
  'mq.address': 'Address',
  'mq.addressDesc': 'Include the port: 1883 in the clear, 8883 with TLS.',
  'mq.topic': 'Topic',
  'mq.topicDesc': 'It publishes to this topic and to its «/text» child.',
  'mq.user': 'User',
  'mq.userDesc': 'Leave it empty if your broker accepts anonymous connections.',
  'mq.subscribeTitle': 'What your device subscribes to',
  'mq.qos':
    'They are published with QoS 1 and **without retaining**: a retained message is delivered on subscribe, so a board booting up in the morning would act on yesterday’s answer.',
  'mq.published': 'published',
  'mq.outWarn':
    '**This takes your answers out of the app.** If the broker is on the internet, the text leaves your network; if it is on your LAN, anyone with access to the topic can read it. A broker with no user and no TLS is a noticeboard — use `mqtts://` outside your network.',
  'mq.connected': 'Connected to the broker',
  'mq.connecting': 'Connecting…',
  'mq.noConnection': 'No connection',
  'mq.off': 'Off',
  'mq.publishedCount': '{count} answer(s) published in this session.',
  'mq.nothingPublished': 'Nothing has been published yet.',

  'mq.publishDesc':
    'Every finished answer is published to MQTT. The ones that fail or get cancelled are not: a device cannot tell an error apart from an answer.',
  'mq.brokerHint2': 'On a network that is not yours, the latter is not optional.',
  'mq.twoTopics':
    'Two topics, because they are two different consumers. If your board only wants the letters of a quiz, the second one saves it from adding a JSON parser.',
  'mq.jsonTopic': 'JSON with id, question, answer, model and trigger',
  'mq.textTopic': 'just the answer text, raw',
  'mq.testPublish': 'Publish a test message',
  'mq.yourDevice':
    'And what your device does with what it receives is up to you: we publish here, and that is where our part ends.',

  // ───────────────────── Ajustes · audio y flecos ─────────────────────
  'aud.captureTitle': 'Audio capture',
  'aud.listening': 'Listening',
  'aud.paused': 'Paused',
  'aud.devices': 'Microphone: {mic} · System: {system}',
  'aud.active': 'active',
  'aud.inactive': 'inactive',
  'aud.stop': 'Stop',
  'aud.start': 'Start listening',
  'aud.sourcesTitle': 'What it listens to',
  'aud.sourcesHint':
    'It decides what goes into the context sent to the model. With «system output only» your microphone is not even opened.',
  'aud.sources': 'Audio sources',
  'aud.both': 'Microphone and system output',
  'aud.systemOnly': 'System output only',
  'aud.micOnly': 'Microphone only',
  'aud.inertWarn':
    'With this combination **no automatic answer will fire**: the trigger is waiting for {wanted} and that source is not opened here.',
  'aud.seeTrigger': 'See the automatic trigger',
  'nav.attention': 'Something needs your attention',
  'nav.wizard': 'Guided setup',
  'nav.footer': 'Everything is stored on your machine. Nothing is uploaded to any server of ours.',
  'ph.qrAlt': 'QR code with the mirror link',
  'local.title': 'Which local model suits your machine',
  'local.hint':
    'Ollama costs no money and sends nothing off your machine, but choosing wrong costs a download of several gigabytes to end up with one-minute answers. This is what fits what you have.',
  'local.ram': 'of RAM',
  'local.cores': '{cores} cores · {cpu}',
  'local.gpu': 'GPU:',
  'local.forChat': 'For conversation',
  'local.forScreen': 'For reading the screen',
  'local.alreadyInstalled': 'already installed',
  'local.copied': 'copied!',
  'local.guide': 'Full guide',
  'local.guideDesc':
    'Every local model by memory tier, the multimodal ones that can read your screen, the paid ones sorted by price and what each screen press really costs. It is generated for your machine and opens in your browser.',
  'local.openGuide': 'Open the guide',
  'local.guideFailed': 'The guide could not be opened.',

  'aud.hintBoth':
    'The model knows what you have already answered, so it does not suggest repeating it. By default the auto-trigger does not react to your own voice.',
  'aud.hintSystem':
    'Your microphone is not even opened. It rules out any chance of your answers entering the context, in exchange for the model not knowing what you have already said.',
  'aud.hintMic':
    'Only what you say gets transcribed. Useful for dictating notes, not for an interview: the other person is not heard, so the default auto-trigger cannot fire.',

  'aud.captureHint':
    'Two independent sources: your microphone and the system output. Keeping them apart is what makes it possible to tell who is speaking without diarisation.',

  // ───────────────────── Errores del proceso principal ─────────────────────
  // Se leen en el OVERLAY, así que van traducidos: sin esto, la app entera en
  // inglés soltaba un «Falta la API key de Anthropic» en cuanto algo fallaba.
  'err.noKeyAnthropic': 'The Anthropic API key is missing. Set it in the dashboard or switch provider.',
  'err.noKeyGoogle': 'The Google API key is missing. Set it in the dashboard or switch provider.',
  'err.noKeyOpenai': 'The OpenAI API key is missing. Set it in the dashboard or switch provider.',
  'err.noKeyDeepseek': 'The DeepSeek API key is missing. Set it in the dashboard or switch provider.',
  'err.badKeyAnthropic': 'The Anthropic API key is not valid.',
  'err.badKeyGoogle': 'The Google API key is not valid.',
  'err.badKeyOpenai': 'The OpenAI API key is not valid.',
  'err.badKeyDeepseek': 'The DeepSeek API key is not valid.',
  'err.rateAnthropic': 'Anthropic rate limit reached.',
  'err.rateGoogle': 'Gemini quota exhausted or rate limit reached.',
  'err.rateOpenai': 'OpenAI rate limit reached, or your account has run out of credit.',
  'err.rateDeepseek': 'DeepSeek rate limit reached, or the account has run out of credit.',
  'err.noModel': 'The model does not exist or your account has no access. Pick another one in the dashboard.',
  'err.noModelGemini': 'That Gemini model does not exist or you have no access.',
  'err.noModelDeepseek': 'That model does not exist in DeepSeek. Pick another one in the dashboard.',
  'err.noAccessOpenai': 'Your OpenAI account has no access to this model. Pick another one in the dashboard.',
  'err.offlineAnthropic': 'No connection to the Anthropic API.',
  'err.offlineOpenai': 'No connection to the OpenAI API.',
  'err.offlineDeepseek': 'No connection to the DeepSeek API.',
  'err.refusedClaude': 'Claude declined to answer this content. Try another provider or rephrase the question.',
  'err.refusedOpenai': 'OpenAI declined to answer this content: {detail}',
  'err.apiError': '{provider} error ({status}): {message}',
  'err.geminiError': 'Gemini error: {message}',
  'err.unknownProvider': 'Unknown provider: {id}',
  'err.noOllamaModel': 'No Ollama model is selected. Pick one in the dashboard.',
  'err.ollamaOffline': 'Could not connect to Ollama. Check that it is running (ollama serve).',
  'err.ollamaError': 'Ollama error: {message}',
  'err.ollamaTimeout': 'Ollama did not answer in time.',
  'err.ollamaNotFound': 'No Ollama server was found listening.',
  'err.ollamaHttp': 'Ollama answered HTTP {status}.',
  'err.ollamaNoModels': 'Ollama answers but has no models. Download one with: ollama pull llama3.2',
  'err.budgetOllama':
    '"{model}" spent its whole budget reasoning and never got to writing the answer. It is a reasoning model on too big a problem: pick one without "thinking" in dashboard → Screen model, or crop the screenshot to what needs solving.',
  'err.budgetOpenai':
    '"{model}" spent its whole budget reasoning and never got to writing the answer. Pick a smaller model in the dashboard, or crop the screenshot to what needs solving.',
  'err.sttNoKeyGoogle': 'The Google API key is missing. Set it further up.',
  'err.sttNoKeyOpenai': 'The OpenAI API key is missing. Set it further up.',
  'err.sttNoKeyGoogleLive':
    'The Google API key is missing. Set it in the dashboard to use Gemini Live, or switch transcription to Whisper local.',
  'err.sttNoKeyGoogleAudio':
    'The Google API key is missing. Direct audio mode sends the sound to the Gemini model itself, so it needs one.',
  'err.sttNoKeyOpenaiEngine':
    'The OpenAI API key is missing. Set it in the dashboard to transcribe with it, or switch transcription to Whisper local.',
  'err.sttNoContext': 'The direct audio engine requires the answer context.',
  'err.sttUnknown': 'Unknown transcription engine: {id}',
  'err.openaiBadKeyStt': 'The OpenAI API key is not valid.',
  'err.openaiNoAccessStt': 'Your OpenAI account has no access to this transcription model.',
  'err.openaiNoModelStt': 'The transcription model does not exist or your account has no access.',

  'mdl.fast': 'fast',
  'mdl.capable': 'most capable',
  'mdl.lowLatency': 'lowest latency',
  'mdl.balanced': 'balanced',
  'mdl.cheapest': 'cheapest',
  'mdl.fastCheap': 'fast and cheap',

  // ───────────────────── Asistente de configuración ─────────────────────
  'wiz.eyebrow': 'Guided setup',
  'wiz.back': '← Back',
  'wiz.skip': 'Skip →',
  'wiz.pickFirst': 'Choose the cloud or your machine first',
  'wiz.skipTitle': 'Move on to the next step without doing this one',
  'wiz.exit': 'Exit the wizard',
  'wiz.titleWelcome': 'Who is going to answer?',
  'wiz.titleBrain': 'Setting up the model',
  'wiz.titleVoice': 'How is speech turned into text?',
  'wiz.titleContext': 'What the model should know about you',
  'wiz.titleDone': 'Ready',
  'wiz.measuring': 'Measuring your machine…',
  'wiz.lead':
    'The app needs a model to write the answers. There are two ways, and the real difference is where it runs and who pays.',
  'wiz.cloud': 'In the cloud',
  'wiz.cloudB1': 'Nothing to install: you paste an API key and it answers.',
  'wiz.cloudB2': 'The best quality, and it answers in a second or two.',
  'wiz.cloudB3': 'You pay per use to the provider. Your transcribed voice leaves your machine.',
  'wiz.cloudCta': 'Use a paid provider',
  'wiz.local': 'On your machine',
  'wiz.localB1': 'Free and account-free. Nothing you say leaves the machine.',
  'wiz.localB2': 'You have to install Ollama and download several GB of models.',
  'wiz.localB3': 'Quality and speed depend on your hardware.',
  'wiz.localCta': 'Install everything here',
  'wiz.recommended': 'recommended',
  'wiz.localViable':
    'Your machine is up to running things locally, so that is what I recommend: it is free and you send nothing out. You can change your mind later without losing anything.',
  'wiz.localWeak':
    'On this machine local models would be slow and would misread screenshots, so I recommend the cloud. You can still try local: the wizard will tell you which models suit you.',
  'wiz.cloudLead':
    'Pick the provider and paste its key. It is stored encrypted in your Windows profile and never shown back.',
  'wiz.claudeNote': 'The best answer quality and screen reading.',
  'wiz.geminiNote': 'Cheaper, and the same key works for live transcription.',
  'wiz.openaiNote': 'If you already pay for OpenAI. It answers and also transcribes.',
  'wiz.deepseekNote': 'The cheapest by far. It does not read images, so the screen needs another one.',
  'wiz.apiKey': 'API key',
  'wiz.alreadyHave': 'you already have one',
  'wiz.keepExisting': 'Leave it empty to use the one you already saved',
  'wiz.pasteKey': 'Paste the key here',
  'wiz.testingKey': 'Testing the key…',
  'wiz.saveAndTest': 'Save and test',
  'wiz.connectionFailed': 'The connection failed.',
  'wiz.installing': 'Installing Ollama…',
  'wiz.installFailed': 'Could not install it.',
  'wiz.configuring': 'Configuring…',
  'wiz.downloadingModels': 'Downloading models…',
  'wiz.downloadFailed': 'Could not download {model}.',
  'wiz.ollamaIs': 'Ollama is the program that runs the models on your machine.',
  'wiz.installedNotRunning': 'You already have it installed, but its server is not responding.',
  'wiz.notInstalled': 'You do not have it installed.',
  'wiz.openItOnce':
    'Open it from the start menu and come back here. It stays running in the background, so this only has to be done once.',
  'wiz.recheck': 'Check again',
  'wiz.wingetNote':
    'I install it with `winget`, the Windows package manager — that way I do not download any executable myself. Windows will ask you for permission with its own prompt.',
  'wiz.installOllama': 'Install Ollama',
  'wiz.noWinget':
    'This machine has no `winget`, so I cannot install it without downloading an executable myself — and I am not going to do that. Install it from **ollama.com/download** and press «Check again».',
  'wiz.ollamaReadyAll':
    'Ollama is ready and you already have the two models that suit your machine downloaded. There is nothing to download: all that is left is to select them.',
  'wiz.ollamaReady':
    'Ollama is ready. These are the two models that suit your machine: one for conversation and one for reading the screen.',
  'wiz.forChat': 'For conversation',
  'wiz.forScreen': 'For reading the screen',
  'wiz.alreadyDownloaded': '· already downloaded',
  'wiz.sizeNote':
    'It is several GB between the two and they are downloaded only once. You will see the exact size as soon as it starts. Any you already have gets skipped.',
  'wiz.useThese': 'Use these models',
  'wiz.downloadAndSet': 'Download and configure',
  'wiz.lookingForOllama': 'Looking for Ollama on your machine…',
  'wiz.voiceBoth':
    'To know what you are being asked, the audio has to be turned into text. The difference between the options is where your voice goes.',
  'wiz.voiceLocal':
    'To know what you are being asked, the audio has to be turned into text. You chose to run everything on your machine, so here there is only the option that sends your voice nowhere.',
  'wiz.voiceCloud':
    'To know what you are being asked, the audio has to be turned into text. You chose the cloud, so these are the ones that do not make you download anything.',
  'wiz.openaiLiveTitle': 'OpenAI live · ~300 ms',
  'wiz.recommendedSuffix': '· recommended',
  'wiz.openaiLiveOk':
    'The model OpenAI recommends for live audio. It uses the key you already set; the audio is sent to OpenAI.',
  'wiz.openaiLiveNoKey': 'It needs an OpenAI key, and you have not set one.',
  'wiz.geminiLiveTitle': 'Gemini Live · ~300 ms',
  'wiz.geminiLiveOk':
    'Just as fast. It uses the Google key you already set; the audio is sent to Google.',
  'wiz.geminiLiveNoKey': 'It needs a Google key, and you have not set one.',
  'wiz.whisperTitle': 'Whisper local · ~1–2 s',
  'wiz.whisperReady': 'Already installed. It works offline and your voice does not leave the machine.',
  'wiz.whisperNew': 'Your voice does not leave the machine. About 150 MB have to be downloaded once.',
  'wiz.noSttKey':
    'There is no key that can transcribe. Go back and set the OpenAI or the Google one, or use **Whisper local** from the dashboard: it works without any key.',
  'wiz.geminiLiveStuck':
    'Gemini Live is set right now and there is no Google key: if you leave without choosing, the app will not transcribe anything.',
  'wiz.cvLead':
    'Paste your CV, or a summary: companies, years, technologies, achievements with numbers. It is the only source of concrete facts about you that the model can cite.',
  'wiz.cvNote':
    'Without it the answers are correct but generic — the model is forbidden from inventing experience. You can leave it for later and paste it under «Context».',
  'wiz.cvPlaceholder': 'Paste your CV or a summary of your experience…',
  'wiz.notNow': 'Not now',
  'wiz.saveAndFinish': 'Save and finish',
  'wiz.doneLead': 'Everything is set. This is how it ended up:',
  'wiz.answers': 'Answers',
  'wiz.transcribes': 'Transcribes',
  'wiz.cvLoaded': 'Your CV is loaded',
  'wiz.noCv': 'No CV: the answers will be generic until you paste it under «Context»',
  'wiz.doneNote':
    'The overlay is already on screen, top right. Press the dot on the left to start listening, or Ctrl+Alt+C to solve whatever is on your screen. All of this can be changed later from this same dashboard.',
  'wiz.startUsing': 'Start using the app',
  'wiz.sttGeminiLive': 'Gemini Live (in the cloud)',
  'wiz.sttGeminiAudio': 'Gemini direct audio',
  'wiz.sttOpenaiLive': 'OpenAI live (in the cloud)',
  'wiz.sttOpenaiTranscribe': 'OpenAI per turn (in the cloud)',
  'wiz.sttWhisper': 'Whisper local (offline)',

  'ol.status': 'Ollama status',
  'ol.checking': 'checking…',
  'ol.detected': 'detected',
  'ol.notDetected': 'not detected',
  'ol.recheck': 'Check again',
  'ol.installHint':
    '{error} Install it from **ollama.com** and leave it running; the server starts by itself after installing.',
  'ol.noModels':
    'Ollama is running but has no model downloaded. Download one from a terminal, for example: `ollama pull llama3.2`',
  'ol.detectedCount': '{count} model(s) detected automatically:',
  'ol.vision': 'vision',
  'mdl.providerOllama': 'Ollama (local)',

  // ───────────────────── Ajustes · claves ─────────────────────
  'keys.title': 'API keys',
  'keys.hint':
    'Stored encrypted with DPAPI in your Windows profile, and only the main process reads them. They are never shown back and never leave this machine except towards the provider you choose.',
  'keys.configured': 'configured',
  'keys.missing': 'not set',
  'keys.placeholder': 'Paste your API key',
  'keys.replace': '•••••••• (type to replace)',
  'keys.save': 'Save',
  'keys.test': 'Test',
  'keys.testing': 'Testing…',
  'keys.clear': 'Delete',
  'keys.ok': 'connection works',
  'keys.failed': 'failed',
  'keys.anthropic': 'Anthropic (Claude)',
  'keys.anthropicHint': 'console.anthropic.com → API Keys',
  'keys.google': 'Google (Gemini)',
  'keys.googleHint':
    'aistudio.google.com → Get API key. Also needed to transcribe with Gemini Live.',
  'keys.openai': 'OpenAI (ChatGPT)',
  'keys.openaiHint':
    'platform.openai.com → API keys. Works for the answers and also to transcribe with the OpenAI engines.',
  'keys.deepseek': 'DeepSeek',
  'keys.deepseekHint':
    'platform.deepseek.com → API keys. Answers only: they have no transcription models, and their models do not read images.',
  'keys.ollama': 'Ollama (local)',
  'keys.ollamaBadge': 'no key needed',
  'keys.ollamaHint':
    'It runs on your machine, so there is nothing to paste here. What is worth checking is that the server is alive and has some model downloaded.',

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

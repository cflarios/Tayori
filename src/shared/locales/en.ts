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

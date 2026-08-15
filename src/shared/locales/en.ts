/**
 * The interface texts, in English. **This is the source.**
 *
 * ## Why a TypeScript module and not a `.json`
 *
 * JSON was considered, which is the standard, and this was chosen for a concrete
 * reason: with a typed object, the Spanish file is declared as
 * `Record<keyof typeof en, string>` and **a missing translation doesn't
 * compile**. With JSON, an untranslated key falls back to the fallback language
 * and nobody notices until a user sees a stray sentence in another language —
 * which is exactly the kind of silent failure this project chases.
 *
 * The rest is identical to having two JSONs: the components stay clean, the
 * translations live together and the coverage can be seen at a glance. And
 * there's no need to touch `resolveJsonModule` or the configuration of two
 * bundlers.
 *
 * ## Conventions
 *
 * - The keys are grouped by screen with dots: `overlay.*`, `dash.*`, `wiz.*`,
 *   `err.*`. It's not real hierarchy, it's useful alphabetical order.
 * - `{something}` are slots filled by `t()`. The same slot has to exist in both
 *   versions or the sentence will come out lame in one language.
 * - `**bold**` and `` `code` `` only work in the keys painted with `<Tx>`. In a
 *   `title` or a `placeholder` the asterisks would come out as-is, just as
 *   happened in the overlay before `parseInline`.
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
  'overlay.settingsShort': 'Settings',
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

  'overlay.codeAction': 'Code',
  'overlay.quizAction': 'Quiz',
  'overlay.more': 'More options',
  'overlay.prompterHint': 'Click to advance · right-click to go back',
  'overlay.code': 'code',
  'overlay.writing': 'writing…',
  'overlay.copied': 'Copied',
  'overlay.copyFailed': "Couldn't copy",
  'overlay.copy': 'Copy',
  'overlay.copyAnswer': 'Copy the answer',

  'overlay.readingScreen': 'Reading the screen…',
  'overlay.thinking': 'Thinking…',
  'overlay.unknownError': 'Unknown error',
  'overlay.prevAnswer': 'Previous answer',
  'overlay.nextAnswer': 'Next answer',
  'overlay.forgotten': 'forgotten',
  'overlay.memory': 'memory {turns}/{max}',
  'overlay.memoryTitle':
    'The assistant remembers {turns} of {max} exchanges and resends them with every query. Press to make it forget them; the transcript and the history stay as they are.',
  'overlay.stop': 'Stop generating',
  'overlay.dismiss': 'Dismiss',
  'overlay.transcription': 'Transcription',
  'overlay.attached': 'Screenshot attached',
  'overlay.size': 'Size {size}',
  'overlay.suggestion': 'Suggestion',
  'overlay.questionLabel': 'Question',
  'overlay.continue': 'Continue',
  'overlay.continueHint': 'Pick up the solution where it was cut off, no repeats',
  'overlay.answeringWith': 'Answering with {model}',
  'overlay.generatedBy': 'This answer was generated by {provider} · {model}',
  'overlay.emptyIdle': 'Ctrl+Enter to ask for an answer · Ctrl+Alt+C to solve the screen.',
  'overlay.emptyStopped':
    'Press «Listen» so it follows the conversation, or Ctrl+Alt+C to solve whatever is on your screen.',
  'overlay.footAsk': 'ask',
  'overlay.footScreen': 'solve screen',

  // Quick actions. The label is read; the text below is sent to the model, and
  // it's translated for consistency — the ANSWER's language is governed by the
  // system prompt's rule, not the request's language.
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

  // ───────────────────── Settings · model ─────────────────────
  'presets.title': 'Model presets',
  'presets.hint':
    'Save a set of models for a use case (interview, meeting, interpreter…) and switch to it in one click. A preset sets the transcription engine and model, the answering provider and model, the screen model and the prompt profile — nothing else.',
  'presets.empty': 'No presets yet. Set up your models below, then save them here.',
  'presets.saveCurrent': 'Save current setup as a preset',
  'presets.apply': 'Apply',
  'presets.delete': 'Delete preset',
  'presets.nameLabel': 'Preset name',

  'model.title': 'Answering model',
  'model.hint': 'Who writes the suggestions you see in the overlay.',
  'model.provider': 'Provider',
  'model.model': 'Model',
  'model.answerLang': 'Answer language',
  'model.answerLangDesc':
    'Automatic follows the content — the conversation, or what is on the screen. Pick a language to force every answer into it.',
  'model.answerLangAuto': 'Automatic',
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

  // ───────────────────── Settings · screen model ─────────────────────
  'screen.title': 'Screen model',
  'screen.hint':
    'The one that solves `Ctrl+Alt+C` (code) and `Ctrl+Alt+Q` (quizzes). It can be different from the one that answers what is being said: that one needs speed, this one needs to read a screenshot properly. **It has to accept images.**',
  'screen.providerDesc':
    '«The same one» uses the answering model above, which is how it worked before.',
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

  // ───────────────────── Settings · general ─────────────────────
  'gen.stealth': 'Stealth mode',
  'gen.stealthDesc':
    'The overlay is excluded from screen capture at the Windows compositor level. Turn it off to record demos or debug the interface.',
  'gen.clickThrough': 'Click-through',
  'gen.clickThroughDesc':
    'The overlay ignores the mouse and clicks reach the window underneath. Recommended during a call.',
  'gen.stealthWarn': 'Stealth mode is off: the overlay **will** show up if you share your screen.',
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

  'gen.teleprompter': 'Teleprompter mode',
  'gen.teleprompterDesc':
    'Shows the finished answer one phrase per line, in a narrow column with the active line always in the same place. What gives away that you are reading is the horizontal eye movement, not the size of the text.',
  'gen.teleprompterHint':
    'Advance with **{next}** and go back with **{prev}** — they are global shortcuts, so they work with the video call focused. You can also click the panel to advance and right-click to go back. Both shortcuts are only registered while this mode is on, and can be changed under *Shortcuts*.',
  'gen.protects':
    '**What it protects and what it does not.** Stealth mode excludes the window from the capture pipeline (screen share, OBS, recorders). It does not protect you from a camera pointed at the screen, it does not hide the process from proctoring software that enumerates windows, and it does not hide what you say into the microphone.',

  // ───────────────────── Settings · transcription ─────────────────────
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
  'stt.languageDesc':
    'Automatic detects the language; fixing it improves accuracy when you get it right.',
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
  'stt.install': 'Install',
  'stt.use': 'Use',
  'stt.inUse': 'In use',
  'stt.recommended': 'Recommended',
  'stt.favorite': 'Mark as favorite',
  'stt.unfavorite': 'Remove from favorites',
  'stt.recForPc': 'Recommended for your PC',
  'stt.downloading': 'Downloading…',
  'stt.installed': 'installed',
  'stt.downloadFailed': 'The download failed.',
  'stt.progressBinary': 'Executable',
  'stt.progressModel': 'Model',

  // ───────────────────── Settings · behavior ─────────────────────
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
  'beh.idle': 'Stop listening when idle',
  'beh.idleDesc':
    'If no one speaks for a while, the app stops listening on its own. Handy for the meeting that ended while the assistant kept listening to an empty room. Off by default.',
  'beh.idleMinutes': 'Idle timeout (minutes)',
  'beh.idleMinutesDesc': 'Minutes of silence before it stops. Only speech counts as activity.',
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
  'beh.profGeneral': 'General (screen)',
  'beh.profInterpreter': 'Interpreter',
  'beh.interpreterLangs': 'Interpreter languages',
  'beh.interpreterLangsDesc':
    'Translates every utterance into the other language, on both lanes. Needs listening and auto-trigger on.',
  'beh.profCustom': 'Custom',
  'beh.codeLang': 'Code mode language',
  'beh.codeLangDesc':
    'Which language the Ctrl+Alt+C solutions are written in. With «auto» it works it out from what is on screen, which is the right thing when the editor already has one selected.',
  'beh.customPlaceholder': 'Describe how the assistant should behave…',
  'beh.speakerThemShort': 'the other person',
  'beh.speakerMeShort': 'you',
  'beh.speakerAnyShort': 'either of the two',

  // ───────────────────── Settings · context ─────────────────────
  'ctx.preparingFor': 'Preparing for',
  'ctx.inUse': '{count} in use: {names}',
  'ctx.nothingActive': 'nothing active yet',
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
  'ctx.vocabularyPlaceholder': 'Kubernetes, Grafana, Docker, Linux, CI/CD…',
  'ctx.vocabularyHint':
    'Separated by commas or line breaks. They go straight to the speech recogniser: this is what fixes proper nouns and acronyms that come out wrong.',
  'ctx.notesPlaceholder': 'Anything the model had better know.',
  'ctx.notesHint': 'Supporting notes with no special treatment.',

  // ───────────────────── Settings · skills ─────────────────────
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
  'ctx.import': 'PDF · Word · Markdown · text',
  'ctx.badgeInUse': 'In use',
  'ctx.tileEmpty': 'Empty — paste or import the text',
  'ctx.dropHint': 'Drag or click to upload',
  'ctx.close': 'Close',
  'ctx.parsing': 'Reading…',
  'ctx.parseFailed': "Couldn't read that file",

  // ───────────────────── Settings · history ─────────────────────
  'hist.save': 'Save conversations',
  'hist.on': 'On. They are written to {where}.',
  'hist.off': 'Off. Nothing touches the disk: the app goes back to listening without saving.',
  'hist.yourFolder': 'your data folder',
  'hist.emptyOn': 'No conversation saved yet.',
  'hist.emptyOff': 'Nothing saved.',
  'hist.meta': '{date} · {turns} answers · {segments} remarks',
  'hist.delete': 'Delete',
  'hist.noQuestion': '(no isolated question)',
  'hist.screenCode': 'Solve on-screen code',
  'hist.screenQuiz': 'Answer on-screen quiz',
  'hist.screenGeneral': 'Help with the screen',
  'hist.search': 'Search conversations…',
  'hist.searchNone': 'No conversation matches “{query}”.',
  'hist.transcript': 'Transcript',
  'hist.showLast': 'Show only the last {count}',
  'hist.showAll': 'See all {count} conversations',
  'hist.clearConfirm': 'All {count} conversations get deleted. There is no undo.',
  'hist.clearYes': 'Yes, delete everything',
  'hist.cancel': 'Cancel',
  'hist.clearAll': 'Delete the whole history',

  // ───────────────────── Settings · shortcuts ─────────────────────
  'hk.rejectedOne':
    'Windows rejected this shortcut: **{keys}**. Another application has it taken, so **it will do nothing** until you pick a different one.',
  'hk.rejectedMany':
    'Windows rejected these shortcuts: **{keys}**. Another application has them taken, so **they will do nothing** until you pick different ones.',
  'hk.teleprompterNext': 'Teleprompter: next line',
  'hk.teleprompterPrev': 'Teleprompter: previous line',
  'hk.reset': 'Reset',
  'hk.resetDesc':
    'Puts every shortcut back to its factory combination, and turns them all back on.',
  'hk.resetButton': 'Default values',
  'hk.askNow': 'Answer now',
  'hk.screenshotAndAsk': 'Capture the screen and answer',
  'hk.solveOnScreen': 'Solve the code on screen',
  'hk.solveQuiz': 'Answer the quiz on screen',
  'hk.captureFrame': 'Scroll capture (collect)',
  'hk.solveCapture': 'Solve the scroll capture',
  'scroll.title': 'Scroll capture',
  'scroll.hint':
    'For a test on a shared screen that is revealed by scrolling: collect several pieces with the shortcut and they are stitched together to solve the full statement. Tip: pin the shared content to full screen so the text is legible.',
  'scroll.manual': 'Manual',
  'scroll.manualHint': 'One shortcut press = one piece. You choose what goes in.',
  'scroll.auto': 'Auto',
  'scroll.autoHint':
    'The shortcut starts and stops a loop that captures on its own and drops repeated pieces.',
  'scroll.pieces': 'Pieces: {count}',
  'scroll.capturing': 'Capturing… {count}',
  'scroll.solve': 'Solve',
  'scroll.clear': 'Clear',
  'notice.scrollFull': 'Stack full: solve the pieces or clear it.',
  'err.noFrames': 'No pieces captured yet.',
  'hk.toggleOverlay': 'Show or hide the overlay',
  'hk.toggleListening': 'Start or stop listening',
  'hk.toggleClickThrough': 'Toggle click-through',
  'hk.moveUp': 'Move the overlay up',
  'hk.moveDown': 'Move the overlay down',
  'hk.moveLeft': 'Move the overlay left',
  'hk.moveRight': 'Move the overlay right',

  // ───────────────────── Settings · diagnostics ─────────────────────
  'diag.testStt': 'Test the transcription',
  'diag.testSttDesc':
    'It really connects to the configured engine: with a cloud engine it negotiates the model, with Whisper it runs the binary over a test audio clip.',
  'diag.works': 'It works.',
  'diag.failed': 'It failed.',
  'diag.copy': 'Copy',
  'diag.copied': 'Copied',
  'diag.emptyLog': 'Nothing logged in this session yet.',

  // ───────────────────── Settings · about ─────────────────────
  'about.what':
    'An assistant that listens to a meeting or an interview, transcribes who says what and suggests answers in a floating panel that **does not show up when you share your screen**. It also solves the code or the quiz in front of you, reading it from a screenshot.',
  'about.version': 'Version',
  'about.author': 'Author',
  'about.license': 'License',
  'about.licenseDesc': 'Open source, no monetisation.',
  'about.web': 'Website',
  'about.webDesc': 'The Tayori landing page.',
  'about.updateTitle': 'Updates',
  'about.updateHint': 'Check GitHub for a newer version. Nothing is downloaded automatically.',
  'about.checkUpdate': 'Check for updates',
  'about.checking': 'Checking…',
  'about.upToDate': "You're up to date (v{version}).",
  'about.updateAvailable': 'A new version is available: **v{latest}** (you have v{current}).',
  'about.download': 'Download',
  'about.viewRelease': 'View release',
  'about.dataTitle': 'What it does with what it hears',
  'about.dataHint':
    'This is what is worth being clear about before leaving it listening to something important.',
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

  // ───────────────────── Settings · phone mirror ─────────────────────
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

  // ───────────────────── Settings · MQTT ─────────────────────
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
  'mq.esp32Title': 'A ready-made consumer',
  'mq.esp32Post':
    'is an Arduino/ESP32 library that subscribes to the topics Tayori publishes and reacts with hardware (LEDs, a traffic light, an OLED).',
  'mq.esp32Open': 'View on GitHub',
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

  // ───────────────────── Settings · audio and odds and ends ─────────────────────
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

  // ───────────────────── Main process errors ─────────────────────
  // They're read in the OVERLAY, so they're translated: without this, the whole
  // app in English blurted out a «Falta la API key de Anthropic» whenever
  // something failed.
  'err.noKeyAnthropic':
    'The Anthropic API key is missing. Set it in the dashboard or switch provider.',
  'err.noKeyGoogle': 'The Google API key is missing. Set it in the dashboard or switch provider.',
  'err.noKeyOpenai': 'The OpenAI API key is missing. Set it in the dashboard or switch provider.',
  'err.noKeyDeepseek':
    'The DeepSeek API key is missing. Set it in the dashboard or switch provider.',
  'err.badKeyAnthropic': 'The Anthropic API key is not valid.',
  'err.badKeyGoogle': 'The Google API key is not valid.',
  'err.badKeyOpenai': 'The OpenAI API key is not valid.',
  'err.badKeyDeepseek': 'The DeepSeek API key is not valid.',
  'err.rateAnthropic': 'Anthropic rate limit reached.',
  'err.rateGoogle': 'Gemini quota exhausted or rate limit reached.',
  'err.rateOpenai': 'OpenAI rate limit reached, or your account has run out of credit.',
  'err.rateDeepseek': 'DeepSeek rate limit reached, or the account has run out of credit.',
  'err.noModel':
    'The model does not exist or your account has no access. Pick another one in the dashboard.',
  'err.noModelGemini': 'That Gemini model does not exist or you have no access.',
  'err.noModelDeepseek':
    'That model does not exist in DeepSeek. Pick another one in the dashboard.',
  'err.noAccessOpenai':
    'Your OpenAI account has no access to this model. Pick another one in the dashboard.',
  'err.offlineAnthropic': 'No connection to the Anthropic API.',
  'err.offlineOpenai': 'No connection to the OpenAI API.',
  'err.offlineDeepseek': 'No connection to the DeepSeek API.',
  'err.refusedClaude':
    'Claude declined to answer this content. Try another provider or rephrase the question.',
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
  'mdl.speedVeryFast': 'very fast',
  'mdl.speedFast': 'fast',
  'mdl.speedMedium': 'medium speed',
  'mdl.speedSlow': 'slow',
  'mdl.accDecent': 'decent accuracy',
  'mdl.accGood': 'good accuracy',
  'mdl.accHigh': 'high accuracy',
  'mdl.accVeryHigh': 'very high accuracy',
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
  'wiz.deepseekNote':
    'The cheapest by far. It does not read images, so the screen needs another one.',
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
  'wiz.whisperReady':
    'Already installed. It works offline and your voice does not leave the machine.',
  'wiz.whisperNew':
    'Your voice does not leave the machine. About 150 MB have to be downloaded once.',
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

  // ───────────────────── Settings · keys ─────────────────────
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

  // ───────────────────── Settings · sections ─────────────────────
  'sec.general': 'General',
  'sec.generalHint':
    'Whether the overlay shows up when you share your screen, and how it looks meanwhile.',
  'sec.audio': 'Audio',
  'sec.audioHint': 'What it listens to, and the check that both sources arrive separately.',
  'sec.phone': 'Phone mirror',
  'sec.phoneHint':
    "Sends the answers to your phone's browser. It covers what stealth mode cannot: when you share your whole screen, whatever is on your monitor is on the other side too.",
  'sec.mqtt': 'MQTT',
  'sec.mqttHint':
    'Publishes every finished answer to a broker so something else can pick it up: an ESP32, a script, whatever you build.',
  'sec.models': 'AI models',
  'sec.modelsHint': 'The keys, who writes the answers and who reads your screen.',
  'sec.transcription': 'Transcription',
  'sec.transcriptionHint':
    'Cloud engines transcribe in ~300 ms but send the audio to their provider. Whisper local never leaves your machine, in exchange for ~1–2 s of latency.',
  'sec.behaviour': 'Behaviour',
  'sec.behaviourHint': 'When the assistant answers, and with how much context.',
  'sec.context': 'Context',
  'sec.contextHint':
    'What you prepare here is what separates a generic answer from one of yours. Each kind is explained to the model differently, so a prepared answer gets reused instead of paraphrased.',
  'sec.skills': 'Skills',
  'sec.skillsHint':
    'Local SKILL.md instructions that refine HOW the model answers: the tone and the words, not the format. You turn them on here or by typing /name in the write tab.',
  'sec.history': 'History',
  'sec.historyHint':
    'Stored on your machine, in plain text, and never sent anywhere. It includes the full transcript: what the other person said, not just what you asked.',
  'sec.hotkeys': 'Shortcuts',
  'sec.hotkeysHint':
    'They are **global**: they work with the video call focused, which is exactly why they take the shortcut away from whatever app has focus. Click a field and type the combination you want.',
  'sec.diagnostics': 'Diagnostics',
  'sec.diagnosticsHint':
    'If something is not working, this is what to look at before anything else.',
  'sec.about': 'About',
  'sec.aboutHint': 'What Tayori is, which version you have and what it does with your data.',

  // ────────────────────────────── Settings ──────────────────────────────
  'dash.language': 'Language',
  'dash.languageDesc':
    'The interface language. It has nothing to do with the language you speak in the meeting — that one is set under Transcription.',

  // ───────────────────── Dashboard · rótulos sueltos ─────────────────────
  'nav.eyebrow': 'Settings',
  'aud.startTitle': 'Start listening',
  'aud.stopTitle': 'Stop listening',
  'aud.meterMe': 'Me (microphone)',
  'aud.meterThem': 'Them (system)',
  'hist.untitled': 'Untitled conversation',
  'hist.inferredQuestion': '(question inferred from the transcript)',
  'stt.whisperTiny': 'Tiny (74 MB) — the fastest',
  'stt.whisperBase': 'Base (141 MB) — tight outside English',
  'stt.whisperSmall': 'Small (465 MB) — recommended outside English',

  // ───────────────────── Settings · shortcuts ─────────────────────
  'hk.needsModifier':
    'A global shortcut needs at least Ctrl, Alt or Shift: without a modifier, that key would stop working everywhere in the system.',
  'hk.taken':
    'Windows rejected this shortcut: another application already has it. Pick a different one.',
  'hk.duplicated': 'Repeated: two actions on the same shortcut means only one of them works.',
  'hk.pressCombo': 'Press the combination…',
  'hk.unassigned': 'Unassigned',
  'hk.switchHint':
    'The switch on each row turns that shortcut off. A global shortcut takes the combination away from whatever application has focus, so turning off one you do not use hands it back — the combination stops being registered and your editor, your game or another app can use it again. The combination is kept, so turning it back on does not mean typing it in again.',
  'hk.offDesc': 'Off: the combination is free for other applications.',

  // ───────────────────── Settings · diagnostics ─────────────────────
  'diag.logAt': 'The main process log is written to `{where}`.',
  'diag.dataFolder': 'your data folder',
  'diag.refresh': 'Refresh the log',
  // What «Test transcription» returns. Read in the same card.
  'diag.whisperNoBinary': 'whisper-cli.exe was not found. Download it from above.',
  'diag.whisperNoModel': 'The "{model}" model is not downloaded.',
  'diag.whisperOk': 'Whisper works. Executable: {binary}',
  'diag.whisperFailed': 'Failed to run {binary}\n{detail}',
  'diag.geminiLiveOk': 'Connected with "{model}" ({modality} output).',
  'diag.geminiLiveAudioOut':
    'This model is forced to return audio, which gets discarded: it transcribes fine, but that output is billed.',
  'diag.geminiAudioOk': 'Connected with "{model}" (direct audio).',
  'diag.openaiLiveOk': 'Session opened with "{model}".',
  'diag.openaiTranscribeOk': 'Connected with "{model}".',

  // ───────────────────── Settings · phone mirror ─────────────────────
  'ph.serverFailed': 'The server could not be opened:',
  'ph.scanHint':
    'Open the camera on your phone and point it here. If you prefer, type the link by hand — it is the same one.',
  // The page served to the phone. They go to text nodes, no markup.
  'ph.pgTitle': 'Mirror',
  'ph.pgConnecting': 'Connecting…',
  'ph.pgConnected': 'Connected',
  'ph.pgReconnecting': 'Reconnecting…',
  'ph.pgExpired': 'Link expired — scan the QR code again',
  'ph.pgEmpty': 'Answers will show up here.\nKeep the screen awake.',
  'ph.pgFoot': 'Only while the computer is on and on the same network.',
  'ph.pgThinking': 'Thinking…',
  'ph.pgFailed': 'The answer failed.',
  'ph.pgCancelled': 'Cancelled.',
  'ph.pgWriting': 'writing…',
  'ph.pgListening': 'listening',
  'ph.pgCaptureError': 'capture error',
  'ph.pgPaused': 'paused',
  'ph.pgCopy': 'Copy',
  'ph.pgCopied': 'Copied',
  'ph.pgExpiredPlain': 'Link expired. Scan the QR code from the dashboard again.',
  'ph.pgNotFound': 'There is nothing here.',

  // ───────────────────── Settings · MQTT ─────────────────────
  'mq.errNoConnection': 'There is no connection to the broker.',
  'mq.testQuestion': 'Test message from the assistant',
  'mq.testText': 'If you can see this on your device, the setup works.',
  'mq.errRefused':
    'The broker refused the connection. Check the address, and that it is listening on that port.',
  'mq.errNoHost': 'That host was not found. Check the broker address.',
  'mq.errAuth': 'The broker rejected the user or the password.',
  'mq.errBadUrl':
    'That URL is not valid. It has to start with mqtt:// or mqtts:// and include the port.',

  // ───────────────────── Modelos locales · recomendación ─────────────────────
  'local.tierTight': '{ram} GB of RAM: tight for local models',
  'local.tierSmall': '{ram} GB of RAM: enough for 3B–7B models',
  'local.tierComfy': '{ram} GB of RAM: comfortable for 7B–8B, tight for 14B',
  'local.tierBig': '{ram} GB of RAM: enough for large models',
  'local.noteLlama1b': 'The smallest thing that is still useful.',
  'local.noteMoondream':
    'Minimal vision; it reads simple screenshots, not long problem statements.',
  'local.noteLlama3b': 'Genuinely fast on CPU; enough to suggest answers.',
  'local.noteQwenVl3b': 'A small multimodal. It reads a problem statement from a good screenshot.',
  'local.noteLlama8b': 'The usual balance between quality and speed.',
  'local.noteQwenVl7b': 'It reads code and quiz screenshots comfortably.',
  'local.noteQwen14b': 'High quality while keeping the latency reasonable.',
  'local.noteQwenVl32b': 'About the best you can run locally for reading screens.',
  'local.caveatTight':
    'With this much memory a local model is going to be slow and to get screenshots wrong. For the screen actions it is worth using a cloud model and leaving the local one for conversation.',
  'local.caveatSmall':
    'It fits, but with a large context window the memory goes quickly. If the machine has no dedicated GPU, expect several seconds per answer.',
  'local.caveatComfy':
    'Without a dedicated GPU, an 8B on CPU takes around 5–15 s per answer: fine for the screen, too slow to follow a live conversation.',
  'local.caveatBig':
    'RAM is not the limit any more; the GPU is. If the model does not fit in VRAM, Ollama splits it with the CPU and the speed collapses — that is when it pays to go a size down even though it fits in memory.',
  'local.vramNote':
    'Your graphics card’s VRAM —the figure that really decides whether a model runs fast— cannot be read reliably from here, so **it is not estimated**: these recommendations are based on RAM. If the model does not fit on the GPU, Ollama splits it with the CPU and it goes much slower, even though it fits in memory. Names change over time; the live list is at `ollama.com/library`.',

  // ───────────────────── Asistente · instalación ─────────────────────
  'wiz.whereToGet': 'Where to get it: {where}',
  'wiz.backPlain': 'Back',
  'setup.noWinget':
    'There is no winget on this machine, so I cannot install it for you without downloading an executable myself, and I am not going to do that. Install Ollama from ollama.com and come back: the wizard will detect it on its own.',
  'setup.installing': 'Installing Ollama with winget…',
  'setup.waitingServer': 'Installed. Waiting for the server to start…',
  'setup.running': 'Ollama is running.',
  'setup.serverSilent':
    'Ollama was installed but its server did not answer. It usually gets fixed by opening Ollama once from the start menu; then come back here.',
  'setup.tooLong': 'The installation took more than 10 minutes and was cancelled.',
  'setup.wingetFailedToRun': 'winget could not be run: {detail}',
  'setup.wingetFailed': 'winget failed (code {code}). {detail}',
  'setup.tryManually': 'Try installing it from ollama.com.',
  'setup.modelNotFound':
    'Ollama cannot find the "{model}" model. It may have been renamed; look it up at ollama.com/library.',
  'setup.pullFailed': '"{model}" could not be downloaded: {detail}',

  // ───────────────────── Skills ─────────────────────
  'sk.humanizeName': 'Don’t sound like AI',
  'sk.humanizeDesc':
    'Strips the marks of generated text: the filler formulas, the uniform rhythm and the vocabulary that gives a model away. For when the answer is going to be read out loud and has to sound like you.',
  'sk.errNoFrontmatter':
    'SKILL.md does not start with a frontmatter block between "---". Add at least a name and a description.',
  'sk.errNoBody': 'The SKILL.md has no instructions below the frontmatter.',
  'sk.errNoFile': 'The folder has no SKILL.md in it.',
  'sk.errUnreadable': 'The SKILL.md could not be read:',

  // ───────────────────── More main process errors ─────────────────────
  'err.noFirstToken':
    '{provider} did not answer within {seconds} s. If it is Ollama, check that the server is still alive (ollama ps).',
  'err.generationTimeout': 'Generation ran past the time limit.',
  'err.noVision':
    'The "{model}" model does not accept images, so it cannot read your screen. Pick one with vision in dashboard → Screen model (Claude, Gemini, or an Ollama multimodal such as qwen2.5vl or llava).',
  'err.emptyAnswer': 'The model returned no text.',
  'err.noScreenshot': 'The screen could not be captured, so there is nothing to solve.',
  'err.whisperNoBinary':
    'The Whisper executable is not installed. Download it from the dashboard (7.6 MB).',
  'err.whisperNoModel': 'The "{model}" Whisper model is not downloaded. Do it from the dashboard.',
  'err.geminiLiveNoModel': 'No Gemini Live model is available for this API key.\n{failures}',
  'err.openaiStreamFailed': 'OpenAI error: {message}',
  'err.noReason': 'the response failed with no reason given.',
  'err.noEncryption':
    'System encryption is not available; the API key will not be stored in plain text.',
  'err.audioWorker': 'The audio worker could not be started.',
  'err.workletFailed': 'The audio processor for "{speaker}" failed.',
  'err.noLoopbackAudio':
    'The screen capture returned no audio. Check that Windows has an active output device.',
  'err.micDegraded':
    'The microphone could not be opened (the meeting is still being heard): {detail}',
  'err.micFailed': 'The microphone could not be opened: {detail}',
  'err.captureUnknown': 'Unknown failure while starting the capture.',
  'notice.nowThem': 'I now answer what the other person says.',
  'notice.nowMe': 'I now answer what you say.',
  'notice.idleStop': 'Listening stopped after inactivity.',

  /*
   * ───────────────────── The model guide ─────────────────────
   *
   * It's a DOCUMENT, not a screen: `shared/model-guide.ts` generates it and it
   * opens in the browser. It lives in this same table and not in a separate file
   * because a person reads it just like any setting, and separating it would give
   * two translation mechanisms with two ways to forget a key.
   *
   * The ones painted with `raw()` in the generator carry HTML inside on purpose
   * —`<strong>`, `<code>`, `<em>`— because the emphasis doesn't fall on the same
   * word in the two languages.
   */
  'guide.docTitle': 'Which model to use',
  'guide.lead':
    'Guide generated for your machine on {date}. Picking the wrong local model costs a several-gigabyte download to end up with one-minute answers; picking the wrong paid one costs money on every sentence of a meeting. This is what fits what you have.',
  'guide.yourMachine': 'Your machine',
  'guide.gpuUnknown': 'GPU: not identified',
  'guide.gpuKnownNote':
    'That advice is about RAM, which is the only thing measured with any certainty. Your graphics card is listed above, but <strong>we do not know how much memory it has</strong>, and that is exactly the figure that decides whether a model flies or crawls — see «What this guide does not know», at the end.',
  'guide.gpuMissingNote':
    'The graphics card could not be identified, so assume the slow case: with no GPU behind it, a local model takes seconds per answer.',
  'guide.h2Decision': 'It is two decisions, not one',
  'guide.decisionIntro':
    'The app uses one model to <strong>talk</strong> —what it hears through the microphone and the system— and it can use <strong>a different one</strong> for the screen actions (<code>Ctrl+Alt+C</code> solve code, <code>Ctrl+Alt+Q</code> answer a quiz). They are split under <em>dashboard → Screen model</em>, and splitting them is worth it because they ask for opposite things:',
  'guide.thTask': 'Task',
  'guide.thNeeds': 'What it needs',
  'guide.thWhy': 'Why',
  'guide.taskChat': 'Conversation',
  'guide.taskScreen': 'Screen',
  'guide.needsLatency': 'Latency',
  'guide.needsEyes': 'Eyes and brains',
  'guide.whyChat':
    'The answer is read out of the corner of your eye while somebody looks at your face. It arrives many times per session.',
  'guide.whyScreen':
    'A problem statement has to be read off a screenshot without getting it wrong. It arrives rarely, and each time matters.',
  'guide.decisionOutro':
    'Hence the most sensible combination for a lot of people: a small local model for talking and a good paid one for the screen. The frequent thing is free and the hard thing comes out right.',
  'guide.visionWarn':
    '<strong>The screen model has to accept images.</strong> If you pick one without vision, both buttons fail with a warning instead of inventing the problem statement. On Ollama that rules out <code>llama3.2</code>, <code>qwen2.5</code> and <code>mistral</code> —they are text-only— and leaves the ones in the multimodal table.',
  'guide.h2Local': 'Local models (Ollama)',
  'guide.localIntro':
    'They cost no money and send nothing off your machine. The cost is speed, and it depends on whether the model fits on the GPU: if it does not, Ollama splits it with the CPU and the speed collapses even though it fits in memory. Rule of thumb: a model quantised to 4 bits takes about <strong>0.6 GB per billion parameters</strong>.',
  'guide.h3Vision': 'For reading the screen (multimodal)',
  'guide.thModel': 'Model',
  'guide.thDownload': 'Download',
  'guide.thRam': 'Recommended RAM',
  'guide.thNotes': 'Notes',
  'guide.pullNote':
    'They are installed with <code>ollama pull &lt;model&gt;</code> from a terminal. For your machine, the app recommends <code>{chat}</code> for conversation and <code>{vision}</code> for the screen.',
  'guide.h2Cloud': 'Paid models, cheapest first',
  'guide.cloudIntro':
    'The Anthropic, OpenAI and DeepSeek prices are verified against each provider’s official reference and are per million tokens. A token is about three quarters of a word; what you pay on each query is the context you send (your CV, the transcript, the screenshot) plus what it answers.',
  'guide.cloudGoogleNote':
    'Google’s <strong>are not reproduced here</strong>: they could not be verified against a reference with the same reliability, and in a price table an invented figure does more damage than a gap. That column points at the provider’s page on purpose.',
  'guide.thPrice': 'Price',
  'guide.thSeesImages': 'Sees images',
  'guide.h3Cost': 'What a screen press really costs',
  'guide.costIntro':
    'A screenshot is not free: the app sends it 1600 px wide, and at that resolution a high-resolution vision model bills it as <strong>around 4,800 input tokens</strong>. With a normal-sized answer, and counting the system prompt, it works out at roughly:',
  'guide.thScreenModel': 'Screen model',
  'guide.thCostEach': 'Approximate cost per press',
  'guide.costLuna': 'two thousandths of a dollar',
  'guide.costHaiku': 'half a cent',
  'guide.costTerra': 'a cent and a half',
  'guide.costSonnet': 'about 2 cents',
  'guide.costOpus': 'about 4 cents',
  'guide.costSol': 'about 4 cents',
  'guide.costOutro':
    'These are orders of magnitude, not an invoice: the real cost depends on how much context you have loaded. The practical conclusion is that screen mode is cheap even with the expensive model — <strong>what adds up is the automatic listening</strong>, which fires a query for every question it hears.',
  'guide.costHaikuNote':
    'Haiku 4.5 comes out cheaper than its price suggests because it also reads images at a lower resolution, so it spends fewer tokens per screenshot. It is the same reason it fails earlier on small print: <em>it is seeing less</em>.',
  'guide.h2Recipes': 'Recommended combinations',
  'guide.dtCost': 'Cost',
  'guide.recipe1Title': 'All local, offline and free',
  'guide.recipe1Who':
    'You are worried about anything leaving your machine, or you do not want to pay.',
  'guide.recipe1Cost': '$0, in exchange for latency and for getting screenshots wrong more often.',
  'guide.recipe2Title': 'Local to talk, cloud for the screen',
  'guide.recipe2Who':
    'The combination most people would want: cheap on the frequent thing, good on the hard thing.',
  'guide.recipe2Cost': 'You only pay for the Ctrl+Alt+C and Ctrl+Alt+Q presses. Cents per session.',
  'guide.recipe3Title': 'All cloud, the cheapest that works',
  'guide.recipe3Who':
    'You do not want to install anything and your machine cannot run local models.',
  'guide.recipe3Cost':
    'The cheapest thing that works. Conversation is almost free and you only really pay per screen press. Careful: the conversation one can be anything, but the screen one HAS to read images, and DeepSeek does not.',
  'guide.recipe4Title': 'No compromises',
  'guide.recipe4Who': 'A real technical assessment, and you would rather not gamble.',
  'guide.recipe4Cost': 'The most expensive on the list, and even so it is cents per exercise.',
  'guide.h2Unknown': 'What this guide does not know',
  'guide.unknownVram':
    '<strong>Your graphics card’s VRAM.</strong> It is the number that really decides whether a local model runs fast, and there is no reliable way to read it from the app without shelling out to system utilities. That is why the recommendations lean on RAM, which can be measured. If your GPU has less memory than the model takes, it will run much slower than this guide suggests.',
  'guide.unknownPrices':
    '<strong>Prices change, and so do models.</strong> The Anthropic and OpenAI ones are verified as of the date above; Ollama model names age. Before downloading several gigabytes, the live list is at <code>ollama.com/library</code>, and the prices at <code>platform.claude.com/docs/en/pricing</code>, <code>developers.openai.com/api/docs/pricing</code> and <code>ai.google.dev/pricing</code>.',
  'guide.unknownYourExam':
    '<strong>How well a model does on YOUR exam.</strong> Nothing beats trying it: take a screenshot of an exercise you already know how to solve and compare. It is the only figure that matters and it takes two minutes to get.',
  'guide.footer':
    'Generated by Tayori for this machine. This document is not sent anywhere: it was written to your data folder and opened in your browser.',
  // Notes of the local models.
  'guide.llama1b':
    'The bare minimum that works. Good for rephrasing and summarising, not for reasoning.',
  'guide.llama3b': 'The balance for a modest machine. It answers quickly on CPU.',
  'guide.qwen7b': 'Better on technical questions than llama3.2:3b, at the cost of latency.',
  'guide.llama8b': 'The workhorse. A good balance if there is a GPU to hold it up.',
  'guide.qwen14b': 'High quality. Without a dedicated GPU, too slow for conversation.',
  'guide.moondream':
    'Minimal vision. It describes a screen; it does not read a long statement reliably.',
  'guide.qwenvl3b': 'The small multimodal that reads on-screen text best.',
  'guide.gemma3':
    'A general-purpose multimodal. The alternative if qwen2.5vl does not convince you.',
  'guide.qwenvl7b': 'The sweet spot for the screen actions locally.',
  'guide.llava13b': 'A veteran, very well tested. Worse with small print than qwen2.5vl.',
  'guide.qwenvl32b':
    'The best you can run locally for reading screens. It asks for a real machine.',
  // Prices, vision and notes of the paid ones.
  'guide.priceHaiku45': '$1 / $5 per million tokens (input / output)',
  'guide.priceSonnet5': '$3 / $15 (introductory $2 / $10 until 31-08-2026)',
  'guide.priceOpus5': '$5 / $25',
  'guide.priceGemini': 'See ai.google.dev/pricing for the current price',
  'guide.priceLuna': '$0.20 / $1.20 per million tokens (input / output)',
  'guide.priceTerra': '$2 / $12',
  'guide.priceDsFlash': '$0.28 / $0.28 ($0.14 for already-cached input)',
  'guide.priceDsPro': '$0.87 / $0.87 ($0.435 for already-cached input)',
  'guide.priceSol': '$5 / $30',
  'guide.visionStd': 'Yes, at standard resolution',
  'guide.visionHigh': 'Yes, high resolution (2576 px)',
  'guide.visionYes': 'Yes',
  'guide.visionNo': 'NO',
  'guide.haiku45':
    'The cheapest Anthropic model and the lowest latency one. It reads screenshots, but at a lower resolution than the Claude 5s: for a statement in small print it is the first one to fail.',
  'guide.sonnet5':
    'This app’s default, and with good reason: it reads a screenshot well and answers fast. If you are only going to set up one model, this one.',
  'guide.opus5':
    'For the exercises Sonnet cannot crack. It costs twice as much per token and answers more slowly: it makes sense as a screen-ONLY model, not for conversation.',
  'guide.gemini36flash':
    'The same key works for transcription with Gemini Live, so a single credential gives you ears and answers. The price is not reproduced here because it could not be verified against the same kind of source as the Anthropic ones.',
  'guide.luna':
    'The cheapest in this whole table, by an order of magnitude. It is OpenAI’s model for price-sensitive workloads: the obvious pick if what worries you is what the automatic listening spends.',
  'guide.terra':
    'The balance between capability and cost, and the one the app sets by default on OpenAI. It reasons before answering; the app asks it for the lowest effort so that does not show up as latency.',
  'guide.dsFlash':
    'The cheapest in the whole table, by a fair margin. A 1M-token window. It does not read images, so it is NO use for the screen actions: it is the conversation option when what worries you is what the automatic listening spends.',
  'guide.dsPro':
    'DeepSeek’s big one, still below what the cheapest Anthropic model costs. It does not read images either.',
  'guide.sol':
    'OpenAI’s frontier model, for complex work. Its output is the most expensive in the table: like Opus, it makes more sense for the screen ONLY than for answering every sentence of a meeting.',

  // Failures read in Diagnostics or in the overlay, not in the log.
  'diag.logUnreadable': 'The log could not be read: {detail}',
  'err.whisperUnzip': 'The Whisper binary could not be unzipped: {detail}',
  'err.whisperNoExe': 'The whisper.cpp zip was unpacked but had no executable in it.',
  'err.sessionError': 'session error',
  'err.handshakeTimeout': '{label}: no answer within {seconds} s',
  'err.closedWithReason': '{reason} (code {code})',
  'err.closedWithCode': 'closed with code {code}',
} as const;

export type UIKey = keyof typeof en;

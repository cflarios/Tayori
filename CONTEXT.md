# CONTEXT.md — why the code is the way it is

This document doesn't explain **how to use** the app (that's [USAGE.md](USAGE.md)),
nor **where each thing lives** (that's [ARCHITECTURE.md](ARCHITECTURE.md)), nor
**what** each file does (the comments say that). It records the **reasoning**:
what was verified, what was dropped and why, and what went wrong when testing it.
Without this, the next person to touch the project —including you three months
from now— makes the same decisions again from scratch, or worse, reverts them
without knowing what motivated them.

**The four documents, and when to open each one:**

| | Answers | Open it when |
|---|---|---|
| [README.md](README.md) | What it is, at a glance | You just landed |
| [USAGE.md](USAGE.md) | How to use each feature | You want to run it |
| [ARCHITECTURE.md](ARCHITECTURE.md) | What it is and how data flows | You're going to touch code and don't know where |
| CONTEXT.md | Why it's like this | Something looks odd and you're about to "fix" it |

That last case is the important one. Much of what's here documents things that
**look** like bugs and aren't.

Written at the end of the initial build session (26 July 2026, commits
`8093c25`..`baa4e29`) and updated in the first round of adjustments.

---

## 1. Environment facts, already verified

They're checked on the real machine. **No need to re-derive them**, and several
are the direct reason for later decisions.

| Fact | Value | Why it matters |
|---|---|---|
| Windows build | `10.0.26200` | Well above 22000, so `WDA_EXCLUDEFROMCAPTURE` gives **total** exclusion from capture. The known "black rectangle instead of invisible" bugs affect builds ≤ 22000 and **don't apply here**. |
| Node / npm / git | 24.18.0 / 11.16.0 / 2.52.0 | npm 11 **blocks install scripts** by default (see §3). |
| Rust / cargo | **absent** | Hence Electron and not Tauri. |
| MSVC / `cl.exe` / `vswhere` | **absent** | No native Node module is viable without asking for ~5 GB of Visual Studio Build Tools. This is the reason for two deviations from the plan (see §5). |
| Python | 3.13.11 | Present, but irrelevant without MSVC: `node-gyp` needs both. |
| Project path | inside **OneDrive**, with **spaces** | Breaks `electron-builder` with `EPERM` and forces avoiding `shell: true` when passing arguments. |

---

## 2. Why Electron and not Tauri

The plan decided it with the user, but it's worth recording the reasoning: Tauri
gives a ~10 MB binary versus ~98 MB, but **there's no Rust installed**, and above
all the audio loopback and the invisibility would have to be implemented by hand
in Rust. Electron brings `setContentProtection`, `desktopCapturer` and native
loopback audio capture (since 31; without third-party packages since 39) working
out of the box. For a personal project, that saved work is worth the 88 MB.

---

## 3. The version matrix: why it's pinned

The versions are **not** arbitrary nor "the latest". Each one is pinned by a
concrete constraint discovered at install time. If you update one, read this
first.

- **`vite` at 7.3.6, not 8.** `electron-vite@5` declares `vite: ^5 || ^6 || ^7`.
  Vite 8 breaks the install.
- **`@vitejs/plugin-react` at 5.2.0, not 6.** 6 requires `vite: ^8`. 5.2.0 is the
  newest that still accepts Vite 7.
- **`typescript` at 6.0.3, not 7.** `typescript-eslint@8.65` declares
  `typescript: >=4.8.4 <6.1.0`. TypeScript 7 (the Go port) is out.
- **`@eslint/js` at 10.0.1**, which doesn't follow `eslint`'s version number
  (10.8.0). They're independently versioned packages.
- **TypeScript 6 deprecated `baseUrl`.** The tsconfig `paths` need an explicit
  `./` prefix, or `tsc` fails with TS5090.
- **`eslint-plugin-react-hooks@7`**: the flat config is in
  `configs.flat['recommended-latest']`. `configs['recommended-latest']` is still
  the old eslintrc format and ESLint 10 rejects it.
- **`electron-store` is out of the project on purpose.** Since v10 it's ESM-only
  (`"type": "module"`), and the main process is bundled as CommonJS. A ~80-line
  store of our own was written in `src/main/config/store.ts`; what we needed was
  trivial and didn't justify fighting the interop.
- **The Electron binary has to be installed by hand after `npm install`.** npm 11
  blocks install scripts, and Electron's postinstall is what downloads the
  binary. If `node_modules/electron/dist/electron.exe` doesn't exist:
  `node node_modules/electron/install.js`. Running **only that** script was
  chosen instead of approving all of them in bulk. `esbuild` doesn't need it: its
  binary arrives via optional dependencies.

**Main is CommonJS, not ESM.** The original reason was compatibility with native
modules (whisper, onnxruntime). That reason **disappeared** when whisper became
an external binary (§5), so today CJS stays only for interop simplicity. If some
day it's worth migrating to ESM, there's nothing blocking it anymore except
reviewing the bundle's implicit `require`s.

---

## 4. Architecture decisions and their reasoning

### The app listens, it doesn't record — qualified in July 2026

The original version **persisted nothing**, and this section warned that adding
a history would break that promise and force updating the README and the legal
considerations *at the same time*. That's exactly what happened: the user asked
for a conversation history that gets saved, explicitly choosing to include the
transcript and not just the answers.

Where the line stands now, which is what you need to know so as not to move it
again by accident:

- **The audio still doesn't touch the disk. Ever.** The worklet's chunks go to
  the engine and are discarded. There are no audio or temporary files — the only
  exception is the WAV that Whisper local needs to invoke `whisper-cli`, which is
  deleted in the `finally` of each invocation and lives in an `mkdtemp` that's
  destroyed on stop. This part is **non-negotiable**: it's what separates the app
  from a recorder.
- **The text is saved**, if `settings.historyEnabled` is on: answers and the full
  transcript, one JSON per conversation in `userData/conversations`. See
  `main/config/history.ts`.
- **It's a switch, not a constant.** Turning it off restores the old behavior
  completely: `ensureConversation()` returns `null` and not even the folder is
  created. That shape —the entry point returning `null` instead of scattering
  checks throughout the orchestrator— is what makes it impossible for a write to
  slip in by oversight.

**And the third one is MQTT.** It publishes finished answers to a broker for
something else to pick up —the case that motivated it is an ESP32 subscribed to
the topic that reacts to the answers of a quiz—. It's the **farthest** output of
the three: the phone mirror doesn't leave your network by construction, but a
broker can be on the internet, so this can take the text of your answers off the
machine and off the network. Off by default, with the warning in the section
itself, and **answers only**: the transcript isn't published, for the usual
reason.

**August 2026: the phone mirror is the second output**, and it's noted here by
the rule at the end of this section. It serves the **answers** —not the
transcript— over HTTP to the user's local network. It doesn't touch the disk and
doesn't leave their network, but while it's on there's a copy of the text
outside the protected window, so it counts as an output and the README says so
under «Legal considerations». The transcript was left out **on purpose**: it's
what the other person said, and duplicating it onto a second device for
convenience was something nobody had asked for. If some day it's added, the
README and this section get touched again in the same commit.

The legal change **isn't cosmetic**: in several jurisdictions a written record of
a conversation counts the same as a recording for consent purposes. That's why
the README no longer says "records nothing" flat out, and «Legal considerations»
now separates three things that used to go together: recording, where the audio
goes, and the policies of whatever company you're at.

**The earlier rule still stands, only the bar moved:** if someone adds export,
sync or any new output of this data, the README and this section have to be
touched again in the same commit.

### Windows

- **Three renderer entries** (overlay, dashboard, audio-worker).
- **The audio worker is a separate hidden window**, not part of the overlay, for
  three reasons: `getUserMedia`/`getDisplayMedia` only exist in a renderer;
  isolating it keeps the audio pipeline from stopping when the user hides the
  overlay; and `backgroundThrottling: false` is essential or Chromium throttles
  the timers of an unfocused window and the audio arrives in stutters.
- **`focusable: false` on the overlay.** This isn't cosmetic: stealing the focus
  from Teams/Meet is what **really** gives the assistant away, more than the
  window itself. It's shown with `showInactive()`, never `show()`.
- **Re-apply `setContentProtection(true)` on `show`/`restore`/`focus`.** Electron
  loses the flag on hiding and showing again (electron/electron#29085, half-fixed
  in #45868 but inconsistent between builds). **Don't remove that hook**: it's the
  number-one cause of leaks in this kind of app.
- **The dashboard is also excluded from capture, but in `content-only` mode.** It
  was a leak: the overlay didn't show in the recording and the settings window
  —where the API keys, the CV, the history are— did. Now the dashboard calls
  `setStealthContentOnly` (in `windows/stealth.ts`) before its first `show`, so
  DWM omits it just like the overlay. It's **`content-only`** on purpose:
  `applyStealth` (the overlay's) bundles the capture protection WITH
  `setAlwaysOnTop('screen-saver')` and `setVisibleOnAllWorkspaces`, which are
  overlay behavior —floating over the video call—; the dashboard is a normal
  window you open to configure and want to be able to alt-tab to, so it gets only
  the `WDA_EXCLUDEFROMCAPTURE` and the re-applies, not the positioning. It
  follows the same stealth switch: `setStealthForAll` routes the `content-only`
  windows down the light path, so demo mode makes both visible alike.

### The overlay controls and the click-through lock

There's a fundamental contradiction between two requirements, and the solution
isn't obvious: the overlay must **let clicks through** during a call, and at the
same time have **pressable buttons** (gear, close) and a drag zone.

`setIgnoreMouseEvents(true, { forward: true })` makes the window ignore clicks
*but still receive movement events*. That's exactly what's exploited: the
renderer listens to `mousemove`, checks with `elementFromPoint` whether the
cursor is over something marked `data-interactive`, and asks the main process to
stop ignoring the mouse only for that stretch (`useChromeMouse`).

Two details that look superfluous and aren't:

- The document's `mouseleave` is also listened to. If the cursor exits quickly
  past an edge, a last `mousemove` over a non-interactive zone may not arrive,
  and the window would be left capturing clicks on top of the video call.
- The drag is **manual** (`startOverlayDrag` follows the cursor from the main
  process with `setPosition`), not `-webkit-app-region: drag`. That property
  doesn't work with `focusable: false`, and giving up `focusable: false` isn't an
  option. The tracking runs on an interval and not on the renderer's `mousemove`
  because when dragging fast the cursor leaves the window.

### The two tabs: listen and write

The input panel has two tabs. **Listen** is the usual transcription; **Write**
is a textarea that calls `askWithText`. The answer is painted in «Suggestion» in
both cases: what changes is where the question comes from, not where the answer
appears.

Writing requires the window to be focusable, so the write tab is **the only
situation in which the overlay takes the focus**. It's acceptable because the
user asks for it explicitly, but it has three consequences that go together and
can't be separated:

- **Reverting isn't optional.** `OverlayApp`'s effect calls
  `setInteractive(false)` on switching tabs and on unmount, and
  `toggleOverlayVisibility` forces it before hiding. A window that stays
  focusable ends up stealing the video call's focus, which is exactly what the
  app exists to avoid.
- **The guard lives in the main process, not in React.** `setOverlayMouseIgnore`
  returns early if `isOverlayInteractive()`. Without it the two mechanisms fight:
  it's enough to move the cursor over a non-interactive zone for
  `useChromeMouse`'s hover to hand click-through back mid-sentence and the send
  button to stop responding. It was placed there and not in the order of React's
  effects because that order is too fragile to hold an invariant.
- **It sends `Enter`, not `Ctrl+Enter`.** `Ctrl+Enter` is a **global** hotkey:
  the main process intercepts it and it never reaches the textarea. If some day
  you want `Ctrl+Enter` to send the draft, you have to unregister the accelerator
  on entering the tab and re-register it on leaving; an `onKeyDown` isn't enough.

The warning that the overlay takes the focus is **on the tab itself**, not just
here: it's an exception to the product's central promise and staying quiet about
it would be the kind of half-truth the README works hard not to tell.

### What surfaced onto the overlay, and why

The overlay went from three controls to a good few more. The criterion for
deciding what rises from the dashboard to the overlay is a single one: **would
you need it mid-call?** The dashboard has to be opened with the gear and steals
the focus, so everything in it is, in practice, unreachable while you talk.

- **Profile chips.** `promptProfileId` already existed; it was only in a
  dashboard dropdown. Switching register is exactly what you want to be able to
  do without stopping. `custom` isn't a chip because it's edited with a textarea.
- **Quick actions** (Continue / Shorter / Follow-up / Summary). They're canned
  prompts that go through `askWithText`, the same route as the write tab:
  **there's no new path to the LLM**. They only appear if there's an answer to
  act on; "expand your last answer" with no previous answer asks the model to
  expand the void.
- **Size S/M/L/XL.** Four presets and no free resizing: the window is
  `frameless`, there are no edges to drag, and building handles of your own for a
  setting touched twice isn't worth it. `setOverlaySize` **re-anchors to the
  right edge**: the overlay lives at the top right and growing outward would take
  it off screen.
- **Relative timestamps**, not the clock time. When reviewing, what matters is
  "how long ago this was said"; an absolute time forces you to subtract in your
  head.
- **New conversation.** It aborts the in-flight answer, flushes the conversation,
  clears the `TranscriptBuffer` **and** emits `onConversationReset`. That last
  one isn't optional: the overlay has its own copy of the segments in React state
  and without the event it would keep showing the previous conversation.
- **The listen switch.** It's the app's most-used control and lived only in the
  dashboard and on `Ctrl+Shift+M`. It failed this very list's criterion: to start
  listening you had to open the window that steals the focus. Now the indicator
  **is** the control —the green dot was already there, just not pressable—,
  because two separate elements for "what's happening" and "change it" cost room
  in a bar that runs tight. The error state is also pressable: it retries.
- **The two audio sources, as switches.** They replace the read-only meters and
  answer two distinct questions that used to be split between the overlay and the
  dashboard: *what's supposed to be heard* (the lit chip) and *what's actually
  coming in* (the moving bar). The third state is the one that existed nowhere
  and is the important one: **configured but not opened** — amber chip. A
  microphone the system didn't grant produced exactly the same screen as a silent
  room. Turning off the last active source isn't silently ignored: it's explained
  that to hear nothing there's the listen button. A control that does nothing
  when pressed is indistinguishable from a broken one.
- **Which model is answering**, next to the "Suggestion" title. When reading a
  weak answer the first thing you want to know is which one it came out of, and
  with three configurable providers it's easy to believe you're on one and be on
  another.
- **Stop the generation.** `ask.abort` existed in the IPC from the start and had
  no button: the only way to cut off an answer was to ask something else, which
  is an expensive way to say "stop".
- **Answer history, with arrows.** An answer was erased by the next one and only
  recovered by opening the dashboard. The overlay keeps the last 20 and navigates
  them. Two details that aren't obvious: the list updates **by id**, because
  `answer` is emitted on every streaming tick and otherwise dozens of copies of
  the same one would pile up; and while looking at an old one **the quick actions
  disappear**, because those prompts say "your last answer" and the last for the
  model is its own, not the one on screen — offering them there would promise to
  act on what's read and would act on something else.
- **Text scale for the content only.** The four presets enlarge the window, not
  the text, so on a 4K the panel grew and the text stayed tiny. `--font-scale`
  multiplies answer, code and transcript; the bar and the chips stay fixed,
  because controls at 180% would leave the panel no room for what you came to
  read.
- **Compact mode.** It folds away what serves to *prepare* or *check* —profiles,
  transcript, shortcut footer— and leaves what serves to *read*. The bar isn't
  touched: it's from there that you expand again, and hiding the button that
  brings back what's hidden would be a trap; besides, stopping listening has to
  always be at hand.
- **The bar wraps, it doesn't clip.** With listen and sources added, at size S it
  no longer all fit: measured, 407 px of content in 354 available, and with the
  "VISIBLE" warning and the forced language, 496. What overflowed the clip was
  the button group, the X included. The buttons are grouped and the bar has
  `flex-wrap`, so the cost is paid in height —which is what there's spare of— and
  never in unreachable controls. At size S the source name is also hidden: the
  icon already tells microphone from speaker apart. The window's width **is** the
  viewport, so a media query is equivalent to "which preset is set".

### The phone mirror: getting the answer off the shared screen

The overlay solves "don't let it show in the recording". There's a case it
**can't** solve by construction: sharing the whole screen, where what's on your
monitor is on the other side by definition. It also doesn't cover a camera, nor
a second monitor someone is looking at. The only way out is for the answer not to
be on that screen, and for that you need another device.

**Server-Sent Events, not WebSocket.** The stream goes in a single direction, and
that changes the whole calculation:

- Node doesn't ship a WebSocket server; SSE is `res.write()` over the same `http`
  that already serves the page. **Zero new dependencies** for the transport.
- `EventSource` **reconnects on its own**. On a phone the connection drops every
  time the screen locks, so you have to have that loop no matter what — with
  WebSocket you'd have to write it, and that's exactly where the odd failures
  show up.
- The phone **not being able to send anything** is a property, not a shortcoming.

**The two switches are separate on purpose.** Turning the mirror on and opening
it to the local network are two distinct decisions, and the second is the one
with reach: with `phoneMirrorLan` off it only listens on `127.0.0.1`. Both start
off; publishing the text of your answers is not a factory default.

**The token changes on each startup** and that's why a link saved on the phone
expires by itself, without anyone having to remember to revoke it. It's compared
with `timingSafeEqual`, which is cheap and avoids having to justify a `===` over
a secret later on.

Three things that came out of **running it**, not reading it:

- **UDP's `socket.connect()` is async.** The first version of `routedAddress()`
  read `socket.address()` right after and threw `EBADF`, so it returned `null`
  **always**: there was still a link —it fell back to the range heuristic— and
  the failure was invisible. It's the pattern of this whole project: what doesn't
  fail loudly you have to go and check.
- **Ask the routing table instead of guessing by prefix.** The test machine had
  four IPv4s: `192.168.1.4` (the good one) and `192.168.121.1`, `192.168.52.1`
  and `172.22.128.1` from virtual adapters. By prefix they're indistinguishable,
  so ordering by ranges got it right **by chance**, depending on how the system
  enumerated them. A UDP `connect()` to a public address doesn't send a single
  byte: it just makes the system choose a route and fix the local endpoint, which
  is exactly the datum you're after. The range heuristic stays as plan B for when
  there's no default route.
- **`server.close()` doesn't close the SSE connections**, which are keep-alive:
  without ending them by hand the port stays taken and the process doesn't die.
  And the close is **async**, so a request from the same tick still gets in —
  what really shuts the door is that the token is deleted synchronously. The test
  says it that way instead of asserting that the connection is rejected: written
  the other way it passed by luck, depending on how fast the machine was.

**The QR travels as a matrix of modules, not as an image.** The dashboard draws
it with `<rect>`: nothing to add to the CSP, sharp at any size, and the
mandatory four-module margin is arithmetic of the `viewBox` instead of a CSS
border someone could remove without knowing what it was for.

**Here a dependency *was* added** (`qrcode-generator`, with no dependencies of
its own), and it's worth saying why it doesn't contradict the `electron-store` or
the Markdown-renderer decisions. Those were dropped because **what was needed was
trivial**: eighty lines of store, a fence splitter. A QR encoder isn't
—Reed-Solomon, mask selection, format bits— and above all **its failure doesn't
show**: a badly generated QR is drawn perfect and no camera reads it. Writing it
by hand would have traded 30 KB for a bug that only appears with a phone in front
of you.

### MQTT: publishing outward, and where our part ends

It's not a feature of the app for the app: it's an output toward **something
else**. The case that motivated it is an ESP32 subscribed to the topic that
receives a quiz's answers and does what its owner programmed. Our responsibility
ends at the `publish`; whatever happens on the other side belongs to whoever
built the device, and the section says so in those words.

Four decisions that aren't obvious:

- **Finished answers only.** `answer` is emitted on **every streaming tick**, so
  publishing everything that passes through the hook would fill the broker with
  dozens of messages per answer, each one a prefix of the next. A microcontroller
  doesn't want to watch a sentence grow: it wants the sentence. There's a test,
  and it was the one most needed — a mock of the client would have passed just as
  well publishing forty times.
- **Neither errors nor aborted ones.** A board that acts on a quiz's answer can't
  tell "this is an error" from "this is the answer" if they arrive over the same
  topic. Sending a failure there is asking it to act on garbage.
- **Two topics, and it's not indecision.** `<base>` carries the full JSON for
  whoever wants context; `<base>/text` carries **only the text**, which is what a
  board can use without putting a JSON parser into 320 KB of RAM. `mqttTopics()`
  lives in `shared/` so the screen can't say one topic while the broker receives
  another; and it trims the trailing slash because `a//text` is a legal and
  **different** topic in MQTT, so the subscriber wouldn't see it.
- **QoS 1 and not retained.** QoS 1 because losing the answer is the failure that
  matters: the query has already been paid for and there's someone waiting for
  their gadget to react. Not retained because a retained message is delivered on
  subscription, so a board that boots in the morning would run yesterday's answer.

**The broker password is encrypted with DPAPI**, in the same store as the API
keys. The project's rule on credentials doesn't distinguish the expensive ones
from the cheap ones: a home broker looks harmless until that password opens
something else.

**The tests' broker is real** (`aedes`, in-process, on an ephemeral port). What
has to be checked isn't that we call `publish`, it's what the subscriber
receives: with a mocked client, publishing to the wrong topic or with the wrong
payload would pass the test just the same.

### The dashboard stopped being a column

It was born as a column of cards and grew to **twelve**, from first steps to the
diagnostic log. With four it worked; with twelve, finding a setting was
remembering what scroll height it was at, and a `scrollToCard()` had to be
invented so the first-steps guide could take you to a card — a sign that the
navigation was no longer provided by the page itself.

Now there's a sidebar with nine sections and only the one you're viewing is
mounted. What you need to know so as not to undo it piecemeal:

- **The panel header is what titles it.** Cards that are unique in their section
  no longer carry `card__title` or `card__hint`: the text moved to
  `SECTIONS[id].hint`. Putting it back would say the same thing twice on the same
  screen. Sections with several cards —General, Audio, Models— do keep them,
  because there the title distinguishes one card from the next.
- **The warnings rise to the sidebar** as an amber dot, and they're exactly the
  ones that already existed inside the cards: unconfigured provider, shortcut
  rejected by Windows, inert auto-trigger, invisible mode off. There's no new
  check; what's new is that **they're visible without going in**. A sectioned
  panel hides the problems by design, and the case that forced it is the inert
  auto-trigger, whose only symptom is silence.
- **The listen switch lives in the header**, not just in its card. It's the same
  reasoning that made the overlay's indicator the control: whoever checks whether
  it's listening is because they want it to listen.
- **«What's being listened to» moved from Transcription to Audio.** It was where
  it's implemented and not where it's looked for. The price of moving it is that
  its most expensive warning is explained under Behavior, so in both places
  there's a jump (`Jump`) instead of the repeated text: splitting the dashboard
  into sections separates settings that explain each other, and that has to be
  paid for explicitly.
- **The section is remembered in `localStorage`.** The dashboard is opened and
  closed many times in a row tuning the same thing, and always returning to
  «General» forces repeating the click. The `try/catch` isn't ceremony: a storage
  that fails can't prevent the settings from opening.

**The icons are drawn by hand** in `icons.tsx`, and it's not masochism: the
dashboard's CSP is `default-src 'self'`, so nothing can come from a CDN, and
putting an icon package into a window that opens to change two settings doesn't
pay off. It's the same reason the overlay has no Markdown renderer.

### What the dashboard had saved and didn't show

Three settings existed in `Settings`, the code applied them, and **there was no
way to touch them** except editing `settings.json` by hand. It's not the same as
a missing setting: the half-finished one looks implemented until someone looks
for it.

- **`overlayOpacity` and `overlayFontScale`.** The overlay already read them. The
  second didn't even exist as a setting, and its absence was noticeable on large
  screens.
- **`HotkeyMap`.** The ten shortcuts were configurable by design and only via
  JSON. And you have to change them: a **global** accelerator takes it away from
  whatever application has the focus, so any default clashes with someone's
  editor, game or keyboard layout.

On the shortcut field, two decisions:

- **The keystroke is captured, the text isn't typed.** The format is Electron's
  (`Control+Shift+S`) and nobody should have to know it; and a badly written
  accelerator gives no error, just a shortcut that doesn't register.
- **At least one modifier is required.** It's not purism: a global shortcut with
  no modifier hijacks that key across **the whole system**. Binding `S` to
  "capture screen" would make it impossible to type the letter S in any
  application while the assistant was open. It's in `acceleratorFromEvent` and has
  a test.

And two warnings that didn't exist before, both about silent failures:
`registerHotkeys` **already returned** the rejected accelerators and nobody
picked up the list —it only came out in the log, which nobody looks at in the
`.exe`—, and two actions with the same shortcut give no error: `globalShortcut`
registers the first and returns `false` for the second, leaving a dead action
without saying so.

### The setup wizard replaced the task list

The «First steps» card was a **task list**: it said what was missing and sent you
to the section to do it yourself. That works if you already know what a provider,
an API key and a vision-capable model are. For someone opening the app for the
first time, the first step —«local or cloud»— demands knowing how much RAM they
have and whether their GPU is up to it, and nobody should have to know that to
try out an app.

The wizard **does** the steps instead of listing them: it measures the machine,
recommends a path with the reason in plain sight, installs Ollama if needed,
downloads the two models that fit that machine and settles the transcription. It
replaces the card instead of coexisting with it: they did the same job and
keeping both was guaranteeing they'd contradict each other.

**It installs with winget, not by downloading the `.exe`.** Downloading an
executable and launching it is the exact shape of a compromised supply chain, and
from the outside it's indistinguishable from the app doing something shady. With
winget we don't touch any binary: it resolves the signed package and the
elevation prompt is painted by Windows with its own face. When winget isn't there
**there's no automatic plan B, and it's deliberate**: ollama.com is opened and
the person installs it. An app that insists on installing software when the clean
path doesn't exist is exactly what we don't want to be.

Two details that cost a decision:

- **Installing isn't being ready.** The installer returns before the server
  accepts connections, so the next step —downloading the model— would fail with a
  "couldn't connect" that looks like an install failure. That's why `probeOllama`
  is polled for up to 90 s before calling the step good.
- **The voice step exists because it's the one that gets forgotten.** Whoever
  pastes a Claude key and closes is left with the app **mute**: the default
  engine is Gemini Live, which needs a Google key that person doesn't have. The
  symptom is the worst possible one —listening on, meters moving and not a word—
  so the wizard picks an engine that can actually work with what's there.

**Download sizes aren't promised.** The GB of each model can't be looked up
before starting, so it says "several GB" and the real number appears as soon as
it starts. It's the same rule as with the guide's prices: better an
acknowledged gap than an invented figure.

### «Configured» wasn't the same as «works»

The wizard exposed it, and it's the kind of failure this document exists to
record: the screen said **«you already have a key»** and two seconds later the
connection test replied **«the API key is missing»**. Both came out of the same
file.

`getPresence()` only checked that the field existed in `secrets.json`;
`getSecret()` was the one that decrypted it. A ciphertext written by another
Windows profile or by another installation **is still there, taking up its
place**, and fails to open. Result: dashboard green and every answer failing,
which is exactly the state in which nobody suspects the key because the app just
said it was fine.

Now presence is answered by attempting to decrypt. It costs two short strings and
turns a half-truth into a fact. It has a test —`secrets-presence.test.ts`—
because the failure is invisible: the broken version passes any test that doesn't
distinguish "there are bytes" from "it can be read".

### The first-steps guide

The overlay already warned that a provider was missing, but that covers **one of
four** steps and doesn't say which the other three are. The two people skipped
are exactly the ones that show up most later:

- **Test the connection.** A badly pasted key gives no symptom until the first
  question, and then the failure looks like the app's.
- **Paste the CV.** Without it the answers come out correct but generic, because
  the model is forbidden from inventing experience. It's the difference between
  the app being useful and looking worthless.

It marks itself, disappears on completion and can be hidden by hand — but the
button to bring it back stays at the end of the dashboard: hiding something
shouldn't be irreversible.

### Discretion on Windows: taskbar and process name

Two distinct things the user asked for, with very different reach:

- **Taskbar:** neither the overlay nor the dashboard appear. The overlay already
  avoided it; `skipTaskbar: true` was added to the dashboard and a
  `setSkipTaskbar(true)` re-asserted after `showInactive()` on the overlay,
  because of an Electron gotcha in `transparent`+`frameless` windows. The
  dashboard's **window title** (BrowserWindow `title` and the HTML `<title>` —
  this last one wins after the page loads, so you have to change both) leaks
  through Alt+Tab and the "Apps" section of Task Manager. It carried a neutral
  name for a while; today it carries the real brand —see the next point—.

- **Process and window name: the real brand, not a disguise.** At first
  `Audio Helper` was set in `electron-builder.yml` (`productName` +
  `executableName` + `nsis.shortcutName`) and as the window title, so a casual
  glance wouldn't say "Tayori". It was reverted on purpose (August 2026): the
  user preferred the real brand, on the argument that **the stealth that matters
  doesn't depend on this name**. What really hides the app is
  `setContentProtection` (invisible when sharing the screen); the process name
  was always **cosmetic** —proctoring software that enumerates processes detects
  it whatever it's called—, so the disguise only bought that it wouldn't stand
  out at a glance, and it didn't offset the inconsistency of the downloadable
  `.exe` being named differently from the app. Now everything is `Tayori`. It's
  reversible without breaking anything: **it doesn't touch the data boundary**
  (see the notice below).

**Rootkit-style hiding was explicitly dropped** (a kernel driver intercepting
`NtQuerySystemInformation`, or hooking `taskmgr.exe`): it's indistinguishable
from malware, antivirus flags it, it requires a signed driver or test-signing,
and it can cause a BSOD with PatchGuard. It's not the right tool for a personal
assistant, and it crosses into rootkit territory. If someone proposes it in the
future, the answer is no.

**Critical constraint to preserve:** the userData folder is `%APPDATA%\Tayori`,
and it comes from `app.name`, which Electron resolves from **`productName`**
(`"Tayori"`, set in both `package.json` and `electron-builder.yml`) and which
`app.setName('Tayori')` at the start of `main/index.ts` reinforces before any
`getPath('userData')`. `package.json` `name` stays `interview-helper` — npm wants
a lowercase id and it's only the fallback if `productName` vanished. If the
resolved name changes, the app stops finding the settings and the DPAPI-encrypted
API key: they're orphaned in the old folder, with no error to give it away. (This
section long claimed the folder was `%APPDATA%\interview-helper`, anchored by
`setName('interview-helper')` — that was wrong: the packaged app has followed
`productName` to `Tayori` since the August rebrand, and dev was unified to it too.)

### The Tayori rebranding, and where the data actually lives

The project was renamed **Tayori**. For a long time this section claimed the
rebranding *stopped* at the data boundary — that userData stayed
`%APPDATA%\interview-helper`, anchored by `app.setName('interview-helper')`. **That
was wrong.** Electron resolves `app.name` from `productName`, and `productName`
became `Tayori` in the August rebrand, so the packaged app has stored everything
in `%APPDATA%\Tayori` ever since; `setName('interview-helper')` never actually
moved the path. The evidence was in the logs: every packaged session wrote to
`Tayori`. So the folder was aligned with the brand all along, and dev was unified
to it too — a `productName` in `package.json`, so `npm run dev` resolves the same
name instead of falling back to `interview-helper`. The layers now:

| Layer | State | Why |
|---|---|---|
| Visible brand (UI, docs, model guide, MQTT client, default theme) | `Tayori` | It's what the user reads: it's *the* rebranding |
| `productName` (`package.json` + `electron-builder.yml`) → the userData folder | `Tayori` | Electron resolves `app.name` from it, so this IS the `%APPDATA%` path (`%APPDATA%\Tayori`), reinforced by `app.setName('Tayori')` |
| `package.json` `name` | **Intact** (`interview-helper`) | npm wants a lowercase id; it's only the fallback if `productName` vanished, and what release-please identifies the package by |
| `appId` (`com.interviewhelper.app`) | **Intact** | It identifies the installation for NSIS; changing it would orphan existing installations |

**`release-please-config.json` keeps `package-name: interview-helper`.** It's
cosmetic —it affects the changelog title—, but publishing cost three attempts
due to silent traps (see §12) and it isn't touched for anything.

### The dashboard opens only from the gear

Explicit decision by the user. There's no automatic opening on first launch, and
**there's no keyboard shortcut** (`openDashboard` was removed from the
`HotkeyMap`). Consequences that have to be preserved together:

- The overlay shows a setup warning when the active provider has no credential,
  because otherwise a new user is left with no clue at all. Ollama counts as
  configured without a credential.
- Opening a second instance **recovers the overlay** instead of opening the
  dashboard: it's the escape route if it was hidden with `Ctrl+Shift+H` and the
  shortcut isn't remembered.

### What's being listened to is configurable

`Settings.audioSources` (`both` | `system` | `mic`) reaches two places:
`capture.ts` (which streams are opened; with `system` microphone permission isn't
even requested) and `STTStartOptions.speakers` (which lanes the engine creates).
The second matters because Gemini Live opens **one WebSocket session per
speaker**: creating the microphone's when you're not listening would waste an
empty connection.

A nuance the UI states explicitly because it's the natural confusion: **the
auto-trigger never reacted to your own voice** — `onFinalSegment` only evaluates
`them` segments. This setting decides what enters the *context* sent to the
model, not when it triggers. Listening to the microphone is usually useful (the
model knows what you've already answered and doesn't suggest repeating it);
`system` exists for
whoever prefers that their answers not leave the machine at all.

### Audio

- **Antialiasing filter before decimating.** The first version resampled
  48 kHz → 16 kHz with linear interpolation and nothing else, reasoning that "the
  aliasing above 8 kHz doesn't affect intelligibility". **That reasoning was
  backwards and it was a real bug**: what's above 8 kHz doesn't disappear on
  decimation, it **folds** back down and lands inside the voice band. The
  sibilants (s, f, z, sh) live there, so they ended up superimposed on the
  vowels. The perverse effect is that **enunciating better makes it worse**,
  because it puts more energy into the band that's going to fold. It was detected
  because the transcription was mediocre with BOTH engines at once, which is what
  pointed to the failure being upstream of both.
  Now there's an **8th-order** Butterworth at 7 kHz. The order isn't zeal: with
  4th a 12 kHz tone came out at -23 dB, plenty audible for a recognizer; with 8th
  it drops below -40 dB. `pcm-worklet.test.ts` runs the real worklet in a sandbox
  and pins both numbers.
- **Not a single `push` inside `process()`.** It runs on the audio thread, with a
  real-time deadline. The previous version used JS arrays with a `push` per
  sample and `slice`/`splice` on every call (~every 2.7 ms): garbage for the GC
  in the worst possible place, and with Whisper and the LLM eating the CPU it
  translates into lost blocks. All the state is `Float32Array` with indices and
  `copyWithin`.
- **Two independent streams** (mic = `me`, loopback = `them`) instead of
  diarization. The speaker is deduced from the source: simpler and exact.
- **`echoCancellation` and `noiseSuppression` disabled on the microphone.** With
  cancellation on, the mic would erase part of the other side's audio, which we
  already capture separately.
- **No lane connects to `context.destination`**: it would play back the captured
  audio and create feedback with the loopback.
- **The worklet accumulates ~100 ms per message.** `process()` is called every
  128 frames (~2.9 ms): emitting on every call would be ~344 IPC messages per
  second **and per stream**.
- **The worklet is compiled from a Blob URL**, not as a file, so as not to depend
  on the hashed name Vite gives assets in production. That forces allowing
  `blob:` in the audio-worker's `script-src` (see §6).

### DeepSeek: OpenAI-compatible, and blind

Fifth provider, August 2026. Two things make it different from the other four,
and both condition where it's allowed to appear.

**Its API is compatible with OpenAI's**, so the same SDK that was already
installed is used by changing its `baseURL`. Zero new dependencies and no HTTP
client by hand. But you enter through **Chat Completions and not the Responses
API**: that one is OpenAI's, not the compatible format's. You lose `store:false`
and `reasoning.effort`, and neither is needed — DeepSeek doesn't store the
answers to retrieve them via API, and effort isn't a parameter of theirs.

**None of its models read images.** Neither the pricing page nor the API
reference mentions image input for either of the two. That doesn't make it a
worse provider, it makes it a provider **for conversing**, and the design
reflects it in three places:

- `supportsVision: false` in the catalog, which is what makes the selector mark
  it «no vision».
- **It doesn't appear in the screen-model dropdown.** That card exists to choose
  the model that has to read the capture; offering there the only one that can't
  is offering the option that guarantees both buttons fail.
- The provider **discards the capture with a log warning** instead of sending it,
  and **doesn't tell the model there's an image**. Telling it without sending it
  is inviting it to invent what's in it.

**The catalog is two ids, and R1 isn't there.** The user asked for «V4 Pro,
V4 Flash and R1», and R1 no longer exists: DeepSeek's `list models` returns today
exactly `deepseek-v4-flash` and `deepseek-v4-pro`, and its pricing table doesn't
list `deepseek-reasoner` or `deepseek-chat` either. The V4 family replaced them.
Whoever still has access to one writes it in «Other…».

The prices are reproduced in the guide because they could be verified: $0.28 per
million on Flash and $0.87 on Pro, input and output. It's between three and ten
times cheaper than anything else in the table, and that changes the recipe of
«all cloud, the cheapest that works» — with the caveat that the screen model has
to be a different one.

### Chunk capture: stitching together a prompt revealed by scrolling

The case was brought by a real user: an interviewer shared their screen with the
technical test —so it couldn't be copy-pasted— and revealed it by scrolling, so
it was never seen whole. The screen buttons were no help: each captures **one**
frame and solves, and here the prompt is spread out over time.

**The expensive part was already done, and that's why the feature is small.** The
multi-image pipeline existed in full since code mode: `AnswerEngine.pendingImages`
is an array, `attachImage` **stacks** instead of replacing, and the four vision
providers already iterate over `request.images` preserving the order. Sending
several frames in one query worked without touching a single provider. The only
thing missing was **accumulating over time**, and for the automatic-mode loop the
pattern that already existed in the audio (`armSettleTimer`) was copied.

Three decisions that aren't obvious:

- **Manual by default, not automatic.** The user asked for it and it's correct:
  whoever watches the scroll knows when there's a new chunk, and one keypress per
  chunk doesn't spend tokens on frames that add nothing. The automatic exists for
  hands-free, but it deduplicates —perceptual `aHash` in `capture/frame-hash.ts`,
  Hamming distance— because otherwise it would fill the stack with copies every
  time the scroll stops. The dedup acts **only** in automatic: in manual the user
  already chose the chunk on purpose.
- **The capture resolution isn't raised, it's guided.** The tile of a shared
  screen is usually small, and the capture is reduced to 1600 px as always.
  Capturing at more px only in this mode was considered; it was dropped for token
  cost and because the real fix is in the usage: pin the shared content to full
  screen. The notice says so in the setting and in the chip, instead of paying
  more for each frame to cover a framing the user controls.
- **It's solved as code, not as a new `ScreenTask`.** The prompt that motivates
  this is a programming test, so it reuses the `coding` profile; only the
  instruction changes (`SCROLL_SOLVE_INSTRUCTION`), which tells the model that the
  images are consecutive fragments with overlap and to reconstruct before solving.
  Adding a `ScreenTask` would have brushed up against half the app's exhaustive
  `switch`es for no gain.

### Long solutions: reading on the phone and «Continue»

A continuation of the previous case: a technical test generates a long solution
—code plus explanation— that **doesn't fit in the small overlay**. Two fronts,
and the decision was to attack both.

**The place to read a long solution is the phone, not the overlay.** The overlay
is small on purpose —it's read out of the corner of your eye, it doesn't cover
the editor— and enlarging it clashes with that. The phone mirror already existed
and already took the answers off the shared screen to a bigger device; it just
needed to be a good **reader**. It was given formatting (bold, inline code, math)
reusing the same `answer-format` as the overlay —moved to `shared/` so as not to
duplicate it—, and a **copy** button per code block, which is what turns «I read
it» into «I take it to the editor». The parsing is done in the main process and
travels already chunked, so the phone script doesn't reimplement the parser and
everything is still painted with `textContent`.

**The phone's copy can't use `navigator.clipboard`.** The phone connects over
**http** to the LAN, which is an insecure context, and there `navigator.clipboard`
doesn't exist. The fallback is the old `execCommand('copy')` on a hidden
`textarea`, which does work without https. Without that fallback the button would
do nothing precisely in the normal case.

**The phone still can't send anything**, so «Continue» is **not** triggered from
it —that would break the property that the SSE is one-directional—: it's pressed
in the overlay and the phone watches the answer grow.

**«Continue» appends to the same answer, and that's why the cap isn't raised
without limit.** Code mode's was raised (from 2200 to 4096) so most fit in one
go, but raising it to «whatever» invites rambling and makes each query more
expensive. For what still doesn't fit, `continueAnswer` reopens the same answer
(same id) and lets `consume` glue the continuation onto the end. The trick behind
why it's so small: `remember` already saved the partial as the assistant's last
turn, so the model already has it in its memory and all you have to ask is to
keep going. **Truncation isn't detected automatically** —the streaming contract
(`llm/types.ts`) only emits strings, not the `stop_reason`, and getting it out
would force touching all five providers—; the button is available on any finished
code answer and it's the user who sees whether it got cut off.

### More Whisper models, and why not all of the reference's

The speech-recognition catalog was expanded from another app's reference. Three
things from that reference **didn't make it in**, and it's worth knowing why
before trying to "complete it":

- **Moonshine isn't whisper.cpp.** It's a separate ONNX model; the local engine
  runs the whisper.cpp binary with GGML models, so Moonshine would require
  **a whole other runtime** (onnxruntime), which is a feature, not "one more
  model".
- **The Distil ones aren't in the official repo** (`ggerganov/whisper.cpp`) nor in
  its downloader. Their GGMLs do exist, but in loose repos and with irregular file
  names (`ggml-medium-32-2.en.bin`), so they carry an **explicit URL verified
  against Hugging Face**: a dead URL doesn't fail on save, it fails on download.
  `distil-large-v2` was left out because its repo returns 404.
- The **«Apple Silicon»** labels are from the Mac app (CoreML); on Windows those
  are the normal Mediums.

The catalog was moved to `shared/whisper-models.ts` —pure data— because both sides
need it: the main process to download and the dashboard for the Model Manager,
and the renderer can't import from `main/`. The by-RAM recommendation has a
**bias toward the fast**: transcription is live, and a slow model ruins the use
case even if it fits in memory.

### Interpreter mode: a profile that translates, not one that answers

It's one more `PromptProfileId`, but it breaks two of the rest's assumptions, and
that's why it's so isolated:

- **It doesn't detect questions: it translates everything.** The normal
  auto-trigger runs each utterance through the detector/classifier; the
  interpreter **skips** it and goes straight to `fire` with every closed
  sentence. And it also skips the **speaker filter** (it translates both lanes)
  and the **debounce** (designed against double-triggers of the same question, it
  would eat a quick back-and-forth).
- **Its prompt is cut off before the normal assembly.** `buildSystemPrompt`
  returns the translation prompt and that's it: no profile, no context and **no
  injection notice** —an interpreter doesn't report a hidden order, it translates
  it—. It's bidirectional with a single prompt: it names the two languages and
  lets the model detect which one each sentence comes from and render it in the
  other. That's why `PROFILES` and `RULES` **exclude** `interpreter` from their
  `Record`: the early `return` narrows the type and dead entries aren't needed.
- **The user turn also goes without envelopes.** Removing the injection notice
  from the *system prompt* isn't enough: `buildUserTurn` wraps the transcript and
  the question in `<transcripcion>`/`<pregunta>` (the rest of the profiles'
  security boundary), and the interpreter, which translates EVERYTHING it
  receives, **translated the tag names** —`<transcripcion>` → `<transcription>`,
  `<pregunta>` → `<question>`— and slipped them into the output. Out came the
  translation wrapped in translated XML. With `AnswerRequest.interpreter` the turn
  goes **raw** —only the last sentence, no envelopes and no final instruction—,
  and no defense is lost because translating is literal by design. The context to
  disambiguate is supplied by the `history`, which travels as real messages.

Two limits accepted in v1: it's **one translation at a time** (the `AnswerEngine`
only has one answer in flight; talking over it aborts the previous one), and it
**doesn't work with `gemini-audio`**, which answers instead of transcribing. The
automatic language detection is done by the model, not the STT, so a Whisper
`.en` is no good for the interpreter: you have to use a multilingual one.

### Two languages: English by default, Spanish one click away

August 2026. The app was entirely in Spanish and moves to having both, with
**English by default**.

**The dictionaries are TypeScript modules and not `.json`**, and that's the only
fundamental decision. It started with both versions embedded in the code
—`t('Listen', 'Escuchar')`— and was changed to separate tables mid-migration,
because with the amount of prose this project has the components became
unreadable. When moving them, JSON was the obvious choice and was still dropped:

> `es.ts` is declared as `Record<UIKey, string>`, so **a missing translation
> doesn't compile**. With JSON it would fall back to the fallback language and
> the failure would only show when someone came across an English sentence in the
> middle of a Spanish screen.

Everything else is identical to having two JSONs —clean components, translations
together, coverage at a glance— and on top of that there's no need to touch
`resolveJsonModule` or the configuration of two bundlers.

What the type **can't** check has a test: that the `{…}` slots match between
languages (a `{turnos}` where the English says `{turns}` comes out literal on
screen) and that no lines were copied over untranslated.

**The prompts stay in Spanish, and it's deliberate.** Translating them was
considered:

- They aren't interface text. **Nobody reads them**: the model reads them.
- They already carry an explicit and tested rule that the answer goes in the
  conversation's language, **not** the instructions' language — precisely because
  that failed once and was fixed by measuring it.
- Every decision in those prompts is documented in this file and validated
  against the Spanish text that's there. Translating them is touching the most
  finely-tuned part of the app, with twelve tests tied to concrete phrases, in
  exchange for nothing the user sees.

The two markers the user **does** read —`DUDA:` and `NO SE VE:`— already
translate themselves: the prompt itself orders them written in the quiz's
language.

**`uiLanguage` and `language` are two distinct settings**, and confusing them
would be the obvious failure: one is the interface language and the other the
speech recognizer's. Someone with the app in English interviewing in Spanish is a
normal case, not an oddity.

The first launch **follows the system language** if it turns out to be Spanish,
and from then on whatever the user chooses rules. The check looks at
`stored.uiLanguage` and not the already-resolved value, so setting English on
purpose on a Spanish Windows isn't undone on the next launch.

### The translation: what was translated and what wasn't

The app is in both languages —with a second pass that was needed, further down—.
What was **not** translated, and why:

| What | Why it stays in Spanish |
|---|---|
| The prompts (`core/prompt.ts`) | They aren't interface: the model reads them. They already carry a tested rule that the answer goes in the **conversation's** language, and every decision in them is validated against the text that's there |
| `CONTEXT_KIND_LABEL` | It labels the blocks sent to the model. Its interface twin is `CONTEXT_KIND_KEY` |
| The model names | «Claude Sonnet 5» is a proper name. What **is** translated is the qualifier, which goes separately in `ModelInfo.note` |
| The comments and these documents | They're for whoever touches the code |

**The qualifiers deserve a note** because the fix wasn't to translate, it was to
**separate**: the `label` said «Claude Sonnet 5 (rápido)», with the proper name
and the adjective stuck together. Half a label in Spanish inside an English
dropdown is one of the things that stands out most, because it's visible without
opening anything. Now the name lives in `label` and the adjective in `note`,
which is a key.

**Three patterns recurred throughout the migration**, and they're the ones to
look for when translating anything new:

- **Hand-stitched plurals.** `respuesta${n === 1 ? '' : 's'}` only works in
  Spanish. Six appeared, across the history, the mirror, MQTT and Ollama.
- **Phrases built by concatenation.** «The executable **and** the model are
  missing» joined pieces with a `' y '` in the middle; the order and the
  conjunction change between languages. They're solved with a slot and a key for
  the separator.
- **A `<strong>` splitting the sentence** to highlight an interpolated datum.
  That fixes where the emphasis goes; with `**bold**` inside the key, each
  language puts it where it belongs.

And one thing that nearly slipped through: when moving `AUDIO_SOURCE_HINT` to
keys, pointing it at the overlay's texts looked correct —same three modes— and it
said **something else**. The overlay's say *what* each source is; the dashboard's
explain *why* to pick it. A translation table invites reuse by the shape of the
key instead of by what the text says.

### What the section above took for finished and wasn't

August 2026, second pass. The app was **not** complete: there remained a
«Paused» button, a sidebar that said «Settings», the whole local-models card and
the entire model guide. All of it was visible by opening the dashboard in English
and scrolling down; none of it was caught by the compiler, because a loose string
inside a JSX is perfectly valid code.

**The type only protects what already goes through the table.**
`Record<UIKey, string>` guarantees that no key is left untranslated, and says
absolutely nothing about the texts that never became keys. That's the half of the
problem this migration doesn't cover, and the only way to find it turned out to
be looking at each file — a grep for accents leaves out «Ajustes», «Actualizar
registro» and any phrase without a single accent mark.

Four things that came out of this pass and weren't translating:

- **There were keys written and unused.** `nav.footer`, `hk.rejectedOne`,
  `about.what`, `local.forChat` and six more existed in both tables while the
  component still had its literal next to it. Translating and **wiring up** are
  two jobs, and the second leaves no trace if forgotten.
- **A missing `t()` painted the key.** `ContextSlot` showed `ctx.cvHint`
  literally below the CV slot, in both languages.
- **Saved data can't carry a language inside it.** The title of an unnamed
  conversation was written to disk as «Conversación sin título» and compared
  against that string to know whether it already had a name. Now it's saved
  **empty** and the label is put by the dashboard: whoever knows which language
  someone is looking at is the one who paints, never the one who persists.
- **`m()` could blow up building an error.** It reads the settings on every call,
  and if `app` isn't available the exception replaced the real cause: OpenAI's
  «it ran out of budget reasoning» came out as a
  `Cannot read properties of undefined`. Now it falls back to the default
  language. A function that translates error messages can't be a source of
  errors.

**The model guide also went in**, with its ~95 prose keys. Giving it a dictionary
of its own inside `model-guide.ts` —it's a document, not a screen— was considered
and dropped: two translation mechanisms are two distinct ways to forget a key,
and in the common table it inherits for free the test that the `{…}` slots match
between languages. `renderModelGuide` now takes the language, and its model notes
and prices are keys like any other.

**And the phone page stopped being «without interpolation».** It was so on purpose
—no user data touched the markup— and now it receives one thing: its dictionary,
as JSON with the `<` escaped and read from the script with `textContent`. It's
escaped even though the text is ours, because the «we wrote this ourselves»
exception survives exactly until the first key with markup inside it.

### The wizard, reviewed with someone in front of you

Second pass over the wizard, with the app open and taking notes. Five things, and
the common thread is the same: **the wizard knew things it didn't say**.

- **You couldn't go back from every step nor skip any.** Each step brought its
  own «Back» and none brought «Next», so to pass by a step that didn't apply —I
  already have the key, I already have the models— you had to run it anyway. Now
  the navigation lives in the progress bar, next to the dots, because it's of the
  same nature as them: it says where you are and lets you move. Each step's
  buttons are still its **action**.
- **If the recommended models were already there, it downloaded them again.**
  `ollama pull` on something already downloaded breaks nothing, but it's slow
  checking the manifest and leaves you watching a bar for work that isn't needed.
  Now it's detected, «already downloaded» is said next to each one, and the button
  becomes «Use these models». The comparison tolerates the implicit tag —Ollama
  lists `llama3.2:latest` for what was pulled as `llama3.2`— because an exact
  comparison would send you to repeat several gigs that are already there.
- **The voice step offered all five options to everyone**, contradicting the
  decision just made two screens earlier: whoever chose «on my machine» so nothing
  leaves had to dodge the cloud engines again, and whoever chose the cloud saw a
  150 MB download. Now what fits the path is offered, and in the cloud **OpenAI
  goes first and recommended**: it's the model its own maker points to for live
  audio, which is literally what this app does.
- **The test button was far from the keys**, and it tested **the active
  provider**: to know whether the DeepSeek key was good you had to switch to
  DeepSeek, test and come back. The question you ask yourself when pasting a key
  is «does this one work?», and it's answered where you paste it.
  `llmTestConnection` now accepts a `providerId` so it can ask about one that
  isn't the active one.
- **And Ollama enters that same card even without a key.** It was the review's
  doubt and it was resolved this way because the card isn't about keys, it's about
  «is this ready to answer?». Ollama enters that question like the rest; the only
  thing that changes is that its answer depends on the server being alive and not
  on a credential. That's why it has no text field —there's nothing to paste— and
  does have the same button.

The same «already downloaded» detection was applied to the dashboard's
local-models card, which still offered to copy an `ollama pull` of something
already on the machine.

### The version, in plain sight

Half an hour went into investigating a bug that was **already fixed**, because
nobody knew which build was running on the machine where it was seen. A number in
plain sight would have said so in two seconds.

Hence the «About» section: what the app is, the version, the author and the
license, plus a summary of what it does with what it hears. That summary repeats
—it's in the README and in every section that opens an output— and the repetition
is deliberate: it's what someone needs to know before leaving this listening to
an interview, and you can't rely on their having read the README.

### Checking for updates without electron-updater

The «Check for updates» button does **not** use Electron's standard auto-update,
and the reason is the distribution shape, not laziness:

- The app is delivered as an **unsigned portable `.exe`**, and the releases only
  attach the portable. electron-updater is designed for the **NSIS installer**:
  it needs `latest.yml` published in each release and an *installed* app that
  replaces itself. A portable can't self-install, so bringing it in would require
  changing the distributed artifact (people would install instead of using
  portable), touching `release.yml` to publish `latest.yml` + the NSIS, and
  adding the dependency. It's a product change for a convenience.
- Unsigned, moreover, each update would trigger SmartScreen just like the initial
  download, so the «silent» auto-update wouldn't be silent.

What it does instead is just enough: `main/update.ts` queries GitHub's **public
releases API** (on demand, only on pressing the button, so the 60 req/h limit
without a token is plenty), compares with `app.getVersion()` and, if there's a
new one, shows the notes and a button that opens the download **in the browser**.
Having the browser download it and not the app is the same caution with which
Ollama is installed via winget: the app doesn't download and run a binary on its
own. The version comparison is `isNewerVersion` in `shared/`, with a test —
comparing tags as strings would make `1.10.0` come out earlier than `1.9.0`.

### The idle shutoff hooked into the watchdog that already existed

The idle mode —stop listening if nobody talks for X minutes— did **not** set up a
new timer: the orchestrator already had a watchdog on an interval (every 15 s,
only while listening) that watched for silent audio, and already computed
`now - lastSegmentAt`. The feature is one more condition there: if
`idleShutoffDue(settings, silentFor)`, `audioCapture.stop()` is called and it's
announced via the overlay. Two decisions:

- **Activity = voice only** (`lastSegmentAt`, which is updated on every segment),
  not the user asking for something by hand. The case it solves is the meeting
  that's over with the assistant listening to an empty room, not someone reading
  in silence.
- **Two settings, not a `0 = off`.** `idleShutoffEnabled` + `idleShutoffMinutes`
  preserve the chosen minutes when turning off and on again, and `idleShutoffDue`
  discards a `minutes <= 0` (a hand-edited `settings.json` with a zero would turn
  off listening right at the start). Off by default: stopping listening on its own
  is a decision, not a factory value.

### Three UX things that only show on a clean machine

They came out of testing the app on a computer where nothing was configured,
which is the scenario whoever develops it never reproduces.

**«You don't have it installed» was a lie half the time.** The wizard decided
with `probeOllama`, which asks whether the **server** answers — not whether
Ollama is installed. Whoever installed it and came back with the service stopped
found the install button again, and reinstalling over the top fixes nothing. Now
they're two distinct questions: `ollamaInstalled()` launches `ollama --version`
(if the executable isn't there, `spawn` fails with ENOENT and it's already
answered) and the «installed but stopped» screen says the only thing to do, which
is open it once.

**The install showed no progress**, and it's the part that takes minutes. The odd
thing is that the main process **already emitted the messages** —«Installing with
winget…», «Waiting for the server to start…»— and nobody painted them: the
progress block lived inside the «Ollama is ready» branch, which isn't entered
during the install. It's the same pattern as `registerHotkeys` returning the
rejected accelerators that nobody picked up: the datum existed and didn't reach
the screen.

And since **winget doesn't report the percentage**, the bar can't fake one: a
fragment that runs across it is drawn. A bar stopped at 0% for three minutes reads
as «this has hung», which is exactly what happened.

**The «AI needs configuring» warning that wouldn't go away was already fixed** in
another commit —the `onSecrets` broadcast—, but it was tested with an earlier
build. It's noted because the conclusion matters: a bug reported twice isn't
always a bug that's still there, and checking the version before "fixing it" again
costs less than the fix.

### The «DUDA:» that got put on every line

Tested with a small local model, quiz mode answered **every** question with
`DUDA:` (doubt) in front. And it was asked for: the rule said «if you doubt on
one, start THAT line with DUDA:» without saying anywhere that it was the
exception.

It's the same lesson already written twice in this file —**before blaming the
model, read what it was asked**— and the same nuance about small models: they
meet the caps poorly and play it safe, so what in a large model is a nuance, in a
small one has to be said as a prohibition.

Now the rule says three things where before it said one: that the marker is the
exception and not the format, that marking everything **informs of nothing**
—whoever reads uses it to decide which ones to risk, and on every line it may as
well not be there— and that the best option always follows anyway.

### OpenAI's two engines, and the one that was dropped

August 2026. The request was «OpenAI has transcription models, and I think we'll
use `gpt-live-transcribe` by default for meetings». The two names proposed
**both exist**, verified against OpenAI's reference and against the installed
SDK's types — but only one fits here, and the reason the other doesn't fit is a
decision this project made on day one.

| Model | What it's for | Here |
|---|---|---|
| `gpt-live-transcribe` | **Live** audio: microphones, calls, streams | The `openai-live` engine, and the sensible default for meetings |
| `gpt-transcribe` | **Recorded** voice | The `openai-transcribe` engine: a VAD produces exactly that, already-closed chunks |
| `gpt-4o-transcribe-diarize` | Separating speakers | **Dropped**, see below |

**Why not diarization.** This app **already knows who's speaking**: the
microphone is «me» and the system loopback is «them», and that split is taken
deliberately from the start because the stream's source is more exact than any
diarization. A model that guesses speakers adds nothing to a datum that's already
exact. On top of that **it doesn't accept `prompt`**, so it would cost the
vocabulary bias, which is the cheapest quality lever there is here. The only thing
it would really add is distinguishing several people **within** «them» —a meeting
of four where now everything falls under the same label— and that's a **distinct
feature**, not an improvement to the transcription. If it's ever wanted, it's
designed as such.

**And why two engines and not one.** It's the same pair that already exists with
Gemini, and it answers the usual question: which hurts more, latency or errors.

| | Latency | What rules | Partials |
|---|---|---|---|
| `openai-live` | ~300 ms | Continuous streaming | Yes |
| `openai-transcribe` | ~1 s per turn | The whole turn at once | No |

The second **hears the full sentence before deciding**, so it's more accurate on
proper names and word endings. The first starts writing sooner. Neither is «the
good one».

#### The constraint that shaped the design: 24 kHz

OpenAI's real-time API **only accepts PCM at 24000 Hz**. It's not a reading
between the lines: the SDK's types say so in those words —`rate?: 24000`, *"Only
a 24kHz sample rate is supported"*— and this app's whole pipeline is normalized to
**16 kHz** because that's what Whisper and Gemini Live want.

Raising the worklet to 24 kHz to please one engine would have made the other
three worse, so the conversion lives contained in `stt/resample.ts`, and there
are two things there worth not «simplifying»:

- **Here linear interpolation IS enough**, unlike in the worklet. That case was
  decimating 48 → 16 kHz, where what's above the new Nyquist **folds** into the
  voice band — that's why an 8th-order Butterworth had to be put in. When raising
  the frequency nothing folds: **images** appear above 8 kHz, and linear
  interpolation already attenuates them. A speech recognizer lives below those
  8 kHz. Raising the frequency doesn't invent detail; it just gets the audio
  through the door.
- **The state between blocks isn't optional.** The audio arrives in ~100 ms
  chunks, ten per second and per speaker. A stateless resampler starts each block
  from zero and leaves a discontinuity at every join: ten clicks per second that
  the recognizer hears as consonants nobody said. The transcription comes out
  worse and **there's nothing in the log to hint at it**. It has a test —a ramp
  split across two blocks that must stay monotonic— and the phase is kept in
  integers because a `float` accumulating 2/3 drifts over minutes.

#### Two failures that only came out of running it, and both were the protocol's

It was written against the reference and still failed on the first attempt. It's
worth recording both because the lessons are distinct.

**The first was loud: `turn_detection`.** The first version sent
`{ type: 'semantic_vad' }` reasoning that the server cuts better by end-of-idea
than by silence. The API replied *"Turn detection is not supported for this
transcription model"* and the session didn't start. The worst part isn't the
error, it's that **the documentation showed `turn_detection: null` and it wasn't
copied**: it was replaced with something that looked better. The rule already
written for Gemini's model IDs holds just as well here — what the reference says
gets copied, not improved.

**The second would have given no error, and that's the important one.** With
`turn_detection` off, **the client closes the turn**: you have to send
`input_audio_buffer.commit`. The model emits the partials on its own, so without
the commit the transcription **shows on screen and everything seems to work** —
but a final segment never arrives, and the auto-trigger only evaluates finals.
The result would have been an app that transcribes beautifully and never answers,
without a single line in the log. It's closed with the usual `EnergyVAD`, the
same as whisper-local and with the same 700 ms, so «when a sentence ends» keeps
being decided in a single place.

Hence the engine has tests against a **real WebSocket**, and not against a mocked
client: both failures lived in what's sent over the wire, which is exactly what a
mock takes for granted. It's the same decision as with the MQTT broker.

**And hence `PROMPT_UNSUPPORTED` too.** Which parameters each transcription model
accepts can't be known from here —the documentation talks about "keyword hints"
without giving the field name— and getting it wrong **takes down the whole
session** instead of degrading. If the `prompt` is rejected, the model is noted
and it reconnects without bias: precision on proper names is lost, which is much
better than losing the transcription. Same pattern as `EFFORT_UNSUPPORTED` in
`claude.ts`, for the third time in this project.

#### What comes free and what doesn't

`openai-live` opens with `intent=transcription`, so the session **is** a
transcriber. That saves all the fight Gemini Live forces you to keep up: there
the model is conversational and is going to try to answer, hence its silence
instruction, the `modelTurn` that gets thrown away and an output paid for without
using it. Here there's no generated output.

In exchange, the app now depends on `ws` **explicitly**. It was already in the
tree —`mqtt` and `@google/genai` drag it in— but leaning on a transitive
dependency is leaning on a third party not changing it, so it's declared. It adds
no download.

### Direct audio: skipping the whole transcription

`gemini-audio` isn't just another transcription engine. It sends the turn's WAV
**to the language model itself** and receives transcription and answer in the
same call, with `responseSchema` so the API guarantees the separation and not a
regular expression.

It was born of a concrete diagnosis: with the language forced wrong, the
recognizer returned *"Are y'all gonna eat?"* from a Spanish sentence and the
model answered impeccably to something nobody said. That failure has two links,
and this engine removes the first: the model **hears** the audio instead of
reading what someone else understood.

What changes in the orchestrator, and why:

- **`STTProvider.answersDirectly`.** With that flag, `onFinalSegment` returns
  early: firing the detector would generate a second answer, this time reading the
  text. Whoever decides if something deserved an answer is the model that heard
  the audio, and that's why the `autoTriggerIsInert` warning doesn't apply here
  either.
- **`AnswerEngine.present()`.** The answer wasn't requested by the answer engine,
  but everything afterward —broadcast to the overlay, conversation memory, history
  on disk— has to be identical. That's why it enters through the same place
  instead of being broadcast loose from the orchestrator.
- **The context is passed as a function, not as a value.** The engine consults it
  on every turn; between startup and the third question the profile or the memory
  have already changed.

**The VAD is still needed.** Someone has to decide when the turn ends; this isn't
streaming. That's what Gemini Live is for.

### Transcription

- **One Gemini Live session PER SPEAKER.** More connections than mixing the
  streams, but it's what keeps the attribution exact; a single session with mixed
  audio would give an indistinguishable transcript.
- **Known compromise with no solution:** the Live models are conversational, not
  pure transcribers, and **they're going to try to answer**. It's mitigated with
  `responseModalities: [TEXT]` (the cheapest output), a system instruction asking
  for silence, and discarding `modelTurn` entirely. The Live API **doesn't allow
  disabling generation**, so a small output cost is paid. If it ever allows it,
  remove the patch.
- **Reconnection with backoff**: the Live API closes long sessions by design. An
  `onclose` is normal, not a failure.
- **`finalizeOpen()` in the buffer** closes segments the engine left open: Gemini
  doesn't always mark `finished` when someone simply goes quiet, and a segment
  open forever would block the auto-trigger.
- **The context packs have type and profile, not just a name.** The first version
  were free-text boxes: all active at once, all dumped into the prompt under a
  `## Name`. That left two things to the user that weren't theirs to handle.
  The first, **remembering to enable and disable** when switching meeting type.
  Now each pack declares in which profiles it applies —empty means always, which
  is what preserves the old packs— and switching from «Interview» to «Meeting» in
  the overlay changes the material too.
  The second, and more expensive: **the model couldn't tell what each block was**.
  A CV is the source of truth about someone; a job offer says where to align the
  discourse; a prepared answer must be **reused**, not paraphrased. Without that
  distinction, an answer the user had carefully drafted came out watered-down and
  generic. `KIND_INSTRUCTIONS` in `prompt.ts` gives each type its own instruction.
  The `vocabulary` type is the only one that **doesn't enter the prompt**: its
  place is the speech recognizer, and in the prompt it would only spend context
  window.
- **`customVocabulary` fed from the context packs.** A CV and a job description are
  full of proper names and acronyms, which is exactly what a general-purpose ASR
  transcribes badly. **For a while it was only passed to Gemini**: whisper.cpp
  accepts the same bias via `--prompt` and it wasn't being used, wasting half the
  value of a feature that already existed.
- **Beam search (`-bs 5`) in Whisper.** It's the lever that helps most with a
  strong accent: instead of keeping the most probable token at each step, it
  maintains several hypotheses and picks the best full sentence. It was measured
  before adopting it, because intuition said it would be expensive: 494–611 ms
  with beams versus 498–563 ms greedy, i.e. **within the noise**. On short turns
  the encoder step rules —constant, 30 s window— and the decoding barely weighs.

### Answers

- **The assistant remembers its own turns, and that had to be added.** The first
  version sent each query as a **single** turn: system prompt plus one user
  message. The model's previous answers never came back. The transcript didn't
  make up for it, because it only contains voice —microphone and system—, never
  what was generated.
  The symptom, taken from a real conversation: 90 seconds after having said *"I
  work in sales"*, the assistant answered *"I have no information about what my
  profession is in this conversation"*. And it forgot a name it had just been
  assigned in under a minute.
  Now `AnswerRequest.history` carries the last 8 exchanges and **each provider
  sends them as real messages** (`user`/`assistant`, or `model` in Gemini), not
  summarized inside the prompt: it's what makes the model treat them as things it
  said. Only the turns completed with text are saved —an aborted answer isn't
  something the model said— and "new conversation" clears them, which is exactly
  what that button exists for.
- **`manualContextSeconds` is NOT the memory**, even though it looks like it. It's
  how many seconds of transcript accompany the question. With the value at 10 the
  model received little more than the sentence in progress; the conversation's
  memory is `history`'s business. The dashboard label was changed to "voice
  window" because "context sent" invited exactly that confusion.
- **`AbortSignal` is mandatory in `LLMProvider`'s signature, not optional.** If
  the interviewer asks something else while the previous answer is being
  generated, it has to be cancelled: a stale answer is **worse than none**,
  because the user reads it and answers something that already passed. A single
  answer in flight, an invariant guaranteed by `abort()` at the start of `ask()`.
- **60 ms throttle when broadcasting the text.** Without it, each token would be
  an IPC message and a React re-render: hundreds per answer.
- **`cache_control: ephemeral` on the system prompt.** The CV and the job
  description don't change during the interview, so that prefix is cached and the
  following calls cost ~10% on that part. Minimum 512 tokens on Opus 5 for the
  cache to be created; below that it simply doesn't cache, no error.
- **The prompt was designed under a single constraint:** the answer is read out
  of the corner of your eye while someone looks you in the face. Hence the maximum
  of 4 bullets, the ban on preambles, and the rule not to invent data outside
  `<contexto>` — a generic answer is recoverable, a detected lie isn't.

### Prompt injection: the envelope and the rule

Four of the things that enter the prompt **are written by someone else**: the
transcription, the question that comes out of it, the `<contexto>` —a CV you write
yourself, a job offer you paste from someone else's listing— and whatever is read
in a capture. None needs a dedicated attacker to bring an order: the prompt of an
exercise in fine print is enough.

**Two defenses, and both are needed.** `core/untrusted.ts` disarms the envelope's
tags and throws away the invisible characters; `INJECTION_RULE`, in the system
prompt, says what's inside is reported material and never instructions. Without
the first, the rule is dodged by writing `</transcripcion>` and continuing outside
the envelope. Without the second, the envelope is two tags the model has no reason
to respect.

**What was dropped: filtering phrases.** Deleting «ignore previous instructions»
and company doesn't work —it's paraphrased, the language is switched, the sentence
is split— and here the false positives genuinely hurt: this app is used in
technical interviews, and whoever interviews in security is going to say that
phrase out loud as a topic of conversation. Deleting it would break the app in the
interview where it's most needed, and would leave the transcript the user reads
saying something different from what was said. That's why `looksLikeInjection`
**marks and doesn't delete**: it puts a notice inside the envelope. A false
positive like that costs nothing, because it reminds the model of something that
was already true.

**The rule requires warning, not just not obeying.** Staying quiet about an order
hidden in a capture leaves someone reading a weird answer without knowing why it
is one; the usual criterion in this project.

**Three places where the foreign text slipped outside the envelope**, and it was
what took some finding:

- **The conversation's memory.** `request.history` travels as real `user`
  messages —that's what makes the model treat its previous answers as its own—
  and therefore with no envelope around it. An order stopped in `<transcripcion>`
  came back clean in the following query. It's disarmed in `remember()`, which is
  the only door to that memory; the disk history keeps the literal text, which is
  what you have to be able to re-read.
- **A context pack's name**, not just its content.
- **The skill.** A skill IS instructions, so it doesn't go in a material
  envelope; what's taken from it is the ability to close `</instruccion_activa>`
  and keep writing as if it were the system message. A `SKILL.md` is installed by
  copying a folder someone hands you.

**The user turn was unified because of this.** It was copied across the five
providers. While it was formatting, the duplication was bearable; being a security
boundary, it wasn't: a defense you have to remember to repeat in five files —and
in the sixth the day a provider is added— is a defense that's going to be
forgotten. Now it comes out of `llm/user-turn.ts`, and the `sendsImages` parameter
preserves the difference that already existed (DeepSeek doesn't send captures, and
announcing one it hasn't received is inviting it to invent the prompt).

What the tests **can't** assert is that the model obeys the rule. What is checked,
and it's what is checked, is that the order can't get out of its envelope in any
of the five providers.

### Skills: the third thing that enters the prompt

August 2026. There were already two ways to influence the answer —the profile and
the context packs— and the request was a third. The obvious risk was ending up
with three mechanisms that do the same thing with different names, so the first
thing was to delimit what each one decides:

| | Decides | If missing |
|---|---|---|
| Profile | The **shape** | The answer doesn't fit in the panel, or the code comes out without code |
| Context pack | The **material** | Correct but generic: it's not yours |
| Skill | The **manner** | Correct and yours, but sounds generated |

That third row is the one that had no answer before, and it's an expensive failure
in this particular app: **the answer is read out loud**. The model's tics
—«it's important to highlight», the pairs of adjectives, the summarizing
close— stand out far more spoken than written.

**The format is Anthropic's and is implemented by hand.** A folder with a
`SKILL.md`, frontmatter with `name` and `description`, body in Markdown. Choosing
a format that already exists is what makes a skill written for another tool work
as-is, and not bringing a dependency to read it is the usual rule: splitting on
`---` and reading two keys is thirty lines, and its failure **shows** —the skill
doesn't load and says so—. It's the same boundary that left out `electron-store`
and that did justify the QR encoder, whose failure was invisible.

The parser accepts continuation on indented lines —a real `description` doesn't
fit in 80 columns— and **ignores keys it doesn't know**, so a SKILL.md with
another tool's fields doesn't fall over for bringing extra.

#### The distribution of authority, which is what makes it work

The design decision is here and isn't obvious: the skill **adds to** the profile,
goes **last** in the system prompt, and carries its precedence **written out**:

> It rules over HOW it's said. It does NOT change the format. Where they disagree
> on the MANNER of writing, the skill wins; where they disagree on the SHAPE, the
> format rule wins.

Without that sentence, a tone skill and format rules that carry the word
«mandatory» on top contradict each other as soon as the first asks for something
the second limits, and **the tie is broken by the model in silence**: different
depending on the provider and on the sentence, which is the worst kind of
behavior — the one that can't be reproduced or explained.

It goes last, even after the context, because it's the position the model attends
to most strongly and because a skill exists precisely to correct the manner of
writing the rules above bring. Placed earlier, it dilutes.

#### Four decisions that look like cutbacks and aren't

- **A single active skill.** Two instructions about how to write contradict each
  other soon —one asks for short sentences, another for a careful register— and
  the result would depend on the order in which they were on. With one, what you
  read is what was asked for.
- **The format's scripts and assets are ignored.** It's not a pending phase:
  running a script that's in a data folder is running unreviewed code, in the
  process that has the API keys decrypted. The day it's wanted, it's designed with
  that sentence in front.
- **`/skill` only works by writing, not by speaking.** A «/humanize» said out
  loud arrives from the recognizer as «humanize» or as «slash humanize» depending
  on the engine: recognizing it there would be guessing.
- **The prefix only counts if the skill exists.** If any `/word` were treated as
  an invocation, writing «/etc is full of configuration» would lose the first word
  and the model would answer something else **without anything warning of it**.
  With the list in front, what doesn't match stays as text. It has a test, because
  it's the silent failure of this feature.

#### And two that cover silent failures

- **A broken skill is listed anyway, with its reason.** Disappearing without
  saying anything leaves someone staring at a folder that does exist. And
  `getSkill()` returns `undefined` for broken ones, so an `activeSkillId` pointing
  at a folder someone broke **behaves as if there were no skill** instead of
  sending half a prompt.
- **An empty body is the only real error.** Without `name` the folder id is used
  and without `description` the list looks bland, but both work. A skill without
  instructions does **nothing** and would appear on in the dropdown saying the
  opposite.

**The skill also enters `gemini-audio`.** With that engine the answer is written
by the recognizer, so if it had been left out there would be an engine where
turning on a skill does nothing — and from the screen the two cases look
identical.

### The heuristic's ceiling, and the missing step

`AutoTriggerMode` promised `heuristic+classifier` **from day one in the type**,
and that code didn't exist. It was implemented in August 2026, pushed by a
concrete case, taken from a real conversation:

> «Someone who knows DevOps should also know security.»
> «If a person knows DevOps, they'd necessarily have to know security.»

Both are **questions**: whoever says them is waiting for an answer. And both
arrive from the recognizer as affirmative sentences, without a mark and without
any interrogative. The natural reaction is to add markers to the list, and it's
the wrong one: **what makes them questions isn't in the lexicon**. It's that
they're statements directed at someone who expects an answer. No word list is ever
going to catch it, and adding «should» was already tried and dropped because it
triggers on «I think I should have studied more».

So `question-detector.ts`'s ceiling wasn't a lack of rules: it was the method.
Hence the second step, which asks the model.

Three rules make it viable, and all three matter:

- **Only the doubt is escalated, never the certainty.** A filler word or a
  two-word phrase are discarded for free. Paying for a query so a model confirms
  that «okay, perfect» isn't a question is throwing money away.
- **It never blocks.** Its own 8 s clock and `AbortSignal`. If the model is slow
  or fails, the verdict is «it wasn't a question» and everything continues as in
  `heuristic`. A downed classifier can't leave listening hung.
- **It costs, and it's said on screen.** It's one more query per ambiguous
  utterance, and on a model that reasons it isn't even cheap. That's why it isn't
  the default value.

**The `ambiguous` field, and why it isn't `reason`'s text.** The first version
decided whether to escalate by comparing the prefix of the reason string, and a
test caught it as soon as it was written: strict mode's reason starts the same, so
the decision depended on how **a message** meant to be read by a person was
**worded**. It's the same lesson already written for the providers' errors —they're
distinguished by class, not by string— applied to a new place.

Along the way it was decided that **`strict` also escalates**. The sensitivity
governs how much the heuristic risks; the mode governs whether the model can weigh
in. Strict + classifier is in fact the most precise combination there is: zero
guessing by words, and the model resolving the doubts.

### Asking isn't questioning, and half the people ask

From the log of a real test, ten seconds apart:

    20:04:58  discarded (no markers): "Explica un poco el rol de un SRE"
    20:05:08  firing (question mark): "¿Podrías explicar un poco el rol de un SRE?"

Both ask for exactly the same thing. Only the second is **phrased** as a question,
and there was the failure: the heuristic had `explícame` but not plain `explica`.

**And it was a cross-language asymmetry that had been there from the start.** In
English the bare imperatives were already covered —`explain`, `describe`, `tell`
live in `INTERROGATIVE_OPENERS`— and in Spanish only the forms with a pronoun were
recognized. Whoever says «explica» without the «me» is asking for the same thing.

`IMPERATIVE_OPENERS` adds them with two conditions that do matter:

- **Only at the start of the utterance.** These verbs are identical to the third
  person of the indicative, which appears all the time: «el informe explica
  que…», «ese diagrama resume bastante bien». At the start it's almost always a
  request; in the middle, almost never. There's a test for both faces.
- **They also count in strict mode.** Asking for something is as explicit as
  questioning it; not carrying a question mark doesn't make it doubtful.

Four verbs were left **out on purpose**, and nobody should add them later:
`cuenta` (it's a noun, and «cuenta con» means something else), `indica` («indica
que…» in the third person is the normal thing), `desarrolla` («desarrolla
software») and `habla` («habla muy rápido»). It's the same criterion that left
out «debería».

**What this doesn't fix**, and you have to know it: it covers the imperative form,
which is frequent and cheap to detect. Requests that are neither questions nor
imperatives —a statement thrown out for you to rebut— still need the classifier. A
list of verbs has the same ceiling as a list of interrogatives; it just has it a
little higher up.

### The sentence that came out twice

It was seen on screen before in any test, and the signature said it all:

    ¿ Qué opin as del concepto de Ops? … ¿Qué opinas del concepto de Ops? …
      └── accumulated partials            └── the full turn, again

Two chained failures, both from the `openai-live` engine:

- **The `delta`s are incremental and the `completed` brings the WHOLE turn.** The
  buffer concatenates because its contract says everything is incremental —it is
  in Gemini Live—, so the final got glued behind what was already accumulated.
- **And the first copy came out with the words split** («conoz ca», «ingen
  ieros») because `joinFragments` inserts a space when neither of the two sides
  brings one, and OpenAI's deltas are token fragments.

It's fixed where the protocol is known: the lane accumulates its own deltas
**raw** and marks what it emits as `cumulative`, so the buffer replaces instead of
concatenating. The alternative —having the buffer guess by comparing prefixes— is
the kind of heuristic that fails the day someone repeats a sentence on purpose.

The lesson for the next engine: **before emitting, check whether the provider's
partials are incremental or cumulative.** There's no standard, and the two in this
app don't match.

### Code mode: why it's a separate path and not just another prompt

The request was simple —"if I have LeetCode on screen, give me the solution"— and
the temptation was to solve it with a new profile in `PROFILES` and that's it.
It's not enough, and it's worth knowing why before "simplifying it":

- **The whole project's format rules prevented it.** `BASE_RULES` says a maximum
  of four bullets, no paragraphs, and that each bullet can be read out loud in one
  go. All of that is correct for speaking and lethal for an algorithm: with those
  rules in place the model returns the summarized approach and **no
  implementation**. That's why `RULES` became a `Record<PromptProfileId,…>`:
  `coding` replaces the rules, it doesn't add to them. If some day someone
  "unifies" that into a single constant, code mode stops giving code.
- **The token cap too.** 700 cuts a Java solution off mid-function, and a
  truncated implementation is worthless. `MAX_CODE_TOKENS` is 2200. The cap is
  chosen by the mode, and the mode is activated by **two** paths: the `code`
  trigger and the `coding` profile set by hand. Forgetting the second left the
  most obvious case —the user picks the "Code" chip— cutting off answers.
- **The question isn't in the audio.** `ask('hotkey')` takes the last closed
  utterance as the question. Here the prompt is on the screen, so that only brings
  in a stray sentence from the call competing with it. `solveOnScreen()` sends a
  fixed instruction and leaves the transcript as secondary context, which is its
  real role: sometimes the important clarification was said out loud.
- **It has to work with listening stopped**, which is the normal case: an
  exercise in front of you and no call open. Nothing in that path touches the STT.
- **It doesn't persist the profile.** Ctrl+Alt+C forces `coding` only on that
  query. If it saved it, whoever uses it in the middle of an interview would be
  left answering the spoken questions in code blocks until they remembered to turn
  it off, and remembering is exactly what they can't do in that moment.
- **Unlike `Ctrl+Shift+S`, with no capture it doesn't ask.** The normal capture
  hotkey answers even if the capture fails, because the question came from the
  audio. Here there's nothing to read, so asking would be spending a call for the
  model to confess it sees nothing.

**Capture quality: 92, not 72.** The JPEG at 72 is fine for "there's a diagram on
screen" and eats exactly what matters here: `l` versus `1`, `;` versus `:`, the
subscripts of a prompt. A misread signature produces a solution that doesn't
compile, and the symptom is baffling because the answer looks perfect. It wasn't
raised to PNG because the models scale to ~1.5k px anyway.

**The shortcut is `Ctrl+Alt+C` and not `Ctrl+Shift+X`.** A global accelerator
wins over that of the application with the focus, and whoever uses this has VS Code
in front: `Ctrl+Shift+X` would have stolen its extensions panel. `Ctrl+Shift+C`
was already taken by click-through, and `Ctrl+Alt+` is the family of the arrows
that move the overlay.

**The overlay had to learn to paint code.** It painted `answer.text` in a `div`
with `pre-wrap`; with a solution inside that leaves the three backticks in view,
splits the long lines mid-expression —which is the opposite of what you want in
code— and forces selecting by hand inside an unfocused window with clicks passing
through it. `answer-format.ts` is a minimal parser of ``` fences and nothing more:
**it isn't a Markdown renderer and mustn't become one**; putting a 40 KB library
into a window that starts on every session doesn't pay off for the only format the
prompt promises.

Its hard case isn't parsing: it's the **streaming**. The closing fence takes
seconds to arrive, so a half-written block would be painted as a paragraph and
jump style mid-answer. Hence the `open` flag, which opens the box as soon as the
opening fence arrives and hides the "Copy" button until the block closes —
copying an unclosed function is worse than not being able to copy it.

### One model to talk and another to look

There was a single model for everything, and the two tasks ask for **opposite**
things:

| | Necesita | Porque |
|---|---|---|
| Converse | Latency | The answer is read while someone looks you in the face |
| Screen | Sight and brains | You have to read a prompt in a capture and not get it wrong |

A small local model meets the first and fails the second; a large paid one the
other way around, it's expensive for every stray sentence of a meeting.
`screenProviderId` + `screenModel` separate them, and the `same` default
reproduces the previous behavior **exactly** — nobody who touches nothing notices
the change.

Two design details:

- **`screenModel` is a loose field, not another per-provider `Record`.** When
  choosing "Ollama for the screen" what you want is a **specific** model —the
  multimodal one you have downloaded— different from the conversing one even if
  the provider is the same. That's exactly the interesting case: `llama3.2:3b` to
  talk and `qwen2.5vl:7b` to look, both local.
- **The overlay's label follows the answer, not the settings.** With two models in
  play, "what this was generated with" stops being deducible from the
  configuration: it's read from `answer.model`, which is the one that actually
  wrote it.

The failure to watch for is the usual one in this project: **a model without
vision discards the images silently**. For a spoken question that just degrades
and that's it; in the screen actions the capture **is** the prompt, so the model
would invent the whole exercise and the answer would look perfect. That's why it
fails with a message there, and why the selector marks which ones see images.

### Two quiz-mode failures that were the prompt's, not the model's

They came out in the first real test, and it's worth recording the diagnosis
because the intuitive conclusion was the opposite:

- **"Qwen only answers one question."** It was asked for exactly that: the
  instruction said *"if there are several visible questions, answer the one in the
  foreground or the first unanswered one"*. It obeyed. Whoever has a quiz in front
  of them wants it whole, so now all are asked for, one line each, in the order
  they appear.
- **"It goes on too long."** Also asked for: the format had a point for the why
  and another for the distractors. With a large model that comes out short; with a
  small local one, which meets length caps poorly, it overflows. The only defense
  that really works isn't asking for fewer words, it's **not asking for the
  explanation**. Now the answer is only the answer, and the why is asked for with
  a button when needed.

The general lesson, which applies to any future adjustment of these prompts:
**before blaming the model, read what it was asked**. Both symptoms looked like
limits of a small local model and neither was.

A third detail from the same test: **a small model needs shorter rules**. The
quiz ones were rewritten as one-line imperative sentences, without the explanatory
prose they carried before; what in a large model is nuance, in a small one is
noise that competes with the format.

### The bold's asterisks: attacked on both sides

Claude marked the correct option of each quiz in bold and the overlay showed
`**B)** El índice...`, asterisks included, because the panel paints plain text.

The correction goes **in both places at once**, and neither is superfluous:

- **The prompt bans emphasis markdown** in the three profiles read in the panel.
  Without this, the marks would keep arriving and spending tokens and width.
- **`parseInline` interprets them anyway.** Because the models put them there no
  matter what you do, and relying on their obeying a formatting instruction is
  exactly the kind of assumption this document exists to disprove.

It's still **not** a Markdown renderer: only bold and inline code, and an unclosed
mark stays as literal text — a necessary condition during streaming, where `**B`
arrives before its partner and nothing can disappear from the screen.

### Quiz mode and the doubt rule

A quiz isn't answered like an algorithm, hence a separate profile and not a
parameter of the code one. What `QUIZ_RULES` governs is that **each line is an
answer and nothing more**: number, letter and text of the option, no preamble. The
rest —the why, the distractors— is asked for with a button, for the reason the
previous section explains.

There are two line markers, and both exist because they change what the reader
does: `DUDA:` when the model isn't sure, and `NO SE VE:` when not all the options
of that question could be read in the capture. The second avoids the worst
possible result, which is a confident answer based on half a question.

The rule that matters most is the uncertainty one. A model that answers "C" with
the same confidence whether it knows it or is guessing is **worse than one that
doesn't answer**: in a quiz with a penalty for wrong answers, the reader has to be
able to decide whether to risk it. Hence the `DUDA:` prefix, which also gives the
best option anyway — refusing to answer doesn't help anyone either.

The prompt explicitly warns about the negations and superlatives of the prompt
("which NOT", "always", "the best"). It's where these questions are lost even
knowing the subject, and a model in a hurry falls just like a person in a hurry.

### Ollama trims the context without saying so, and the memory is now visible

**Ollama doesn't use the model's context window.** It applies its own, `num_ctx`,
by default **2048 tokens**, and what doesn't fit it discards from the beginning
**with no error**. With the system prompt carrying the CV, the transcript and
eight turns of memory, those 2048 run out quickly.

The symptom is exactly the one already documented once —the assistant "forgets"
what you just told it— but the cause is **another**: that time it was that the
history wasn't being sent; this one is that it is sent and Ollama throws it away.
That two distinct causes produce the same symptom is the reason this is written
here. Now `num_ctx` is sent explicitly, configurable, with 8192 by default.

The overlay's `memoria n/8` chip also comes from here. Each remembered turn is
resent **whole** in the following query, and that showed up nowhere; it's the only
part of a query's cost the user can decide on. Clearing it is different from "new
conversation": that one aborts the in-flight answer, clears the transcript and
closes the conversation on disk. This only throws away what's resent to the model.

An implementation detail that cost a read: the chip's "forgotten" is marked
**before** calling the IPC, not in the `.then`. Clearing the memory leaves the
counter at zero, and with zero the chip isn't painted — by the time the response
arrived the component was already unmounted and the notice was never seen.

### Reasoning models spend output on something nobody reads

A reasoning model in Ollama —`qwen3-vl:8b-thinking` and family— breaks two
assumptions the provider took for granted, and both silently.

**The first is where the text arrives.** The reasoning comes in
`message.thinking`, a field distinct from `message.content`, and `num_predict`
counts both together. Measured with the real code-mode prompt:

| `num_predict` | reasoning | answer | `done_reason` |
|---|---|---|---|
| 2200 (the code cap) | 6,432 chars | **0 chars** | `length` |
| 8000 | 23,329 chars | 589 chars | `stop` |

With the usual cap the model ran out of budget **thinking**. The stream ended
clean, no error, so the app fell into its "the stream ended with no text" branch
and said *"The model returned no text"* — true and completely useless. The
reasoning was 10 to 50 times longer than the answer, so it isn't fixed by raising
the cap a little: the models that think carry `THINKING_BUDGET_TOKENS` **on top
of** whatever they spend answering.

**The second is the clock.** `FIRST_TOKEN_TIMEOUT_MS` kills the query if nothing
has come out in 45 s, and here the first character took **62.8 s** in the worst
case measured. Without touching that, fixing the budget would have been no use:
the query died just the same, only with a different message. That's why the
provider emits an **empty heartbeat** as soon as it sees the first chunk of
reasoning: it tells the engine "I'm still alive" without painting the
deliberation in the overlay, which is a panel read out of the corner of your eye
while someone looks you in the face.

**`think: false` isn't the way out.** It was tested against this same model and it
kept reasoning 7,364 characters. There are models that only know how to think, so
the option to turn it off wasn't implemented: what was done was to make room for
them.

The detection is by name **and learned on the fly**, the same pattern as
`EFFORT_UNSUPPORTED` in `claude.ts`: the list of hints ages —tomorrow one comes
out that thinks and isn't called "thinking"—, so the first query discovers it via
the `thinking` field and the following ones already go out with a budget.

### The model catalog is a suggestion, not a boundary

`CLAUDE_MODELS`, `GEMINI_MODELS` and `OPENAI_MODELS` are written in the code, so
they age: each new model from the provider took **however long an app version
took** to become usable, even if the account already had access. The list is still
the first thing you see —it's what almost everyone wants and it avoids typing an id
from memory— but now it has an «Other…» option that opens a text field.

**With Ollama it isn't offered, and it's not an oversight.** That list isn't a
catalog of ours: it's what the local server reports it has downloaded. Writing
there the name of a model that isn't installed doesn't install it, it just
produces an error later and farther from the cause.

Two things that had to be fixed for this to work:

- **The auto-fill overwrote the hand-typed id.** The effect that loads the list
  repaired the setting when the saved model *wasn't in the list*, which was
  correct when the list was the only possible source. With hand-typed ids, that
  replaced the typed model with the first of the catalog on the next opening of
  the dashboard. Now the condition is "it's empty". The case that motivated the
  original fix —Ollama with `""`, which failed with "no model selected"— is still
  covered; the new one isn't. Changing someone's model behind their back is bad
  with a local one and worse with a paid one.
- **`normalizeModelId`, and it's not cosmetic.** An id copied from a documentation
  page is pasted with a space after it. The provider responds 404 and the message
  that arrives is "the specified model doesn't exist", which sends you to look for
  the right model when the model was already the right one. No provider accepts
  spaces in an id, so they're removed on typing. It has a test.

The field is in monospace for the same reason: what's written there is compared
character by character against the provider's id, and in a proportional font a `1`
for an `l` doesn't show.

The familiar face of the controlled `<select>` is still watched for here: while
the list loads it's empty, and without the `models.length > 0` check **everything**
would look hand-typed, so the text field would appear and disappear by itself on
every opening. It was verified by sampling the DOM every few milliseconds after
switching provider.

### The model guide is a document, and not another window

The dashboard card answers *"what do I set?"* in two lines. The neighboring
question —*"and why, and what else is there, and how much does it cost?"*— needs
tables, tiers and price comparisons, and in a settings column that's a wall nobody
reads.

It was solved by generating a self-contained HTML and opening it with the system
browser. **An Electron window of its own was dropped for this project's golden
rule**: every new window has to be registered in the capture protection, and
invisible mode is verified, not assumed. A document doesn't have that risk, and on
top of that it's saved, printed and consulted with the app closed — which is how a
price table gets read.

The renderer lives in `shared/` and is a pure function from `SystemSpecs` to
string, so it has tests: that it escapes what comes from the system (the CPU and
GPU names are given by the OS and end up inside the HTML), that it puts in no
`<script>` or external references —it opens from `file://` and can't depend on the
network— and that it covers the three things it set out to: local by compute,
multimodal and cheap cloud.

**On the prices, two rules.** Anthropic's were verified against their official
reference instead of writing them from memory, and the document carries a date
because they expire. Google's are **not reproduced**: they couldn't be verified
with the same source, and an invented figure in a price table is worse than a
pointer to the provider's page. That asymmetry is explained in the document itself
instead of being disguised.

The datum that was hardest to gather and the most surprising is the real cost of a
screen press: a 1600 px capture is charged as **~4,800 input tokens** on the
high-resolution vision models, which leaves screen mode in cents even with the
expensive model. The practical conclusion is the opposite of the intuition:
**what fattens the bill isn't the buttons, it's the automatic listening**, which
fires a query for every question it hears.

The note about Haiku 4.5 also comes from here, which looks like the obvious
bargain: it's cheaper *and* spends fewer tokens per capture because it reads it at
lower resolution. It's exactly the same reason it fails sooner with fine print —
it's seeing less.

### Recommending a local model without inventing the data

"Which Ollama model will do well for me?" has no generic answer: the same model is
instant with a GPU and takes a minute without one, and getting it wrong costs a
download of several gigs. The guide measures RAM, CPU and GPU and recommends two
models, one to converse and another for the screen.

**What it doesn't do is estimate the VRAM**, and it's deliberate. It's the number
that really decides whether a model fits in the card, and there's no reliable way
to read it from Electron without invoking system utilities. A recommendation
propped on an invented figure is worse than a recommendation with an acknowledged
gap, so the gap is acknowledged on screen.

The GPU name is extracted, and by a not-obvious route: `app.getGPUInfo` returns
numeric identifiers, but `auxAttributes.glRenderer` brings the ANGLE string
—`"ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 …)"`— from which the
commercial name can be extracted without depending on anything external.

**That string is written by the driver, and not all of them write it the same.**
With recent NVIDIA drivers the PCI id arrives stuck to the name —`"NVIDIA GeForce
RTX 5070 Ti (0x00002C05)"`— and it slipped whole into a line read at a glance.
`cleanRenderer` removes it, and it has a test: the pattern is scoped to what looks
like a hexadecimal id precisely so as not to take out the parenthesis of an
`"Intel(R) UHD Graphics 620"`, which is part of the name. The id is removed and
not hidden behind anything because it doesn't answer that card's only question
—which local model suits this machine—, just as the VRAM that can't be measured
isn't estimated.

The tiers come from a simple rule: a model quantized to 4 bits takes ~0.6 GB per
billion parameters, plus the system and the context window. Hence a 7B asks for
~8 GB free and a 14B is around 16 GB. Model names age, so the dashboard shows the
command and points to the Ollama library instead of promising they'll always
exist.

### Facts of the Claude API, verified against the reference

Three came out **different** from what would have been written from memory. If
some day the code looks "incomplete" on these points, it's deliberate:

1. **`temperature` / `top_p` / `top_k` return 400** on Opus 5 and Sonnet 5.
   They're removed. Style is controlled by prompt.
2. **Thinking is on by default in Opus 5.** The latency lever is
   `output_config.effort: 'low'`, **not** disabling it: disabling it has two known
   bugs (tool calls emitted as plain text, which never execute and give no error;
   and `<thinking>` tags leaked in the visible answer).
3. **`stop_reason: 'refusal'` arrives as HTTP 200**, not as an exception. You have
   to check it explicitly or the overlay stays blank for no reason.

Correct model IDs: `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5`.

**Fourth fact, learned the hard way:** point 2 was verified against Opus 5 and
applied to all three models. `output_config.effort` is **generation 5**'s, and
Haiku 4.5 returns `400: "This model does not support the effort parameter"` — so
Haiku failed on ALL questions while Opus worked, a pattern that makes no sense
from the outside. `EFFORT_UNSUPPORTED` in `claude.ts` carries the list and also
**learns on the fly**: if a future model also rejects it, the first request
detects it, retries without the parameter and the following ones come out fine.
The general lesson is that a parameter verified against one model isn't verified
for its family.

### ChatGPT goes through the Responses API, and it's not a preference

The OpenAI provider (August 2026) was requested as «add ChatGPT». What isn't
obvious is that the choice of **API** decides more than the choice of provider:

- **Chat Completions doesn't let you govern the reasoning.** The GPT-5 models
  think before answering, and there's no way there to ask them to think little.
  The only latency lever that exists —`reasoning.effort`— lives in the Responses
  API, and this app is read out of the corner of your eye while someone looks you
  in the face. `low` is sent for the same reason as Claude's `effort`.
- **`store: false`, and this is what really matters.** The Responses API **saves
  by default** each answer in the OpenAI account so it can be retrieved later via
  API. That is: the provider's factory value leaves a copy of what was said in
  your interview somewhere this app knows nothing about. It contradicts the line
  §4 has been defending from the start, and that's why it's turned off in **all**
  calls, including the «Test connection» one. It has a test against a real server,
  not against a mocked client: a mock would have passed just the same sending
  `store: true`.

**And the budget trap appears for the third time.** `max_output_tokens` counts the
reasoning tokens **and** the answer's, exactly like `num_predict` in Ollama. With
code mode's 2,200 cap, a model that thinks can spend it all deliberating and
finish without writing a single character, no error. It's already documented twice
in this file —Ollama and the first-token clock— and it still had to be solved
again here, so it's worth stating as a rule and not as an anecdote:

> When a provider has a single number for «how much you can generate», you have to
> check whether the reasoning comes out of that number **before** trusting the cap.

`budgetFor(maxTokens, withReasoning)` lends 4,000 tokens separately. It's less than
Ollama's 8,000 because with `effort: 'low'` the reasoning is much shorter than that
of a local model of the *thinking* family, and because you're only charged for the
ones used.

**`reasoning` is learned on the fly**, just like `EFFORT_UNSUPPORTED` in
`claude.ts` and `KNOWN_THINKERS` in `ollama.ts`. The models without reasoning —a
`gpt-4o` hand-typed in «Other…»— return a 400 for a parameter the user doesn't
know is being sent, so **all** their questions would fail: it's Haiku 4.5's bug
traced over. The first request discovers it, retries without the block and the
following ones come out fine.

**The catalog is the three GPT-5.6, and the names don't help.** «Sol», «terra» and
«luna» don't say which is the big one —unlike `mini`/`nano`, or Haiku/Sonnet/Opus—
so each one's role **has to be gone and read** instead of deduced, which is exactly
the kind of assumption this document exists to disprove. Verified against OpenAI's
reference:

| Model | What it is | Price (input / output per million) |
|---|---|---|
| `gpt-5.6-luna` | Cost-sensitive workloads | $0.20 / $1.20 |
| `gpt-5.6-terra` | Balances capability and cost | $2 / $12 |
| `gpt-5.6-sol` | Frontier model, complex work | $5 / $30 |

All three accept **text and image**, which is the condition to be able to appear
in the screen-model selector too. That was also checked instead of taken for
granted: a model without vision there doesn't degrade, **it invents the whole
prompt** and the answer looks perfect.

**The default is Terra**, for the same reason it's Sonnet and not Opus in Claude:
this app fires a query for every question it hears, so starting with the expensive
model charges it to someone who chose nothing. Luna is of another order of
magnitude —30 times cheaper on output than Sol— and it's the right answer for
whoever watches the automatic-listening bill.

**OpenAI's prices are reproduced in the guide**, with a date, because they could
be verified against their official reference just like Anthropic's. Google's are
still not reproduced: the asymmetry isn't laziness, it's the usual criterion — a
figure that couldn't be verified does more damage in a price table than an
acknowledged gap.

### What it cost to add ChatGPT, and it wasn't the provider

The provider's file and its entry in the factory are the easy part, and the
exhaustive `never` in `llm/index.ts` makes it oversight-proof too. The expensive
part was **three places the compiler doesn't flag**, and all three have the same
shape: a hand-written condition that enumerates the providers of the time.

| Where | What happened if forgotten |
|---|---|
| `providerReady()` in the dashboard | Falls to the `else`: the «Models» section comes up with a "not configured" warning **with the key set** |
| The overlay's `configured` | The panel shows "The AI needs configuring" forever, with the provider working |
| `alreadyThere` in the wizard | Says "you already have a key" looking at another provider's |

All three decided the same question —*is this configured?*— with three distinct
conditions, and none breaks the build when adding an id: the ternary chain simply
falls to the last case. In the wizard it was replaced by indexing
`presence[choice.secret]`, which can't fall behind. The other two are still `if`
chains, and it's noted here that **they're the place to look** when adding the
next one.

Two more things that came out along the way, neither caused by OpenAI:

- **The wizard was erasing other providers' models.** The local path wrote the
  whole `llmModels` map by hand —`{ claude: '', gemini: '', ollama: … }`— with an
  `as` on top that let it slip through silently. Whoever tried local lost the
  model they had chosen in the cloud. The cloud path already documented exactly
  this lesson **and the other hadn't applied it**. Now it merges with whatever was
  there, and without the `as`, which is also what forces the build to warn if a
  key is missing tomorrow.
- **The secrets' IPC channel lied in the type.** `secretsSet` declared
  `key: 'anthropic' | 'google'` while the preload was already sending `SecretKey`,
  and the MQTT password had been saved through there for a while without appearing
  in that union. Nothing failed —the type doesn't reach runtime— but it was a
  hand-written list doomed to age: now it's `SecretKey`.

For Gemini Live, Google's documentation listed **three distinct model IDs** on
different pages. The API's shape was verified against the installed SDK's types
(`node_modules/@google/genai/dist/genai.d.ts`), which is the authoritative source.
`GEMINI_LIVE_MODELS` is ordered by preference: if the first gives 404 or
permission denied, try the next.

### Model mini-profiles, and why they aren't the prompt profile

A `ModelPreset` saves in one click which **engines and models** to use for a case
(interview, meeting, interpreter…): transcription engine and model, answer
provider and model, screen model and prompt profile. The temptation is to merge it
with `promptProfileId`, which is already called «profile» and already has those
names; they're distinct things and joining them breaks both. `promptProfileId`
decides the answer's **shape** (four bullets, code block); a `ModelPreset` decides
**which models** are loaded and **includes** a `promptProfileId` as one more field.
Switching prompt profile doesn't apply a preset: mixing them would make choosing
«code mode» change your model behind your back.

The delicate thing about `applyModelPreset` is `llmModels`, which is a per-provider
`Record`: it's **merged** to overwrite only the preset provider's model and not
lose the one you chose in the others. It has a test —that's exactly the silent bug:
applying an Ollama preset and losing your Claude model—.

### The favorites star only sorts, it doesn't change anything

A star in the Model Manager moves the marked local models to the top
(`favoriteLocalModels`), so you don't have to hunt for the one you usually use.
It's pure convenience: it does **not** change which is active —that's what
`whisperModel` says—, only the order. `sortByFavorite` is generic over `{ id }` and
stable (within favorites and rest the catalog's order is preserved, which already
goes from lightest to heaviest).

### The specs cache, or why two tabs loaded slowly

`getSystemSpecs()` calls `app.getGPUInfo('complete')`, which is expensive (hundreds
of ms). The dashboard requested it on **every visit** to Models and Transcription
—which remount on switching tabs—, so those two loaded noticeably slower than the
rest. The hardware doesn't change within a session, so the promise is **memoized**
(paid once) and **warmed up** on app startup, so even the first visit finds it
ready. See `system-specs.ts`.

### The little ghost: the mascot and the `.exe` icon

The mascot (`renderer/Mascot.tsx`) is the same SVG as the web —`tayori-web`—,
copied instead of sharing a package: they're two projects and it's a
self-contained file. The gradient ids go through `useId` so two mascots on the
same page don't collide their `url(#...)`.

The `.exe` icon (`build/icon.ico`, multi-size 256→16) is generated from
`build/icon.svg` with `scripts/make-icon.mjs`, and **the generator's dependencies
(`@resvg/resvg-js`, `png-to-ico`) do NOT live in the project**: they're installed
on the fly, the `.ico` is generated —which is committed as an asset—, and they're
removed. It's an asset that only changes when the mascot changes; loading two
permanent native deps for that doesn't pay off. The script documents how to
regenerate it.

### The red «detectable» frame

When stealth is off —the app DOES show in the capture— a dashed red frame appears
at the window's edge, in the overlay, the dashboard and the wizard. It's the same
state as the overlay bar's «VISIBLE», but impossible to overlook. It goes
**outside** the content: the content is set apart with a gap of the same
background color (`--bg` matches the window's `backgroundColor`), so only the red
line is seen floating, not on top of the content. The wizard is a separate render,
so it had to be given it too or it seemed to fall outside the switch —even though
the capture protection, being window-level, already covered it—.

---

## 5. Deviations from the approved plan, and why

The original plan is in `~/.claude/plans/vamos-a-crear-un-luminous-hippo.md`. Two
pieces were implemented differently. **Both meet the same requirement**; the
mechanism changed, not the objective.

### Whisper local: external binary, not native binding

The plan said `smart-whisper`. On going to install it:

- It's a native binding (`node-addon-api`) that has to be **recompiled against
  Electron's ABI** with `electron-rebuild`.
- That requires **Visual Studio Build Tools (~5 GB)**, absent on this machine.
- And it breaks on **every Electron update**.

Instead the **official whisper.cpp binary** is used (`whisper-bin-x64.zip`,
v1.9.1, **7.6 MB**) as a child process: no toolchain, no `node-gyp`, no ABI
coupling, and it's packaged without ceremony (`npmRebuild: false`). It's unzipped
with the `tar.exe` Windows 10 1803+ ships by default, so as not to add an unzip
dependency for an operation done once.

The executable is **searched for** instead of assuming its path: the name changed
between versions (`main.exe` → `whisper-cli.exe`) and the zip has no stable
structure.

**Since July 2026 `whisper-server` is used, not the CLI per turn.** The same zip
brings `whisper-server.exe`, which keeps the model loaded between requests and
accepts WAV over HTTP. Measured with the same threads and the same audio:

| | per turn |
|---|---|
| `whisper-cli` (new process each time) | ~1440 ms |
| `whisper-server` (resident model) | ~825 ms |

The CLI's ~1440 ms match the real times from a session's log (1380–1540 ms), so
the measure is representative and not from a lab.

Two things worth not confusing:

- **The CLI is still there and isn't dead code.** If the server doesn't start
  —port taken, old binary without `whisper-server.exe`— it falls back to the CLI.
  A latency improvement can't take down the whole transcription.
- **What it does NOT fix:** whisper.cpp always processes a 30-second window, so
  the encoder step costs the same with 1.7 s of audio as with 8.2 s. That floor is
  the model's, not the transport's, and it's the reason the log's times were so
  flat. Whoever wants to go below that has to touch `--audio-ctx`, at the cost of
  precision, or switch to an engine with real streaming (Gemini Live).

### VAD: energy in TypeScript, not Silero

By the same criterion. The plan said `@ricky0123/vad-web` + `onnxruntime-node`,
which is **another** native module. Silero is more precise at rejecting noise
that isn't voice, but for the only thing needed here —**knowing where a turn
ends**— RMS energy is enough, and Whisper filters out what isn't speech
afterwards.

Details that aren't optional in `core/vad.ts`:

- **Adaptive noise floor**, updated **only in silence**. A fixed threshold fails
  between a laptop mic and a headset one, which differ by an order of magnitude;
  and if it updated during speech, the voice itself would drag the floor up until
  it stopped being detected.
- **Latch rescue.** Updating the floor *only* in silence has a bug that appears
  after a while: if the background noise rises above 2.5× the learned floor —the
  fan spinning up because Whisper and the LLM are loading the CPU, or the mic's
  AGC raising gain— every frame starts counting as speech, and then the floor
  **never updates again**, because it only updated in silence. The VAD stays
  latched and everything comes out through the 20 s forced cut. That's why, after
  30 s straight of "speech", it's assumed to be noise and the floor is let to
  learn it. `Utterance`'s `forced` field existed from the start and nobody read
  it; now it's logged, because several forced cuts in a row are the exact
  signature of this bug.
- **Forced cut at 20 s**, or whoever talks without pauses would never be
  transcribed.
- **Discarding short peaks** (< 250 ms): a bang on the table exceeds the threshold
  for an instant, and without a filter it would be sent to Whisper, which would
  return a hallucination.
- **300 ms pre-roll**, so as not to eat the first syllable, which is exactly the
  one that disambiguates many questions.

The **typical whisper.cpp hallucinations on silence** are also filtered
("subtitles by…", "thanks for watching", `[música]`): they're known artifacts of
the training corpus, and slipping them into the transcript would poison the LLM's
context.

### Auto-trigger: precision over recall

A product decision worth not reverting by carelessness. The detector
(`core/question-detector.ts`) prefers to **miss questions** rather than trigger too
much: a suggestion that appears when nobody asked anything distracts at the worst
possible moment, and the user **always** has the manual hotkey as a net.

- **It doesn't depend on the question mark**, because many STT engines don't
  punctuate reliably; depending on it would lose most of the questions.
- **The filler words are checked BEFORE everything else**: "¿me escuchas?" carries
  a mark *and* starts with an interrogative, and it still isn't answered.
- **It accumulates before deciding, it doesn't discard after.** The VAD closes the
  turn at 700 ms of silence, and whoever hesitates makes pauses longer than that
  mid-sentence: *"entonces… eh… lo que quería preguntarte es… ¿cómo lo harías?"*
  arrives as three segments.
  The first version fired on the **first** fragment and silenced the following
  ones for 2.5 s. The code comment identified the problem well —"a long question
  can close in several segments"— and drew the opposite conclusion: it answered
  the hesitation and **discarded the question**.
  Now the fragments accumulate and the whole is judged after `AUTO_SETTLE_MS`
  (900 ms) without new speech. Added to the VAD's 700 ms, ~1.6 s of silence is
  needed to call the utterance finished: more than a pause of doubt lasts, less
  than the end of a question lasts. The 2.5 s debounce survives only as a net
  against double-triggers by distinct paths.
- **The imperative openers are searched for in any position.** A direct
  consequence of the above: on joining fragments, "cuéntame" stops heading the
  sentence and the prefix check stopped seeing it. Asking for something is still
  asking for something even with a hesitation in front.

**July 2026: the balance became configurable, with data.** The first real
listening test gave the measure: of five sentences dictated to the microphone in a
row, **only one fired**, and from the outside it was experienced as "the app
hung". It wasn't hung — the detector was discarding them silently.

What the literal transcripts taught (recovered from the history, which for this
alone was already worth what it cost) is that **the same engine punctuates
irregularly within the same session**:

```
"¿Qué tanto sabes de ingeniería software?"     ← with marks
"que empresa creó Kotlin."                      ← no marks, no accents
"Si yo quiero programar una aplicación escritorio que lenguaje… deberiosa ahora."
```

Two concrete causes, both fixed:

- **`normalize()` throws away the accents**, and in Spanish the accent is the only
  thing separating "qué" from "que" — the language's strongest signal was lost
  before looking at it. Now the accented interrogatives are searched over the
  **raw** text and **in any position**, not just in the first two words.
- **The filler filter only looked at the start.** "Hola, ¿cómo estás? ¿Me
  escuchas?" doesn't start with a filler and carries a question mark, so it fired.
  Now it's also checked by content in short sentences.

And since the right balance **depends on what you use the app for**,
`autoTriggerSensitivity` was added (`strict` | `balanced` | `all`, default
`balanced`). `all` exists because the user's real case was dictating the questions
to it on purpose: there's no noise to protect against there and any heuristic is
superfluous.

**What was tried and dropped:** putting variants of "debería" among the markers
(`que deberia`, `deberia usar`…). They fired on normal subordinate clauses —
*"creo que debería haber estudiado más"* isn't a question. What distinguishes a
question isn't the verb, it's the interrogative. The false-positive test in
`question-detector.test.ts` pins that decision so it doesn't come back.

**Who triggers is configurable, but the default doesn't change.**
`settings.autoTriggerSpeaker` accepts `them` (default), `me` and `any`. The default
is still the other party for the usual reason: answering what you say makes no
sense in an interview. It was made configurable because the combination
`audioSources: 'mic'` + trigger on `them` leaves the auto-trigger **dead
silently** — the `them` lane isn't even created, so `onFinalSegment` discarded
every segment without emitting a single trace, and from the outside it looked
exactly like "the model doesn't answer". Whoever uses the app dictating the
questions needs `me`.

That impossible combination is detected with `autoTriggerIsInert()` in
`shared/types.ts`, used at once by the main process (warns via console on starting
the transcription) and the dashboard (red banner). It's in shared **on purpose**:
the rule has to say the same thing in both places or the warning stops matching the
behavior.

The manual hotkey (`session.lastRelevantSegment()`) follows the same preference,
but falls back to the other speaker **only if the preferred one isn't even being
listened to**. If it is being listened to and hasn't said anything yet, there's no
fallback: sending someone else's last line as if it were the question is worse than
letting the model deduce it.

---

## 6. Bugs found while verifying, and what each one taught

They all came out of **running the app**, not reading the code. They're fixed;
they're recorded because each one marks a trap that's easy to step on again.

| Symptom | Cause | Lesson |
|---|---|---|
| A window that starts with stealth off couldn't be turned on afterward | `registerWindow()` was only called from `applyStealth`, so the window never entered `tracked` | The registration must be independent of the initial state |
| The text of the window behind was read **sharp** through the overlay | `backdrop-filter: blur()` **doesn't compose** reliably over a `transparent: true` window on Windows | Don't trust blur on transparent windows; solid background. A 4% translucency gives no sense of transparency, just noise |
| The configuration was ignored **silently** | **UTF-8 BOM** in `settings.json` → `JSON.parse` throws → the store fell back to defaults. Notepad and PowerShell 5.1's `Set-Content -Encoding utf8` write a BOM | A file meant to be edited by hand must tolerate a BOM |
| `Unable to load a worklet's module` | The CSP itself: `script-src 'self'` blocks the worklet's Blob URL | Strict CSPs also block your own generated code |
| ~344 IPC messages/s per stream | The worklet emitted on every `process()` | Accumulate to a useful block size |
| `session.bind()` resolved to `Function.prototype.bind` | Name collision with Electron's `session` module | TypeScript warned with "Duplicate identifier"; without it it would have been a silent failure |
| The selector showed the wrong provider's models | Provider A's slow `listModels()` resolving **after** switching to B | Caught by eslint's `set-state-in-effect` rule. Fixed by storing the result alongside the provider and discarding it by comparison |
| `EPERM` when packaging | **OneDrive** holds a lock on `release/` | See §7 |
| The dashboard showed `llama3.2:3b` selected and the settings saved `""` | A controlled `<select>` whose `value` **doesn't exist among its `<option>`s**: the browser paints the first option as selected but **doesn't fire `onChange`** | A controlled select must always have an `<option>` with its value, even a placeholder. Otherwise the UI lies and the failure appears far from its cause |
| Whisper local failed with `Command failed` on every utterance | `findWhisperBinary()` walked the directory and returned the **first** match; `main.exe` sorts before `whisper-cli.exe` and since whisper.cpp 1.7 it's a deprecation stub that exits with **code 1** | Search by the candidate array's priority, never by directory order. And an executable existing doesn't mean it works |
| Sentences with "you" disappeared from the transcript | `'you'` was in the hallucination list and compared with `includes()` | A substring filter needs the entries to be long enough not to appear inside legitimate text; the short ones go to exact comparison |
| `error: input file not found 'false'` in whisper-cli | `--output-txt false`: `-otxt` is a boolean flag with NO argument, so `false` was taken as an input file | Verify each flag against the real CLI; whisper.cpp doesn't fail, it just ignores it and writes an extra `.txt` |
| Gemini Live didn't work and there was no way to know why | `GEMINI_LIVE_MODELS` is ordered by preference and this very document said the next was tried if the first failed — **but nobody implemented it**: the constructor took `[0]` and that was it | Documenting an intention doesn't implement it. If CONTEXT says something does X, there must be a test or a reading of the code that confirms it |
| "The app stopped responding" with no error | The detector discarded the sentences **silently**: there was no log of the discard or the reason | A path that decides not to act needs to leave a trace as much as one that fails. The mute `return` is the worst of the two |
| No diagnosis possible in the packaged `.exe` | The main process's `console.*` only existed launching from a terminal | If the app is used packaged, the log has to go to a file from day one |
| Mediocre transcription with BOTH engines | Without an antialiasing filter, the content above 8 kHz folded into the voice band when decimating to 16 kHz | A failure affecting two independent implementations alike is the sign that it's upstream of both |
| "¿Qué tal es la idea de software?" discarded as a filler | The filter did `startsWith('que tal ')`, so any question starting with a filler died | A list of phrases to ignore must be compared against the WHOLE phrase; a shared prefix doesn't mean the same thing |
| Answer eternally on "Thinking…" | There was no time limit on the generation: a hung provider left the state there forever | Everything that waits on a foreign process needs a clock. Without one, "slow" and "dead" are the same screen |
| Haiku 4.5 failed with 400 on every question | `output_config.effort` is Claude generation 5's and was sent to all models. The API says it plainly: *"This model does not support the effort parameter"* | A parameter verified against ONE model isn't verified for the whole family. See `EFFORT_UNSUPPORTED` |
| Answers unrelated to what was asked, mixing languages | `settings.language` was on `en` with someone speaking Spanish. Whisper **doesn't fail** when forcing a language: it returns plausible text invented from the sounds (*"Are y'all gonna eat?"*) | A setting whose error produces no error has to be in plain sight. That's why the forced language now shows in the overlay bar |
| "¿Podrías presentarte?" discarded | `MIN_WORDS = 3`, and in Spanish complete two-word questions abound | A length threshold needs an exception when there's an unambiguous signal |
| The assistant forgot what it had itself said | Each query was a single turn: its previous answers didn't come back to the model, and the transcript only contains voice | "Context" and "memory" aren't the same. A transcript isn't a conversation history |
| Gemini Live "didn't work" leaving no trace | `live.connect()` **has no time limit**: if the handshake doesn't complete, the promise never resolves or rejects. `startTranscription` stayed hung, the capture kept saying "Listening" and there was neither transcription nor error | The log caught it: `[capture] first chunk` with no `[stt] transcription started` behind it. Every network promise needs a clock, and one that hangs is worse than one that fails |
| The timeout said "no response in 15s" and was no use | The cause **did** arrive: the server closes the socket with `1007` and a legible reason (*"API key not valid"*), but **without sending any message**. The SDK waits for a `setupComplete` that isn't going to come and the timeout covered the reason | It was checked by opening the WebSocket by hand with a fake key. A timeout that replaces an error is a patch: you have to listen to the channel the cause arrives through —here, the `onclose` |
| JSON cut off mid-string in direct audio | Gemini 2.5 reasons by default and **the reasoning tokens are deducted from `maxOutputTokens`**: they were spent thinking and the JSON was truncated | `thinkingConfig: { thinkingBudget: 0 }`. An output budget shared with the reasoning isn't an output budget |
| Changing "What's being listened to" mid-session changed nothing | `audioSources` is only read inside `capture.start()`, and the STT engine's speakers are fixed on starting the transcription. The setting saved, the UI updated and it kept listening to the old thing | A setting only read on startup needs whoever changes it to restart what depends on it. It's done in the `settingsUpdate` handler, not in the UI, so it holds equally from the overlay and from the dashboard |
| The "Copy" button of a code block did nothing | `navigator.clipboard.writeText()` requires the document to have the **focus**, and the overlay is `focusable: false` on purpose so as not to steal it from the video call: it always rejected with *"Document is not focused"*. And the `.then()` without a `.catch()` swallowed the rejection | Two lessons. One: in the overlay, any browser API that depends on the focus is ruled out by design, not by chance — it's done from the main process (`clipboard.writeText`), which also skips the `setPermissionRequestHandler` that only grants `clipboard-read`. Another: a promise without a `catch` in a click handler turns an error into "nothing happens", which is the most expensive symptom to diagnose |
| ~1.3 s fixed per turn in Whisper local | `whisper-cli` **loads the model on every invocation**: it takes the same with 1.7 s as with 8.2 s of audio | Measuring the cost against the input's size instantly reveals what's fixed and what's proportional |
| "The model returned no text" with a reasoning model in Ollama | Ollama returns the reasoning in `message.thinking`, **apart** from `message.content`, and `num_predict` counts both together: with code mode's 2,200 cap, `qwen3-vl:8b-thinking` exhausted the budget thinking and finished with `done_reason: "length"` without writing a single character | A new field in a provider's response doesn't announce that it exists: the loop read `content` and the rest fell to the floor. And an output cap computed for "what's read" is no good when the model spends output on something that **isn't** read |

Two tooling rules found real things, not noise: `noUncheckedIndexedAccess`
(destructuring `getPosition()`, which returns `number[]`, not a tuple) and
`preserve-caught-error` (re-throwing without `cause`). Eslint's `set-state-in-effect`
rule has found **two** real race conditions (the model selector and the Ollama
probe); it's worth treating its warnings as bugs and not as pedantry.

### Synthetic clicks are NO good for testing the overlay

It's worth writing down because it almost prompted a "fix" of healthy code.

When verifying the gear button with `SetCursorPos` + `mouse_event` from
PowerShell, **the click never arrived**, not even with click-through disabled. The
tempting conclusion was that the hover mechanism was broken. It was false: tested by
hand with a real mouse, it **works**.

The cause is that synthetic input doesn't faithfully reproduce the message path
Electron forwards with `forward: true` toward a window with `focusable: false`
(`WS_EX_NOACTIVATE`).

**Practical rule:** screenshots serve to verify that the overlay *renders* and that
stealth works, but **mouse interaction on the overlay has to be tested by hand**.
If a synthetic click fails, the default hypothesis should be the test harness, not
the code.

### The overlay locked up after the dashboard, and persistence was the cause

An arc of three attempts worth writing down in full, because the temptation at each
step was the wrong one.

**The symptom:** after opening and closing the dashboard, the overlay was left
unclickable —not even the `⋯` menu responded—; worse the more the dashboard was
used, and worse in the `.exe` than in `dev`.

**The mechanism** has two layers, and both matter:

- *The mouse forwarding breaks.* The overlay ignores the mouse with
  `{ forward: true }` and it's those forwarded `mousemove`s that let it detect the
  hover over its bar. When another focusable window takes the focus, Windows stops
  forwarding them.
- *The renderer's cache desyncs.* `useChromeMouse` caches locally whether it's
  ignoring and **only notifies the main process on changes**. If the main process
  changes the state on its own (a «fix» that re-applies `setIgnoreMouseEvents`), the
  cache is left pointing at another value and the next hover does an early-return:
  it reactivates nothing. The first two attempts —re-applying from the main
  process— failed because of this, or even made it worse.

**The real cure for the desync** is for the main process to ask the renderer for an
`onOverlayResync`: the renderer resets its cache to a known state and re-sends the
state, which re-applies the forwarding. That was kept as a safety net.

**But the root cause was another:** the dashboard had been made `always-on-top`
(`screen-saver` level) so it would persist when clicking another app. That left
**two topmost windows at the same level fighting over the focus**, and each fight
broke the overlay's forwarding —hence it accumulated with use—. Persistence and a
stable overlay are incompatible: a focusable window that stays in front when you
click outside **has** to be topmost, and on Windows two topmost windows are ordered
by focus. The `always-on-top` was removed: with a single topmost window —the
overlay— there's no fight. The cost, accepted deliberately, is that the dashboard
goes behind like any normal window (recovered with the gear). **If someone proposes
making the dashboard persistent again, this is what breaks.**

### The interpreter translated the envelope tags

`buildUserTurn` wraps the user turn in `<transcripcion>`/`<pregunta>` —the
anti-injection boundary—, but the interpreter **translates everything it
receives**, so it carried the tag names translated into the output
(`<transcripcion>` → `<transcription>`) and the translation came out wrapped in
XML. The copy button exposed it, since it gives the text raw. It was fixed with
`AnswerRequest.interpreter`: in that mode the turn goes without envelopes or
instruction —just the sentence—, losing no defense because translating is literal
by design.

---

## 7. The OneDrive problem

`electron-builder` fails **reproducibly** with:

```
EPERM: operation not permitted, rename 'release\win-unpacked.tmp' -> 'release\win-unpacked'
```

It's not configuration: OneDrive holds a lock on the folder while it syncs it.
Besides, syncing ~215 MB of artifacts makes no sense at all.

`scripts/build-win.mjs` detects whether the project lives in a synced folder and
sends the output to `%LOCALAPPDATA%\Tayori-release`, warning via console. Another
path can be forced with `IH_BUILD_OUT`.

That script invokes `cli.js` with `process.execPath` instead of `npx` with
`shell: true`, for two reasons: passing arguments with a shell concatenates them
**without escaping** (Node warns with DEP0190), and this project's path **contains
spaces** ("Tayori").

---

## 8. What's verified and what isn't

Important distinction: almost everything was tested by **running the app and
looking at screenshots**, not just compiling.

### Verified by running it

- **Stealth in both directions.** With the mode active the overlay **doesn't
  appear** in a GDI capture; disabling it, it **does appear**. Testing only one
  direction would have proved nothing: the absence is also compatible with "the
  overlay doesn't render".
- **Global hotkeys** with the focus on another application (`Ctrl+Alt+Left` moved
  the overlay exactly 120 px in three presses).
- **Separation of the two streams**: with a 440 Hz tone through the speakers, the
  "Them" meter rises and "Me" stays at zero.
- **PCM chunks reaching the main process** from both speakers at 16 kHz.
- **Screen capture** → thumbnail in the overlay → answer engine calling the
  provider and showing the missing-key error in the panel.
- **STT error path**: with no key, it fails with an actionable message and **the
  audio capture keeps working** (the resilient behavior sought).
- **Complete dashboard**, with the model selector populated by IPC.
- **The packaged app boots**: NSIS installer + ~98 MB portable, and the `.exe`
  brings up dashboard and overlay reading settings from `userData`.
- `typecheck`, `lint` and **45 tests** clean.

### NOT verified — requires keys or manual intervention

- **Real token streaming** from Claude/Gemini (needs the user's API key).
- **ChatGPT against OpenAI's real API.** **The contract** is verified:
  `tests/openai-provider.test.ts` brings up a real HTTP server that speaks the
  Responses API over SSE, and pins what goes out (`store: false`, the `reasoning`
  block, the lent budget, the history as messages, the capture as `input_image`)
  and what's done with what comes back (refusal, exhausted budget, retry without
  `reasoning`, cancellation). The catalog's ids, their roles, their prices and
  that they accept images come from OpenAI's reference, consulted on 1 August
  2026. What has **not** been checked is a real call against their servers: that
  the account has access to those three models. «Test connection» will say so —
  the button is there and the error it returns already distinguishes invalid key,
  no access, no balance and nonexistent model.
- **Live transcription** with Gemini Live (ditto).
- **Auto-trigger on real speech** (the heuristic is covered by tests).
- **Whisper local end-to-end**: the assets **are already downloaded** and it was
  checked, by running it, that `whisper-cli.exe` transcribes a hand-generated WAV
  with the exact argument list the app uses, and that `findWhisperBinary()` picks
  `whisper-cli.exe` and not the `main.exe` stub. What remains untested is the full
  chain with real voice: VAD → turn → text.
- **Ollama**: the server **does run** now, with `llama3.2:3b`. What's verified is
  the model listing; token streaming on a real question isn't.
- **Gemini Live is still untested against the real API.** The model fallback is
  implemented and there's a "Test" button in Diagnostics that opens a real
  session, but it requires the user's API key. Until someone presses it, **we
  don't know which Live model the account accepts** — only that it no longer fails
  silently on the first candidate.
- **Code mode against a real screen.** What's covered by tests is what can be
  covered without a key: that `coding` replaces the format rules, that the forced
  profile doesn't touch the settings, and the fence parser with its streaming
  case. What's missing is the whole loop —capture of a real LeetCode → vision
  model → solution that compiles—, which needs an API key and an eyeball test. The
  first thing to look at there is whether at quality 92 the model reads the
  method's **signature** well: it's the mode's silent failure, because a perfect
  answer over a misread signature can't be told from a good one until the
  evaluator rejects it.
- **The two OpenAI engines against their servers.** `openai-transcribe` is
  verified end to end against a real HTTP server: that the turn goes out as WAV,
  with the right model, with the vocabulary bias, without forcing a language when
  it's `auto`, and that a lane nobody listens to doesn't spend a single request.
  `openai-live` is verified **against a real local WebSocket** —the
  `session.update` with `turn_detection: null`, the audio resampled to 24 kHz, the
  commit at the end of the turn and its absence while speaking, the partials and
  the final separately, and the degradation without `prompt`—, and its handshake
  against the real API was already tested: it's what exposed the two protocol
  failures. What **remains unchecked** is a whole meeting from start to finish:
  that the turns close where they have to close with real voice, and how well it
  transcribes compared to Whisper local. That's listening and judging, and it
  needs someone in front of it.
- **That a skill really changes the tone of an answer.** Verified that it reaches
  the prompt —where it goes, with what precedence and that the profile survives—,
  and the load from disk against real folders, with their odd cases. What's
  missing is what's only seen by reading the output: whether with «Don't sound
  like AI» set the model stops writing «it's important to highlight». It's an
  eyeball test and needs a key.
- **The test on a real video call** (Meet / Teams / Zoom / OBS). The verification
  was done with GDI/BitBlt capture. `WDA_EXCLUDEFROMCAPTURE` also covers the DXGI
  and Windows Graphics Capture paths those apps use, **but it's worth confirming**.
  It's the phase-1 test that remains pending, and the most important of all.

---

## 9. Concrete loose ends

Things that half-exist. They aren't bugs; they're unfinished work, and it's better
written here than discovered by surprise.

- **`resizeOverlay` is called by nobody.** The handler and the preload exist; the
  idea was for the overlay to fit the answer's height. Now that the write tab
  changes the panel's usable height, it's more visible than before.
- **`overlayOpacity` can't be changed.** The overlay respects it; the dashboard
  doesn't expose it.
- **The hotkeys can't be remapped from the UI.** `settings.hotkeys` and
  `registerHotkeys()` already support it (and `registerHotkeys` returns the
  accelerators Windows rejected, so it can warn), but the dashboard doesn't have
  the editor.
- **`'heuristic+classifier'` is in the `AutoTriggerMode` type but not
  implemented.** The dashboard only offers `off` and `heuristic`; if someone
  writes that value in `settings.json` it will behave as `heuristic`. It was the
  classifier step with Haiku.
- **There's no app icon.** `electron-builder` warns: *"default Electron icon is
  used"*. `build/icon.ico` is missing.
- **`build/` doesn't exist** (it's `buildResources` in the electron-builder
  config).

---

## 10. How to repeat the verifications

The procedures that were used, in case something has to be revalidated after a
change.

**Stealth (always in both directions):** with the mode active, take a screenshot
and check that the overlay is **not** there; disable it in the dashboard, repeat,
and check that it **is** there. A single direction proves nothing.

**Dual audio:** play a tone or a video through the speakers while talking to the
microphone; the dashboard's two meters must move independently. The main
process's log prints one line per speaker when their first chunk arrives
(`[capture] first chunk of "them" (16000 Hz)`) — it's there precisely to
distinguish "nothing is heard" from "the pipeline is broken", which from the
outside look the same.

**Global hotkeys:** fire them with the focus on **another** application. If they
only work with the app focused, they aren't registered as global.

**Overlay interaction (by hand, no exception):** drag by the bar, press the gear
and press the X — with **click-through enabled**, which is the hard case.
Synthetic clicks are no good here (see §6).

**Packaging:** `npm run build:win` and then **run the packaged `.exe`**. The
files being generated doesn't prove it boots: the production bundle resolves the
renderers' paths differently from the dev server.

```bash
npm run typecheck && npm run lint && npm test
```

---

## 11. Golden rule for this project

**Invisible mode is verified, not assumed.** It's the only feature whose failure
is silent *and* costly: if it stops working, the app keeps looking perfect and
the user will find out at the worst possible moment. Any change that touches
`windows/stealth.ts`, `windows/overlay.ts` or the windows' lifecycle requires
repeating the two-direction test **before** calling the change good.

And in the README the real limits are written without adornment: it doesn't
protect against a camera pointing at the screen, it doesn't hide the process from
proctoring software that enumerates windows, and it doesn't hide what you say into
the microphone. That honesty is part of the product; it shouldn't be diluted.

---

## 12. Build and release automation

Two GitHub Actions workflows live under `.github/workflows/`:

- **`ci.yml`** runs on every `push` and `pull_request` in Windows. It runs
  `npm ci`, typecheck, lint and tests, then builds only the portable target via
  `npm run build:portable` (`electron-builder --win portable`). The `.exe` is
  available as a run artifact for 30 days. `build:win` remains available for a
  local NSIS installer build.
- **`release.yml`** runs on pushes to `main`. Release Please reads Conventional
  Commits and opens or updates a release PR. Once that PR is merged, it updates
  `package.json`, `package-lock.json`, `CHANGELOG.md` and the versions manifest,
  then creates the tag, GitHub Release and its generated change notes.

When Release Please creates a release, a Windows runner rebuilds the portable
from **that tag** and attaches two files to the Releases page:
`Tayori-<version>-portable.exe` and a `.zip` containing that same
executable. The CI artifact is deliberately not reused, so the published binary
always belongs to the versioned commit.

Version bumps require Conventional Commits on `main`: `fix:` bumps patch,
`feat:` bumps minor, and `feat!:` (or `BREAKING CHANGE`) marks a breaking
change. The base version is tracked in `.release-please-manifest.json`; do not
manually edit it except for an intentional bootstrap.

### What the first real publication cost

The two workflows were well written from the start and **the repository still went
weeks without a single release**, with the runs green. Three chained traps, all
three silent:

1. **No `main` commit followed Conventional Commits.** The entire history was
   `Workflow added`, `Controles en el overlay…`. Release Please looks for
   `feat:`/`fix:`, finds nothing to publish, and **finishes correctly**. Green and
   with no result, which is the worst kind of failure.
2. **GitHub forbids Actions from creating pull requests by default.** With that
   option off, release-please computes the version, generates the CHANGELOG,
   creates the branch and the commit... and dies at the last step with
   `GitHub Actions is not permitted to create or approve pull requests`. It's
   fixed in Settings → Actions → General → Workflow permissions.
3. **Release Please identifies its PR by a label it sets.** On creating it by hand
   to unblock the publication, on merging it it wasn't recognized as a release: it
   didn't create the tag and set about computing the next version. If it ever has
   to be unblocked by hand, it's better to create the tag and the release directly
   than to fake its PR.

Out of that came **`publish.yml`**: it rebuilds and publishes the `.exe` of a tag
that already exists, only via `workflow_dispatch`. Creating a *release* is allowed
with `contents: write` —the only thing blocked are the PRs—, so it doesn't depend
on any repository configuration. It's **not** hooked to `push: tags` on purpose:
with `release.yml` working, both would build the same binary in parallel, about
eight minutes of Windows runner for nothing.

**The tag format has to match in both places.**
`include-component-in-tag: false` leaves the tags as `v{version}`. Without that,
release-please named them `interview-helper-v{version}`, didn't recognize a
hand-created `v0.2.0` tag as published, and repackaged everything prior into the
next version.

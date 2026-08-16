# Usage guide

Everything Tayori does and how to set it up. For what it is at a glance see the
[README](README.md); for how the code is laid out, [ARCHITECTURE.md](ARCHITECTURE.md);
for why it's built this way, [CONTEXT.md](CONTEXT.md).

## Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Guided setup](#guided-setup)
- [First steps](#first-steps)
- [Handling the overlay](#handling-the-overlay)
- [Audio devices](#audio-devices)
- [Spoken answers](#spoken-answers)
- [Teleprompter mode](#teleprompter-mode)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [The screen actions](#the-screen-actions)
- [Skills](#skills)
- [Chunk capture](#chunk-capture)
- [Code mode](#code-mode)
- [Interpreter mode](#interpreter-mode)
- [Invisible mode: what it protects and what it doesn't](#invisible-mode-what-it-protects-and-what-it-doesnt)
- [Phone mirror](#phone-mirror)
- [MQTT](#mqtt)
- [Instructions hidden in what the app hears or reads](#instructions-hidden-in-what-the-app-hears-or-reads)
- [Latency and privacy: the trade-off](#latency-and-privacy-the-trade-off)
- [Legal considerations](#legal-considerations)
- [Conversation history](#conversation-history)
- [Language](#language)
- [About](#about)

## Requirements

- Windows 10 version 2004 or newer (Windows 11 recommended).
- Node.js 20+ and npm, only to build from source.
- At least one API key: [Anthropic](https://console.anthropic.com),
  [Google AI Studio](https://aistudio.google.com),
  [OpenAI](https://platform.openai.com) or
  [DeepSeek](https://platform.deepseek.com). Ollama and Whisper local need none.
  - The Google and OpenAI keys also work for **transcription**. Anthropic and
    DeepSeek only answer: if those are the only keys you set, speech is handled
    by Whisper local.
  - **DeepSeek can't read images**, so it doesn't work for the screen buttons.

## Installation

```bash
npm install
npm run dev
```

To generate an installer and a portable executable (~98 MB each):

```bash
npm run build:win
```

The artifacts land in `release/`. **If the project lives inside OneDrive,
Dropbox or similar**, the script moves them to `%LOCALAPPDATA%\Tayori-release`
automatically and warns on the console: OneDrive holds a lock on the folder and
electron-builder fails with `EPERM` while unpacking Electron. You can force
another path with the `IH_BUILD_OUT` variable.

The binary is unsigned, so Windows SmartScreen will warn the first time:
"More info" → "Run anyway".

## Guided setup

The first time you open the dashboard, a wizard gets everything working without
you needing to know what a provider is or how much RAM you have. It measures your
machine and proposes one of two paths:

- **In the cloud.** Pick Claude, Gemini, ChatGPT or DeepSeek, paste the API key,
  done. Nothing to install. You pay the provider per use.
- **On your machine.** If you don't have Ollama, it installs it with `winget`
  — the Windows package manager, with its own permission prompt — and downloads
  the two models that fit your hardware: one to converse and one to read the
  screen.

Then it sorts out transcription (Gemini Live if you have a Google key, or Whisper
local, which downloads on its own) and offers to paste your CV, which is what
separates a correct answer from *your* answer.

Nothing is installed or downloaded without you asking: every action sits behind a
button that says what it's about to do. You can leave at any point and configure
things by hand, and call the wizard again from **Guided setup** at the foot of
the sidebar.

If your machine has no `winget`, the wizard will **not** download any executable
on its own: it sends you to ollama.com and detects the install when you come
back.

## First steps

1. Launch the app. Only the overlay shows up, top-right.
2. Open the settings from the **`⋯`** menu in its top bar. That's the only way
   to open it: there's no shortcut and it never opens by itself. At the very top
   there's a **first-steps** guide with the four things to do; it checks itself
   off as you complete them and disappears when you're done.
3. Paste your API key for Anthropic, Google, OpenAI or DeepSeek.
4. Choose **what is heard**. By default it's both sources; if you'd rather the
   assistant not process your own answers, switch to *System output only*.
5. In **Context**, add your CV and the job description. This is what stops the
   model from inventing experience you don't have, and it also improves
   recognition of proper nouns and acronyms.
6. Press **Start listening** and check that the meters move.

## Handling the overlay

Everything you use mid-call is in the top bar, without opening the settings:

- **Listen / Listening**: starts and stops listening. If something fails, the
  button turns to "Retry" and its tooltip says what happened.
  The little **caret** next to it opens which **sources** are heard — your mic,
  the system output, or both — folded in here so the bar stays short. If a source
  is configured but **didn't manage to open**, the control turns **amber**: the
  warning that tells "nothing is audible" apart from "nothing is being listened
  to".
- **Eye (visibility)**: toggles whether the overlay is excluded from screen
  capture. It turns **red** when the overlay is *visible* — the risky state — and
  the panel gains a dashed red frame so you can't share your screen without
  noticing.
- **Solve screen**: reads what's on your screen and helps with it. It's one
  button with a small menu — **Code problem**, **Quiz question**, or **Anything
  else** (general help: a config error, some logs, a diagram to explain, going
  from one state to another). Code and quiz also have hotkeys (`Ctrl+Alt+C` /
  `Ctrl+Alt+Q`); "Anything else" is menu-only. At size S and in compact mode it
  keeps just the icon.
- **`⋯`**: everything you do **not** use mid-call — collapse the panel, settings,
  and quit. It went to a menu because it shared space and visual weight with the
  buttons above, and at size S it no longer fit. Quitting the app sits apart at
  the end.
- **Profile and model**: the row below the bar. The **profile** picks the shape
  of the answer and the dropdown next to it the **answer model** — both without
  opening the settings. In compact mode they ride in the bar itself.
- **Listen / Write tabs**: **Listen** follows the call; **Write** is a small chat
  where you type a question (`/skill` to invoke one, `Tab` to complete it) and the
  exchanges stack as a scrollable thread you can walk back through, like a
  messaging app. The **+** by the input attaches an image — a fresh screenshot or
  one from your PC — to send with the question, and each answer has a **copy**
  button (plus a **speak** button when spoken answers are on). A **new
  conversation** button sits at the right of the tab row: one click wipes the
  transcript and memory and starts fresh.
- **`‹ 2/5 ›`**: in the answer header, to go back to earlier answers without
  opening the history. While you're looking at an old one the quick actions don't
  appear: they say "your last answer" and the last one for the model is its own,
  not the one you have in front of you.
- **Move it**: drag the **grip** — the six dots at the left of the bar — with the
  left button, or use `Ctrl+Alt+arrows`. Only the grip moves the window, so the
  rest of the bar stays clickable without dragging by accident.
- **Hide the overlay** without closing the app: `Ctrl+Shift+H`.

The bar buttons work even with *click-through* enabled: the overlay stops
ignoring the mouse while the cursor is over the bar, and lets it pass again as
soon as you leave.

## Audio devices

Two independent sources — your microphone and the system output. In *dashboard →
Audio → Devices* you choose **which microphone** the capture opens and **which
output** playback uses, for machines with more than one of either.

The microphone applies **immediately**: change it while listening and the streams
reopen with the new one. The output doesn't change what's captured — the system
loopback is always the default render mix — it's where the **spoken answers**
play, and a **Test output** button checks the device before you rely on it.

## Spoken answers

It can read the assistant's answers out loud. Turn it on in *dashboard → Audio →
Spoken answers*, then pick an **engine**:

- **System voices** (Web Speech) — free, offline, zero download. Uses the OS
  voices; it always plays on the **default** output (this API has no device
  routing).
- **OpenAI** — a more natural cloud voice; reuses your OpenAI key. Plays through
  the output device you picked.
- **Piper** — a local neural engine. Choose a voice and **download** it once (the
  small binary comes along on the first download); it then runs offline and plays
  through your chosen output.

Set the **voice** and **speed**, and whether to **read new answers
automatically** — with that off, each answer still has a speak button you press
for the ones you want. Starting one answer stops any other, and the speak button
toggles play/stop, so a reading can be cut short.

Privacy-wise, **system voices and Piper are local** — nothing leaves the machine;
**OpenAI** sends the answer's text to OpenAI to synthesize it, like any cloud
call.

## Teleprompter mode

Turned on in *dashboard → General → Teleprompter mode*, it changes how the
finished answer reads: **one sentence per line**, in a narrow column, with the
active line always in the same spot and the neighbours dimmed.

Why it's like this and not "the answer, but bigger": what gives away that you're
reading **isn't font size, it's the horizontal movement of your eyes**. Sweeping
a long line and returning to the start of the next one is visible from the other
side of a video call. A narrow column with the line fixed keeps your eyes almost
still — and if the overlay is up top, near the webcam, it looks like you're
looking at the camera.

You advance with `Ctrl+Alt+X` and go back with `Ctrl+Alt+Z`; a click and a
right-click on the panel also work. It's manual on purpose: in a conversation you
don't know how fast you'll speak, and an auto-scroll drifts off just as you get
interrupted — chasing it means staring at the screen. Both shortcuts are **only
registered with this mode on**, so with it off those combinations are free.

It only kicks in with the answer **finished**. During streaming the lines would
be recomputed on every token and the one you're reading would move under your
eyes, which is the opposite of what this mode solves.

## Keyboard shortcuts

All of them are global: they work even when the video-call window has focus.

| Shortcut | Action |
|---|---|
| `Ctrl+Enter` | Answer now |
| `Ctrl+Shift+S` | Capture screen and answer |
| `Ctrl+Alt+C` | Solve the code on screen |
| `Ctrl+Alt+Q` | Answer the quiz on screen |
| `Ctrl+Alt+A` | Chunk capture: collect a chunk (or start/stop the loop in automatic mode) |
| `Ctrl+Alt+S` | Reconstruct and solve the captured chunks |
| `Ctrl+Shift+H` | Show or hide the overlay |
| `Ctrl+Shift+M` | Start or stop listening |
| `Ctrl+Shift+C` | Toggle click-through |
| `Ctrl+Alt+←↑→↓` | Move the overlay |
| `Ctrl+Alt+X` / `Ctrl+Alt+Z` | Teleprompter: next / previous line |

The settings have **no shortcut** on purpose: it opens only from the overlay's
`⋯` menu.

**All of them can be changed and turned off** in dashboard → *Keyboard
shortcuts*: click the field and type the combination, or use the switch on its
row. Turning one off isn't just that it stops reacting: **the combination is
released**, and becomes available again for your editor or whoever wants it. A
global accelerator takes it away from whatever app has focus, and there's no
sense in holding it for a feature you don't use. It's kept saved, so turning it
back on doesn't force you to type it again. If Windows rejects one because
another app already holds it, it shows up in red — which matters, because a taken
shortcut throws no error: it simply does nothing.

## The screen actions

The **Solve screen** button in the overlay bar captures your screen and helps
with what's on it. Its menu has three cases:

- **Code problem** (`Ctrl+Alt+C`): solves the coding exercise, failing test or
  stack trace in view — full code, ready to paste.
- **Quiz question** (`Ctrl+Alt+Q`): answers the test on screen (see below).
- **Anything else**: general help with whatever else is there — a config error,
  some logs, a diagram or drawing to explain, getting from one state to another.
  This one has **no hotkey**; it's reached from the button's menu.

They share the whole path — high-quality capture, their own profile, a
vision-capable model — and split only in how they answer, because an algorithm, a
multiple-choice question and "explain this diagram" aren't answered the same way.

Quiz mode answers **every question on screen**, one line per question and nothing
else: the number, the letter and the option text. No explanations — with the exam
in front of you what you need is the answer.

Two marks that do show up, because they change what you do with them:

- **`DOUBT:`** at the start of a line means the model isn't sure, and gives its
  best option anyway. In an exam that penalizes wrong answers, an unsure answer
  dressed up as a sure one is worse than none.
- **`NOT VISIBLE:`** means not all of that question's options were readable in the
  capture. Repeat the shot with the whole question in view.

The "why" doesn't disappear: with the answer on screen you get the **Why?**,
**The discarded ones** and **Review the doubts** buttons, which ask for it when
you want it.

### Which model

You can use **a different one** from the model that answers what's being spoken:
*dashboard → Model for the screen*. The two tasks ask for opposite things —
conversing needs latency, reading a capture needs vision and brains — so a
reasonable combination is a small local model to talk and a big one for the
screen, or the reverse if you're worried about captures leaving your machine. By
default the same one is used for everything, as before.

**It has to support images.** If you pick one without vision, the screen actions
fail with a warning instead of inventing the prompt. The dashboard marks which ones
read images and warns you before you find out mid-exam.

### A model that isn't on the list

The cloud provider dropdowns carry the models the app knows about, and that list
ages with every version. If your account has access to another one, pick
**"Other…"** and type its id: it's saved as-is and used like any of the listed
ones. A made-up id doesn't fail on save, it fails on the first question, so
confirm it with **Test connection**.

With **Ollama that option doesn't appear**, on purpose: there the list isn't a
catalog of ours but what your local server reports as downloaded, and typing the
name of a model that isn't installed doesn't install it.

## Skills

A skill is an instruction of yours that changes **how** the model answers. It's
not the same as a profile or a context, and that difference is what lets the
three combine:

| | Decides | Example |
|---|---|---|
| **Profile** | The shape of the answer | 4 bullets, a code block, one line per question |
| **Context** | The material | Your CV, the job offer, prepared answers |
| **Skill** | The way of writing | Which words to avoid, what rhythm, what tone |

The **profiles are yours to shape**: in *dashboard → Behavior* you can rename or
rewrite any built-in, hide the ones you don't use, create your own from scratch,
and delete or restore any of them — the interpreter is the one fixed mode, kept
out of that list. The default text you start editing from is shown in the
interface language.

The app ships one skill: **"Don't sound like AI"**, which strips filler formulas and
the vocabulary that gives a model away. It's the flaw that shows most when the
answer is read out loud.

### Writing one

Each skill is a **folder** with a `SKILL.md` file inside. It's Anthropic's
format, so a skill written for another tool usually works as-is:

```markdown
---
name: Systems answers
description: For systems design interviews: numbers before names.
---

Always start with the number: how many requests per second, how many GB, how
many users. A design without magnitudes can't be evaluated.

Name the concrete technology only after saying what problem it solves. Never list
three alternatives without picking one.
```

Dashboard → **Skills** → *Open folder* takes you to
`%APPDATA%\Tayori\skills`. Create the folder, drop the file in and
press **Reload**: the folder name is what you type after the slash.

The **scripts and assets** the format allows are ignored on purpose. Only the
`SKILL.md` is read.

### Using them

- **For the whole conversation**: the *Skill* dropdown in the overlay, or the
  dashboard. It applies to everything, including automatic answers.
- **For a single message**: type `/name` (or `$name`) at the start in the writing
  tab. It autocompletes as you type the slash.

There's only **one active at a time**, and it isn't a pending limitation: two
instructions about how to write contradict each other quickly, and the model
breaks the tie silently.

## Chunk capture

The screen buttons assume the prompt fits in a single capture. It doesn't always:
an interviewer can **share their screen** with the test — so you can't copy and
paste the text — and **reveal it by scrolling**, so it's never fully visible. A
single screenshot only catches the visible chunk.

Chunk capture solves that: it accumulates several frames and sends them together
to the model, which **reconstructs the full prompt by stitching the overlaps**
and solves it like in code mode.

- `Ctrl+Alt+A` **collects** a chunk. Press it as you scroll: chunk 1 → scroll →
  chunk 2 → … A chip in the answer header keeps the count.
- `Ctrl+Alt+S` **reconstructs and solves** the stack, and empties it. The chip's
  ✕ discards it without solving.

There are **two modes**, in *dashboard → Behavior → Chunk capture*:

- **Manual** (default): each press of `Ctrl+Alt+A` adds a chunk. You choose what
  goes in.
- **Automatic**: `Ctrl+Alt+A` starts and stops a loop that captures on its own
  every few seconds and **discards repeated chunks** (when the scroll stops).

**A tip that changes the result:** text on a shared screen is often small, and
the capture is downscaled for the model. **Pin the shared content to full screen**
(the Meet/Zoom "pin") before collecting, or the prompt may end up illegible.

Like any screen action, it needs a **vision-capable model** (Claude, Gemini,
OpenAI or multimodal Ollama); DeepSeek can't read images.

## Code mode

`Ctrl+Alt+C` captures the screen and returns the solution to the programming
problem on it. It's meant for what you have in front of you in a technical test:
a LeetCode or HackerRank prompt, an editor with a half-written signature, a test
in red or a stack trace.

What sets it apart from `Ctrl+Shift+S` (capture and answer):

- **Different output rules.** The rest of the app is tuned for four-bullet
  answers read out loud. Here that's out of place: it returns the approach with
  its complexity in one line, the **complete** code in a block, and at most three
  notes. The token cap rises accordingly.
- **It needs no audio.** It works with listening stopped, which is the normal
  case when you're solving an exercise with no call open. If there is a
  transcript, it's sent as secondary context.
- **It doesn't change your profile.** You can be on "Interview" and press it:
  only that query uses code mode, and the next spoken question comes back out in
  bullets. If you want everything to be code, there's the **Code** chip in the
  overlay.
- **The capture is sent at higher quality.** At normal quality the JPEG eats the
  difference between `l` and `1`, and a misread signature gives a solution that
  won't compile.

The code comes in a block with a **Copy** button, monospaced and with horizontal
scroll: long lines aren't wrapped, because a wrapped expression reads as something
else.

The language is inferred from what's selected on the screen. If you'd rather pin
it (or the prompt is blank), there's a field in dashboard → *Code mode language*.

The `</>` button in the overlay bar does exactly the same as the shortcut.

### Long solutions

A real technical test doesn't fit in four lines. Two things cover it:

- **The code-mode cap is generous** (more than a spoken answer's), so most
  solutions come out whole in one go.
- If it still gets cut off, a **Continue** button appears in the answer header:
  the model picks up **where it left off** and the continuation is **glued to the
  same answer**, not a new one. You can press it several times.

To read a long solution comfortably, the place is the **phone mirror**: a bigger
screen, off the shared one, with the code formatted and a button to copy it. See
[Phone mirror](#phone-mirror).

## Interpreter mode

A **mode** that, instead of suggesting answers, **translates**. Pick it from the
Profile dropdown (in the overlay or in *dashboard → Behavior*) — it's a mode of
its own, not one of the editable profiles — and set the **two languages** in
*dashboard → Behavior → Interpreter languages*, which stay configurable whether
or not the mode is active (say Spanish ⇄ English).

With it on, each turn is translated **to the other language, in both directions**:
what you say into the mic comes out in language B, and what the other person says
comes out in language A. The model detects on its own which language each
sentence is in. The translation shows up in the overlay's answer area — and on
the phone, if you have the mirror on, to show it to the other person.

Details worth knowing:

- **It translates everything that's said**, it doesn't wait to detect a question:
  that's why it's a separate mode. It needs **listening** and **auto-trigger** on,
  and you need to hear **both sources** for the back-and-forth.
- It's **one translation at a time**: if you talk over an in-progress
  translation, the new one replaces the previous. In a real conversation you
  pause to interpret, so in practice it works fine sentence by sentence.
- **It doesn't work with Gemini's direct audio engine** (`gemini-audio`), which
  answers instead of transcribing. Use Whisper local, Gemini Live or OpenAI.

> **A good model matters here.** Translation quality varies a lot between models,
> especially on idioms and less common language pairs. Vision or "thinking"
> models are a poor fit — they add latency without helping. For local use, a
> multilingual model such as Aya Expanse or a text Gemma/Qwen works well; a cloud
> Flash-tier model beats any local one on pure translation.

## Invisible mode: what it protects and what it doesn't

This is the part worth understanding well before you trust it.

On Windows, invisible mode calls `SetWindowDisplayAffinity` with
`WDA_EXCLUDEFROMCAPTURE`. The system compositor (DWM) skips the window when
building the capture buffer, so it **doesn't appear** in:

- Screen sharing on Google Meet, Microsoft Teams, Zoom, Discord and the like.
- Recorders like OBS with "Display Capture".
- The Windows Snipping Tool and the app's own screenshots.

It applies **to the overlay and the settings window**: the dashboard has your API
keys, your CV and the history, so it shouldn't appear in the recording either.
The stealth switch controls both; the difference is that the dashboard is still a
normal window (it doesn't float over the video call, you can alt-tab to it), it's
just left out of the capture.

**It does not protect you from:**

- A **camera** pointed at your screen.
- **Proctoring or monitoring** software that enumerates processes or open
  windows. The process is visible in the Task Manager (see below).
- What you **say into the mic**. If you read the suggestion out loud, it's heard.
- Someone looking over your shoulder.

It requires Windows 10 2004 or newer. On older versions the system degrades to
`WDA_MONITOR` and the window comes out as a **black rectangle** — more noticeable
than not hiding it. Check your version with `winver` before trusting this.

### Presence in Windows: taskbar and Task Manager

By default neither the overlay nor the settings window appears in the
**taskbar**. Settings is recovered from the overlay's `⋯` menu; the overlay, with
`Ctrl+Shift+H`.

**A decoy taskbar entry (optional).** If you'd rather hide *in plain sight* than
be absent, *dashboard → General* offers a decoy: the overlay then keeps a taskbar
entry **disguised as a Windows tool** — Windows Terminal, Settings or Task Manager
— with the matching icon and title. It stays excluded from screen capture, so the
disguise is only for someone glancing at your taskbar, not for what a shared
screen shows. Stealth mode keeps the disguised entry; only with the decoy off
does the overlay vanish from the taskbar entirely.

In the packaged build, the process is called **Tayori**, with its real brand (its
subprocesses group under that name, like any Electron app such as Slack or VS
Code). The name is **not** a hiding mechanism — what hides the app is the
screen-capture exclusion, not what the process is called:

- The **Details** tab shows the `.exe` path.
- **Proctoring** software that enumerates processes or compares
  signatures/binaries detects it regardless of the name.
- In **development mode** (`npm run dev`) the process is always "Electron".

Truly hiding the process from Task Manager would require rootkit techniques
(kernel driver, hooking `taskmgr.exe`) that are indistinguishable from malware,
get flagged by antivirus and can destabilize the system. **They're deliberately
not implemented.** If you'd rather have a neutral name instead, it's changed in
`electron-builder.yml` (`productName` / `executableName`).

## Phone mirror

Invisible mode solves "don't show up in the recording". It doesn't solve the case
of **sharing your whole screen**: what's on your monitor is, by definition, on the
other side — and it doesn't cover a camera or a second monitor someone might be
watching either.

The mirror takes the answers off the shared screen entirely: your computer serves
a page to your phone's browser, on your own network. Turn it on in **Settings →
Phone mirror**, scan the QR and that's it.

It's also the **reading surface** when a solution doesn't fit in the small
overlay: the answer shows with the same formatting as in the overlay — bold, code
in a block with highlighting, formulas in Unicode — and each code block carries a
**Copy** button to take it to your editor. It keeps the last 20 answers and
scrolls like any page. It stays **read-only**: the phone can't trigger anything,
only view.

| | |
|---|---|
| What's sent | The answers and whether listening is active |
| What's **not** sent | The transcript — what the other person said isn't duplicated on a second device |
| Where it travels | Your local network, served by your own machine. No cloud, no account, no going out to the internet |
| When it's alive | Only with the app open and the switch on |

Two switches, and **both start off**:

- **Turn on the mirror.** Opens the server and generates the link and the QR.
- **Allow access from the local network.** Without this it only listens on
  `127.0.0.1`, i.e. only this same computer can connect (useful to test it, or for
  an SSH tunnel). A phone needs this on.

What to be clear about before using it:

- The link carries a **token that changes on every launch**. A link saved on the
  phone stops working on its own — but **while the mirror is on, anyone with that
  link and on your network can read your answers**. On a guest or office network,
  that's a decision, not a detail.
- The first time, Windows may ask you for **firewall** permission. Without
  granting it, the phone won't connect.
- If your machine has several network addresses (VPN, Docker, VirtualBox), the
  dashboard picks the one the system uses to go out and **shows the others** in
  case it guesses wrong.

## MQTT

With this on, each **finished** answer is published to an MQTT broker so
something else can pick it up: an ESP32, a script, a Home Assistant. Configure it
in **Settings → MQTT**.

It publishes to two topics, because they're two different consumers:

| Topic | Content |
|---|---|
| `<your-topic>` | JSON with `id`, `trigger`, `question`, `answer`, `providerId`, `model` and `at` |
| `<your-topic>/text` | Just the answer text, raw |

The second exists for microcontrollers: you subscribe and read the answer without
putting a JSON parser on the board.

```cpp
// ESP32, with PubSubClient
client.subscribe("tayori/answer/text");
// callback(topic, payload, length) → payload is the answer, as-is
```

Details worth knowing before wiring it up:

- **Complete answers only.** None of the streaming fragments: one message per
  answer, when it's whole.
- **Neither errors nor cancelled answers.** Your device can't tell a failure from
  an answer, so they aren't sent.
- **QoS 1 and not retained.** The answer isn't lost, and a board that boots up in
  the morning doesn't run yesterday's.
- **The transcript isn't published.** What the other person said doesn't go out
  here.
- **The broker password** is stored encrypted with DPAPI, like the API keys.

**This takes your answers out of the app.** If the broker is on the internet, the
text leaves your network; if it's on your LAN, anyone with access to the topic can
read it. A broker with no user and no TLS is a public noticeboard — use `mqtts://`
outside your network.

## Instructions hidden in what the app hears or reads

The app passes the model things you **don't type**: what the other person says,
what's in a screenshot and what you paste into *Context* — a job offer was
written by someone else. Any of those can carry a phrase aimed at the assistant:
*"ignore the previous instructions"*, *"stop answering"*. It doesn't take malice:
it's enough for it to be written in an exercise prompt.

All that material travels **marked as material**, never as instructions, and the
system prompt explicitly says that what's inside it is to be reported and not
obeyed. It holds for all five providers and for the local models: the defense is
in how the query is assembled, not in the model that receives it.

What you'll notice if it happens: the assistant **tells you** in one line — "there
is text on screen trying to give me instructions" — and keeps answering the real
question. Warning is part of the deal: you don't see what it read.

Two limits worth being clear about:

- **Nothing that was said gets deleted.** If in a security interview you talk
  about prompt injection, those phrases show up in the transcript as-is. Filtering
  them would break the app in exactly the interview where it's needed most.
- **This reduces the risk, it doesn't eliminate it.** The last word belongs to
  the model, and none is immune. If an answer behaves oddly right after a long
  text shows up on screen, suspect that.

## Latency and privacy: the trade-off

| Engine | Latency | Where the audio goes |
|---|---|---|
| OpenAI live | ~300 ms | To OpenAI |
| OpenAI by turn | ~1 s, with the whole sentence heard before deciding | To OpenAI |
| Gemini Live | ~300 ms | To Google |
| Gemini direct audio | ~1–2 s, but **also replaces the model call** | To Google |
| Whisper local | ~0.8–1.5 s | Nowhere |

**The two OpenAI ones** use the models OpenAI recommends for each case:
`gpt-live-transcribe` for live audio — mics and calls, which is what this app does
— and `gpt-transcribe` for already-recorded voice. The second waits for you to
finish the sentence, so it does better on proper nouns and acronyms in exchange
for a second of latency. Both use the same API key as the answers.

`gpt-4o-transcribe-diarize` is **not** used, on purpose: it separates speakers,
and this app already knows who's talking because it listens to the mic and the
system output separately. That model also doesn't support vocabulary biasing,
which is what makes your CV improve proper-noun recognition.

**Gemini direct audio** doesn't transcribe and then ask: it sends your voice to
the model itself, which returns transcription and answer at once. A bad
transcription can no longer spoil the answer, because the model hears what you
said instead of reading what someone else understood. In exchange, the audio
leaves your machine.

### Which model to use: the card and the guide

The dashboard measures your RAM, CPU and GPU and recommends two models: one to
converse and one to read the screen, with the `ollama pull` command ready to
copy. Choosing blind costs a multi-gig download only to end up with minute-long
answers.

Next to it there's a button, **Open the guide**, which generates a document for
your machine and opens it in the browser. There's what doesn't fit in a settings
column:

- All the local models by memory tier, with each download's size and the RAM you
  should keep free.
- The **multimodal** ones — the only ones that can read your screen — listed
  separately, because it's the costliest mistake: picking a text-only one leaves
  the screen actions dead.
- The paid ones sorted by price, with Anthropic's and OpenAI's figures verified
  against each one's official reference and dated. Google's are **not**
  reproduced: they couldn't be verified the same way, and a made-up price misleads
  more than an acknowledged gap.
- **What a screen press really costs**: a capture runs around 4,800 input tokens,
  so it comes out to pennies even with the expensive model. What adds up isn't
  that, it's automatic listening.
- Four closed combinations, from "all local and free" to "no compromises".

The document is written to your data folder and isn't sent anywhere.

What it does **not** do is estimate the graphics card's VRAM, which is the figure
that really decides whether a model runs fast: there's no reliable way to read it
from the app, and giving a made-up number would be worse than not giving one. If
the model doesn't fit in the GPU, Ollama splits it with the CPU and the speed
collapses even if it fits in memory.

### Ollama trims the context without warning

Ollama **doesn't use the model's context window**: it applies its own, 2048
tokens by default, and what doesn't fit it drops from the start **with no error at
all**. With the CV, the transcript and the conversation memory, those 2048 run out
fast, and the symptom is the model forgetting what you just told it. It's adjusted
in *dashboard → Transcription → Ollama context window*; by default the app asks
for 8192.

Related: the overlay shows a **`memory n/8`** chip in the answer header with the
exchanges the assistant resends on each query. Click it to make it forget them,
and it's **not** the same as "new conversation": the transcript and the history
stay as they are.

Whisper local downloads the official whisper.cpp binary (7.6 MB) and the GGML
model you choose the first time you enable it. The dashboard's **Model Manager**
lists the whole Whisper family — Tiny/Base/Small/Medium in English and
multilingual, and Large v3 Turbo — plus the **Distil** ones (faster with good
accuracy), each with its size, speed and accuracy, and a recommendation based on
your RAM. It doesn't use a native Node binding on purpose: that would require
Visual Studio Build Tools and recompiling on every Electron update.

Combined with Ollama, the app works **completely offline**.

## Legal considerations

There are three separate things here, and it's worth not mixing them up:

**1. Recording.** The app never records audio. But with history on it **does
store the transcript** of what the other person said, and in several jurisdictions
a written record of a conversation counts the same as a recording for consent
rules (one-party or all-party, depending on where you are). If that affects you,
**turn off history** in the dashboard: then it's genuinely true that nothing
remains.

**2. Where the audio goes.** With Gemini Live, the meeting audio is sent to Google
to transcribe it. With **Whisper local + Ollama** nothing leaves your machine.

**2b. The phone mirror** adds one more outlet, even if it doesn't leave your
network: with it on, the answers are served over HTTP to any device on your local
network that has the link. It doesn't include the transcript, the link expires
when you turn it off, and it starts off — but while it's on it's a copy of your
answers outside the protected window.

**2c. MQTT** goes further than the previous two: a broker can be on the internet,
so with this on the text of your answers can leave your machine and your network.
It also doesn't include the transcript, and it also starts off.

**2d. What the provider keeps on its own.** The OpenAI API **stores by default**
each response in your account so it can be retrieved later; the app explicitly
disables it (`store: false`) in all its calls. That covers what depends on us, but
not each provider's own retention policies: what you send to Anthropic, Google or
OpenAI is governed by theirs, and none of that is this app's business.

**2e. Skills travel inside the prompt.** What you write in a `SKILL.md` is sent to
the provider on **every query** while that skill is active. Nothing is executed —
the folder's scripts are ignored — but a skill someone hands you is text that will
leave your machine: treat it the way you'd treat anything you were about to paste
into a chat.

**3. Where you have that conversation.** Many companies restrict the use of AI
assistants in their selection processes, regardless of what you do or don't store.
This applies all the more to code mode: technical assessment platforms often
prohibit it explicitly in their terms, and several detect mass pasting even if
they can't see the window.

Check what applies in your case; the responsibility for using this is yours.

## Conversation history

With **Save conversations** on (*dashboard → History*), each conversation is
written to a JSON in your data folder: the answers and the full transcript. The
History section lists them newest first — open one to read its turns and
transcript, delete one, or clear them all. A **search box** filters the list by
any word across titles, questions, answers and transcripts, so you can find a past
conversation without scrolling. Nothing is written while the switch is off.

## Language

The interface is in **English and Spanish**. It starts in English unless it's the
first launch and your Windows is in Spanish; it's changed in *dashboard → General
→ Language*, and it has nothing to do with the language you speak in the meeting,
which is chosen in *Transcription*.

The internal prompts stay in Spanish on purpose: they aren't interface — the model
reads them, not you — and they already carry a rule forcing an answer in the
conversation's language, whatever it is.

**The answer language can also be pinned.** By default the model answers in the
conversation's language, or, for a screen action, the language of what's on the
screen. If you'd rather fix it — always in English, say, even when the screen is
in another language — set it in *dashboard → Answering model → Answer language*.
Leave it on **Automatic** for the default behaviour.

## About

Dashboard → **About** sums up what the app is, which version you have, the license
and what it does with what it hears. The version number is there on purpose: it's
the first thing you need to know whether a bug you're seeing still exists.

Right there is a **Check for updates** button: it asks GitHub whether there's a
newer version and, if there is, shows the changes and a button to **download** the
new portable (the download is done by your browser). Nothing downloads or installs
on its own, and it only checks when you press it.

Author: **@cflarios**. MIT, no monetization.

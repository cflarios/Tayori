# Contributing to Tayori

Thanks for wanting to help. This is a small, opinionated codebase; the notes
below are what keep it consistent.

## Language policy

Tayori started in Spanish and is moving to English so it can be used and worked
on internationally. The rule going forward:

- **English** for new code comments, commit messages, PR titles and
  descriptions, and documentation.
- **Existing Spanish is migrated opportunistically**, not in one big rewrite:
  when you touch a file, translate the comments you're already working near. A
  giant translation-only PR wrecks `git blame` and can't be reviewed — don't.
- **The UI is bilingual (English/Spanish)** and stays that way. Strings live in
  `src/shared/locales/en.ts` and `es.ts`, typed as `Record<UIKey, string>`, so
  a missing translation fails the build rather than shipping a half-translated
  screen. Add both when you add a key.
- **The internal LLM prompts stay in Spanish, on purpose.** They aren't UI — the
  model reads them, not the user — and they already carry a rule that forces the
  answer into the conversation's language. Translating them is a behavior change
  that needs A/B testing, not a find-replace. See the *Language* note in the
  [README](README.md#-documentation) and `src/main/core/prompt.ts`.

Old commits stay in Spanish; we don't rewrite history.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/). This isn't
cosmetic: **Release Please reads these to build the changelog and pick the next
version**, so a free-form subject produces no release and is silently ignored.

A `commit-msg` hook (husky + commitlint) enforces the *format* on every commit.
It cannot check that the message is English — that's on you.

```
feat(overlay): add copy button to every answer
fix(stt): retry whisper-server after a transient failure
docs: split README into README + USAGE
chore(deps): bump electron to 43.2
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`,
`ci`. Add `!` after the type (or a `BREAKING CHANGE:` footer) for a breaking
change.

## Development

```bash
npm install         # also installs the git hooks (husky)
npm run dev         # app in dev mode with HMR
npm run typecheck   # tsc on both projects (node and web)
npm run lint        # eslint
npm test            # vitest — pure logic: buffer, detector, VAD
npm run build:win   # NSIS installer + portable
```

Run `npm run typecheck && npm run lint && npm test` before opening a PR; CI runs
the same on every push.

## Where things live

| Document | For |
|---|---|
| [USAGE.md](USAGE.md) | How every feature works |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Where code lives and how data flows |
| [CONTEXT.md](CONTEXT.md) | Why it's built this way — read before "fixing" something that looks odd |

Adding a transcription engine, an answer provider, a prompt profile or a skill
is a small, well-defined change — see
[ARCHITECTURE.md §8](ARCHITECTURE.md#8-how-to-add-things). The factories use
exhaustive `switch`/`Record` types, so adding an id without handling it breaks
the build instead of failing at runtime.

## A note on the app name

`app.name` is `interview-helper` and **must not change**: the user-data path and
the encrypted secrets key derive from it. The product name is *Tayori*
(`productName` / `executableName` in `electron-builder.yml`). Don't confuse the
two.

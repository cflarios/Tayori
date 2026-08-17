# Security Policy

Thanks for helping keep Tayori and its users safe.

## Supported versions

Tayori ships as a rolling release: only the **latest published release** on the
[Releases page](https://github.com/cflarios/Tayori/releases) receives security
fixes. There are no long-term support branches. Please update before reporting a
problem you hit on an older build.

| Version | Supported |
|---|---|
| Latest release | ✅ |
| Anything older | ❌ |

## Reporting a vulnerability

**Please do not open a public issue for security problems.** A public report
tells everyone about the hole before there's a fix.

Instead, use GitHub's private vulnerability reporting:

1. Go to the [**Security** tab](https://github.com/cflarios/Tayori/security).
2. Click **Report a vulnerability**.
3. Describe the issue, the impact, and how to reproduce it.

This opens a private advisory only the maintainers can see, where we can discuss
and fix it before disclosure.

What to expect:

- An acknowledgement within a few days.
- An honest assessment of severity and, if valid, a fix in the next release.
- Credit in the advisory once it's public, unless you'd rather stay anonymous.

Please give us a reasonable window to release a fix before disclosing publicly.

## Scope

In scope — issues in Tayori's own code, for example:

- Leaks of the locally stored API keys or other secrets.
- Ways the overlay becomes visible in a screen capture when it shouldn't.
- Remote code execution, or the app fetching and running untrusted code.
- Exposure of the transcript or conversation history to another party.

Out of scope:

- Vulnerabilities in third-party providers (OpenAI, Google, Ollama, …) or in
  Electron/Chromium itself — report those upstream.
- The **documented limits** of invisible mode. Tayori excludes its window from
  the capture buffer, but this is *not* a guarantee of secrecy: it does not hide
  the process, the microphone audio, or a camera pointed at the screen. This is
  by design and explained in
  [USAGE.md](USAGE.md#invisible-mode-what-it-protects-and-what-it-doesnt) — it's
  a known limitation, not a vulnerability.

## A note on how Tayori handles your data

Tayori is a local desktop app. Your API keys are stored encrypted on your
machine, and audio and transcripts are sent only to the providers you configure
— there is no Tayori backend in between. See
[Privacy at a glance](README.md#-privacy-at-a-glance) for the short version.

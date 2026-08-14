import { app } from 'electron';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { m } from './i18n';

/**
 * File log of the main process.
 *
 * Until now the main process's `console.*` only existed if you launched from a
 * terminal with `npm run dev`. In the packaged `.exe` —which is how the app is
 * really used— **there was nowhere to look**: a Gemini Live or Whisper failure
 * looked exactly like "doesn't respond". This module exists to make that
 * difference visible.
 *
 * The `console.*` are wrapped instead of replaced by a custom logger: that way
 * the 15 log points that already existed start persisting without touching them,
 * and nobody has to remember to import anything for their message to be saved.
 */

/** Above this it rotates. A diagnostic log must not grow without end. */
const MAX_BYTES = 1024 * 1024;

let logFile: string | null = null;

function logDir(): string {
  return join(app.getPath('userData'), 'logs');
}

/** Rotates to `.1` when the file goes over size. Only one round is kept. */
function rotateIfNeeded(file: string): void {
  try {
    if (!existsSync(file) || statSync(file).size < MAX_BYTES) return;
    renameSync(file, `${file}.1`);
  } catch {
    // If rotation fails we keep writing to the same file: losing the log for not
    // being able to rotate it would be worse than a big file.
  }
}

function write(level: string, args: unknown[]): void {
  if (!logFile) return;
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 23);
  const body = args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) return `${arg.message}\n${arg.stack ?? ''}`;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');

  try {
    rotateIfNeeded(logFile);
    appendFileSync(logFile, `${stamp} ${level.padEnd(5)} ${body}\n`, 'utf-8');
  } catch {
    // A failure writing the log can NEVER take down the app: it's diagnostics,
    // not functionality.
  }
}

/**
 * Starts logging. It has to be called as early as possible at startup, and
 * always AFTER `app.setName`, because the path comes from `userData`.
 */
export function initLogging(): void {
  if (logFile) return;

  try {
    mkdirSync(logDir(), { recursive: true });
  } catch {
    return;
  }
  logFile = join(logDir(), 'main.log');

  const original = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  console.log = (...args: unknown[]): void => {
    original.log(...args);
    write('INFO', args);
  };
  console.warn = (...args: unknown[]): void => {
    original.warn(...args);
    write('WARN', args);
  };
  console.error = (...args: unknown[]): void => {
    original.error(...args);
    write('ERROR', args);
  };

  // An uncaught failure in main leaves the app half-alive and with no trace;
  // with this at least what happened gets written down.
  process.on('uncaughtException', (err) => {
    write('FATAL', [err]);
  });
  process.on('unhandledRejection', (reason) => {
    write('FATAL', ['unhandledRejection:', reason]);
  });

  console.log(`── sesión iniciada · ${app.getVersion()} · ${process.platform} ──`);
}

export function logLocation(): string {
  return logFile ?? logDir();
}

/** Last `lines` lines, which is the only thing looked at when diagnosing. */
export function readLogTail(lines = 300): string {
  if (!logFile || !existsSync(logFile)) return '';
  try {
    const all = readFileSync(logFile, 'utf-8').split('\n');
    return all.slice(-lines).join('\n').trim();
  } catch (err) {
    // It's read in Diagnostics, so it goes in the interface language.
    return m('diag.logUnreadable', {
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

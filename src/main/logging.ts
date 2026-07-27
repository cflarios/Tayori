import { app } from 'electron';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Log a archivo del proceso principal.
 *
 * Hasta ahora los `console.*` del main sólo existían si arrancabas desde una
 * terminal con `npm run dev`. En el `.exe` empaquetado —que es como se usa la
 * app de verdad— **no había ningún sitio donde mirar**: un fallo de Gemini Live
 * o de Whisper se veía exactamente igual que "no responde". Este módulo existe
 * para que esa diferencia sea visible.
 *
 * Se envuelven los `console.*` en lugar de sustituirlos por un logger propio:
 * así los 15 puntos de log que ya existían empiezan a persistir sin tocarlos, y
 * nadie tiene que acordarse de importar nada para que su mensaje se guarde.
 */

/** Por encima de esto se rota. Un log de diagnóstico no debe crecer sin fin. */
const MAX_BYTES = 1024 * 1024;

let logFile: string | null = null;

function logDir(): string {
  return join(app.getPath('userData'), 'logs');
}

/** Rota a `.1` cuando el archivo se pasa de tamaño. Sólo se guarda una vuelta. */
function rotateIfNeeded(file: string): void {
  try {
    if (!existsSync(file) || statSync(file).size < MAX_BYTES) return;
    renameSync(file, `${file}.1`);
  } catch {
    // Si la rotación falla se sigue escribiendo en el mismo archivo: perder el
    // log por no poder rotarlo sería peor que un archivo grande.
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
    // Un fallo al escribir el log NUNCA puede tumbar la app: es diagnóstico,
    // no funcionalidad.
  }
}

/**
 * Empieza a registrar. Hay que llamarlo lo antes posible en el arranque, y
 * siempre DESPUÉS de `app.setName`, porque la ruta sale de `userData`.
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

  // Un fallo no capturado en el main deja la app medio viva y sin rastro; con
  // esto al menos queda escrito qué pasó.
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

/** Últimas `lines` líneas, que es lo único que se mira al diagnosticar. */
export function readLogTail(lines = 300): string {
  if (!logFile || !existsSync(logFile)) return '';
  try {
    const all = readFileSync(logFile, 'utf-8').split('\n');
    return all.slice(-lines).join('\n').trim();
  } catch (err) {
    return `No se pudo leer el log: ${err instanceof Error ? err.message : String(err)}`;
  }
}

import { spawn } from 'node:child_process';
import { Ollama } from 'ollama';
import type { SetupProgress } from '@shared/types';
import { probeOllama } from '../llm/ollama';
import { m } from '../i18n';

/**
 * Getting Ollama and a model onto the machine of someone who's installed nothing.
 *
 * ## Why winget and not downloading the installer ourselves
 *
 * The alternative was fetching the `.exe` from ollama.com and running it. It was
 * dropped: **downloading an executable and launching it is exactly the shape of a
 * compromised supply chain**, and for the user it's indistinguishable from the
 * app doing something shady. With winget we touch no binary: Microsoft's package
 * manager resolves the signed package, and the elevation prompt is painted by
 * Windows with its own face, not us with ours.
 *
 * The price is that winget may not be there (old Windows, trimmed image). There
 * there's no automatic plan B and there shouldn't be one either: the download
 * page opens and the person installs it. An app that insists on installing
 * software when the clean path isn't available is exactly what we don't want.
 *
 * ## None of this happens without being asked
 *
 * The two functions are called from a wizard button that says beforehand what
 * it's going to do and how much it takes. There's no path that installs or
 * downloads when the app starts.
 */

/** Exact package id. Verified with `winget search --id Ollama.Ollama`. */
const WINGET_PACKAGE = 'Ollama.Ollama';

/** An install on a slow network takes a while; hanging forever isn't an option. */
const INSTALL_TIMEOUT_MS = 10 * 60_000;

/** After installing, the server takes a bit to come up. */
const SERVER_WAIT_MS = 90_000;
const SERVER_POLL_MS = 2_000;

/**
 * `true` if Ollama is **installed**, whether or not its server is running.
 *
 * They're two distinct states and confusing them produced a real bug:
 * `probeOllama` responds if the **server** answers, and the wizard showed "You
 * don't have it installed" —with its install button— to someone who had just
 * installed it and only had the service stopped. Reinstalling on top fixes
 * nothing; what's needed is to open it.
 *
 * It's checked by launching `ollama --version`, which is the cheapest and
 * doesn't touch the network: if the executable isn't on the PATH, `spawn` fails
 * with ENOENT and the question is already answered.
 */
export function ollamaInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = spawn('ollama', ['--version'], { windowsHide: true });
    probe.on('error', () => resolve(false));
    probe.on('close', (code) => resolve(code === 0));
    setTimeout(() => {
      probe.kill();
      resolve(false);
    }, 5_000).unref();
  });
}

/** `true` if the clean install path exists on this machine. */
export function wingetAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    // `--version` is the cheapest check there is and doesn't touch the network.
    const probe = spawn('winget', ['--version'], { windowsHide: true });
    probe.on('error', () => resolve(false));
    probe.on('close', (code) => resolve(code === 0));
    // A winget that doesn't answer in five seconds is a winget that's no use.
    setTimeout(() => {
      probe.kill();
      resolve(false);
    }, 5_000).unref();
  });
}

/**
 * Installs Ollama and waits for its server to answer.
 *
 * Installing isn't the same as being ready: the installer returns before the
 * service accepts connections, and if the wizard took the step as good there,
 * the next one —downloading the model— would fail with a "couldn't connect" that
 * looks like an installation failure.
 */
export async function installOllama(
  baseUrl: string,
  onProgress: (progress: SetupProgress) => void
): Promise<{ ok: boolean; error?: string }> {
  if (!(await wingetAvailable())) {
    return { ok: false, error: m('setup.noWinget') };
  }

  onProgress({ phase: 'install', message: m('setup.installing') });

  const result = await runWinget();
  if (!result.ok) return result;

  onProgress({ phase: 'install', message: m('setup.waitingServer') });

  const deadline = Date.now() + SERVER_WAIT_MS;
  while (Date.now() < deadline) {
    const status = await probeOllama(baseUrl);
    if (status.reachable) {
      onProgress({ phase: 'install', message: m('setup.running') });
      return { ok: true };
    }
    await sleep(SERVER_POLL_MS);
  }

  return { ok: false, error: m('setup.serverSilent') };
}

/** Launches winget and translates the result. No `shell`: the path has spaces. */
function runWinget(): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      'winget',
      [
        'install',
        '--id',
        WINGET_PACKAGE,
        '--exact',
        '--silent',
        // Without this winget can sit waiting for an answer no one is going to
        // type: there's no console to answer it in.
        '--disable-interactivity',
        '--accept-source-agreements',
        '--accept-package-agreements',
      ],
      { windowsHide: true }
    );

    /** Only used if something fails: winget explains its errors fairly well. */
    let output = '';
    const capture = (chunk: Buffer): void => {
      output += chunk.toString('utf8');
      // A verbose installer can't eat the main process's memory.
      if (output.length > 8_000) output = output.slice(-4_000);
    };
    child.stdout?.on('data', capture);
    child.stderr?.on('data', capture);

    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, error: m('setup.tooLong') });
    }, INSTALL_TIMEOUT_MS);

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: m('setup.wingetFailedToRun', { detail: err.message }) });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ ok: true });
        return;
      }
      console.error(`[setup] winget salió con ${code}: ${output.trim().slice(-500)}`);
      resolve({
        ok: false,
        // The exit code alone tells no one anything; winget's last line is
        // usually the sentence that explains what happened.
        error: m('setup.wingetFailed', {
          code: code ?? '?',
          detail: lastLine(output) || m('setup.tryManually'),
        }),
      });
    });
  });
}

/**
 * Downloads a model, reporting the bytes.
 *
 * Without the bar, a three-gig `pull` is the app frozen for ten minutes: there's
 * no signal that anything is happening. And downloading without saying how much
 * it takes would be the kind of surprise paid for in someone else's data.
 */
export async function pullModel(
  baseUrl: string,
  model: string,
  onProgress: (progress: SetupProgress) => void
): Promise<{ ok: boolean; error?: string }> {
  const client = new Ollama({ host: baseUrl });

  try {
    const stream = await client.pull({ model, stream: true });

    for await (const chunk of stream) {
      onProgress({
        phase: 'pull',
        model,
        message: chunk.status,
        // `completed` and `total` only come on the layers being downloaded; on
        // the verification steps they arrive at zero and the bar mustn't jump.
        ...(chunk.total ? { receivedBytes: chunk.completed ?? 0, totalBytes: chunk.total } : {}),
      });
    }

    console.log(`[setup] modelo "${model}" listo`);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[setup] no se pudo descargar "${model}": ${message}`);
    return {
      ok: false,
      error: /not found|manifest/i.test(message)
        ? m('setup.modelNotFound', { model })
        : m('setup.pullFailed', { model, detail: message }),
    };
  }
}

function lastLine(output: string): string {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines[lines.length - 1] ?? '';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

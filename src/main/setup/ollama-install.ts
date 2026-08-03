import { spawn } from 'node:child_process';
import { Ollama } from 'ollama';
import type { SetupProgress } from '@shared/types';
import { probeOllama } from '../llm/ollama';

/**
 * Poner Ollama y un modelo en la máquina de alguien que no ha instalado nada.
 *
 * ## Por qué winget y no descargar el instalador nosotros
 *
 * La alternativa era bajar el `.exe` de ollama.com y ejecutarlo. Se descartó:
 * **descargar un ejecutable y lanzarlo es exactamente la forma de una cadena de
 * suministro comprometida**, y para el usuario es indistinguible de que la app
 * haga algo turbio. Con winget no tocamos ningún binario: el gestor de paquetes
 * de Microsoft resuelve el paquete firmado, y el aviso de elevación lo pinta
 * Windows con su propia cara, no nosotros con la nuestra.
 *
 * El precio es que winget puede no estar (Windows viejo, imagen recortada). Ahí
 * no hay plan B automático y tampoco debería haberlo: se abre la página de
 * descarga y lo instala la persona. Una app que insiste en instalar software
 * cuando el camino limpio no está disponible es justo lo que no queremos.
 *
 * ## Nada de esto pasa sin que lo pidan
 *
 * Las dos funciones se llaman desde un botón del asistente que dice antes qué va
 * a hacer y cuánto ocupa. No hay ninguna ruta que instale o descargue al
 * arrancar la app.
 */

/** Id exacto del paquete. Verificado con `winget search --id Ollama.Ollama`. */
const WINGET_PACKAGE = 'Ollama.Ollama';

/** Una instalación con red lenta tarda; colgarse para siempre no es opción. */
const INSTALL_TIMEOUT_MS = 10 * 60_000;

/** Tras instalar, el servidor tarda un poco en levantar. */
const SERVER_WAIT_MS = 90_000;
const SERVER_POLL_MS = 2_000;

/**
 * `true` si Ollama está **instalado**, corra o no su servidor.
 *
 * Son dos estados distintos y confundirlos producía un fallo de verdad:
 * `probeOllama` responde si el **servidor** contesta, y el asistente enseñaba
 * «No lo tienes instalado» —con su botón de instalar— a quien acababa de
 * instalarlo y sólo tenía el servicio parado. Volver a instalar por encima no
 * arregla nada; lo que hace falta es abrirlo.
 *
 * Se comprueba lanzando `ollama --version`, que es lo más barato y no toca la
 * red: si el ejecutable no está en el PATH, `spawn` falla con ENOENT y ya está
 * respondida la pregunta.
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

/** `true` si existe el camino limpio de instalación en esta máquina. */
export function wingetAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    // `--version` es la comprobación más barata que existe y no toca la red.
    const probe = spawn('winget', ['--version'], { windowsHide: true });
    probe.on('error', () => resolve(false));
    probe.on('close', (code) => resolve(code === 0));
    // Un winget que no contesta en cinco segundos es un winget que no sirve.
    setTimeout(() => {
      probe.kill();
      resolve(false);
    }, 5_000).unref();
  });
}

/**
 * Instala Ollama y espera a que su servidor conteste.
 *
 * Instalar no es lo mismo que estar listo: el instalador vuelve antes de que el
 * servicio acepte conexiones, y si el asistente diera el paso por bueno ahí, el
 * siguiente —descargar el modelo— fallaría con un "no se pudo conectar" que
 * parece un fallo de la instalación.
 */
export async function installOllama(
  baseUrl: string,
  onProgress: (progress: SetupProgress) => void
): Promise<{ ok: boolean; error?: string }> {
  if (!(await wingetAvailable())) {
    return {
      ok: false,
      error:
        'No hay winget en este equipo, así que no puedo instalarlo por ti sin descargar un ' +
        'ejecutable por mi cuenta, y eso no lo voy a hacer. Instala Ollama desde ollama.com y ' +
        'vuelve aquí: el asistente lo detectará solo.',
    };
  }

  onProgress({ phase: 'install', message: 'Instalando Ollama con winget…' });

  const result = await runWinget();
  if (!result.ok) return result;

  onProgress({ phase: 'install', message: 'Instalado. Esperando a que arranque el servidor…' });

  const deadline = Date.now() + SERVER_WAIT_MS;
  while (Date.now() < deadline) {
    const status = await probeOllama(baseUrl);
    if (status.reachable) {
      onProgress({ phase: 'install', message: 'Ollama está corriendo.' });
      return { ok: true };
    }
    await sleep(SERVER_POLL_MS);
  }

  return {
    ok: false,
    error:
      'Ollama se instaló pero su servidor no respondió. Suele arreglarse abriendo Ollama una ' +
      'vez desde el menú de inicio; después vuelve aquí.',
  };
}

/** Lanza winget y traduce el resultado. Sin `shell`: la ruta lleva espacios. */
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
        // Sin esto winget puede quedarse esperando una respuesta que nadie va a
        // teclear: no hay consola donde contestarle.
        '--disable-interactivity',
        '--accept-source-agreements',
        '--accept-package-agreements',
      ],
      { windowsHide: true }
    );

    /** Sólo se usa si algo falla: winget explica bastante bien sus errores. */
    let output = '';
    const capture = (chunk: Buffer): void => {
      output += chunk.toString('utf8');
      // Un instalador verboso no puede comerse la memoria del proceso principal.
      if (output.length > 8_000) output = output.slice(-4_000);
    };
    child.stdout?.on('data', capture);
    child.stderr?.on('data', capture);

    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, error: 'La instalación tardó más de 10 minutos y se canceló.' });
    }, INSTALL_TIMEOUT_MS);

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: `No se pudo ejecutar winget: ${err.message}` });
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
        // El código de salida solo no le dice nada a nadie; la última línea de
        // winget suele ser la frase que explica qué pasó.
        error: `winget falló (código ${code}). ${lastLine(output) || 'Prueba a instalarlo desde ollama.com.'}`,
      });
    });
  });
}

/**
 * Descarga un modelo, informando de los bytes.
 *
 * Sin la barra, un `pull` de tres gigas es la app congelada durante diez
 * minutos: no hay ninguna señal de que esté pasando algo. Y descargar sin
 * decir cuánto ocupa sería el tipo de sorpresa que se paga en datos de otro.
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
        // `completed` y `total` sólo vienen en las capas que se descargan; en
        // los pasos de verificación llegan a cero y la barra no debe saltar.
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
      error:
        /not found|manifest/i.test(message)
          ? `Ollama no encuentra el modelo "${model}". Puede que haya cambiado de nombre; búscalo en ollama.com/library.`
          : `No se pudo descargar "${model}": ${message}`,
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

import { app } from 'electron';
import { isNewerVersion, type UpdateInfo } from '@shared/types';

/**
 * Comprobación de actualizaciones bajo demanda.
 *
 * La app se distribuye como `.exe` portable sin firmar, así que el auto-update
 * estándar (electron-updater, que necesita el instalador NSIS + `latest.yml`) no
 * encaja. En su lugar: se consulta la API pública de releases de GitHub, se
 * compara la versión y, si hay una nueva, el dashboard ofrece descargar el nuevo
 * portable en el navegador. La descarga la hace el navegador —no la app baja y
 * ejecuta un binario por su cuenta—, que es la misma cautela con la que se
 * instala Ollama por winget en vez de bajando el `.exe`.
 *
 * Sólo se llama cuando el usuario pulsa el botón: nada de red al arrancar, así el
 * límite de 60 peticiones/hora sin autenticar de GitHub sobra de largo.
 */

const REPO = 'cflarios/Tayori';

export async function checkForUpdate(): Promise<UpdateInfo | { error: string }> {
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
        // GitHub rechaza peticiones sin User-Agent.
        'User-Agent': 'Tayori-Updater',
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return { error: `GitHub respondió HTTP ${response.status}` };
    }

    const data = (await response.json()) as {
      tag_name?: string;
      html_url?: string;
      body?: string;
      assets?: { name?: string; browser_download_url?: string }[];
    };

    const latest = (data.tag_name ?? '').replace(/^v/i, '');
    if (!latest) {
      return { error: 'La respuesta de GitHub no traía número de versión.' };
    }

    const current = app.getVersion();
    const portable = data.assets?.find((asset) => /portable\.exe$/i.test(asset.name ?? ''));

    return {
      current,
      latest,
      isNewer: isNewerVersion(latest, current),
      notes: (data.body ?? '').trim(),
      releaseUrl: data.html_url ?? `https://github.com/${REPO}/releases/latest`,
      downloadUrl: portable?.browser_download_url ?? '',
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

import { app } from 'electron';
import { isNewerVersion, type UpdateInfo } from '@shared/types';

/**
 * On-demand update check.
 *
 * The app is distributed as an unsigned portable `.exe`, so the standard
 * auto-update (electron-updater, which needs the NSIS installer + `latest.yml`)
 * doesn't fit. Instead: GitHub's public releases API is queried, the version is
 * compared and, if there's a new one, the dashboard offers to download the new
 * portable in the browser. The download is done by the browser —the app doesn't
 * fetch and run a binary on its own—, which is the same caution with which Ollama
 * is installed via winget instead of downloading the `.exe`.
 *
 * It's only called when the user presses the button: no network at startup, so
 * GitHub's 60-requests/hour unauthenticated limit is more than enough.
 */

const REPO = 'cflarios/Tayori';

export async function checkForUpdate(): Promise<UpdateInfo | { error: string }> {
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
        // GitHub rejects requests with no User-Agent.
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
      releaseUrl: data.html_url ?? `https://github.com/${REPO}/releases/latest`,
      downloadUrl: portable?.browser_download_url ?? '',
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

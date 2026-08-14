import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Launches electron-builder choosing an output directory that OneDrive doesn't
 * sync.
 *
 * The problem is real and reproducible: if the project lives inside OneDrive,
 * electron-builder fails to unpack Electron with
 *
 *   EPERM: operation not permitted, rename 'release\\win-unpacked.tmp' -> 'release\\win-unpacked'
 *
 * because OneDrive holds a lock on the folder while it syncs it. The build is
 * ~215 MB of artifacts that also makes no sense to upload to the cloud, so when
 * we detect that the project is synced we send the output to a local path.
 *
 * It can be forced with the IH_BUILD_OUT environment variable.
 */

const projectRoot = resolve(import.meta.dirname, '..');

/** Heuristic: is the path inside a OneDrive-synced folder? */
function isCloudSynced(path) {
  const normalized = path.toLowerCase();
  const markers = ['onedrive', 'dropbox', 'google drive', 'icloud'];
  if (markers.some((marker) => normalized.includes(marker))) return true;

  // OneDrive can also redirect Documents without it showing up in the path.
  for (const env of ['OneDrive', 'OneDriveCommercial', 'OneDriveConsumer']) {
    const root = process.env[env];
    if (root && normalized.startsWith(root.toLowerCase())) return true;
  }
  return false;
}

function pickOutputDir() {
  if (process.env.IH_BUILD_OUT) return resolve(process.env.IH_BUILD_OUT);
  if (!isCloudSynced(projectRoot)) return join(projectRoot, 'release');

  const localAppData = process.env.LOCALAPPDATA;
  const base = localAppData && existsSync(localAppData) ? localAppData : tmpdir();
  return join(base, 'Tayori-release');
}

const outputDir = pickOutputDir();
const relocated = !outputDir.startsWith(projectRoot);
const requestedArgs = process.argv.slice(2);
const includesPlatformTarget = requestedArgs.some((arg) =>
  ['--win', '--mac', '--linux'].includes(arg)
);

if (relocated) {
  console.log(
    `\n[build] El proyecto está en una carpeta sincronizada en la nube.\n` +
      `[build] Los artefactos irán a: ${outputDir}\n` +
      `[build] (OneDrive bloquea la carpeta y electron-builder falla con EPERM).\n` +
      `[build] Fuerza otra ruta con IH_BUILD_OUT si lo prefieres.\n`
  );
}

// cli.js is invoked with node itself instead of `npx ... {shell:true}`:
// passing arguments with a shell concatenates them without escaping, and Node
// warns about it (DEP0190). Without a shell there's also no need to worry about
// paths with spaces, which is exactly this project's case if it lives under a
// folder with spaces.
const cli = join(projectRoot, 'node_modules', 'electron-builder', 'cli.js');
if (!existsSync(cli)) {
  console.error('[build] No se encontró electron-builder. Ejecuta `npm install` primero.');
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [
    cli,
    ...(includesPlatformTarget ? [] : ['--win']),
    '--config',
    'electron-builder.yml',
    `--config.directories.output=${outputDir}`,
    ...requestedArgs,
  ],
  { cwd: projectRoot, stdio: 'inherit' }
);

if (result.status !== 0) process.exit(result.status ?? 1);

console.log(`\n[build] Listo. Artefactos en: ${outputDir}\n`);

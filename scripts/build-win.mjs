import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Lanza electron-builder eligiendo un directorio de salida que OneDrive no
 * sincronice.
 *
 * El problema es real y reproducible: si el proyecto vive dentro de OneDrive,
 * electron-builder falla al desempaquetar Electron con
 *
 *   EPERM: operation not permitted, rename 'release\\win-unpacked.tmp' -> 'release\\win-unpacked'
 *
 * porque OneDrive mantiene un lock sobre la carpeta mientras la sincroniza. El
 * build son ~215 MB de artefactos que además no tiene ningún sentido subir a la
 * nube, así que cuando detectamos que el proyecto está sincronizado sacamos la
 * salida a una ruta local.
 *
 * Se puede forzar con la variable de entorno IH_BUILD_OUT.
 */

const projectRoot = resolve(import.meta.dirname, '..');

/** Heurística: ¿está la ruta dentro de una carpeta sincronizada por OneDrive? */
function isCloudSynced(path) {
  const normalized = path.toLowerCase();
  const markers = ['onedrive', 'dropbox', 'google drive', 'icloud'];
  if (markers.some((marker) => normalized.includes(marker))) return true;

  // OneDrive también puede redirigir Documentos sin que aparezca en la ruta.
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

// Se invoca el cli.js con el propio node en lugar de `npx ... {shell:true}`:
// pasar argumentos con shell los concatena sin escapar, y Node avisa de ello
// (DEP0190). Sin shell tampoco hay que preocuparse por rutas con espacios,
// que es justo el caso de este proyecto si vive bajo una carpeta con espacios.
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

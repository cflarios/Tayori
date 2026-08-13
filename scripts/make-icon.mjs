/**
 * Genera `build/icon.ico` (multi-tamaño) a partir de `build/icon.svg`.
 *
 * El .ico lo consume electron-builder para el icono del `.exe`, del instalador y
 * del acceso directo. Se regenera a mano —no en cada build— porque cambia sólo
 * cuando cambia la mascota; el resultado se commitea como asset binario.
 *
 * Las dependencias NO viven en el proyecto (son sólo para esto): instálalas al
 * vuelo antes de ejecutar y quítalas después:
 *
 *   npm i -D @resvg/resvg-js png-to-ico
 *   node scripts/make-icon.mjs
 *   npm remove @resvg/resvg-js png-to-ico
 *
 * `@resvg/resvg-js` rasteriza el SVG (con gradientes) a cada tamaño y `png-to-ico`
 * los empaqueta. Se renderiza a cada tamaño en vez de escalar uno grande para que
 * el icono pequeño (16/32) salga nítido.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import pngToIco from 'png-to-ico';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'build', 'icon.svg'), 'utf-8');

const sizes = [256, 128, 64, 48, 32, 16];
const pngs = sizes.map((value) =>
  Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value } }).render().asPng())
);

const ico = await pngToIco(pngs);
writeFileSync(join(root, 'build', 'icon.ico'), ico);
console.log(`build/icon.ico generado (${sizes.join(', ')} px, ${ico.length} bytes)`);

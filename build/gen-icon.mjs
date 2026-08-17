/**
 * Regenerates the app icon from `build/icon.svg` into a multi-size `.ico`:
 *   - `build/icon.ico`            → the electron-builder icon (exe/installer)
 *   - `resources/icons/tayori.ico`→ the runtime taskbar icon / decoy «Off»
 *
 * It's a one-off maintenance task, so its tools aren't project dependencies. Run
 * it with a throwaway install:
 *
 *   npm i --no-save sharp png-to-ico && node build/gen-icon.mjs
 *
 * The SVG has a transparent background on purpose — just the ghost, no tile.
 */
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'build/icon.svg'));
const sizes = [16, 24, 32, 48, 64, 128, 256];

const pngs = await Promise.all(
  sizes.map((size) =>
    sharp(svg, { density: 512 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
  )
);

const ico = await pngToIco(pngs);
writeFileSync(join(root, 'build/icon.ico'), ico);
writeFileSync(join(root, 'resources/icons/tayori.ico'), ico);
console.log(`icon.ico regenerated (${ico.length} bytes, sizes ${sizes.join(', ')})`);

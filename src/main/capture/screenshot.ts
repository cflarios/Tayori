import { app, desktopCapturer, screen } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ImageAttachment } from '@shared/types';
import { aHashFromBitmap } from './frame-hash';

/**
 * Screenshot capture to use as visual context.
 *
 * Useful side effect of content protection: the overlay does NOT appear in its
 * own capture, because `WDA_EXCLUDEFROMCAPTURE` excludes it from the compositor
 * just like from a screen share. There's no need to hide it before capturing.
 *
 * It's compressed to JPEG for cost: a 1920x1080 capture in PNG runs about 2-3 MB
 * of base64, and the vision models don't care about lossy compression for
 * reading on-screen text.
 */

/**
 * Maximum width sent to the model. Claude accepts up to 2576 px on the long side
 * (~4784 image tokens); 1600 px keeps the on-screen text legible at considerably
 * less cost per capture.
 */
const MAX_WIDTH = 1600;
const JPEG_QUALITY = 72;

/**
 * Quality for code mode.
 *
 * 72 is plenty for "there's a diagram on screen", but the JPEG artifact at that
 * quality eats exactly what matters here: the difference between `l` and `1`,
 * between `;` and `:`, and the subscripts of a prompt. A misread signature
 * produces a solution that won't compile, so the extra token cost is paid for.
 * It's not bumped to PNG because the model scales to ~1.5k px anyway.
 */
const CODE_JPEG_QUALITY = 92;

/** Side of the perceptual fingerprint: 8×8 = 64 bits, enough to deduplicate. */
const HASH_SIZE = 8;

/**
 * Captures the screen containing the cursor, at real resolution and before
 * compressing. It's the common part of `captureScreen` and `captureScreenFrame`.
 *
 * With several monitors, the cursor's screen is the one the user is looking at
 * — a much better heuristic than always taking the primary one.
 */
async function acquireScreen(): Promise<Electron.NativeImage | null> {
  const cursor = screen.getCursorScreenPoint();
  const target = screen.getDisplayNearestPoint(cursor);

  // `thumbnailSize` is the real capture resolution, not a thumbnail: it has to
  // be requested at the display's size or the image comes out illegible.
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: target.size.width * target.scaleFactor,
      height: target.size.height * target.scaleFactor,
    },
  });

  // `display_id` is the reliable way to pair source and display; the order of
  // `sources` doesn't match that of `screen.getAllDisplays()`.
  const source = sources.find((s) => s.display_id === String(target.id)) ?? sources[0];

  if (!source || source.thumbnail.isEmpty()) return null;
  return source.thumbnail;
}

/**
 * Debug dump, off by default.
 *
 * The app does NOT persist media: the captures go to the model and to the
 * overlay's thumbnail, never to disk. But with `IH_DEBUG_CAPTURES` in the
 * environment, each one is also written to `userData/debug-captures` so it can
 * be opened and the crop and legibility judged. It's best-effort and off the
 * critical path: if it fails, the capture still goes to the model. Development
 * only.
 */
async function dumpCapture(jpeg: Buffer, label: string): Promise<void> {
  if (!process.env.IH_DEBUG_CAPTURES) return;
  try {
    const dir = join(app.getPath('userData'), 'debug-captures');
    await mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = join(dir, `${stamp}-${label}.jpg`);
    await writeFile(file, jpeg);
    console.log(`[debug] captura guardada: ${file}`);
  } catch (err) {
    console.warn('[debug] no se pudo guardar la captura:', err);
  }
}

/** Shrinks to `MAX_WIDTH` if needed and compresses to base64 JPEG. */
function toJpegAttachment(
  thumb: Electron.NativeImage,
  forCode?: boolean,
  label = 'screen'
): ImageAttachment {
  const resized =
    thumb.getSize().width > MAX_WIDTH ? thumb.resize({ width: MAX_WIDTH, quality: 'good' }) : thumb;

  const jpeg = resized.toJPEG(forCode ? CODE_JPEG_QUALITY : JPEG_QUALITY);
  void dumpCapture(jpeg, label);
  return { mime: 'image/jpeg', base64: jpeg.toString('base64') };
}

/**
 * @param options.forCode Raises the quality so small text is legible.
 */
export async function captureScreen(
  options: { forCode?: boolean } = {}
): Promise<ImageAttachment | null> {
  const thumb = await acquireScreen();
  return thumb ? toJpegAttachment(thumb, options.forCode) : null;
}

/**
 * Like `captureScreen`, but also returns a perceptual fingerprint of the frame.
 *
 * "Chunk capture" in automatic mode uses it to deduplicate near-identical frames
 * (when the scroll stops). The fingerprint is taken from the full-resolution
 * frame —before the JPEG— reduced to 8×8 in gray: cheap and stable against
 * compression noise.
 */
export async function captureScreenFrame(
  options: { forCode?: boolean } = {}
): Promise<{ image: ImageAttachment; hash: bigint } | null> {
  const thumb = await acquireScreen();
  if (!thumb) return null;

  const small = thumb.resize({ width: HASH_SIZE, height: HASH_SIZE, quality: 'good' });
  return {
    image: toJpegAttachment(thumb, options.forCode, 'frame'),
    hash: aHashFromBitmap(small.toBitmap(), HASH_SIZE, HASH_SIZE),
  };
}

import { app, desktopCapturer, screen } from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ImageAttachment } from '@shared/types';
import { aHashFromBitmap } from './frame-hash';

/**
 * Captura de pantalla para usarla como contexto visual.
 *
 * Efecto secundario útil de la protección de contenido: el overlay NO sale en
 * su propia captura, porque `WDA_EXCLUDEFROMCAPTURE` lo excluye del compositor
 * igual que de un screen share. No hay que ocultarlo antes de capturar.
 *
 * Se comprime a JPEG por coste: una captura 1920x1080 en PNG ronda los 2-3 MB
 * de base64, y a los modelos de visión les da igual la compresión con pérdida
 * para leer texto de pantalla.
 */

/**
 * Ancho máximo enviado al modelo. Claude admite hasta 2576 px en el lado largo
 * (~4784 tokens de imagen); 1600 px conserva el texto de pantalla legible con
 * bastante menos coste por captura.
 */
const MAX_WIDTH = 1600;
const JPEG_QUALITY = 72;

/**
 * Calidad para el modo código.
 *
 * 72 vale de sobra para "hay un diagrama en pantalla", pero el artefacto de JPEG
 * a esa calidad se come justo lo que aquí importa: la diferencia entre `l` y
 * `1`, entre `;` y `:`, y los subíndices de un enunciado. Una firma mal leída
 * produce una solución que no compila, así que el coste extra en tokens está
 * pagado. No se sube a PNG porque el modelo escala a ~1,5k px de todas formas.
 */
const CODE_JPEG_QUALITY = 92;

/** Lado de la huella perceptual: 8×8 = 64 bits, suficiente para deduplicar. */
const HASH_SIZE = 8;

/**
 * Captura la pantalla que contiene el cursor, a resolución real y antes de
 * comprimir. Es la parte común de `captureScreen` y `captureScreenFrame`.
 *
 * Con varios monitores, la pantalla del cursor es la que el usuario está mirando
 * — mucho mejor heurística que coger siempre la principal.
 */
async function acquireScreen(): Promise<Electron.NativeImage | null> {
  const cursor = screen.getCursorScreenPoint();
  const target = screen.getDisplayNearestPoint(cursor);

  // `thumbnailSize` es la resolución real de captura, no una miniatura: hay que
  // pedirla del tamaño del display o la imagen sale ilegible.
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: target.size.width * target.scaleFactor,
      height: target.size.height * target.scaleFactor,
    },
  });

  // `display_id` es la forma fiable de emparejar fuente y display; el orden de
  // `sources` no coincide con el de `screen.getAllDisplays()`.
  const source = sources.find((s) => s.display_id === String(target.id)) ?? sources[0];

  if (!source || source.thumbnail.isEmpty()) return null;
  return source.thumbnail;
}

/**
 * Volcado de depuración, apagado por defecto.
 *
 * La app NO persiste medios: las capturas van al modelo y a la miniatura del
 * overlay, nunca al disco. Pero con `IH_DEBUG_CAPTURES` en el entorno, cada una
 * se escribe además a `userData/debug-captures` para poder abrirla y juzgar el
 * recorte y la legibilidad. Es best-effort y fuera del camino crítico: si falla,
 * la captura sigue yendo al modelo igual. Sólo para desarrollo.
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

/** Reduce a `MAX_WIDTH` si hace falta y comprime a JPEG base64. */
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
 * @param options.forCode Sube la calidad para que el texto pequeño se lea.
 */
export async function captureScreen(
  options: { forCode?: boolean } = {}
): Promise<ImageAttachment | null> {
  const thumb = await acquireScreen();
  return thumb ? toJpegAttachment(thumb, options.forCode) : null;
}

/**
 * Como `captureScreen`, pero además devuelve una huella perceptual del frame.
 *
 * Lo usa la "captura por trozos" en modo automático para deduplicar frames casi
 * idénticos (cuando el scroll se detiene). La huella se saca del frame a
 * resolución completa —antes del JPEG— reducido a 8×8 en gris: barato y estable
 * frente al ruido de compresión.
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

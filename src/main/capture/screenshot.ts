import { desktopCapturer, screen } from 'electron';
import type { ImageAttachment } from '@shared/types';

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
 * Captura la pantalla que contiene el cursor.
 *
 * Con varios monitores, la pantalla del cursor es la que el usuario está mirando
 * — mucho mejor heurística que coger siempre la principal.
 */
export async function captureScreen(): Promise<ImageAttachment | null> {
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
  const source =
    sources.find((s) => s.display_id === String(target.id)) ?? sources[0];

  if (!source || source.thumbnail.isEmpty()) return null;

  const resized =
    source.thumbnail.getSize().width > MAX_WIDTH
      ? source.thumbnail.resize({ width: MAX_WIDTH, quality: 'good' })
      : source.thumbnail;

  return {
    mime: 'image/jpeg',
    base64: resized.toJPEG(JPEG_QUALITY).toString('base64'),
  };
}

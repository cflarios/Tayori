import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';

/**
 * Extrae texto plano de un archivo de contexto subido en el dashboard.
 *
 * Vive en el main y no en el renderer a propósito: parsear un PDF (pdfjs por
 * debajo) o un .docx (descomprimir el zip y leer su XML) es trabajo pesado con
 * librerías, y el proyecto concentra eso en el proceso con Node. El renderer
 * sólo manda los bytes y recibe el texto. El texto plano (.txt/.md) ni siquiera
 * llega aquí: lo lee el propio renderer con FileReader, sin cruzar el IPC.
 *
 * Devuelve un resultado en vez de lanzar: un PDF cifrado o un archivo corrupto
 * es un caso normal —lo acaba de elegir el usuario— y el dashboard lo enseña
 * como un aviso en el propio dropzone, no como una excepción sin recoger.
 */
export type ParseResult = { ok: true; text: string } | { ok: false; error: string };

export async function parseDocument(name: string, data: ArrayBuffer): Promise<ParseResult> {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  const buffer = Buffer.from(data);

  try {
    if (ext === 'pdf') {
      const result = await pdfParse(buffer);
      return { ok: true, text: result.text.trim() };
    }
    if (ext === 'docx') {
      const result = await mammoth.extractRawText({ buffer });
      return { ok: true, text: result.value.trim() };
    }
    // El .doc antiguo (binario, no zip) no lo lee mammoth, y cualquier otra
    // extensión tampoco tiene parser: se dice en vez de devolver basura.
    return { ok: false, error: `unsupported:${ext}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

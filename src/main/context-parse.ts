import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';

/**
 * Extracts plain text from a context file uploaded in the dashboard.
 *
 * It lives in main and not in the renderer on purpose: parsing a PDF (pdfjs
 * underneath) or a .docx (unzipping and reading its XML) is heavy work with
 * libraries, and the project concentrates that in the Node process. The renderer
 * only sends the bytes and receives the text. Plain text (.txt/.md) doesn't even
 * reach here: the renderer reads it itself with FileReader, without crossing the
 * IPC.
 *
 * It returns a result instead of throwing: an encrypted PDF or a corrupt file is
 * a normal case —the user just chose it— and the dashboard shows it as a warning
 * in the dropzone itself, not as an uncaught exception.
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
    // The old .doc (binary, not zip) isn't read by mammoth, and any other
    // extension has no parser either: it's said instead of returning garbage.
    return { ok: false, error: `unsupported:${ext}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

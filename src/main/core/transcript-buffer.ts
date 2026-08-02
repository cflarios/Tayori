import { randomUUID } from 'node:crypto';
import type { Speaker, TranscriptSegment } from '@shared/types';

/**
 * Ventana rodante de la conversación.
 *
 * Los motores de STT emiten resultados parciales que se van revisando antes de
 * cerrarse. El buffer los consolida: mientras un hablante tiene un segmento
 * abierto, cada parcial REEMPLAZA el texto en lugar de añadir una línea nueva.
 * Sin esto el transcript se llenaría de versiones intermedias de la misma
 * frase y el contexto que mandamos al LLM sería basura repetida.
 */
export class TranscriptBuffer {
  private segments: TranscriptSegment[] = [];
  /** Segmento abierto por hablante (aún no finalizado). */
  private open = new Map<Speaker, TranscriptSegment>();

  constructor(private maxSegments = 40) {}

  /**
   * Incorpora un resultado del STT y devuelve el segmento resultante, que es lo
   * que se difunde al overlay.
   *
   * Los proveedores difieren en si los parciales son acumulativos (el texto
   * completo hasta ahora) o incrementales (sólo lo nuevo). Gemini Live envía
   * fragmentos incrementales, así que concatenamos.
   */
  ingest(
    speaker: Speaker,
    text: string,
    isFinal: boolean,
    /**
     * `true` si `text` ya es el turno entero. Ver `TranscriptEvent.cumulative`:
     * concatenarlo escribiría la frase dos veces, que es un fallo que se vio en
     * pantalla con la API en tiempo real de OpenAI.
     */
    cumulative = false
  ): TranscriptSegment {
    const now = Date.now();
    const existing = this.open.get(speaker);

    if (existing) {
      existing.text = cumulative ? text.trim() : joinFragments(existing.text, text);
      existing.isFinal = isFinal;
      if (isFinal) {
        existing.endedAt = now;
        this.open.delete(speaker);
      }
      return existing;
    }

    const segment: TranscriptSegment = {
      id: randomUUID(),
      speaker,
      text: text.trimStart(),
      isFinal,
      startedAt: now,
      ...(isFinal ? { endedAt: now } : {}),
    };

    if (!isFinal) this.open.set(speaker, segment);
    this.segments.push(segment);
    this.trim();
    return segment;
  }

  /**
   * Cierra a la fuerza el segmento abierto de un hablante.
   *
   * Necesario porque algunos motores nunca marcan `finished` si el hablante se
   * queda callado sin más: sin esto el segmento quedaría abierto para siempre y
   * el detector de preguntas nunca se dispararía.
   */
  finalizeOpen(speaker: Speaker): TranscriptSegment | null {
    const segment = this.open.get(speaker);
    if (!segment) return null;
    segment.isFinal = true;
    segment.endedAt = Date.now();
    this.open.delete(speaker);
    return segment;
  }

  private trim(): void {
    if (this.segments.length <= this.maxSegments) return;
    const removed = this.segments.splice(0, this.segments.length - this.maxSegments);
    // Si se descarta un segmento que seguía abierto, hay que soltar la
    // referencia o `ingest` seguiría escribiendo en un objeto ya olvidado.
    for (const segment of removed) {
      const open = this.open.get(segment.speaker);
      if (open && open.id === segment.id) this.open.delete(segment.speaker);
    }
  }

  /** Todos los segmentos, del más antiguo al más reciente. */
  all(): readonly TranscriptSegment[] {
    return this.segments;
  }

  /** Segmentos que empezaron dentro de los últimos `seconds`. */
  recent(seconds: number): TranscriptSegment[] {
    const cutoff = Date.now() - seconds * 1000;
    return this.segments.filter((s) => s.startedAt >= cutoff);
  }

  /**
   * Transcript formateado para inyectar en el prompt del LLM.
   * Las etiquetas son explícitas porque el modelo necesita saber a quién
   * responder: confundir los papeles produce respuestas inútiles.
   */
  format(segments: readonly TranscriptSegment[] = this.segments): string {
    return segments
      .filter((s) => s.text.trim().length > 0)
      .map((s) => `${s.speaker === 'me' ? 'YO' : 'ENTREVISTADOR'}: ${s.text.trim()}`)
      .join('\n');
  }

  /** Última intervención cerrada del interlocutor: la pregunta a responder. */
  lastFrom(speaker: Speaker): TranscriptSegment | null {
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const segment = this.segments[i];
      if (segment && segment.speaker === speaker && segment.text.trim()) return segment;
    }
    return null;
  }

  clear(): void {
    this.segments = [];
    this.open.clear();
  }
}

/**
 * Une dos fragmentos de transcripción respetando los espacios.
 *
 * Los motores mandan trozos que a veces ya traen espacio inicial y a veces no,
 * y también signos de puntuación que deben pegarse a la palabra anterior. Sin
 * esta normalización el texto sale con espacios dobles o palabras pegadas.
 */
function joinFragments(left: string, right: string): string {
  if (!left) return right.trimStart();
  if (!right) return left;

  const endsWithSpace = /\s$/.test(left);
  const startsWithSpace = /^\s/.test(right);
  const startsWithPunctuation = /^[.,;:!?)\]}»…]/.test(right.trimStart());

  if (endsWithSpace || startsWithSpace || startsWithPunctuation) {
    return startsWithPunctuation ? left.trimEnd() + right.trimStart() : left + right;
  }
  return `${left} ${right.trimStart()}`;
}

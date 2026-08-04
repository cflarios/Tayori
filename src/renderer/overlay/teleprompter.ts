import { parseAnswerBlocks } from './answer-format';

/**
 * Parte una respuesta en líneas que se puedan decir de un tirón.
 *
 * ## Qué problema resuelve, que no es el que parece
 *
 * Lo que delata que alguien está leyendo **no es el tamaño de la letra**: es el
 * movimiento horizontal de los ojos. Barrer una línea larga de izquierda a
 * derecha y volver al principio de la siguiente se ve desde el otro lado de una
 * videollamada, y se ve mucho. Por eso poner la respuesta "en grande" empeora
 * el problema en vez de arreglarlo: una viñeta en letra grande es más ancha.
 *
 * La solución de cualquier teleprompter de verdad es la contraria: **columna
 * estrecha y una frase por línea**, de modo que los ojos apenas se muevan y la
 * línea activa esté siempre a la misma altura. Eso es lo que hace esta función.
 *
 * ## Dónde se corta
 *
 * Por donde una persona respiraría, en este orden: final de frase, después una
 * pausa fuerte (`;` `:` guion largo), después una coma, y sólo si no queda más
 * remedio por palabras. Cortar por número de caracteres a secas parte los
 * sintagmas —«la base de / datos»— y eso obliga a leer las dos líneas antes de
 * decir nada, que es justo el titubeo que se quiere evitar.
 */

/**
 * Ancho objetivo de una línea, en caracteres.
 *
 * Alrededor de 42 es lo que cabe en una columna que se abarca **sin mover los
 * ojos**, con el tamaño al que se lee de reojo. Más ancho y vuelve el barrido
 * horizontal; más estrecho y hay que avanzar tan a menudo que el gesto de
 * pasar de línea pasa a ser el delator.
 */
export const TARGET_CHARS = 42;

/** Tope duro. Por encima se parte aunque no haya ningún sitio bonito. */
const MAX_CHARS = 58;

/** Menos que esto no merece una línea propia: se pega a la anterior. */
const MIN_CHARS = 14;

/** Quita lo que es marca visual y no se lee en voz alta. */
function readable(text: string): string {
  return (
    text
      // Viñetas y numeración al principio de línea: se ven, no se dicen.
      .replace(/^[\s]*[-*•·]\s+/gm, '')
      .replace(/^[\s]*\d+[.)]\s+/gm, '')
      // Negrita y código en línea: los asteriscos y las comillas no se leen.
      .replace(/\*\*/g, '')
      .replace(/`/g, '')
      .trim()
  );
}

/**
 * El espacio más cercano al ancho objetivo.
 *
 * Se busca **cerca de `TARGET_CHARS` y no al final del tope**: coger el último
 * espacio que quepa deja la línea siguiente en una palabra suelta —«no /
 * vuelva.»— y una línea de siete caracteres en el centro de la pantalla es un
 * gesto de avanzar que no compra nada.
 */
function spaceNearTarget(piece: string): number {
  let best = -1;
  for (let i = MIN_CHARS; i < Math.min(piece.length, MAX_CHARS); i++) {
    if (piece[i] !== ' ') continue;
    if (best === -1 || Math.abs(i - TARGET_CHARS) < Math.abs(best - TARGET_CHARS)) best = i;
  }
  return best;
}

/**
 * Corta por el mejor sitio disponible.
 *
 * Se intenta partir todo lo que pase del ancho objetivo, no sólo lo que pase
 * del tope duro: el tope es el límite de lo tolerable, y una línea a la que se
 * llega siempre no es un objetivo, es un techo.
 */
function splitLong(piece: string): string[] {
  if (piece.length <= TARGET_CHARS) return [piece];

  const window = piece.slice(0, MAX_CHARS);
  const pause = Math.max(
    window.lastIndexOf('; '),
    window.lastIndexOf(': '),
    window.lastIndexOf(' — '),
    window.lastIndexOf(' - ')
  );
  const comma = window.lastIndexOf(', ');

  // Por donde respiraría una persona, de más fuerte a más débil.
  const cut =
    pause >= MIN_CHARS ? pause + 1 : comma >= MIN_CHARS ? comma + 1 : spaceNearTarget(piece);

  // Sin ningún sitio decente: se deja entera si es tolerable, y sólo si pasa del
  // tope se parte a lo bruto.
  if (cut <= MIN_CHARS || cut >= piece.length) {
    if (piece.length <= MAX_CHARS) return [piece];
    return [piece.slice(0, MAX_CHARS).trim(), ...splitLong(piece.slice(MAX_CHARS).trim())];
  }

  const head = piece.slice(0, cut).trim();
  const tail = piece.slice(cut).trim();
  return tail ? [head, ...splitLong(tail)] : [head];
}

/**
 * Las líneas de una respuesta, en orden.
 *
 * **Los bloques de código no entran.** Nadie lee un algoritmo en voz alta en una
 * entrevista: se copia y se comenta. Meterlos aquí llenaría el teleprompter de
 * líneas que no se pueden decir y que empujan fuera a las que sí.
 */
export function toLines(text: string): string[] {
  const prose = parseAnswerBlocks(text)
    .filter((block) => block.type !== 'code')
    .map((block) => block.content)
    .join('\n');

  const lines: string[] = [];

  for (const paragraph of readable(prose).split(/\n+/)) {
    const clean = paragraph.trim();
    if (!clean) continue;

    /*
     * Dónde empieza esta viñeta dentro de `lines`.
     *
     * Marca el límite de lo que se puede fusionar: el salto de una viñeta a la
     * siguiente es una pausa de verdad —son dos ideas— y pegarlas porque la
     * primera sea corta junta en una línea dos cosas que se dicen por separado.
     */
    const startedAt = lines.length;

    // Se corta DETRÁS del signo, no delante: el punto pertenece a la frase que
    // acaba, y verlo es lo que dice que ahí se puede respirar.
    for (const sentence of clean.split(/(?<=[.!?…])\s+/)) {
      for (const piece of splitLong(sentence.trim())) {
        const last = lines[lines.length - 1];
        /*
         * Se mira si la línea ANTERIOR es un muñón, no si lo es la nueva.
         *
         * «Sí.» solo, en el centro de la pantalla, es una línea que no dice nada
         * y un gesto de avanzar que sí se ve; se le pega lo siguiente. Al revés
         * —pegar toda cola corta a la línea de antes— deshacía el corte que se
         * acababa de hacer por una coma, y devolvía la línea larga.
         */
        if (
          last &&
          lines.length > startedAt &&
          last.length < MIN_CHARS &&
          last.length + piece.length + 1 <= MAX_CHARS
        ) {
          lines[lines.length - 1] = `${last} ${piece}`;
        } else if (piece) {
          lines.push(piece);
        }
      }
    }
  }

  return lines;
}

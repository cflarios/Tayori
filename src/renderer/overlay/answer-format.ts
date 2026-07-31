/**
 * Separa una respuesta en bloques de texto y bloques de código.
 *
 * El overlay pintaba `answer.text` tal cual dentro de un `div` con
 * `white-space: pre-wrap`. Para cuatro viñetas habladas está bien; para una
 * solución de LeetCode no: la indentación se ve pero no se puede copiar de un
 * clic, las líneas largas se parten a mitad de expresión y las tres comillas
 * quedan a la vista como ruido.
 *
 * Es un parser mínimo a propósito —sólo vallas de tres comillas—, porque es lo
 * único que el prompt del modo código promete que va a llegar. No es un
 * renderizador de Markdown y no debería convertirse en uno: meter una librería
 * de 40 KB en una ventana que tiene que arrancar sin que se note no sale a
 * cuenta.
 */

export interface AnswerBlock {
  type: 'text' | 'code';
  content: string;
  /** Lenguaje declarado en la apertura de la valla, si lo había. */
  lang?: string;
  /**
   * El bloque todavía se está escribiendo: la valla de cierre no ha llegado.
   *
   * Importa porque el texto llega en streaming. Sin esto, un bloque a medias se
   * pintaría como párrafo hasta que cerrara —el panel entero saltando de estilo
   * a mitad de respuesta— y se ofrecería copiar código incompleto.
   */
  open?: boolean;
}

/** Una valla: hasta tres espacios de sangría, tres comillas y el lenguaje. */
const FENCE = /^ {0,3}```(.*)$/;

export function parseAnswerBlocks(text: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let buffer: string[] = [];
  let inCode = false;
  let lang = '';

  const flush = (open = false): void => {
    if (inCode) {
      // Un bloque de código vacío sí se emite mientras está abierto: es lo que
      // hace que la caja aparezca en cuanto el modelo abre la valla, en vez de
      // esperar a la primera línea.
      const content = trimBlankEdges(buffer);
      if (content || open) {
        blocks.push({
          type: 'code',
          content,
          ...(lang ? { lang } : {}),
          ...(open ? { open: true } : {}),
        });
      }
    } else {
      const content = trimBlankEdges(buffer);
      if (content) blocks.push({ type: 'text', content });
    }
    buffer = [];
  };

  for (const line of text.split('\n')) {
    const fence = FENCE.exec(line);
    if (!fence) {
      buffer.push(line);
      continue;
    }

    if (inCode) {
      flush();
      inCode = false;
      lang = '';
    } else {
      flush();
      inCode = true;
      // "```python" y "```py filename=x" → nos quedamos con el primer token.
      lang = (fence[1] ?? '').trim().split(/\s+/)[0] ?? '';
    }
  }

  flush(inCode);
  return blocks;
}

/** Quita líneas en blanco al principio y al final sin tocar la indentación. */
function trimBlankEdges(lines: string[]): string {
  let start = 0;
  let end = lines.length;
  while (start < end && !(lines[start] ?? '').trim()) start += 1;
  while (end > start && !(lines[end - 1] ?? '').trim()) end -= 1;
  return lines.slice(start, end).join('\n');
}

/** `true` si la respuesta trae algún bloque de código. Lo usa la UI para decidir. */
export function hasCode(text: string): boolean {
  return text.includes('```');
}

/** Un trozo de texto con su marca, dentro de una línea. */
export interface InlineSpan {
  type: 'plain' | 'bold' | 'code';
  text: string;
}

/**
 * Negrita `**así**` y código `` `así` `` dentro de un párrafo.
 *
 * Esto NO es abrir la puerta a un renderizador de Markdown —siguen sin
 * soportarse enlaces, títulos, listas ni cursivas— sino tapar un agujero
 * concreto que se vio usándolo: **los modelos ponen asteriscos hagas lo que
 * hagas**. Claude marcaba en negrita la opción correcta de cada test y el panel
 * enseñaba `**B)** El índice...` con los asteriscos a la vista.
 *
 * Se ataca por los dos lados: el prompt pide que no los use, y esto los
 * interpreta cuando los usa igualmente. La primera mitad sola no basta, porque
 * depende de que el modelo obedezca; la segunda sola tampoco, porque el texto
 * seguiría llegando lleno de marcas que gastan tokens y ancho de panel.
 *
 * Una marca sin cerrar se queda como texto literal, que es lo que hace falta
 * durante el streaming: mientras llega `**B` no debe desaparecer nada.
 */
const INLINE = /\*\*(?!\s)([^\n]+?)\*\*|`([^`\n]+?)`/g;

export function parseInline(text: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  let last = 0;

  for (const match of text.matchAll(INLINE)) {
    const at = match.index;
    if (at > last) spans.push({ type: 'plain', text: text.slice(last, at) });

    const bold = match[1];
    if (bold !== undefined) spans.push({ type: 'bold', text: bold });
    else spans.push({ type: 'code', text: match[2] ?? '' });

    last = at + match[0].length;
  }

  if (last < text.length) spans.push({ type: 'plain', text: text.slice(last) });
  return spans;
}

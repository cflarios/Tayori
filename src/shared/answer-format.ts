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
      // La matemática se normaliza SÓLO aquí, en la prosa: dentro de un bloque
      // de código un "^" o un "\" son operadores reales y tocarlos rompería lo
      // que se copia. Ver `mathToReadable`.
      const content = mathToReadable(trimBlankEdges(buffer));
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

/**
 * Convierte notación LaTeX a texto plano legible con Unicode.
 *
 * Es el mismo patrón que `parseInline`, y por la misma razón: los modelos
 * escriben matemática en LaTeX hagas lo que hagas. OpenAI devolvía
 * "\(O(n^2d)\)" y "QK^\top", y el panel los enseñaba con las barras, los
 * dólares y el acento circunflejo a la vista. El prompt pide que no lo hagan
 * (`core/prompt.ts`) y esto lo arregla cuando lo hacen igual. Ninguna de las
 * dos mitades basta sola: el prompt depende de que el modelo obedezca; esto
 * depende de que el modelo use LaTeX estándar.
 *
 * NO es un renderizador de LaTeX ni pretende serlo —no hay matrices, ni
 * integrales con límites, ni alineación—. Cubre lo que aparece en una respuesta
 * hablada de entrevista: complejidades, fracciones simples, super/subíndices y
 * los símbolos de una tabla. Lo que no reconoce se queda **literal**, que es lo
 * que hace falta durante el streaming: una fórmula a medio escribir no debe
 * desaparecer, y un `\comando` desconocido es mejor verlo que mutilarlo.
 *
 * Dos límites deliberados para no estropear texto que no era matemática:
 * - `$...$` sólo se desenvuelve si su interior trae algún signo de LaTeX
 *   (`\`, `^`, `_`), para no comerse un "$5" de una cifra.
 * - Los subíndices sólo se convierten con llaves (`x_{ij}`) o dígito (`H_2O`),
 *   nunca un `_letra` suelto, o `file_name` saldría con la ene bajada.
 */
const SUP: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
  '−': '⁻',
  '=': '⁼',
  '(': '⁽',
  ')': '⁾',
  a: 'ᵃ',
  b: 'ᵇ',
  c: 'ᶜ',
  d: 'ᵈ',
  e: 'ᵉ',
  f: 'ᶠ',
  g: 'ᵍ',
  h: 'ʰ',
  i: 'ⁱ',
  j: 'ʲ',
  k: 'ᵏ',
  l: 'ˡ',
  m: 'ᵐ',
  n: 'ⁿ',
  o: 'ᵒ',
  p: 'ᵖ',
  r: 'ʳ',
  s: 'ˢ',
  t: 'ᵗ',
  u: 'ᵘ',
  v: 'ᵛ',
  w: 'ʷ',
  x: 'ˣ',
  y: 'ʸ',
  z: 'ᶻ',
  T: 'ᵀ',
};

const SUB: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  '+': '₊',
  '-': '₋',
  '−': '₋',
  '=': '₌',
  '(': '₍',
  ')': '₎',
  a: 'ₐ',
  e: 'ₑ',
  h: 'ₕ',
  i: 'ᵢ',
  j: 'ⱼ',
  k: 'ₖ',
  l: 'ₗ',
  m: 'ₘ',
  n: 'ₙ',
  o: 'ₒ',
  p: 'ₚ',
  r: 'ᵣ',
  s: 'ₛ',
  t: 'ₜ',
  u: 'ᵤ',
  v: 'ᵥ',
  x: 'ₓ',
};

/** Comandos que aparecen como exponente: transpuesta, prima, grados. */
const SCRIPT_CMD: Record<string, string> = {
  top: 'ᵀ',
  prime: '′',
  circ: '∘',
  ast: '∗',
  dagger: '†',
};

const SYMBOLS: Record<string, string> = {
  times: '×',
  cdot: '·',
  div: '÷',
  pm: '±',
  mp: '∓',
  ast: '∗',
  leq: '≤',
  le: '≤',
  geq: '≥',
  ge: '≥',
  neq: '≠',
  ne: '≠',
  approx: '≈',
  equiv: '≡',
  sim: '∼',
  propto: '∝',
  ll: '≪',
  gg: '≫',
  rightarrow: '→',
  to: '→',
  leftarrow: '←',
  leftrightarrow: '↔',
  Rightarrow: '⇒',
  Leftarrow: '⇐',
  mapsto: '↦',
  sum: '∑',
  prod: '∏',
  int: '∫',
  infty: '∞',
  partial: '∂',
  nabla: '∇',
  sqrt: '√',
  in: '∈',
  notin: '∉',
  subset: '⊂',
  subseteq: '⊆',
  supset: '⊃',
  cup: '∪',
  cap: '∩',
  emptyset: '∅',
  forall: '∀',
  exists: '∃',
  neg: '¬',
  land: '∧',
  lor: '∨',
  wedge: '∧',
  vee: '∨',
  ldots: '…',
  cdots: '⋯',
  dots: '…',
  top: '⊤',
  bot: '⊥',
  angle: '∠',
  deg: '°',
  prime: '′',
  approxeq: '≊',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  varepsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  vartheta: 'ϑ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'φ',
  varphi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',
};

/** Barato: si no hay ninguna señal de LaTeX, no se toca nada. */
const LATEX_HINT = /\\[a-zA-Z([]|[$^_]/;

/**
 * Convierte un token a super/subíndice. `null` si algún carácter no tiene forma:
 * entonces se deja literal en vez de mezclar caracteres normales y bajados.
 */
function toScript(token: string, map: Record<string, string>): string | null {
  if (token.startsWith('\\')) return SCRIPT_CMD[token.slice(1)] ?? null;
  let out = '';
  for (const ch of token) {
    const mapped = map[ch];
    if (!mapped) return null;
    out += mapped;
  }
  return out || null;
}

/** Envuelve en paréntesis sólo si hace falta para no cambiar la precedencia. */
function wrap(s: string): string {
  const t = s.trim();
  return t.length > 1 && /[+\-*/ ]/.test(t) ? `(${t})` : t;
}

export function mathToReadable(text: string): string {
  if (!LATEX_HINT.test(text)) return text;

  return (
    text
      // 1. Quitar los delimitadores de fórmula, quedándonos con el interior.
      //    Sólo cerrados: uno a medias durante el streaming se queda literal.
      .replace(/\\\[([\s\S]+?)\\\]/g, '$1')
      .replace(/\\\(([\s\S]+?)\\\)/g, '$1')
      .replace(/\$\$([\s\S]+?)\$\$/g, '$1')
      .replace(/\$([^$\n]*[\\^_][^$\n]*)\$/g, '$1')
      // 2. Envoltorios y espaciado que no aportan nada en texto plano.
      .replace(/\\(?:text|mathrm|mathbf|mathbb|mathcal|operatorname)\s*\{([^{}]*)\}/g, '$1')
      // El límite es clave: sin él "\right" se comería el prefijo de "\rightarrow".
      .replace(/\\(?:left|right)(?![a-zA-Z])/g, '')
      .replace(/\\(?:quad|qquad)(?![a-zA-Z])/g, ' ')
      .replace(/\\[!,;:]/g, '')
      // 3. Fracciones y raíces: las únicas construcciones de dos argumentos.
      .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, a, b) => `${wrap(a)}/${wrap(b)}`)
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, (_, a) => `√${wrap(a)}`)
      // 4. Exponentes: llaves, un carácter suelto, o un comando como \top.
      .replace(
        /\^\{([^{}]*)\}|\^(\\[a-zA-Z]+|[^\s{])/g,
        (m, braced, single) => toScript(braced ?? single, SUP) ?? m
      )
      // 5. Subíndices: sólo llaves o dígito (ver la nota de la cabecera).
      .replace(/_\{([^{}]*)\}/g, (m, g) => toScript(g, SUB) ?? m)
      .replace(/_(\d)/g, (m, d) => SUB[d] ?? m)
      // 6. Símbolos sueltos: griego, operadores y flechas. Lo no listado, literal.
      .replace(/\\([a-zA-Z]+)/g, (m, name) => SYMBOLS[name] ?? m)
  );
}

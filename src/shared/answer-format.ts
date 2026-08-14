/**
 * Splits an answer into text blocks and code blocks.
 *
 * The overlay painted `answer.text` as-is inside a `div` with
 * `white-space: pre-wrap`. For four spoken bullets it's fine; for a LeetCode
 * solution it isn't: the indentation shows but can't be copied in one click, the
 * long lines are split mid-expression and the three backticks are left in view
 * as noise.
 *
 * It's a minimal parser on purpose —only three-backtick fences—, because that's
 * the only thing the code-mode prompt promises will arrive. It isn't a Markdown
 * renderer and shouldn't become one: putting a 40 KB library into a window that
 * has to start without being noticed doesn't pay off.
 */

export interface AnswerBlock {
  type: 'text' | 'code';
  content: string;
  /** Language declared at the fence's opening, if there was one. */
  lang?: string;
  /**
   * The block is still being written: the closing fence hasn't arrived.
   *
   * It matters because the text arrives streaming. Without this, a half-written
   * block would be painted as a paragraph until it closed —the whole panel
   * jumping style mid-answer— and copying incomplete code would be offered.
   */
  open?: boolean;
}

/** A fence: up to three spaces of indent, three backticks and the language. */
const FENCE = /^ {0,3}```(.*)$/;

export function parseAnswerBlocks(text: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let buffer: string[] = [];
  let inCode = false;
  let lang = '';

  const flush = (open = false): void => {
    if (inCode) {
      // An empty code block is emitted while it's open: it's what makes the box
      // appear as soon as the model opens the fence, instead of waiting for the
      // first line.
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
      // The math is normalized ONLY here, in the prose: inside a code block a "^"
      // or a "\" are real operators and touching them would break what's copied.
      // See `mathToReadable`.
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
      // "```python" and "```py filename=x" → we keep the first token.
      lang = (fence[1] ?? '').trim().split(/\s+/)[0] ?? '';
    }
  }

  flush(inCode);
  return blocks;
}

/** Removes blank lines at the start and end without touching the indentation. */
function trimBlankEdges(lines: string[]): string {
  let start = 0;
  let end = lines.length;
  while (start < end && !(lines[start] ?? '').trim()) start += 1;
  while (end > start && !(lines[end - 1] ?? '').trim()) end -= 1;
  return lines.slice(start, end).join('\n');
}

/** `true` if the answer brings any code block. The UI uses it to decide. */
export function hasCode(text: string): boolean {
  return text.includes('```');
}

/** A piece of text with its marker, within a line. */
export interface InlineSpan {
  type: 'plain' | 'bold' | 'code';
  text: string;
}

/**
 * Bold `**like this**` and code `` `like this` `` within a paragraph.
 *
 * This is NOT opening the door to a Markdown renderer —links, headings, lists
 * and italics are still unsupported— but plugging a concrete hole seen while
 * using it: **the models put asterisks no matter what you do**. Claude marked the
 * correct option of each quiz in bold and the panel showed `**B)** El índice...`
 * with the asterisks in view.
 *
 * It's attacked on both sides: the prompt asks it not to use them, and this
 * interprets them when it uses them anyway. The first half alone isn't enough,
 * because it depends on the model obeying; the second alone isn't either, because
 * the text would keep arriving full of marks that spend tokens and panel width.
 *
 * An unclosed mark stays as literal text, which is what's needed during
 * streaming: while `**B` arrives nothing must disappear.
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
 * Converts LaTeX notation to plain, legible text with Unicode.
 *
 * It's the same pattern as `parseInline`, and for the same reason: the models
 * write math in LaTeX no matter what you do. OpenAI returned "\(O(n^2d)\)" and
 * "QK^\top", and the panel showed them with the backslashes, the dollars and the
 * circumflex in view. The prompt asks them not to (`core/prompt.ts`) and this
 * fixes it when they do anyway. Neither half is enough alone: the prompt depends
 * on the model obeying; this depends on the model using standard LaTeX.
 *
 * It is NOT a LaTeX renderer nor does it pretend to be —there are no matrices,
 * no integrals with limits, no alignment—. It covers what appears in a spoken
 * interview answer: complexities, simple fractions, super/subscripts and a
 * table's symbols. What it doesn't recognize stays **literal**, which is what's
 * needed during streaming: a half-written formula mustn't disappear, and an
 * unknown `\command` is better seen than mangled.
 *
 * Two deliberate limits so as not to spoil text that wasn't math:
 * - `$...$` is only unwrapped if its interior brings some LaTeX sign
 *   (`\`, `^`, `_`), so as not to eat a "$5" of a figure.
 * - Subscripts are only converted with braces (`x_{ij}`) or a digit (`H_2O`),
 *   never a lone `_letter`, or `file_name` would come out with the n lowered.
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

/** Commands that appear as an exponent: transpose, prime, degrees. */
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

/** Cheap: if there's no LaTeX signal at all, nothing is touched. */
const LATEX_HINT = /\\[a-zA-Z([]|[$^_]/;

/**
 * Converts a token to super/subscript. `null` if some character has no form:
 * then it's left literal instead of mixing normal and lowered characters.
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

/** Wraps in parentheses only if needed so as not to change the precedence. */
function wrap(s: string): string {
  const t = s.trim();
  return t.length > 1 && /[+\-*/ ]/.test(t) ? `(${t})` : t;
}

export function mathToReadable(text: string): string {
  if (!LATEX_HINT.test(text)) return text;

  return (
    text
      // 1. Remove the formula delimiters, keeping the interior.
      //    Only closed ones: a half one during streaming stays literal.
      .replace(/\\\[([\s\S]+?)\\\]/g, '$1')
      .replace(/\\\(([\s\S]+?)\\\)/g, '$1')
      .replace(/\$\$([\s\S]+?)\$\$/g, '$1')
      .replace(/\$([^$\n]*[\\^_][^$\n]*)\$/g, '$1')
      // 2. Wrappers and spacing that add nothing in plain text.
      .replace(/\\(?:text|mathrm|mathbf|mathbb|mathcal|operatorname)\s*\{([^{}]*)\}/g, '$1')
      // The boundary is key: without it "\right" would eat the prefix of "\rightarrow".
      .replace(/\\(?:left|right)(?![a-zA-Z])/g, '')
      .replace(/\\(?:quad|qquad)(?![a-zA-Z])/g, ' ')
      .replace(/\\[!,;:]/g, '')
      // 3. Fractions and roots: the only two-argument constructions.
      .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, a, b) => `${wrap(a)}/${wrap(b)}`)
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, (_, a) => `√${wrap(a)}`)
      // 4. Exponents: braces, a lone character, or a command like \top.
      .replace(
        /\^\{([^{}]*)\}|\^(\\[a-zA-Z]+|[^\s{])/g,
        (m, braced, single) => toScript(braced ?? single, SUP) ?? m
      )
      // 5. Subscripts: only braces or a digit (see the header note).
      .replace(/_\{([^{}]*)\}/g, (m, g) => toScript(g, SUB) ?? m)
      .replace(/_(\d)/g, (m, d) => SUB[d] ?? m)
      // 6. Lone symbols: Greek, operators and arrows. Anything unlisted, literal.
      .replace(/\\([a-zA-Z]+)/g, (m, name) => SYMBOLS[name] ?? m)
  );
}

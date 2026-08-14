import { describe, expect, it } from 'vitest';
import { mathToReadable, parseAnswerBlocks, parseInline } from '../src/shared/answer-format';

/**
 * The parser is exercised against what actually arrives: streaming text, with
 * the closing fence pending for seconds. That intermediate state is the one that
 * broke the render and that's why it has more cases than the rest.
 */
describe('parseAnswerBlocks', () => {
  it('leaves an answer without code as a single text block', () => {
    const blocks = parseAnswerBlocks('- Primera viñeta\n- Segunda viñeta');
    expect(blocks).toEqual([{ type: 'text', content: '- Primera viñeta\n- Segunda viñeta' }]);
  });

  it("separates prose and code, and keeps the fence's language", () => {
    const blocks = parseAnswerBlocks(
      'Hash map, una pasada · O(n)\n\n```python\ndef solve(n):\n    return n\n```\n\n- Cuidado con n=0'
    );

    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toEqual({ type: 'text', content: 'Hash map, una pasada · O(n)' });
    expect(blocks[1]).toEqual({
      type: 'code',
      lang: 'python',
      content: 'def solve(n):\n    return n',
    });
    expect(blocks[2]).toEqual({ type: 'text', content: '- Cuidado con n=0' });
  });

  it("preserves the indentation and the blank lines inside the code", () => {
    const blocks = parseAnswerBlocks('```js\nfunction f() {\n\n  return 1;\n}\n```');
    expect(blocks[0]?.content).toBe('function f() {\n\n  return 1;\n}');
  });

  it("marks as open the block whose closing fence hasn't arrived yet", () => {
    const blocks = parseAnswerBlocks('Enfoque\n\n```java\nclass Solution {');

    expect(blocks[1]).toEqual({
      type: 'code',
      lang: 'java',
      content: 'class Solution {',
      open: true,
    });
  });

  it('opens the box as soon as the fence arrives, even without a single line of code', () => {
    const blocks = parseAnswerBlocks('```python\n');
    expect(blocks).toEqual([{ type: 'code', lang: 'python', content: '', open: true }]);
  });

  it('accepts a fence without a language', () => {
    const blocks = parseAnswerBlocks('```\nx = 1\n```');
    expect(blocks[0]).toEqual({ type: 'code', content: 'x = 1' });
  });

  it('allows several blocks in the same answer', () => {
    const blocks = parseAnswerBlocks('```py\na\n```\nentre medias\n```py\nb\n```');
    expect(blocks.map((b) => b.type)).toEqual(['code', 'text', 'code']);
  });

  it("doesn't leave empty text blocks between two consecutive fences", () => {
    const blocks = parseAnswerBlocks('```py\na\n```\n\n```py\nb\n```');
    expect(blocks.map((b) => b.type)).toEqual(['code', 'code']);
  });
});

/**
 * The bold and inline code are interpreted because the models put them there no
 * matter what you do: Claude marked the correct option of each quiz that way and
 * the panel showed "**B)** El índice…" with the asterisks in view.
 */
describe('parseInline', () => {
  it('leaves text without marks in a single piece', () => {
    expect(parseInline('B) El índice se recalcula')).toEqual([
      { type: 'plain', text: 'B) El índice se recalcula' },
    ]);
  });

  it('recognizes the bold and keeps what is inside', () => {
    expect(parseInline('**B)** El índice')).toEqual([
      { type: 'bold', text: 'B)' },
      { type: 'plain', text: ' El índice' },
    ]);
  });

  it('recognizes inline code', () => {
    expect(parseInline('usa `num_ctx` para eso')).toEqual([
      { type: 'plain', text: 'usa ' },
      { type: 'code', text: 'num_ctx' },
      { type: 'plain', text: ' para eso' },
    ]);
  });

  it('allows several marks on the same line', () => {
    const spans = parseInline('**1. A)** verdadero · **2. C)** falso');
    expect(spans.map((s) => s.type)).toEqual(['bold', 'plain', 'bold', 'plain']);
  });

  it('an unclosed mark stays as text', () => {
    // It's the streaming case: while "**B" arrives nothing can disappear from the
    // screen.
    expect(parseInline('**B')).toEqual([{ type: 'plain', text: '**B' }]);
    expect(parseInline('valor `num_ctx')).toEqual([{ type: 'plain', text: 'valor `num_ctx' }]);
  });

  it("doesn't eat a lone multiplication asterisk", () => {
    expect(parseInline('n * 2 elementos')).toEqual([{ type: 'plain', text: 'n * 2 elementos' }]);
  });

  it("doesn't cross line breaks", () => {
    // Two consecutive quiz answers mustn't merge into a giant bold because one
    // line opened and the next closed.
    const spans = parseInline('**A)** uno\n**B)** dos');
    expect(spans.map((s) => s.type)).toEqual(['bold', 'plain', 'bold', 'plain']);
    expect(spans[1]?.text).toBe(' uno\n');
  });

  it("the empty or spaced mark doesn't count as bold", () => {
    expect(parseInline('** no es negrita **')).toEqual([
      { type: 'plain', text: '** no es negrita **' },
    ]);
  });
});

/**
 * The math is normalized because the models write LaTeX no matter what you do:
 * OpenAI returned "\(O(n^2d)\)" and the panel showed the backslashes and the
 * circumflex in view. The prompt asks them not to and this fixes it when they do
 * anyway — the same two-sided defense as the bold.
 */
describe('mathToReadable', () => {
  it('leaves text without math intact (fast path)', () => {
    expect(mathToReadable('Hash map, una pasada · O(n) tiempo')).toBe(
      'Hash map, una pasada · O(n) tiempo'
    );
  });

  it('removes the formula delimiters and leaves the interior', () => {
    expect(mathToReadable('coste \\(O(n)\\) por token')).toBe('coste O(n) por token');
    expect(mathToReadable('$$E = mc^2$$')).toBe('E = mc²');
    expect(mathToReadable('la matriz \\[A\\] es densa')).toBe('la matriz A es densa');
  });

  it('converts exponents to Unicode superscripts', () => {
    expect(mathToReadable('O(n^2)')).toBe('O(n²)');
    expect(mathToReadable('O(n^{2d})')).toBe('O(n²ᵈ)');
    expect(mathToReadable('2^{32} entradas')).toBe('2³² entradas');
  });

  it('translates the transpose written as QK^\\top', () => {
    expect(mathToReadable('la matriz QK^\\top es n×n')).toBe('la matriz QKᵀ es n×n');
  });

  it('converts simple fractions, with parentheses only when needed', () => {
    expect(mathToReadable('\\frac{n}{2}')).toBe('n/2');
    expect(mathToReadable('\\frac{a+b}{c}')).toBe('(a+b)/c');
    expect(mathToReadable('\\sqrt{n} pasos')).toBe('√n pasos');
  });

  it('translates Greek symbols and operators from the table', () => {
    expect(mathToReadable('\\theta óptimo con \\lambda \\leq 1')).toBe('θ óptimo con λ ≤ 1');
    expect(mathToReadable('n \\times d \\rightarrow salida')).toBe('n × d → salida');
    expect(mathToReadable('coste \\approx O(nd^2 + n^2d)')).toBe('coste ≈ O(nd² + n²d)');
  });

  it('converts subscripts with braces or a digit', () => {
    expect(mathToReadable('x_{ij} de la matriz')).toBe('xᵢⱼ de la matriz');
    expect(mathToReadable('H_2O y CO_2')).toBe('H₂O y CO₂');
  });

  it('does NOT touch a lone underscore between letters (snake_case)', () => {
    // The case that forces limiting the subscripts: file_name would come out with
    // the n lowered if any "_letter" were converted.
    expect(mathToReadable('usa el campo file_name del objeto')).toBe(
      'usa el campo file_name del objeto'
    );
  });

  it('does NOT eat a figure in dollars', () => {
    expect(mathToReadable('cuesta $5 y a veces $10')).toBe('cuesta $5 y a veces $10');
  });

  it("leaves literal what it doesn't recognize: unknown command and half formula", () => {
    // During streaming an unclosed delimiter mustn't swallow the rest, and a
    // command that isn't in the table is better seen than mangled.
    expect(mathToReadable('empieza \\(O(n')).toBe('empieza \\(O(n');
    expect(mathToReadable('el operador \\bowtie une')).toBe('el operador \\bowtie une');
  });
});

/**
 * The normalization lives in `parseAnswerBlocks`, so it applies to the prose and
 * NEVER to the code: a "^" inside a block is an operator that gets copied.
 */
describe('parseAnswerBlocks + math', () => {
  it('normalizes the prose but leaves the fence code intact', () => {
    const blocks = parseAnswerBlocks('Complejidad O(n^2)\n\n```python\nx = n ^ 2\n```');
    expect(blocks[0]).toEqual({ type: 'text', content: 'Complejidad O(n²)' });
    expect(blocks[1]).toEqual({ type: 'code', lang: 'python', content: 'x = n ^ 2' });
  });
});

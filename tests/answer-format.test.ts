import { describe, expect, it } from 'vitest';
import {
  mathToReadable,
  parseAnswerBlocks,
  parseInline,
} from '../src/renderer/overlay/answer-format';

/**
 * El parser se ejercita contra lo que de verdad llega: texto en streaming, con
 * la valla de cierre pendiente durante segundos. Ese estado intermedio es el
 * que rompía el render y por eso tiene más casos que el resto.
 */
describe('parseAnswerBlocks', () => {
  it('deja una respuesta sin código como un solo bloque de texto', () => {
    const blocks = parseAnswerBlocks('- Primera viñeta\n- Segunda viñeta');
    expect(blocks).toEqual([{ type: 'text', content: '- Primera viñeta\n- Segunda viñeta' }]);
  });

  it('separa prosa y código, y se queda con el lenguaje de la valla', () => {
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

  it('conserva la indentación y las líneas en blanco de dentro del código', () => {
    const blocks = parseAnswerBlocks('```js\nfunction f() {\n\n  return 1;\n}\n```');
    expect(blocks[0]?.content).toBe('function f() {\n\n  return 1;\n}');
  });

  it('marca como abierto el bloque cuya valla de cierre aún no ha llegado', () => {
    const blocks = parseAnswerBlocks('Enfoque\n\n```java\nclass Solution {');

    expect(blocks[1]).toEqual({
      type: 'code',
      lang: 'java',
      content: 'class Solution {',
      open: true,
    });
  });

  it('abre la caja en cuanto llega la valla, aún sin una sola línea de código', () => {
    const blocks = parseAnswerBlocks('```python\n');
    expect(blocks).toEqual([{ type: 'code', lang: 'python', content: '', open: true }]);
  });

  it('acepta una valla sin lenguaje', () => {
    const blocks = parseAnswerBlocks('```\nx = 1\n```');
    expect(blocks[0]).toEqual({ type: 'code', content: 'x = 1' });
  });

  it('admite varios bloques en la misma respuesta', () => {
    const blocks = parseAnswerBlocks('```py\na\n```\nentre medias\n```py\nb\n```');
    expect(blocks.map((b) => b.type)).toEqual(['code', 'text', 'code']);
  });

  it('no deja bloques de texto vacíos entre dos vallas seguidas', () => {
    const blocks = parseAnswerBlocks('```py\na\n```\n\n```py\nb\n```');
    expect(blocks.map((b) => b.type)).toEqual(['code', 'code']);
  });
});

/**
 * La negrita y el código en línea se interpretan porque los modelos los ponen
 * hagas lo que hagas: Claude marcaba así la opción correcta de cada test y el
 * panel enseñaba "**B)** El índice…" con los asteriscos a la vista.
 */
describe('parseInline', () => {
  it('deja el texto sin marcas en un solo trozo', () => {
    expect(parseInline('B) El índice se recalcula')).toEqual([
      { type: 'plain', text: 'B) El índice se recalcula' },
    ]);
  });

  it('reconoce la negrita y se queda con lo de dentro', () => {
    expect(parseInline('**B)** El índice')).toEqual([
      { type: 'bold', text: 'B)' },
      { type: 'plain', text: ' El índice' },
    ]);
  });

  it('reconoce el código en línea', () => {
    expect(parseInline('usa `num_ctx` para eso')).toEqual([
      { type: 'plain', text: 'usa ' },
      { type: 'code', text: 'num_ctx' },
      { type: 'plain', text: ' para eso' },
    ]);
  });

  it('admite varias marcas en la misma línea', () => {
    const spans = parseInline('**1. A)** verdadero · **2. C)** falso');
    expect(spans.map((s) => s.type)).toEqual(['bold', 'plain', 'bold', 'plain']);
  });

  it('una marca sin cerrar se queda como texto', () => {
    // Es el caso del streaming: mientras llega "**B" no puede desaparecer nada
    // de la pantalla.
    expect(parseInline('**B')).toEqual([{ type: 'plain', text: '**B' }]);
    expect(parseInline('valor `num_ctx')).toEqual([{ type: 'plain', text: 'valor `num_ctx' }]);
  });

  it('no se come un asterisco suelto de multiplicación', () => {
    expect(parseInline('n * 2 elementos')).toEqual([{ type: 'plain', text: 'n * 2 elementos' }]);
  });

  it('no cruza saltos de línea', () => {
    // Dos respuestas de test seguidas no deben fundirse en una negrita gigante
    // porque una línea abriera y la siguiente cerrara.
    const spans = parseInline('**A)** uno\n**B)** dos');
    expect(spans.map((s) => s.type)).toEqual(['bold', 'plain', 'bold', 'plain']);
    expect(spans[1]?.text).toBe(' uno\n');
  });

  it('la marca vacía o con espacio no cuenta como negrita', () => {
    expect(parseInline('** no es negrita **')).toEqual([
      { type: 'plain', text: '** no es negrita **' },
    ]);
  });
});

/**
 * La matemática se normaliza porque los modelos escriben LaTeX hagas lo que
 * hagas: OpenAI devolvía "\(O(n^2d)\)" y el panel enseñaba las barras y el
 * acento a la vista. El prompt pide que no lo hagan y esto lo arregla cuando lo
 * hacen igual — la misma defensa de dos lados que la negrita.
 */
describe('mathToReadable', () => {
  it('deja el texto sin matemática intacto (atajo rápido)', () => {
    expect(mathToReadable('Hash map, una pasada · O(n) tiempo')).toBe(
      'Hash map, una pasada · O(n) tiempo'
    );
  });

  it('quita los delimitadores de fórmula y deja el interior', () => {
    expect(mathToReadable('coste \\(O(n)\\) por token')).toBe('coste O(n) por token');
    expect(mathToReadable('$$E = mc^2$$')).toBe('E = mc²');
    expect(mathToReadable('la matriz \\[A\\] es densa')).toBe('la matriz A es densa');
  });

  it('convierte exponentes a superíndices Unicode', () => {
    expect(mathToReadable('O(n^2)')).toBe('O(n²)');
    expect(mathToReadable('O(n^{2d})')).toBe('O(n²ᵈ)');
    expect(mathToReadable('2^{32} entradas')).toBe('2³² entradas');
  });

  it('traduce la transpuesta escrita como QK^\\top', () => {
    expect(mathToReadable('la matriz QK^\\top es n×n')).toBe('la matriz QKᵀ es n×n');
  });

  it('convierte fracciones simples, con paréntesis sólo cuando hacen falta', () => {
    expect(mathToReadable('\\frac{n}{2}')).toBe('n/2');
    expect(mathToReadable('\\frac{a+b}{c}')).toBe('(a+b)/c');
    expect(mathToReadable('\\sqrt{n} pasos')).toBe('√n pasos');
  });

  it('traduce símbolos griegos y operadores de la tabla', () => {
    expect(mathToReadable('\\theta óptimo con \\lambda \\leq 1')).toBe('θ óptimo con λ ≤ 1');
    expect(mathToReadable('n \\times d \\rightarrow salida')).toBe('n × d → salida');
    expect(mathToReadable('coste \\approx O(nd^2 + n^2d)')).toBe('coste ≈ O(nd² + n²d)');
  });

  it('convierte subíndices con llaves o dígito', () => {
    expect(mathToReadable('x_{ij} de la matriz')).toBe('xᵢⱼ de la matriz');
    expect(mathToReadable('H_2O y CO_2')).toBe('H₂O y CO₂');
  });

  it('NO toca un guion bajo suelto entre letras (snake_case)', () => {
    // El caso que obliga a limitar los subíndices: file_name saldría con la ene
    // bajada si se convirtiera cualquier "_letra".
    expect(mathToReadable('usa el campo file_name del objeto')).toBe(
      'usa el campo file_name del objeto'
    );
  });

  it('NO se come una cifra en dólares', () => {
    expect(mathToReadable('cuesta $5 y a veces $10')).toBe('cuesta $5 y a veces $10');
  });

  it('deja literal lo que no reconoce: comando desconocido y fórmula a medias', () => {
    // Durante el streaming un delimitador sin cerrar no debe tragarse el resto,
    // y un comando que no está en la tabla es mejor verlo que mutilarlo.
    expect(mathToReadable('empieza \\(O(n')).toBe('empieza \\(O(n');
    expect(mathToReadable('el operador \\bowtie une')).toBe('el operador \\bowtie une');
  });
});

/**
 * La normalización vive en `parseAnswerBlocks`, así que se aplica a la prosa y
 * NUNCA al código: un "^" dentro de un bloque es un operador que se copia.
 */
describe('parseAnswerBlocks + matemática', () => {
  it('normaliza la prosa pero deja el código de la valla intacto', () => {
    const blocks = parseAnswerBlocks('Complejidad O(n^2)\n\n```python\nx = n ^ 2\n```');
    expect(blocks[0]).toEqual({ type: 'text', content: 'Complejidad O(n²)' });
    expect(blocks[1]).toEqual({ type: 'code', lang: 'python', content: 'x = n ^ 2' });
  });
});

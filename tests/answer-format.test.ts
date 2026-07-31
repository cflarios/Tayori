import { describe, expect, it } from 'vitest';
import { parseAnswerBlocks } from '../src/renderer/overlay/answer-format';

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

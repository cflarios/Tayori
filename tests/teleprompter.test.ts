import { describe, expect, it } from 'vitest';
import { toLines, TARGET_CHARS } from '../src/renderer/overlay/teleprompter';

/**
 * The teleprompter's chunking.
 *
 * What's tested isn't «it splits the text», it's that **each line can be said in
 * one breath**: nothing so long it forces you to sweep with your eyes, nothing
 * cut at a spot that forces reading two lines before opening your mouth.
 */

const longest = (lines: string[]): number => Math.max(...lines.map((l) => l.length));

describe('toLines', () => {
  it('a short bullet is one line, without its marker', () => {
    // The dash is seen, not said: reading it out loud would be absurd.
    expect(toLines('- Usé Kubernetes en producción.')).toEqual([
      'Usé Kubernetes en producción.',
    ]);
  });

  it('splits by sentences, and the period stays with its own', () => {
    // Seeing the period is what says you can breathe there.
    const lines = toLines('Monté el clúster. Luego migré los servicios uno a uno.');

    expect(lines).toEqual(['Monté el clúster.', 'Luego migré los servicios uno a uno.']);
  });

  it('no line forces you to sweep with your eyes', () => {
    const largo =
      '- Reduje la latencia del endpoint de búsqueda de 800 ms a 120 ms ' +
      'añadiendo un índice compuesto y moviendo el recuento a una vista materializada, ' +
      'lo que además quitó carga de la réplica de lectura.';

    const lines = toLines(largo);

    expect(longest(lines)).toBeLessThanOrEqual(58);
    // And the text arrives whole: chunking isn't summarizing.
    expect(lines.join(' ')).toContain('120 ms');
    expect(lines.join(' ')).toContain('réplica de lectura');
  });

  it('prefers to cut at a pause rather than at any old space', () => {
    const lines = toLines(
      'El problema era el bloqueo de la tabla; lo resolví con una migración en dos fases.'
    );

    // The first line ends where you'd breathe, not mid-phrase.
    expect(lines[0]).toBe('El problema era el bloqueo de la tabla;');
  });

  it("a lone fragment doesn't spend a whole line", () => {
    // "Sí." alone, in the center of the screen, is a line that says nothing and a
    // gesture of advancing that does show.
    const lines = toLines('Sí. Lo hice con Terraform.');
    expect(lines).toEqual(['Sí. Lo hice con Terraform.']);
  });

  it("code doesn't go in: it isn't read out loud", () => {
    const conCodigo = [
      'El enfoque es un hash map de una pasada.',
      '```python',
      'def two_sum(nums, target):',
      '    seen = {}',
      '```',
      'Cuidado con los duplicados.',
    ].join('\n');

    const lines = toLines(conCodigo);

    expect(lines.join(' ')).not.toContain('def two_sum');
    expect(lines).toContain('Cuidado con los duplicados.');
  });

  it('several bullets give several lines, in order', () => {
    const lines = toLines('- Primero esto.\n- Después lo otro.\n- Y por último aquello.');

    expect(lines).toEqual(['Primero esto.', 'Después lo otro.', 'Y por último aquello.']);
  });

  it('with nothing to read it returns an empty list, not a blank line', () => {
    // An empty line in the center of the screen reads as "it broke".
    expect(toLines('')).toEqual([]);
    expect(toLines('   \n\n  ')).toEqual([]);
    expect(toLines('```\nsolo codigo\n```')).toEqual([]);
  });

  it('most of the lines fit in the target width', () => {
    const respuesta = [
      '- Empecé midiendo, porque sin número no hay problema.',
      '- El cuello era la consulta de agregados, no la red.',
      '- Lo dejé en 120 ms y puse una alerta para que no vuelva.',
    ].join('\n');

    const lines = toLines(respuesta);
    const holgadas = lines.filter((l) => l.length <= TARGET_CHARS + 8);

    expect(holgadas.length / lines.length).toBeGreaterThanOrEqual(0.7);
  });
});

import { describe, expect, it } from 'vitest';
import { toLines, TARGET_CHARS } from '../src/renderer/overlay/teleprompter';

/**
 * El troceado del teleprompter.
 *
 * Lo que se prueba no es «parte el texto», es que **cada línea se pueda decir de
 * un tirón**: nada tan largo que obligue a barrer con los ojos, nada cortado por
 * un sitio que fuerce a leer dos líneas antes de abrir la boca.
 */

const longest = (lines: string[]): number => Math.max(...lines.map((l) => l.length));

describe('toLines', () => {
  it('una viñeta corta es una línea, sin su marca', () => {
    // El guion se ve, no se dice: leerlo en voz alta sería absurdo.
    expect(toLines('- Usé Kubernetes en producción.')).toEqual([
      'Usé Kubernetes en producción.',
    ]);
  });

  it('parte por frases, y el punto se queda con la suya', () => {
    // Ver el punto es lo que dice que ahí se puede respirar.
    const lines = toLines('Monté el clúster. Luego migré los servicios uno a uno.');

    expect(lines).toEqual(['Monté el clúster.', 'Luego migré los servicios uno a uno.']);
  });

  it('ninguna línea obliga a barrer con los ojos', () => {
    const largo =
      '- Reduje la latencia del endpoint de búsqueda de 800 ms a 120 ms ' +
      'añadiendo un índice compuesto y moviendo el recuento a una vista materializada, ' +
      'lo que además quitó carga de la réplica de lectura.';

    const lines = toLines(largo);

    expect(longest(lines)).toBeLessThanOrEqual(58);
    // Y el texto llega entero: trocear no es resumir.
    expect(lines.join(' ')).toContain('120 ms');
    expect(lines.join(' ')).toContain('réplica de lectura');
  });

  it('prefiere cortar por una pausa antes que por un espacio cualquiera', () => {
    const lines = toLines(
      'El problema era el bloqueo de la tabla; lo resolví con una migración en dos fases.'
    );

    // La primera línea termina donde uno respiraría, no a mitad de sintagma.
    expect(lines[0]).toBe('El problema era el bloqueo de la tabla;');
  });

  it('un fragmento suelto no gasta una línea entera', () => {
    // "Sí." solo, en el centro de la pantalla, es una línea que no dice nada y
    // un gesto de avanzar que sí se ve.
    const lines = toLines('Sí. Lo hice con Terraform.');
    expect(lines).toEqual(['Sí. Lo hice con Terraform.']);
  });

  it('el código no entra: no se lee en voz alta', () => {
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

  it('varias viñetas dan varias líneas, en orden', () => {
    const lines = toLines('- Primero esto.\n- Después lo otro.\n- Y por último aquello.');

    expect(lines).toEqual(['Primero esto.', 'Después lo otro.', 'Y por último aquello.']);
  });

  it('sin nada que leer devuelve una lista vacía, no una línea en blanco', () => {
    // Una línea vacía en el centro de la pantalla se lee como "se ha roto".
    expect(toLines('')).toEqual([]);
    expect(toLines('   \n\n  ')).toEqual([]);
    expect(toLines('```\nsolo codigo\n```')).toEqual([]);
  });

  it('la mayoría de las líneas caben en el ancho objetivo', () => {
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

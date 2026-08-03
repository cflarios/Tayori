import type { Skill } from '@shared/types';

/**
 * Las skills que vienen con la app.
 *
 * Existe una, y no es de relleno: es el fallo más caro que tiene un asistente
 * como éste. Las respuestas se leen **en voz alta**, y un texto que suena a
 * generado se nota antes hablado que escrito — las muletillas de modelo
 * («es importante destacar», «en el vertiginoso mundo de») cantan en una
 * entrevista de una forma que no cantan en un documento.
 *
 * Van en el código y no como carpeta en disco por dos razones: una skill que
 * el usuario puede borrar sin querer no es un valor de fábrica, y así la
 * carpeta de skills empieza **vacía**, que es lo que deja claro que lo que hay
 * dentro lo ha puesto él.
 *
 * Se puede sustituir: una carpeta con el mismo id gana. Ver `loadSkills()`.
 */
export const BUILT_IN_SKILLS: Skill[] = [
  {
    id: 'humanizar',
    /*
     * El nombre va dos veces a propósito. `name` es lo que se cuela dentro del
     * system prompt —«ha activado la instrucción "…"»— y los prompts de esta
     * app se quedan en español; `nameKey` es lo que lee una persona en el
     * desplegable, y eso sí sigue al idioma de la interfaz.
     */
    name: 'Que no suene a IA',
    nameKey: 'sk.humanizeName',
    description: '',
    descriptionKey: 'sk.humanizeDesc',
    builtIn: true,
    instructions: `
Escribe como escribe una persona que sabe de lo que habla y tiene prisa.

Nunca escribas:
- Fórmulas de apertura vacías: "es importante destacar", "cabe señalar",
  "en el mundo actual", "en el vertiginoso mundo de".
- Cierres que resumen lo ya dicho: "en resumen", "en definitiva", "en
  conclusión". Si la respuesta cabe en cuatro viñetas, no necesita resumen.
- Parejas de adjetivos donde basta uno: "robusto y escalable", "claro y
  conciso". Elige el que aporte y borra el otro.
- Las muletillas de modelo: "profundizar", "aprovechar" por "usar",
  "fundamental", "clave" como comodín, "no solo… sino también".
- Preguntas retóricas para introducir algo que vas a contar igualmente.

Sí haz esto:
- Varía la longitud de las frases. Un texto donde todas las líneas miden lo
  mismo suena a máquina aunque cada frase por separado esté bien.
- Usa el verbo concreto: "desplegué", "medí", "rompí el índice" en lugar de
  "realicé la implementación de".
- Si algo se puede decir con la palabra normal, dila. "Usar", no "utilizar".
  "Hacer", no "llevar a cabo".
- Admite los límites en primera persona cuando los haya: "esto no lo he tocado
  en producción" dice más de ti que una respuesta redonda y genérica.
- Deja el detalle específico —una cifra, una herramienta, un caso concreto—
  antes que la afirmación general. Lo específico es lo que no suena a plantilla.

Esta instrucción va sobre CÓMO se dice. Los topes de longitud y la estructura
que pidan las reglas de formato siguen mandando: no escribas más largo para
sonar más natural.
`.trim(),
  },
];

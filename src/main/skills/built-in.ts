import type { Skill } from '@shared/types';

/**
 * The skills that ship with the app.
 *
 * There's one, and it's not filler: it's the most expensive failure an assistant
 * like this has. The answers are read **out loud**, and a text that sounds
 * generated stands out more spoken than written — the model's tics («it's
 * important to highlight», «in the fast-paced world of») stand out in an
 * interview in a way they don't in a document.
 *
 * They go in the code and not as a folder on disk for two reasons: a skill the
 * user can delete by accident isn't a factory default, and this way the skills
 * folder starts **empty**, which is what makes clear that whatever is inside was
 * put there by them.
 *
 * It can be replaced: a folder with the same id wins. See `loadSkills()`.
 */
export const BUILT_IN_SKILLS: Skill[] = [
  {
    id: 'humanizar',
    /*
     * The name goes twice on purpose. `name` is what slips into the system
     * prompt —«has activated the instruction "…"»— and this app's prompts stay
     * in Spanish; `nameKey` is what a person reads in the dropdown, and that one
     * does follow the interface language.
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

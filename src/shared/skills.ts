import type { Skill } from './types';

/**
 * Skills: instrucciones sueltas que refinan CÓMO responde el modelo.
 *
 * Una skill no es un perfil ni un context pack, y la diferencia importa porque
 * los tres acaban en el mismo system prompt:
 *
 * | | Qué aporta |
 * |---|---|
 * | Perfil | Quién eres y con qué **forma** se responde (4 viñetas, código, test) |
 * | Context pack | **Material**: el CV, la oferta, respuestas preparadas |
 * | Skill | **Manera**: tono, elección de palabras, qué evitar al escribir |
 *
 * El formato es el de Anthropic —una carpeta con un `SKILL.md` que lleva
 * frontmatter y el cuerpo en Markdown— y se implementa aquí en lugar de traer
 * una dependencia porque es una **convención**, no un algoritmo: leer dos
 * campos y partir por `---` son treinta líneas, y su fallo se ve (la skill no
 * carga y lo dice). Es el mismo criterio que dejó fuera a `electron-store` y
 * que sí justificó el codificador de QR, cuyo fallo era invisible.
 *
 * Todo lo de este archivo es **puro**: lo necesitan los dos lados —el main para
 * cargar y aplicar, el renderer para autocompletar lo que escribes— y una
 * segunda implementación en el otro lado acabaría reconociendo cosas distintas.
 */

/**
 * Los dos caracteres que invocan una skill al principio de un mensaje.
 *
 * Dos y no uno porque los teclados no se ponen de acuerdo: `/` es la convención
 * de los chats, y `$` está donde `/` cuesta en algunas distribuciones.
 */
export const SKILL_PREFIXES = ['/', '$'] as const;

/**
 * El id de una skill sale del **nombre de su carpeta**, no del frontmatter.
 *
 * Es lo que hace que el id sea estable y visible: se escribe `/mi-skill` y se
 * ve la carpeta que hay que abrir para editarla. Si saliera del campo `name`,
 * cambiar el título del archivo cambiaría la forma de invocarla sin que nada lo
 * dijera.
 */
export function skillIdFromFolder(folder: string): string {
  return folder
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Lee un `SKILL.md`: frontmatter YAML mínimo entre `---`, y el cuerpo debajo.
 *
 * «YAML mínimo» es literal y deliberado: `clave: valor` por línea, con las
 * líneas indentadas siguientes tratadas como continuación —así una descripción
 * larga se puede partir a 80 columnas sin romperse— y las claves desconocidas
 * ignoradas, para que un `SKILL.md` escrito para otra herramienta no falle
 * aquí por traer campos de más.
 *
 * Lo que **no** hace: listas, anidamiento, ni bloques `|`/`>`. Un SKILL.md que
 * los necesite está pidiendo un parser de YAML de verdad, y eso es una
 * dependencia que esta función existe para no tener.
 */
export function parseSkillFile(raw: string, id: string, builtIn = false): Skill {
  // Un archivo escrito con Notepad llega con BOM y `---` dejaría de casar.
  const text = (raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).replace(/\r\n/g, '\n');

  const skill: Skill = { id, name: id, description: '', instructions: '', builtIn };

  const match = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text.trimStart());
  if (!match) {
    return {
      ...skill,
      error:
        'SKILL.md no empieza por un bloque de frontmatter entre "---". Añade al menos ' +
        'un name y una description.',
    };
  }

  const fields = parseFrontmatter(match[1] ?? '');
  const body = text.trimStart().slice(match[0].length).trim();

  if (fields.name) skill.name = fields.name;
  if (fields.description) skill.description = fields.description;
  skill.instructions = body;

  /*
   * El cuerpo vacío es el único error de verdad. Sin `name` se usa el id de la
   * carpeta y sin `description` la lista se ve sosa, pero las dos siguen
   * funcionando; una skill sin instrucciones **no hace nada**, y una skill que
   * no hace nada pero aparece encendida es exactamente el tipo de fallo mudo
   * que este proyecto persigue.
   */
  if (!body) {
    return { ...skill, error: 'El SKILL.md no tiene instrucciones debajo del frontmatter.' };
  }

  return skill;
}

/** `clave: valor`, con continuación en las líneas indentadas. */
function parseFrontmatter(block: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let current = '';

  for (const line of block.split('\n')) {
    if (!line.trim()) continue;

    // Indentada y con una clave ya abierta: es la continuación de su valor.
    if (/^\s/.test(line) && current) {
      fields[current] = `${fields[current] ?? ''} ${line.trim()}`.trim();
      continue;
    }

    const pair = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!pair) continue;

    current = pair[1]!.toLowerCase();
    fields[current] = unquote(pair[2] ?? '');
  }

  return fields;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  const quoted = /^(['"])([\s\S]*)\1$/.exec(trimmed);
  return quoted ? (quoted[2] ?? '') : trimmed;
}

/**
 * Separa `/skill-name resto de la pregunta` en sus dos partes.
 *
 * **Sólo reconoce skills que existen**, y eso no es una comprobación de más: si
 * cualquier `/palabra` se tratara como invocación, escribir «/etc está lleno de
 * configuración» perdería la primera palabra de la pregunta y el modelo
 * respondería a otra cosa sin que nada lo avisara. Con la lista delante, lo que
 * no casa se queda como texto, que es lo que el usuario escribió.
 */
export function parseSkillInvocation(
  text: string,
  known: readonly Pick<Skill, 'id'>[]
): { skillId?: string; text: string } {
  const match = /^([/$])([A-Za-z0-9._-]+)(?:\s+([\s\S]*))?$/.exec(text.trimStart());
  if (!match) return { text };

  const id = match[2]!.toLowerCase();
  if (!known.some((skill) => skill.id === id)) return { text };

  return { skillId: id, text: (match[3] ?? '').trim() };
}

/**
 * Las skills que casan con lo que se lleva escrito, para el autocompletado.
 *
 * Devuelve `null` —y no una lista vacía— cuando el texto ni siquiera empieza
 * por un prefijo: el desplegable tiene que distinguir "no estás invocando nada"
 * de "estás invocando algo que no existe", porque lo segundo sí merece
 * enseñarse en pantalla.
 */
export function matchSkills(text: string, all: readonly Skill[]): Skill[] | null {
  const match = /^([/$])([A-Za-z0-9._-]*)$/.exec(text.trimStart());
  if (!match) return null;

  const typed = (match[2] ?? '').toLowerCase();
  return all
    .filter((skill) => !skill.error)
    .filter((skill) => skill.id.includes(typed) || skill.name.toLowerCase().includes(typed));
}

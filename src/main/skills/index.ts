import { app, shell } from 'electron';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSkillFile, skillIdFromFolder } from '@shared/skills';
import type { Skill } from '@shared/types';
import { BUILT_IN_SKILLS } from './built-in';

/**
 * Carga de skills desde disco.
 *
 * Una skill es **una carpeta con un `SKILL.md`**, no un archivo suelto: es el
 * formato de Anthropic y deja sitio a los scripts y assets que esa
 * especificación admite. Esta versión **los ignora** —sólo se lee el `SKILL.md`—
 * y conviene decir por qué no es una fase pendiente sino una decisión: ejecutar
 * un script que hay en una carpeta de datos es ejecutar código que no ha pasado
 * por ninguna revisión, en un proceso que tiene las API keys descifradas. El día
 * que se quiera, se diseña con esa frase delante.
 *
 * La lista se cachea porque se consulta en **cada consulta al modelo**, y leer
 * un puñado de archivos por cada pregunta de una entrevista es trabajo de disco
 * en el peor momento. `reloadSkills()` la tira; lo llama el botón de recargar
 * del dashboard, que es la forma de que editar un SKILL.md se note sin reiniciar.
 */

/** `%APPDATA%\interview-helper\skills`. */
export function skillsFolder(): string {
  return join(app.getPath('userData'), 'skills');
}

let cache: Skill[] | null = null;

/** Todas las skills: las de serie primero, después las del usuario. */
export function listSkills(): Skill[] {
  if (!cache) cache = loadSkills();
  return cache;
}

/**
 * Una skill por id, sólo si se puede usar.
 *
 * Devuelve `undefined` también para las que cargaron con error, y eso es lo que
 * evita el peor caso: un `activeSkillId` que apunta a una carpeta que alguien
 * rompió editándola no debe mandar un prompt a medias, tiene que comportarse
 * como si no hubiera skill.
 */
export function getSkill(id: string): Skill | undefined {
  if (!id) return undefined;
  const found = listSkills().find((skill) => skill.id === id);
  return found && !found.error ? found : undefined;
}

/** Vuelve a leer el disco. Devuelve la lista nueva para no pedirla dos veces. */
export function reloadSkills(): Skill[] {
  cache = loadSkills();
  return cache;
}

/**
 * Crea la carpeta si no está y la abre en el explorador.
 *
 * Se crea al abrirla y no al arrancar: una carpeta vacía que nadie pidió es
 * basura en el perfil de alguien que quizá nunca use esto.
 */
export function openSkillsFolder(): void {
  const folder = skillsFolder();
  mkdirSync(folder, { recursive: true });
  void shell.openPath(folder);
}

function loadSkills(): Skill[] {
  const folder = skillsFolder();
  const skills: Skill[] = [];

  if (existsSync(folder)) {
    let entries: string[] = [];
    try {
      entries = readdirSync(folder, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch (err) {
      console.error('[skills] no se pudo leer la carpeta:', err);
    }

    for (const name of entries) {
      const id = skillIdFromFolder(name);
      if (!id) continue;

      const file = findSkillFile(join(folder, name));
      if (!file) {
        skills.push({
          id,
          name,
          description: '',
          instructions: '',
          builtIn: false,
          error: 'La carpeta no tiene ningún SKILL.md.',
        });
        continue;
      }

      try {
        skills.push(parseSkillFile(readFileSync(file, 'utf-8'), id));
      } catch (err) {
        skills.push({
          id,
          name,
          description: '',
          instructions: '',
          builtIn: false,
          error: `No se pudo leer el SKILL.md: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  /*
   * Las de serie se añaden al final y **sólo si nadie ha puesto una carpeta con
   * su id**. Que el usuario gane es lo correcto: la forma natural de ajustar la
   * skill de serie es copiarla a una carpeta y editarla, y si en ese caso
   * aparecieran las dos en la lista habría que adivinar cuál se está aplicando.
   */
  for (const built of BUILT_IN_SKILLS) {
    if (!skills.some((skill) => skill.id === built.id)) skills.push(built);
  }

  return skills;
}

/**
 * El `SKILL.md` de una carpeta.
 *
 * Se busca en lugar de componer la ruta: Windows no distingue mayúsculas pero
 * un repositorio clonado de otra máquina puede traer `skill.md` o `Skill.md`, y
 * el mismo archivo dejaría de encontrarse el día que esto corriera en otro
 * sistema. Es la misma razón por la que el binario de Whisper se busca en vez
 * de asumirse.
 */
function findSkillFile(folder: string): string | undefined {
  try {
    const match = readdirSync(folder).find((entry) => entry.toLowerCase() === 'skill.md');
    return match ? join(folder, match) : undefined;
  } catch {
    return undefined;
  }
}

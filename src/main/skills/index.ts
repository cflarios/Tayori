import { app, shell } from 'electron';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSkillFile, skillIdFromFolder } from '@shared/skills';
import type { Skill } from '@shared/types';
import { BUILT_IN_SKILLS } from './built-in';

/**
 * Loading skills from disk.
 *
 * A skill is **a folder with a `SKILL.md`**, not a loose file: it's Anthropic's
 * format and leaves room for the scripts and assets that specification allows.
 * This version **ignores them** —only the `SKILL.md` is read— and it's worth
 * saying why it's not a pending phase but a decision: running a script that's in
 * a data folder is running code that hasn't been through any review, in a
 * process that has the API keys decrypted. The day it's wanted, it's designed
 * with that sentence in front.
 *
 * The list is cached because it's consulted on **every query to the model**, and
 * reading a handful of files for every question of an interview is disk work at
 * the worst moment. `reloadSkills()` drops it; the dashboard's reload button
 * calls it, which is how editing a SKILL.md is noticed without restarting.
 */

/** `%APPDATA%\Tayori\skills`. */
export function skillsFolder(): string {
  return join(app.getPath('userData'), 'skills');
}

let cache: Skill[] | null = null;

/** All the skills: the built-in ones first, then the user's. */
export function listSkills(): Skill[] {
  if (!cache) cache = loadSkills();
  return cache;
}

/**
 * A skill by id, only if it can be used.
 *
 * It also returns `undefined` for those that loaded with an error, and that's
 * what avoids the worst case: an `activeSkillId` pointing at a folder someone
 * broke while editing it mustn't send half a prompt, it has to behave as if
 * there were no skill.
 */
export function getSkill(id: string): Skill | undefined {
  if (!id) return undefined;
  const found = listSkills().find((skill) => skill.id === id);
  return found && !found.error ? found : undefined;
}

/** Re-reads the disk. Returns the new list so it isn't requested twice. */
export function reloadSkills(): Skill[] {
  cache = loadSkills();
  return cache;
}

/**
 * Creates the folder if it isn't there and opens it in the explorer.
 *
 * It's created on opening it and not on startup: an empty folder nobody asked
 * for is junk in the profile of someone who may never use this.
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
          error: 'sk.errNoFile',
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
          error: 'sk.errUnreadable',
          errorDetail: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /*
   * The built-in ones are added at the end and **only if nobody has put a folder
   * with their id**. The user winning is the right thing: the natural way to
   * tweak the built-in skill is to copy it to a folder and edit it, and if in
   * that case both appeared in the list you'd have to guess which is being
   * applied.
   */
  for (const built of BUILT_IN_SKILLS) {
    if (!skills.some((skill) => skill.id === built.id)) skills.push(built);
  }

  return skills;
}

/**
 * A folder's `SKILL.md`.
 *
 * It's searched for instead of composing the path: Windows is case-insensitive
 * but a repository cloned from another machine may bring `skill.md` or
 * `Skill.md`, and the same file would stop being found the day this ran on
 * another system. It's the same reason the Whisper binary is searched for
 * instead of assumed.
 */
function findSkillFile(folder: string): string | undefined {
  try {
    const match = readdirSync(folder).find((entry) => entry.toLowerCase() === 'skill.md');
    return match ? join(folder, match) : undefined;
  } catch {
    return undefined;
  }
}

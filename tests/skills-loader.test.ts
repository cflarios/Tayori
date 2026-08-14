import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * The load from disk, against real folders.
 *
 * What's checked here isn't the parser —that's in `skills.test.ts`— but the
 * folder rules: what counts as a skill, what happens with a half-finished one,
 * and who wins when the user creates one with a built-in's id. All three look the
 * same from the outside if they break: a list with one element short.
 */

let userData = '';

vi.mock('electron', () => ({
  app: { getPath: () => userData },
  shell: { openPath: () => Promise.resolve('') },
}));

async function skills(): Promise<typeof import('../src/main/skills')> {
  return import('../src/main/skills');
}

/** Leaves a skill on disk, as the user would have left it with their editor. */
function write(folder: string, contents: string | null): void {
  const dir = join(userData, 'skills', folder);
  mkdirSync(dir, { recursive: true });
  if (contents !== null) writeFileSync(join(dir, 'SKILL.md'), contents, 'utf-8');
}

const file = (name: string, body = 'Instrucciones.'): string =>
  ['---', `name: ${name}`, 'description: Una descripción.', '---', body].join('\n');

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'ih-skills-'));
  vi.resetModules();
});

afterEach(() => {
  rmSync(userData, { recursive: true, force: true });
});

describe('skill loading', () => {
  it('with no folder, only the built-in ones are there', async () => {
    // Starting without having created anything has to give a usable list, not an
    // error: the folder is created when someone opens it, not on install.
    const { listSkills } = await skills();
    const all = listSkills();

    expect(all.length).toBeGreaterThan(0);
    expect(all.every((skill) => skill.builtIn)).toBe(true);
  });

  it('reads a folder with its SKILL.md', async () => {
    write('mi-skill', file('Mi Skill'));

    const { listSkills } = await skills();
    const found = listSkills().find((skill) => skill.id === 'mi-skill');

    expect(found?.name).toBe('Mi Skill');
    expect(found?.instructions).toBe('Instrucciones.');
    expect(found?.builtIn).toBe(false);
  });

  it('the id comes from the folder, not from the name', async () => {
    // It's what keeps `/mi-skill` working when someone changes the file's title,
    // and what lets the id be deduced by looking at the explorer.
    write('Carpeta Con Espacios', file('Un nombre muy distinto'));

    const { listSkills } = await skills();
    expect(listSkills().some((skill) => skill.id === 'carpeta-con-espacios')).toBe(true);
  });

  it('a folder without a SKILL.md is listed with its reason', async () => {
    // Disappearing without saying anything would leave someone staring at a
    // folder that does exist, wondering why the app doesn't see it.
    write('vacia', null);

    const { listSkills } = await skills();
    const found = listSkills().find((skill) => skill.id === 'vacia');

    expect(found?.error).toBeTruthy();
  });

  it("getSkill doesn't return a broken skill", async () => {
    // It's what prevents an `activeSkillId` pointing at a broken folder from
    // sending half a prompt: with no skill it answers as usual.
    write('rota', ['---', 'name: Rota', '---', ''].join('\n'));

    const { getSkill, listSkills } = await skills();

    expect(listSkills().some((skill) => skill.id === 'rota')).toBe(true);
    expect(getSkill('rota')).toBeUndefined();
  });

  it("a user folder replaces the built-in one with its id", async () => {
    /*
     * The natural way to tweak the built-in skill is to copy it and edit it. If
     * in that case both appeared in the list, you'd have to guess which is being
     * applied — and both would be called the same in the dropdown.
     */
    const { listSkills: first } = await skills();
    const builtIn = first().find((skill) => skill.builtIn)!;

    vi.resetModules();
    write(builtIn.id, file('La mía'));

    const { listSkills } = await skills();
    const matching = listSkills().filter((skill) => skill.id === builtIn.id);

    expect(matching).toHaveLength(1);
    expect(matching[0]!.name).toBe('La mía');
    expect(matching[0]!.builtIn).toBe(false);
  });

  it('reloading picks up a skill created after startup', async () => {
    // It's the only thing the reload button does, and without it you'd have to
    // restart the app to debut a just-written skill.
    const { listSkills, reloadSkills } = await skills();
    expect(listSkills().some((skill) => skill.id === 'nueva')).toBe(false);

    write('nueva', file('Nueva'));
    expect(reloadSkills().some((skill) => skill.id === 'nueva')).toBe(true);
  });

  it("ignores loose files that aren't in a folder", async () => {
    // A skill is a folder: it's what leaves room for the format's assets, and
    // what avoids treating a loose README as if it were an instruction.
    mkdirSync(join(userData, 'skills'), { recursive: true });
    writeFileSync(join(userData, 'skills', 'SUELTO.md'), file('Suelto'), 'utf-8');

    const { listSkills } = await skills();
    expect(listSkills().every((skill) => skill.builtIn)).toBe(true);
  });
});

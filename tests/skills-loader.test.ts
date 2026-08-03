import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * La carga desde disco, contra carpetas de verdad.
 *
 * Lo que se comprueba aquí no es el parser —eso está en `skills.test.ts`— sino
 * las reglas de la carpeta: qué se considera una skill, qué pasa con una que
 * está a medias, y quién gana cuando el usuario crea una con el id de una de
 * serie. Las tres se ven igual desde fuera si se rompen: una lista con un
 * elemento de menos.
 */

let userData = '';

vi.mock('electron', () => ({
  app: { getPath: () => userData },
  shell: { openPath: () => Promise.resolve('') },
}));

async function skills(): Promise<typeof import('../src/main/skills')> {
  return import('../src/main/skills');
}

/** Deja una skill en disco, como la habría dejado el usuario con su editor. */
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

describe('carga de skills', () => {
  it('sin carpeta, sólo están las de serie', async () => {
    // Arrancar sin haber creado nada tiene que dar una lista usable, no un
    // error: la carpeta se crea cuando alguien la abre, no al instalar.
    const { listSkills } = await skills();
    const all = listSkills();

    expect(all.length).toBeGreaterThan(0);
    expect(all.every((skill) => skill.builtIn)).toBe(true);
  });

  it('lee una carpeta con su SKILL.md', async () => {
    write('mi-skill', file('Mi Skill'));

    const { listSkills } = await skills();
    const found = listSkills().find((skill) => skill.id === 'mi-skill');

    expect(found?.name).toBe('Mi Skill');
    expect(found?.instructions).toBe('Instrucciones.');
    expect(found?.builtIn).toBe(false);
  });

  it('el id sale de la carpeta, no del name', async () => {
    // Es lo que hace que `/mi-skill` siga funcionando cuando alguien cambia el
    // título del archivo, y que el id se pueda deducir mirando el explorador.
    write('Carpeta Con Espacios', file('Un nombre muy distinto'));

    const { listSkills } = await skills();
    expect(listSkills().some((skill) => skill.id === 'carpeta-con-espacios')).toBe(true);
  });

  it('una carpeta sin SKILL.md se lista con su motivo', async () => {
    // Desaparecer sin decir nada dejaría a alguien mirando una carpeta que sí
    // existe, preguntándose por qué la app no la ve.
    write('vacia', null);

    const { listSkills } = await skills();
    const found = listSkills().find((skill) => skill.id === 'vacia');

    expect(found?.error).toBeTruthy();
  });

  it('getSkill no devuelve una skill rota', async () => {
    // Es lo que impide que un `activeSkillId` apuntando a una carpeta rota
    // mande medio prompt: sin skill se responde como siempre.
    write('rota', ['---', 'name: Rota', '---', ''].join('\n'));

    const { getSkill, listSkills } = await skills();

    expect(listSkills().some((skill) => skill.id === 'rota')).toBe(true);
    expect(getSkill('rota')).toBeUndefined();
  });

  it('una carpeta del usuario sustituye a la de serie con su id', async () => {
    /*
     * La forma natural de ajustar la skill de serie es copiarla y editarla. Si
     * en ese caso aparecieran las dos en la lista, habría que adivinar cuál se
     * está aplicando — y las dos se llamarían igual en el desplegable.
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

  it('recargar recoge una skill creada después de arrancar', async () => {
    // Es lo único que hace el botón de recargar, y sin él habría que reiniciar
    // la app para estrenar una skill recién escrita.
    const { listSkills, reloadSkills } = await skills();
    expect(listSkills().some((skill) => skill.id === 'nueva')).toBe(false);

    write('nueva', file('Nueva'));
    expect(reloadSkills().some((skill) => skill.id === 'nueva')).toBe(true);
  });

  it('ignora los archivos sueltos que no están en una carpeta', async () => {
    // Una skill es una carpeta: es lo que deja sitio a los assets del formato,
    // y lo que evita tratar un README suelto como si fuera una instrucción.
    mkdirSync(join(userData, 'skills'), { recursive: true });
    writeFileSync(join(userData, 'skills', 'SUELTO.md'), file('Suelto'), 'utf-8');

    const { listSkills } = await skills();
    expect(listSkills().every((skill) => skill.builtIn)).toBe(true);
  });
});

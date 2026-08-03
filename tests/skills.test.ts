import { describe, expect, it } from 'vitest';
import {
  matchSkills,
  parseSkillFile,
  parseSkillInvocation,
  skillIdFromFolder,
} from '../src/shared/skills';
import { buildSystemPrompt } from '../src/main/core/prompt';
import {
  DEFAULT_SETTINGS,
  providerIsReady,
  type SecretsPresence,
  type Settings,
  type Skill,
} from '../src/shared/types';

const settings = (patch: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...patch });

const skill = (patch: Partial<Skill> = {}): Skill => ({
  id: 'humanizar',
  name: 'Que no suene a IA',
  description: 'Quita las marcas de texto generado.',
  instructions: 'Nunca escribas "es importante destacar".',
  builtIn: false,
  ...patch,
});

/**
 * El parser de SKILL.md.
 *
 * Es el sitio donde un fallo se ve poco: un frontmatter mal leído no revienta,
 * produce una skill con la descripción metida dentro de las instrucciones o al
 * revés, y eso llega al modelo sin que nada lo diga.
 */
describe('parseSkillFile', () => {
  it('separa el frontmatter del cuerpo', () => {
    const parsed = parseSkillFile(
      ['---', 'name: Humanizar', 'description: Que no suene a IA.', '---', '', 'No uses jerga.'].join(
        '\n'
      ),
      'humanizar'
    );

    expect(parsed.name).toBe('Humanizar');
    expect(parsed.description).toBe('Que no suene a IA.');
    expect(parsed.instructions).toBe('No uses jerga.');
    expect(parsed.error).toBeUndefined();
  });

  it('junta una descripción partida en varias líneas', () => {
    // Una `description` de verdad no cabe en 80 columnas, y quien escriba el
    // archivo la va a partir. Sin esto, la segunda línea desaparecería.
    const parsed = parseSkillFile(
      ['---', 'name: X', 'description: Primera parte', '  y la continuación.', '---', 'Cuerpo.'].join(
        '\n'
      ),
      'x'
    );

    expect(parsed.description).toBe('Primera parte y la continuación.');
  });

  it('ignora las claves que no conoce en vez de fallar', () => {
    // Un SKILL.md escrito para otra herramienta trae campos de más (license,
    // allowed-tools…). Rechazarlo por eso sería romper la compatibilidad con el
    // formato que hemos elegido seguir.
    const parsed = parseSkillFile(
      ['---', 'name: X', 'license: MIT', 'allowed-tools: none', '---', 'Cuerpo.'].join('\n'),
      'x'
    );

    expect(parsed.name).toBe('X');
    expect(parsed.error).toBeUndefined();
  });

  it('tolera el BOM y los saltos de Windows', () => {
    // Un archivo creado con Notepad trae las dos cosas, y con el BOM delante el
    // `---` de apertura deja de casar: la skill entera se caería sin motivo
    // visible.
    const parsed = parseSkillFile('﻿---\r\nname: X\r\n---\r\nCuerpo.\r\n', 'x');

    expect(parsed.name).toBe('X');
    expect(parsed.instructions).toBe('Cuerpo.');
  });

  it('quita las comillas de un valor entrecomillado', () => {
    const parsed = parseSkillFile(['---', 'name: "X: con dos puntos"', '---', 'Cuerpo.'].join('\n'), 'x');
    expect(parsed.name).toBe('X: con dos puntos');
  });

  it('sin frontmatter da error en lugar de tragarse el archivo entero', () => {
    const parsed = parseSkillFile('Sólo instrucciones, sin cabecera.', 'x');
    expect(parsed.error).toBeTruthy();
  });

  it('un cuerpo vacío es un error, aunque el frontmatter esté bien', () => {
    // Es el único fallo que importa de verdad: una skill sin instrucciones no
    // hace NADA, y aparecería encendida en el desplegable diciendo lo contrario.
    const parsed = parseSkillFile(['---', 'name: X', 'description: Y', '---', ''].join('\n'), 'x');
    expect(parsed.error).toBeTruthy();
  });

  it('sin name usa el id de la carpeta, y eso no es un error', () => {
    const parsed = parseSkillFile(['---', 'description: Y', '---', 'Cuerpo.'].join('\n'), 'mi-skill');
    expect(parsed.name).toBe('mi-skill');
    expect(parsed.error).toBeUndefined();
  });
});

describe('skillIdFromFolder', () => {
  it('normaliza el nombre de la carpeta', () => {
    expect(skillIdFromFolder('Humanizar Texto')).toBe('humanizar-texto');
    expect(skillIdFromFolder('  QUIZ_helper  ')).toBe('quiz_helper');
  });

  it('no deja guiones sueltos en los extremos', () => {
    // Se teclean tras la barra: `/-mi-skill-` sería imposible de adivinar.
    expect(skillIdFromFolder('¡Mi Skill!')).toBe('mi-skill');
  });
});

/**
 * El prefijo `/skill`.
 *
 * Lo que se protege aquí no es el caso bueno, es el malo: una invocación que se
 * reconoce cuando no debía se come la primera palabra de la pregunta, y el
 * modelo responde a otra cosa sin que nada lo avise.
 */
describe('parseSkillInvocation', () => {
  const known = [{ id: 'humanizar' }, { id: 'quiz' }];

  it('separa la skill de la pregunta', () => {
    expect(parseSkillInvocation('/humanizar explícame Kubernetes', known)).toEqual({
      skillId: 'humanizar',
      text: 'explícame Kubernetes',
    });
  });

  it('acepta también $, porque en algunos teclados la barra cuesta', () => {
    expect(parseSkillInvocation('$quiz ¿cuál es la respuesta?', known).skillId).toBe('quiz');
  });

  it('NO toca el texto si la skill no existe', () => {
    // El caso que justifica la comprobación: sin ella, "/etc" se tomaría por una
    // invocación y la pregunta perdería su primera palabra.
    expect(parseSkillInvocation('/etc está lleno de configuración', known)).toEqual({
      text: '/etc está lleno de configuración',
    });
  });

  it('una skill sin pregunta detrás deja el texto vacío', () => {
    // Sigue siendo válido: se responde a lo que haya en la transcripción, con
    // la skill puesta.
    expect(parseSkillInvocation('/humanizar', known)).toEqual({ skillId: 'humanizar', text: '' });
  });

  it('no confunde una barra en medio de la frase', () => {
    expect(parseSkillInvocation('qué opinas de /humanizar', known).skillId).toBeUndefined();
  });
});

describe('matchSkills', () => {
  const all = [skill(), skill({ id: 'quiz', name: 'Modo examen' })];

  it('devuelve null si no se está invocando nada', () => {
    // `null` y lista vacía significan cosas distintas: sin esa diferencia, el
    // menú no podría decir "no hay ninguna que se llame así".
    expect(matchSkills('hola qué tal', all)).toBeNull();
  });

  it('con sólo la barra ofrece todas', () => {
    expect(matchSkills('/', all)).toHaveLength(2);
  });

  it('filtra por id y por nombre', () => {
    expect(matchSkills('/hum', all)?.map((s) => s.id)).toEqual(['humanizar']);
    expect(matchSkills('/examen', all)?.map((s) => s.id)).toEqual(['quiz']);
  });

  it('no ofrece una skill rota', () => {
    // Elegirla no haría nada, porque `getSkill` la descarta igualmente.
    const rota = [skill({ id: 'rota', error: 'sin instrucciones' })];
    expect(matchSkills('/', rota)).toHaveLength(0);
  });

  it('deja de ofrecer en cuanto hay un espacio', () => {
    // Con un espacio ya se está escribiendo la pregunta, no el nombre.
    expect(matchSkills('/humanizar explica', all)).toBeNull();
  });
});

/**
 * La skill dentro del prompt.
 *
 * El reparto de autoridad es lo que hace que esto funcione, y es justo lo que un
 * refactor puede tirar sin que ningún test lo note: una skill que se limita a
 * concatenarse pierde contra unas reglas de formato que llevan la palabra
 * "obligatorias" encima.
 */
describe('buildSystemPrompt con skill', () => {
  it('no cambia nada si no hay skill', () => {
    expect(buildSystemPrompt(settings())).toBe(buildSystemPrompt(settings(), undefined, undefined));
  });

  it('mete las instrucciones de la skill', () => {
    const prompt = buildSystemPrompt(settings(), undefined, skill());
    expect(prompt).toContain('Nunca escribas "es importante destacar"');
    expect(prompt).toContain('Que no suene a IA');
  });

  it('va la última, después incluso del contexto', () => {
    // Es la posición que el modelo atiende con más fuerza, y una skill existe
    // para corregir la manera de escribir que traen las reglas de arriba.
    const prompt = buildSystemPrompt(
      settings({
        contextPacks: [
          {
            id: '1',
            name: 'CV',
            content: 'Diez años de backend.',
            enabled: true,
            kind: 'cv',
            profiles: [],
          },
        ],
      }),
      undefined,
      skill()
    );

    expect(prompt.indexOf('<instruccion_activa>')).toBeGreaterThan(prompt.indexOf('</contexto>'));
  });

  it('declara el reparto: manda en la manera, no en la forma', () => {
    // Sin esto, una skill de tono y unas reglas de formato se contradicen y el
    // empate lo rompe el modelo en silencio — distinto según el proveedor y
    // según la frase, que es la peor clase de comportamiento.
    const prompt = buildSystemPrompt(settings(), undefined, skill());

    expect(prompt).toContain('NO cambia el formato');
    expect(prompt).toContain('gana la regla de formato');
    // Y las reglas del perfil siguen ahí enteras.
    expect(prompt).toContain('Máximo 4 viñetas');
  });

  it('convive con el perfil forzado del modo código', () => {
    const prompt = buildSystemPrompt(settings(), 'coding', skill());
    expect(prompt).toContain('El código COMPLETO');
    expect(prompt).toContain('<instruccion_activa>');
  });

  it('una skill sin instrucciones no añade bloque', () => {
    // Un `<instruccion_activa>` vacío le diría al modelo que hay una instrucción
    // activa sin decirle cuál, que es peor que no decir nada.
    const prompt = buildSystemPrompt(settings(), undefined, skill({ instructions: '   ' }));
    expect(prompt).not.toContain('<instruccion_activa>');
  });
});

/**
 * «¿Puede responder el proveedor elegido?»
 *
 * Esta cuenta la hacían tres pantallas por separado, cada una con su cadena de
 * `if`, y ninguna rompía el build al añadir un proveedor: la cadena caía al
 * último caso y contestaba por otro. El síntoma real fue el peor de los suyos —
 * el overlay diciendo «Falta configurar la IA» con la IA configurada.
 */
describe('providerIsReady', () => {
  const presence = (patch: Partial<SecretsPresence> = {}): SecretsPresence => ({
    anthropic: false,
    google: false,
    openai: false,
    deepseek: false,
    mqtt: false,
    ...patch,
  });

  it('cada proveedor mira SU credencial y no la del vecino', () => {
    expect(providerIsReady(settings({ llmProviderId: 'claude' }), presence({ anthropic: true }))).toBe(true);
    expect(providerIsReady(settings({ llmProviderId: 'claude' }), presence({ google: true }))).toBe(false);
    expect(providerIsReady(settings({ llmProviderId: 'openai' }), presence({ openai: true }))).toBe(true);
    expect(providerIsReady(settings({ llmProviderId: 'openai' }), presence({ anthropic: true }))).toBe(false);
    expect(providerIsReady(settings({ llmProviderId: 'gemini' }), presence({ google: true }))).toBe(true);
  });

  it('la clave que falta en OTRO proveedor no apaga al elegido', () => {
    // El caso exacto del fallo: con Ollama puesto y un modelo elegido, no tener
    // clave de OpenAI no tiene por qué decir nada.
    const current = settings({
      llmProviderId: 'ollama',
      llmModels: { ...DEFAULT_SETTINGS.llmModels, ollama: 'qwen2.5vl:latest' },
    });
    expect(providerIsReady(current, presence())).toBe(true);
  });

  it('Ollama no necesita clave, pero sí un modelo', () => {
    // Sin modelo, cada pregunta falla con "no hay ningún modelo seleccionado", y
    // antes ese caso pasaba por configurado sin enseñar ningún aviso.
    const sinModelo = settings({
      llmProviderId: 'ollama',
      llmModels: { ...DEFAULT_SETTINGS.llmModels, ollama: '' },
    });
    expect(providerIsReady(sinModelo, presence({ anthropic: true }))).toBe(false);
  });
});

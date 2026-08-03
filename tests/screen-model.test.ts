import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '../src/main/core/prompt';
import {
  adviseLocalModels,
  alignAutoTrigger,
  DEFAULT_SETTINGS,
  isScreenTrigger,
  normalizeModelId,
  screenModelFor,
  type Settings,
} from '../src/shared/types';
import { translate } from '../src/shared/i18n';

const settings = (patch: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...patch });

describe('screenModelFor', () => {
  it('por defecto hereda el modelo de respuestas', () => {
    // Es lo que garantiza que quien no toque nada siga teniendo el
    // comportamiento de antes de que este ajuste existiera.
    const target = screenModelFor(settings());
    expect(target).toEqual({ providerId: 'claude', model: 'claude-sonnet-5', inherited: true });
  });

  it('un proveedor propio para la pantalla no toca el de conversar', () => {
    const current = settings({
      llmProviderId: 'claude',
      screenProviderId: 'ollama',
      screenModel: 'qwen2.5vl:7b',
    });

    expect(screenModelFor(current)).toEqual({
      providerId: 'ollama',
      model: 'qwen2.5vl:7b',
      inherited: false,
    });
    // El de conversar sigue intacto.
    expect(current.llmProviderId).toBe('claude');
  });

  it('sin modelo elegido cae al del proveedor en lugar de quedarse vacío', () => {
    // Un campo vacío daría un error del proveedor sobre un ajuste que el
    // usuario no sabe que existe; responder con algo es preferible.
    const target = screenModelFor(
      settings({ screenProviderId: 'gemini', screenModel: '' })
    );
    expect(target.model).toBe('gemini-2.5-flash');
  });

  it('el mismo proveedor puede llevar otro modelo', () => {
    // El caso de Ollama: uno pequeño y rápido para hablar, un multimodal para
    // la pantalla, ambos locales.
    const target = screenModelFor(
      settings({
        llmProviderId: 'ollama',
        llmModels: {
          claude: 'claude-sonnet-5',
          gemini: 'gemini-2.5-flash',
          openai: 'gpt-5.6-terra',
          deepseek: 'deepseek-v4-flash',
          ollama: 'llama3.2:3b',
        },
        screenProviderId: 'ollama',
        screenModel: 'qwen2.5vl:7b',
      })
    );
    expect(target.model).toBe('qwen2.5vl:7b');
  });
});

describe('isScreenTrigger', () => {
  it('distingue los disparos de pantalla de los demás', () => {
    expect(isScreenTrigger('code')).toBe(true);
    expect(isScreenTrigger('quiz')).toBe(true);
    expect(isScreenTrigger('hotkey')).toBe(false);
    expect(isScreenTrigger('auto')).toBe(false);
    expect(isScreenTrigger('manual-input')).toBe(false);
  });
});

describe('perfil de test', () => {
  it('trae sus propias reglas, no las de hablar ni las de código', () => {
    const prompt = buildSystemPrompt(settings(), 'quiz');

    expect(prompt).toContain('UNA línea por pregunta');
    expect(prompt).toContain('DUDA:');
    expect(prompt).not.toContain('Máximo 4 viñetas');
    expect(prompt).not.toContain('El código COMPLETO');
  });

  it('pide TODAS las preguntas y ninguna explicación', () => {
    // Las dos cosas que salieron mal al usarlo de verdad, y las dos eran del
    // prompt: pedía quedarse con una sola pregunta y pedía el porqué.
    const prompt = buildSystemPrompt(settings(), 'quiz');

    expect(prompt).toContain('Responde TODAS las preguntas');
    expect(prompt).toContain('sin explicación');
    expect(prompt).not.toMatch(/línea con el porqué/);
  });

  it('prohíbe el markdown en los tres perfiles que se leen en el panel', () => {
    // Los modelos marcan en negrita por su cuenta y el overlay enseñaba los
    // asteriscos. Se ataca por prompt Y por render; esto cubre la mitad del
    // prompt.
    for (const profile of ['interview', 'coding', 'quiz'] as const) {
      expect(buildSystemPrompt(settings(), profile).toLowerCase()).toContain('asterisco');
    }
  });

  it('avisa de las negaciones del enunciado, que es donde se falla', () => {
    expect(buildSystemPrompt(settings(), 'quiz')).toContain('cuál NO');
  });

  it('el perfil forzado no toca el configurado', () => {
    const current = settings({ promptProfileId: 'interview' });
    expect(buildSystemPrompt(current, 'quiz')).toContain('DUDA:');
    expect(buildSystemPrompt(current)).toContain('Máximo 4 viñetas');
  });
});

describe('adviseLocalModels', () => {
  it('recomienda algo para cada tramo de memoria', () => {
    for (const totalMemoryGB of [4, 8, 16, 32, 64]) {
      const advice = adviseLocalModels({ totalMemoryGB, cpuModel: 'x', cpuCores: 8 });
      expect(advice.chat.model).toBeTruthy();
      expect(advice.vision.model).toBeTruthy();
      expect(advice.caveat).toBeTruthy();
      // El tramo sale como clave con un hueco: la cifra la pone quien pinta.
      expect(translate('en', advice.tier, { ram: totalMemoryGB })).toContain(
        String(totalMemoryGB)
      );
    }
  });

  it('a más memoria, no recomienda un modelo más pequeño', () => {
    const poco = adviseLocalModels({ totalMemoryGB: 4, cpuModel: 'x', cpuCores: 4 });
    const mucho = adviseLocalModels({ totalMemoryGB: 64, cpuModel: 'x', cpuCores: 16 });
    expect(poco.chat.model).not.toBe(mucho.chat.model);
  });

  it('con poca memoria dice que lo local no vale para la pantalla', () => {
    // Es la parte honesta de la recomendación: con 4 GB el modelo cabe y aun
    // así se equivoca leyendo capturas, que es lo que hay que advertir.
    const advice = adviseLocalModels({ totalMemoryGB: 4, cpuModel: 'x', cpuCores: 4 });
    expect(translate('es', advice.caveat)).toContain('nube');
    expect(translate('en', advice.caveat)).toContain('cloud');
  });
});

/**
 * El catálogo de Claude y Gemini está en el código, así que envejece: un modelo
 * nuevo del proveedor no se puede usar hasta que salga una versión de la app.
 * Escribir el id a mano es la salida, y esto cubre la parte con lógica.
 */
describe('normalizeModelId', () => {
  it('deja intacto un id bien escrito', () => {
    expect(normalizeModelId('claude-opus-4-8')).toBe('claude-opus-4-8');
  });

  it('quita el espacio final que deja un copiar y pegar', () => {
    // Es el caso real: se copia el id de una página de documentación, llega con
    // un espacio detrás, y el proveedor responde 404. El mensaje dice "el
    // modelo no existe", que manda a buscar el modelo bueno cuando ya lo era.
    expect(normalizeModelId('claude-opus-4-8 ')).toBe('claude-opus-4-8');
    expect(normalizeModelId('  gemini-2.5-pro\n')).toBe('gemini-2.5-pro');
  });

  it('quita también los espacios de en medio', () => {
    // Ningún proveedor usa espacios en un id, así que un espacio interior sólo
    // puede venir de un salto de línea del portapapeles.
    expect(normalizeModelId('claude-sonnet\n-5')).toBe('claude-sonnet-5');
    expect(normalizeModelId('qwen2.5vl: 7b')).toBe('qwen2.5vl:7b');
  });

  it('un campo vacío o con sólo espacios queda vacío', () => {
    expect(normalizeModelId('   ')).toBe('');
    expect(normalizeModelId('')).toBe('');
  });
});

/**
 * El idioma, visto en una conversación real: pregunta y respuesta en inglés,
 * pero los rótulos de la estructura en español, copiados literalmente del
 * prompt ("**Situación:** I manage a web application…"). Estas pruebas fijan
 * las dos mitades del arreglo — la regla existe en TODOS los perfiles, y ya no
 * se le dan al modelo etiquetas en español que copiar.
 */
describe('idioma de la respuesta', () => {
  const perfiles = ['interview', 'meeting', 'lecture', 'support', 'coding', 'quiz'] as const;

  it('todos los perfiles llevan la regla de idioma', () => {
    // Antes vivía dentro de las reglas de hablar, así que código y test —que
    // las sustituyen enteras— se quedaban sin ninguna.
    for (const profile of perfiles) {
      const prompt = buildSystemPrompt(settings(), profile);
      expect(prompt, profile).toContain('idioma de la conversación');
      expect(prompt, profile).toContain('ENTERA en ese idioma');
    }
  });

  it('avisa de que las instrucciones estén en español no obliga a nada', () => {
    // Es la confusión concreta del modelo: prompt en español, luego respondo
    // con trozos en español.
    expect(buildSystemPrompt(settings())).toContain('no en el de estas');
  });

  it('el perfil de entrevista ya no dicta rótulos copiables', () => {
    const prompt = buildSystemPrompt(settings(), 'interview');
    expect(prompt).not.toMatch(/situación → acción → resultado/i);
    expect(prompt).toContain('No escribas rótulos');
  });

  it('el modo test manda traducir sus dos marcas fijas', () => {
    const prompt = buildSystemPrompt(settings(), 'quiz');
    expect(prompt).toContain('UNSURE:');
    expect(prompt).toContain("CAN'T SEE:");
  });
});

/**
 * Pulsar "Ellos" tiene que dar respuestas, no silencio. Es el fallo que se
 * arregló a mano desde el dashboard sin que la relación fuera evidente.
 */
describe('alignAutoTrigger', () => {
  it('elegir sólo la salida del sistema pasa el disparo al interlocutor', () => {
    const current = settings({ audioSources: 'both', autoTriggerSpeaker: 'me' });
    expect(alignAutoTrigger(current, { audioSources: 'system' })).toEqual({
      audioSources: 'system',
      autoTriggerSpeaker: 'them',
    });
  });

  it('elegir sólo el micrófono pasa el disparo a ti', () => {
    const current = settings({ audioSources: 'both', autoTriggerSpeaker: 'them' });
    expect(alignAutoTrigger(current, { audioSources: 'mic' })).toEqual({
      audioSources: 'mic',
      autoTriggerSpeaker: 'me',
    });
  });

  it('no toca nada si la combinación ya podía disparar', () => {
    const current = settings({ audioSources: 'mic', autoTriggerSpeaker: 'them' });
    // Con las dos fuentes se oye a todo el mundo: no hay nada que realinear.
    expect(alignAutoTrigger(current, { audioSources: 'both' })).toEqual({ audioSources: 'both' });
  });

  it('respeta "cualquiera" y el disparo apagado', () => {
    // Ninguno de los dos puede quedar inerte, así que cambiarlos sería tocar un
    // ajuste sin motivo.
    const any = settings({ autoTriggerSpeaker: 'any' });
    expect(alignAutoTrigger(any, { audioSources: 'mic' })).toEqual({ audioSources: 'mic' });

    const off = settings({ autoTriggerMode: 'off', autoTriggerSpeaker: 'them' });
    expect(alignAutoTrigger(off, { audioSources: 'mic' })).toEqual({ audioSources: 'mic' });
  });

  it('no se mete cuando el patch no cambia las fuentes', () => {
    // Cambiar el hablante a mano desde el dashboard es una elección explícita.
    const current = settings({ audioSources: 'system' });
    expect(alignAutoTrigger(current, { autoTriggerSpeaker: 'me' })).toEqual({
      autoTriggerSpeaker: 'me',
    });
  });
});

/**
 * La marca "DUDA:" del modo test, que dejó de servir por usarse siempre.
 *
 * Probado con un modelo local pequeño, respondía TODAS las líneas con "DUDA:"
 * delante. Y estaba pedido: la regla decía «si dudas, empieza esa línea por
 * DUDA:» sin decir en ningún sitio que fuera la excepción. Un modelo que marca
 * todo está obedeciendo, y la marca deja de informar de nada — que es
 * exactamente igual que no tenerla.
 */
describe('la regla de la duda en el modo test', () => {
  it('dice que es la excepción, no el formato', () => {
    // Se comprueban trozos que caben en una línea: el prompt va envuelto a 80
    // columnas y afirmar una frase larga rompería el test al reajustar el texto.
    const prompt = buildSystemPrompt(settings(), 'quiz');
    expect(prompt).toContain('es la EXCEPCIÓN, no el formato');
    expect(prompt).toContain('si está en todas las líneas');
  });

  it('prohíbe explícitamente marcarlo todo', () => {
    // Sin esta frase, un modelo pequeño se cura en salud y marca cada línea.
    const prompt = buildSystemPrompt(settings(), 'quiz');
    expect(prompt).toContain('Marcarlo todo no informa de nada');
  });

  it('sigue exigiendo la mejor opción detrás de la marca', () => {
    // Negarse a responder tampoco ayuda a nadie: en un test con penalización
    // hay que poder decidir si se arriesga, y para eso hace falta la opción.
    expect(buildSystemPrompt(settings(), 'quiz')).toContain('Nunca es "DUDA:" a secas');
  });
});

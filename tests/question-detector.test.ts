import { describe, expect, it } from 'vitest';
import { looksLikeQuestion } from '../src/main/core/question-detector';
import { worthClassifying } from '../src/main/core/question-classifier';

/** Helper para que los casos se lean como una tabla. */
const isQ = (text: string): boolean => looksLikeQuestion(text).isQuestion;

describe('looksLikeQuestion', () => {
  describe('detecta preguntas de entrevista', () => {
    it.each([
      '¿Cuál es tu mayor debilidad?',
      '¿Por qué quieres trabajar aquí?',
      'Cuéntame sobre tu experiencia con React',
      'Háblame de un proyecto difícil',
      'Explícame cómo funciona un closure',
      'Describe a time when you disagreed with your manager',
      'Walk me through your approach to debugging',
      'Tell me about a challenging project',
      'How would you scale this system',
      'What is the difference between a process and a thread',
      'Give me an example of a conflict you resolved',
    ])('%s', (text) => {
      expect(isQ(text)).toBe(true);
    });
  });

  describe('funciona sin signo de interrogación', () => {
    // Muchos motores de STT no puntúan de forma fiable; si dependiéramos del
    // signo perderíamos la mayoría de las preguntas reales.
    it('detecta interrogativo inicial sin signo', () => {
      expect(isQ('cuales son tus fortalezas')).toBe(true);
      expect(isQ('como manejarias un cliente difícil')).toBe(true);
    });

    it('detecta pese a acentos ausentes', () => {
      expect(isQ('Por que dejaste tu ultimo trabajo')).toBe(true);
    });
  });

  describe('rechaza lo que no pide respuesta', () => {
    it.each([
      'Sí',
      'Vale, entiendo',
      'Perfecto gracias',
      'Estoy revisando tu curriculum ahora mismo',
      'Nosotros somos un equipo de veinte personas',
      'Te cuento un poco sobre la empresa',
    ])('%s', (text) => {
      expect(isQ(text)).toBe(false);
    });

    it('rechaza muletillas y comprobaciones de audio', () => {
      // Estas empiezan por interrogativo y/o llevan signo, y aun así no se
      // responden: una sugerencia aquí distrae en el peor momento.
      expect(isQ('¿Me escuchas?')).toBe(false);
      expect(isQ('¿Cómo estás?')).toBe(false);
      expect(isQ('Can you hear me?')).toBe(false);
      expect(isQ('¿Qué tal?')).toBe(false);
    });

    it('rechaza frases demasiado cortas', () => {
      expect(isQ('¿Y?')).toBe(false);
      expect(isQ('claro')).toBe(false);
    });

    it('rechaza texto vacío o en blanco', () => {
      expect(isQ('')).toBe(false);
      expect(isQ('   ')).toBe(false);
    });
  });

  describe('devuelve el motivo de la decisión', () => {
    it('nombra el marcador encontrado', () => {
      expect(looksLikeQuestion('Cuéntame sobre ti').reason).toContain('imperativa');
      expect(looksLikeQuestion('¿Sabes qué es esto?').reason).toContain('interrogación');
      expect(looksLikeQuestion('cuales son tus metas').reason).toContain('interrogativo');
    });

    it('explica el rechazo', () => {
      expect(looksLikeQuestion('¿Me escuchas?').reason).toContain('muletilla');
      expect(looksLikeQuestion('vale ya').reason).toContain('corto');
    });
  });
});

/**
 * Casos salidos de una prueba de escucha real (julio 2026). De cinco frases
 * seguidas solo disparó la primera, y el usuario lo vivió como "la app dejó de
 * responder". Los tres primeros describen lo que fallaba.
 */
describe('recall sobre habla real transcrita por Whisper', () => {
  it('detecta la pregunta aunque el interrogativo no vaya al principio', () => {
    // Whisper no pone "¿", y el interrogativo llega en la palabra nueve. Las
    // reglas de apertura solo miran las dos primeras.
    const verdict = looksLikeQuestion(
      'Si yo quiero programar una aplicación escritorio qué lenguaje de programación debería usar ahora.'
    );
    expect(verdict.isQuestion).toBe(true);
  });

  it('acepta fórmulas de consulta sin interrogativo ni signo', () => {
    expect(looksLikeQuestion('Me recomiendas Postgres o MySQL para esto.').isQuestion).toBe(true);
    expect(looksLikeQuestion('Cuál es la diferencia entre un proceso y un hilo.').isQuestion).toBe(
      true
    );
    expect(looksLikeQuestion('Como puedo mejorar el rendimiento de esa consulta.').isQuestion).toBe(
      true
    );
  });

  it('el acento es la señal, no el verbo', () => {
    // El mismo verbo, dos frases distintas. Es la razón de que no haya ninguna
    // variante de "debería" entre los marcadores.
    expect(
      looksLikeQuestion('Qué base de datos debería usar para esto.').isQuestion
    ).toBe(true);
    expect(
      looksLikeQuestion('Le dije que debería usar Postgres y me hizo caso.').isQuestion
    ).toBe(false);
  });

  it('sigue descartando las comprobaciones de audio', () => {
    // "me puedes escuchar" no estaba en la lista y no lo cazaba nada más.
    for (const filler of ['Me puedes escuchar.', 'Se escucha bien', 'Hola buenos días']) {
      expect(looksLikeQuestion(filler).isQuestion).toBe(false);
    }
  });

  it('no dispara con afirmaciones que suenan parecido', () => {
    // El precio de subir el recall: estas NO pueden empezar a disparar. Por eso
    // los marcadores son multi-palabra y no "deberia" a secas.
    const statements = [
      'Creo que debería haber estudiado más matemáticas en su momento.',
      'Trabajé tres años en una empresa que hacía aplicaciones de escritorio.',
      'Lo que hicimos fue migrar todo el backend a Go durante ese trimestre.',
      'Mi experiencia con bases de datos viene sobre todo de Postgres.',
    ];
    for (const text of statements) {
      expect(looksLikeQuestion(text).isQuestion).toBe(false);
    }
  });
});

/**
 * Transcripciones LITERALES de una sesión real con Whisper local, sacadas del
 * historial guardado. Son la mejor prueba disponible de lo irregular que es un
 * ASR: la misma persona, seguidas, unas con signos y otras sin ellos.
 */
const REALES = {
  conSignos: '¿Qué tanto sabes de genería software?',
  sinSignos: 'que empresa creó Kotlin.',
  condicional:
    'Si yo quiero programar una aplicación escritorio que lenguaje de programación deberiosa ahora.',
  saludoYPrueba: 'Hola, ¿cómo estás? ¿Me escuchas?',
};

describe('sensibilidad del auto-disparo', () => {
  it('las muletillas no disparan en ningún modo, ni con signo de interrogación', () => {
    // Este caso disparaba: no EMPIEZA por muletilla y trae "?", así que pasaba
    // los dos filtros. Es un saludo, no una pregunta.
    for (const mode of ['strict', 'balanced', 'all'] as const) {
      expect(looksLikeQuestion(REALES.saludoYPrueba, mode).isQuestion).toBe(false);
    }
  });

  it('estricto solo acepta señales inequívocas', () => {
    expect(looksLikeQuestion(REALES.conSignos, 'strict').isQuestion).toBe(true);
    // "que" inicial es un interrogativo de apertura, así que también pasa.
    expect(looksLikeQuestion(REALES.sinSignos, 'strict').isQuestion).toBe(true);
    // Ésta no: el interrogativo va en la palabra nueve y sin acento.
    expect(looksLikeQuestion(REALES.condicional, 'strict').isQuestion).toBe(false);
  });

  it('equilibrado no cambia lo que estricto ya aceptaba', () => {
    expect(looksLikeQuestion(REALES.conSignos, 'balanced').isQuestion).toBe(true);
    expect(looksLikeQuestion(REALES.sinSignos, 'balanced').isQuestion).toBe(true);
  });

  it('todo responde a cualquier intervención que no sea muletilla', () => {
    // El caso del usuario: dicta él las preguntas, no hay ruido del que
    // protegerse, y cualquier heurística sobra.
    expect(looksLikeQuestion(REALES.condicional, 'all').isQuestion).toBe(true);
    expect(
      looksLikeQuestion('Es posible utilizar Kotlin para aplicaciones de escritorio.', 'all')
        .isQuestion
    ).toBe(true);
    // Pero sigue sin responder a un "Hola" suelto.
    expect(looksLikeQuestion('Hola', 'all').isQuestion).toBe(false);
  });

  it('el default es equilibrado', () => {
    expect(looksLikeQuestion(REALES.conSignos)).toEqual(
      looksLikeQuestion(REALES.conSignos, 'balanced')
    );
  });
});

/**
 * Transcripciones LITERALES de una sesión de prueba (log del 27/07, 21:05-21:12).
 * Son la mejor referencia que hay de lo que llega de verdad, con las erratas del
 * reconocedor incluidas.
 */
describe('casos del log de una sesión real', () => {
  it('un saludo encadenado con una prueba de audio no dispara', () => {
    for (const text of [
      'Hola, ¿cómo estás? ¿Me escuchas?',
      'Hola, ¿puedes oírme?',
      '¿Hey, can you hear me?',
      'Hola, puedes escucharme.',
    ]) {
      expect(looksLikeQuestion(text).isQuestion).toBe(false);
    }
  });

  it('pero una pregunta que EMPIEZA como muletilla sí dispara', () => {
    // Se descartaba porque el filtro miraba el prefijo: "qué tal" es muletilla,
    // luego "¿Qué tal es la idea de software?" tambien lo era. No lo es.
    expect(looksLikeQuestion('¿Qué tal es la idea de software?').isQuestion).toBe(true);
    expect(looksLikeQuestion('¿Cómo estás gestionando el despliegue?').isQuestion).toBe(true);
  });

  it('en modo "todo" también pasan las que el reconocedor destroza', () => {
    // Ninguna de estas tiene marcador aprovechable, y las tres eran preguntas.
    for (const text of [
      'Quiero usar Jenkins como CI/CD que sugerencias me das.',
      'si yo creo ser quien quince en CI/CD como funcionaría.',
      'Si yo quiero utilizar Jenkins como se hice de como la haría.',
    ]) {
      expect(looksLikeQuestion(text, 'balanced').isQuestion).toBe(false);
      expect(looksLikeQuestion(text, 'all').isQuestion).toBe(true);
    }
  });
});

/**
 * Sesión del 28/07, 04:00-04:03. El idioma estaba forzado a inglés mientras se
 * hablaba español, así que estas transcripciones son literalmente lo que
 * Whisper inventó — y siguen siendo el mejor material de prueba que hay.
 */
describe('casos del log del 28/07', () => {
  it('acepta preguntas de dos palabras con signo', () => {
    // Se descartaba por "demasiado corto (2 palabras)". Es una pregunta entera.
    expect(looksLikeQuestion('Podrías presentarte?').isQuestion).toBe(true);
    expect(looksLikeQuestion('¿Qué recomiendas?').isQuestion).toBe(true);
    expect(looksLikeQuestion('¿Cómo funciona?').isQuestion).toBe(true);
  });

  it('pero dos palabras sin marcador siguen sin bastar', () => {
    // El mínimo sólo baja cuando hay señal inequívoca; si no, cualquier
    // confirmación suelta empezaría a disparar.
    expect(looksLikeQuestion('vale ya').isQuestion).toBe(false);
    expect(looksLikeQuestion('perfecto gracias').isQuestion).toBe(false);
    expect(looksLikeQuestion('¿Y?').isQuestion).toBe(false);
  });
});

/**
 * El filtro de coste del clasificador.
 *
 * El segundo escalón cuesta una consulta por intervención, así que sólo puede
 * escalar lo que la heurística no supo decidir. Preguntarle a un modelo si
 * "vale, perfecto" es una pregunta cuesta lo mismo que preguntarle algo útil, y
 * la respuesta ya se sabe.
 */
describe('worthClassifying', () => {
  it('escala lo ambiguo: las frases sin ningún marcador', () => {
    // El caso real que motivó todo esto: una pregunta dicha como afirmación.
    const verdict = looksLikeQuestion(
      'Una persona que conozca de DevOps debería conocer también de seguridad.'
    );
    expect(verdict.isQuestion).toBe(false);
    expect(worthClassifying(verdict)).toBe(true);
  });

  it('NO escala una muletilla', () => {
    const verdict = looksLikeQuestion('¿me escuchas?');
    expect(verdict.isQuestion).toBe(false);
    expect(worthClassifying(verdict)).toBe(false);
  });

  it('NO escala una frase demasiado corta', () => {
    const verdict = looksLikeQuestion('ya');
    expect(verdict.isQuestion).toBe(false);
    expect(worthClassifying(verdict)).toBe(false);
  });

  it('escala también en modo estricto: la sensibilidad no decide esto', () => {
    // `strict` decide cuánto se arriesga la heurística, no si el modelo puede
    // opinar. Estricto + clasificador es la combinación más precisa que hay.
    const verdict = looksLikeQuestion('Si una persona sabe DevOps, sabría de seguridad.', 'strict');
    expect(verdict.isQuestion).toBe(false);
    expect(worthClassifying(verdict)).toBe(true);
  });
});

/**
 * El imperativo pelado: «explica X» en lugar de «¿podrías explicar X?».
 *
 * Salió de una prueba real y del log: «Explica un poco el rol de un SRE» se
 * descartó, y la misma petición formulada como pregunta disparó sin problema.
 * Las dos piden lo mismo y la gente usa las dos — apoyarse en que venga
 * formulada como pregunta es perder la mitad.
 *
 * Era además una asimetría entre idiomas: en inglés `explain` y `describe` ya
 * estaban cubiertos y en español sólo las formas con pronombre.
 */
describe('peticiones en imperativo', () => {
  it('caza el caso exacto que falló', () => {
    const verdict = looksLikeQuestion('Explica un poco el rol de un SRE');
    expect(verdict.isQuestion).toBe(true);
  });

  it('reconoce los verbos de petición más habituales', () => {
    for (const texto of [
      'Explica qué es un SRE',
      'Describe el proceso de despliegue',
      'Compara Kubernetes con Docker Swarm',
      'Resume las ventajas de esa arquitectura',
      'Define qué entiendes por observabilidad',
      'Profundiza en el tema de los secretos',
    ]) {
      expect(looksLikeQuestion(texto).isQuestion, texto).toBe(true);
    }
  });

  it('también en modo estricto, porque pedir es tan explícito como preguntar', () => {
    // Que no lleve signo de interrogación no vuelve dudosa a una petición.
    expect(looksLikeQuestion('Explica el rol de un SRE', 'strict').isQuestion).toBe(true);
  });

  it('las formas con "-nos" valen en cualquier posición', () => {
    // Nadie dice "explícanos" sin estar pidiendo algo, así que no hace falta
    // que encabece la frase.
    expect(looksLikeQuestion('Y ahora explicanos cómo lo desplegarías').isQuestion).toBe(true);
  });

  it('NO dispara con el mismo verbo en tercera persona', () => {
    /*
     * Es el precio de esta regla y por eso los verbos sólo cuentan al PRINCIPIO:
     * en mitad de una frase son indistinguibles del indicativo, que aparece a
     * todas horas.
     */
    for (const texto of [
      'El informe explica que hubo una caída del servicio',
      'Mi compañero describe el problema de otra forma',
      'Ese diagrama resume bastante bien la arquitectura',
    ]) {
      expect(looksLikeQuestion(texto).isQuestion, texto).toBe(false);
    }
  });

  it('deja fuera los verbos que se confunden con una afirmación', () => {
    // `cuenta` es sustantivo y "cuenta con" significa otra cosa; `indica` y
    // `desarrolla` abren frases afirmativas de lo más normal.
    for (const texto of [
      'Cuenta con tres años de experiencia en AWS',
      'Indica que el despliegue falló por un timeout',
      'Desarrolla software para el sector bancario',
    ]) {
      expect(looksLikeQuestion(texto).isQuestion, texto).toBe(false);
    }
  });
});

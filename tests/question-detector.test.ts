import { describe, expect, it } from 'vitest';
import { looksLikeQuestion } from '../src/main/core/question-detector';

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

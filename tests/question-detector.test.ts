import { describe, expect, it } from 'vitest';
import { looksLikeQuestion } from '../src/main/core/question-detector';
import { worthClassifying } from '../src/main/core/question-classifier';

/** Helper so the cases read like a table. */
const isQ = (text: string): boolean => looksLikeQuestion(text).isQuestion;

describe('looksLikeQuestion', () => {
  describe('detects interview questions', () => {
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

  describe('works without a question mark', () => {
    // Many STT engines don't punctuate reliably; if we depended on the mark we'd
    // lose most of the real questions.
    it('detects a leading interrogative without a mark', () => {
      expect(isQ('cuales son tus fortalezas')).toBe(true);
      expect(isQ('como manejarias un cliente difícil')).toBe(true);
    });

    it('detects despite absent accents', () => {
      expect(isQ('Por que dejaste tu ultimo trabajo')).toBe(true);
    });
  });

  describe("rejects what doesn't ask for an answer", () => {
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

    it('rejects fillers and audio checks', () => {
      // These start with an interrogative and/or carry a mark, and still aren't
      // answered: a suggestion here distracts at the worst moment.
      expect(isQ('¿Me escuchas?')).toBe(false);
      expect(isQ('¿Cómo estás?')).toBe(false);
      expect(isQ('Can you hear me?')).toBe(false);
      expect(isQ('¿Qué tal?')).toBe(false);
    });

    it('rejects sentences that are too short', () => {
      expect(isQ('¿Y?')).toBe(false);
      expect(isQ('claro')).toBe(false);
    });

    it('rejects empty or blank text', () => {
      expect(isQ('')).toBe(false);
      expect(isQ('   ')).toBe(false);
    });
  });

  describe("returns the decision's reason", () => {
    it('names the marker found', () => {
      expect(looksLikeQuestion('Cuéntame sobre ti').reason).toContain('imperativa');
      expect(looksLikeQuestion('¿Sabes qué es esto?').reason).toContain('interrogación');
      expect(looksLikeQuestion('cuales son tus metas').reason).toContain('interrogativo');
    });

    it('explains the rejection', () => {
      expect(looksLikeQuestion('¿Me escuchas?').reason).toContain('muletilla');
      expect(looksLikeQuestion('vale ya').reason).toContain('corto');
    });
  });
});

/**
 * Cases from a real listening test (July 2026). Of five sentences in a row only
 * the first fired, and the user experienced it as "the app stopped responding".
 * The first three describe what was failing.
 */
describe('recall over real speech transcribed by Whisper', () => {
  it("detects the question even when the interrogative isn't at the start", () => {
    // Whisper doesn't put "¿", and the interrogative arrives in the ninth word.
    // The opener rules only look at the first two.
    const verdict = looksLikeQuestion(
      'Si yo quiero programar una aplicación escritorio qué lenguaje de programación debería usar ahora.'
    );
    expect(verdict.isQuestion).toBe(true);
  });

  it('accepts query phrasings without an interrogative or mark', () => {
    expect(looksLikeQuestion('Me recomiendas Postgres o MySQL para esto.').isQuestion).toBe(true);
    expect(looksLikeQuestion('Cuál es la diferencia entre un proceso y un hilo.').isQuestion).toBe(
      true
    );
    expect(looksLikeQuestion('Como puedo mejorar el rendimiento de esa consulta.').isQuestion).toBe(
      true
    );
  });

  it('the accent is the signal, not the verb', () => {
    // The same verb, two different sentences. It's the reason there's no variant
    // of "debería" among the markers.
    expect(
      looksLikeQuestion('Qué base de datos debería usar para esto.').isQuestion
    ).toBe(true);
    expect(
      looksLikeQuestion('Le dije que debería usar Postgres y me hizo caso.').isQuestion
    ).toBe(false);
  });

  it('keeps discarding the audio checks', () => {
    // "me puedes escuchar" wasn't in the list and nothing else caught it.
    for (const filler of ['Me puedes escuchar.', 'Se escucha bien', 'Hola buenos días']) {
      expect(looksLikeQuestion(filler).isQuestion).toBe(false);
    }
  });

  it("doesn't fire on statements that sound similar", () => {
    // The price of raising recall: these must NOT start firing. That's why the
    // markers are multi-word and not plain "deberia".
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
 * LITERAL transcriptions from a real session with Whisper local, taken from the
 * saved history. They're the best available proof of how irregular an ASR is:
 * the same person, in a row, some with marks and some without.
 */
const REALES = {
  conSignos: '¿Qué tanto sabes de genería software?',
  sinSignos: 'que empresa creó Kotlin.',
  condicional:
    'Si yo quiero programar una aplicación escritorio que lenguaje de programación deberiosa ahora.',
  saludoYPrueba: 'Hola, ¿cómo estás? ¿Me escuchas?',
};

describe('auto-trigger sensitivity', () => {
  it('the fillers fire in no mode, not even with a question mark', () => {
    // This case fired: it doesn't START with a filler and it carries "?", so it
    // passed both filters. It's a greeting, not a question.
    for (const mode of ['strict', 'balanced', 'all'] as const) {
      expect(looksLikeQuestion(REALES.saludoYPrueba, mode).isQuestion).toBe(false);
    }
  });

  it('strict only accepts unambiguous signals', () => {
    expect(looksLikeQuestion(REALES.conSignos, 'strict').isQuestion).toBe(true);
    // Leading "que" is an opener interrogative, so it also passes.
    expect(looksLikeQuestion(REALES.sinSignos, 'strict').isQuestion).toBe(true);
    // This one doesn't: the interrogative is in the ninth word and without an accent.
    expect(looksLikeQuestion(REALES.condicional, 'strict').isQuestion).toBe(false);
  });

  it("balanced doesn't change what strict already accepted", () => {
    expect(looksLikeQuestion(REALES.conSignos, 'balanced').isQuestion).toBe(true);
    expect(looksLikeQuestion(REALES.sinSignos, 'balanced').isQuestion).toBe(true);
  });

  it('all responds to any utterance that is not a filler', () => {
    // The user's case: they dictate the questions, there's no noise to protect
    // against, and any heuristic is superfluous.
    expect(looksLikeQuestion(REALES.condicional, 'all').isQuestion).toBe(true);
    expect(
      looksLikeQuestion('Es posible utilizar Kotlin para aplicaciones de escritorio.', 'all')
        .isQuestion
    ).toBe(true);
    // But it still doesn't respond to a lone "Hola".
    expect(looksLikeQuestion('Hola', 'all').isQuestion).toBe(false);
  });

  it('the default is balanced', () => {
    expect(looksLikeQuestion(REALES.conSignos)).toEqual(
      looksLikeQuestion(REALES.conSignos, 'balanced')
    );
  });
});

/**
 * LITERAL transcriptions from a test session (log of 27/07, 21:05-21:12). They're
 * the best reference there is of what actually arrives, with the recognizer's
 * typos included.
 */
describe('cases from a real session log', () => {
  it("a greeting chained with an audio check doesn't fire", () => {
    for (const text of [
      'Hola, ¿cómo estás? ¿Me escuchas?',
      'Hola, ¿puedes oírme?',
      '¿Hey, can you hear me?',
      'Hola, puedes escucharme.',
    ]) {
      expect(looksLikeQuestion(text).isQuestion).toBe(false);
    }
  });

  it('but a question that STARTS like a filler does fire', () => {
    // It was discarded because the filter looked at the prefix: "qué tal" is a
    // filler, so "¿Qué tal es la idea de software?" was too. It isn't.
    expect(looksLikeQuestion('¿Qué tal es la idea de software?').isQuestion).toBe(true);
    expect(looksLikeQuestion('¿Cómo estás gestionando el despliegue?').isQuestion).toBe(true);
  });

  it('in "all" mode the ones the recognizer mangles also pass', () => {
    // None of these has a usable marker, and all three were questions.
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
 * Session of 28/07, 04:00-04:03. The language was forced to English while Spanish
 * was being spoken, so these transcriptions are literally what Whisper invented —
 * and they're still the best test material there is.
 */
describe('cases from the 28/07 log', () => {
  it('accepts two-word questions with a mark', () => {
    // It was discarded for "too short (2 words)". It's a whole question.
    expect(looksLikeQuestion('Podrías presentarte?').isQuestion).toBe(true);
    expect(looksLikeQuestion('¿Qué recomiendas?').isQuestion).toBe(true);
    expect(looksLikeQuestion('¿Cómo funciona?').isQuestion).toBe(true);
  });

  it('but two words without a marker still aren\'t enough', () => {
    // The minimum only drops when there's an unambiguous signal; otherwise any
    // lone confirmation would start firing.
    expect(looksLikeQuestion('vale ya').isQuestion).toBe(false);
    expect(looksLikeQuestion('perfecto gracias').isQuestion).toBe(false);
    expect(looksLikeQuestion('¿Y?').isQuestion).toBe(false);
  });
});

/**
 * The classifier's cost filter.
 *
 * The second step costs one query per utterance, so it can only escalate what the
 * heuristic couldn't decide. Asking a model whether "vale, perfecto" is a
 * question costs the same as asking it something useful, and the answer is
 * already known.
 */
describe('worthClassifying', () => {
  it('escalates the ambiguous: sentences with no marker at all', () => {
    // The real case that motivated all this: a question said as a statement.
    const verdict = looksLikeQuestion(
      'Una persona que conozca de DevOps debería conocer también de seguridad.'
    );
    expect(verdict.isQuestion).toBe(false);
    expect(worthClassifying(verdict)).toBe(true);
  });

  it("does NOT escalate a filler", () => {
    const verdict = looksLikeQuestion('¿me escuchas?');
    expect(verdict.isQuestion).toBe(false);
    expect(worthClassifying(verdict)).toBe(false);
  });

  it('does NOT escalate a sentence that is too short', () => {
    const verdict = looksLikeQuestion('ya');
    expect(verdict.isQuestion).toBe(false);
    expect(worthClassifying(verdict)).toBe(false);
  });

  it("escalates in strict mode too: the sensitivity doesn't decide this", () => {
    // `strict` decides how much the heuristic risks, not whether the model can
    // weigh in. Strict + classifier is the most precise combination there is.
    const verdict = looksLikeQuestion('Si una persona sabe DevOps, sabría de seguridad.', 'strict');
    expect(verdict.isQuestion).toBe(false);
    expect(worthClassifying(verdict)).toBe(true);
  });
});

/**
 * The bare imperative: «explica X» instead of «¿podrías explicar X?».
 *
 * It came out of a real test and the log: «Explica un poco el rol de un SRE» was
 * discarded, and the same request phrased as a question fired without a problem.
 * Both ask for the same thing and people use both — relying on it being phrased
 * as a question is losing half.
 *
 * It was also a cross-language asymmetry: in English `explain` and `describe`
 * were already covered and in Spanish only the forms with a pronoun.
 */
describe('imperative requests', () => {
  it('catches the exact case that failed', () => {
    const verdict = looksLikeQuestion('Explica un poco el rol de un SRE');
    expect(verdict.isQuestion).toBe(true);
  });

  it('recognizes the most common request verbs', () => {
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

  it('in strict mode too, because asking is as explicit as questioning', () => {
    // Not carrying a question mark doesn't make a request doubtful.
    expect(looksLikeQuestion('Explica el rol de un SRE', 'strict').isQuestion).toBe(true);
  });

  it('the "-nos" forms count in any position', () => {
    // Nobody says "explícanos" without asking for something, so it doesn't need
    // to head the sentence.
    expect(looksLikeQuestion('Y ahora explicanos cómo lo desplegarías').isQuestion).toBe(true);
  });

  it("does NOT fire with the same verb in the third person", () => {
    /*
     * It's the price of this rule and that's why the verbs only count at the
     * START: mid-sentence they're indistinguishable from the indicative, which
     * appears all the time.
     */
    for (const texto of [
      'El informe explica que hubo una caída del servicio',
      'Mi compañero describe el problema de otra forma',
      'Ese diagrama resume bastante bien la arquitectura',
    ]) {
      expect(looksLikeQuestion(texto).isQuestion, texto).toBe(false);
    }
  });

  it('leaves out the verbs that get confused with a statement', () => {
    // `cuenta` is a noun and "cuenta con" means something else; `indica` and
    // `desarrolla` open perfectly normal affirmative sentences.
    for (const texto of [
      'Cuenta con tres años de experiencia en AWS',
      'Indica que el despliegue falló por un timeout',
      'Desarrolla software para el sector bancario',
    ]) {
      expect(looksLikeQuestion(texto).isQuestion, texto).toBe(false);
    }
  });
});

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

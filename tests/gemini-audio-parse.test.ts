import { describe, expect, it } from 'vitest';
import { parseAudioResponse } from '../src/main/stt/gemini-audio';

/**
 * El caso real: el log del 28/07 registró
 * "Unterminated string in JSON at position 59 (line 3 column 20)".
 * Gemini 2.5 razona por defecto y esos tokens se descuentan de
 * `maxOutputTokens`, así que la respuesta se cortaba a media cadena.
 */
describe('parseAudioResponse', () => {
  it('lee la respuesta completa', () => {
    const parsed = parseAudioResponse(
      '{"transcripcion": "¿Qué es un closure?", "respuesta": "- Una función que captura su entorno."}'
    );
    expect(parsed).toEqual({
      transcript: '¿Qué es un closure?',
      answer: '- Una función que captura su entorno.',
    });
  });

  it('rescata la transcripción de un JSON cortado', () => {
    // La transcripción va primero en el esquema, así que sobrevive al corte.
    const parsed = parseAudioResponse('{\n  "transcripcion": "Hola, me escuchas",\n  "respuesta": "- Sí, te esc');
    expect(parsed?.transcript).toBe('Hola, me escuchas');
    expect(parsed?.answer).toBe('');
  });

  it('respeta las comillas escapadas al rescatar', () => {
    const parsed = parseAudioResponse('{"transcripcion": "dijo \\"vale\\" y se fue", "respuesta": "- cor');
    expect(parsed?.transcript).toBe('dijo "vale" y se fue');
  });

  it('devuelve null cuando no hay nada aprovechable', () => {
    expect(parseAudioResponse('esto no es json')).toBeNull();
    expect(parseAudioResponse('{"otra_cosa": 1}')).toEqual({ transcript: '', answer: '' });
  });

  it('tolera campos ausentes', () => {
    expect(parseAudioResponse('{"transcripcion": "Hola"}')).toEqual({
      transcript: 'Hola',
      answer: '',
    });
  });
});

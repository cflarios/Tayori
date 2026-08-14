import { describe, expect, it } from 'vitest';
import { parseAudioResponse } from '../src/main/stt/gemini-audio';

/**
 * The real case: the log of 28/07 recorded
 * "Unterminated string in JSON at position 59 (line 3 column 20)".
 * Gemini 2.5 reasons by default and those tokens are deducted from
 * `maxOutputTokens`, so the answer was cut off mid-string.
 */
describe('parseAudioResponse', () => {
  it('reads the complete response', () => {
    const parsed = parseAudioResponse(
      '{"transcripcion": "¿Qué es un closure?", "respuesta": "- Una función que captura su entorno."}'
    );
    expect(parsed).toEqual({
      transcript: '¿Qué es un closure?',
      answer: '- Una función que captura su entorno.',
    });
  });

  it('rescues the transcription from a cut-off JSON', () => {
    // The transcription goes first in the schema, so it survives the cut.
    const parsed = parseAudioResponse('{\n  "transcripcion": "Hola, me escuchas",\n  "respuesta": "- Sí, te esc');
    expect(parsed?.transcript).toBe('Hola, me escuchas');
    expect(parsed?.answer).toBe('');
  });

  it('respects the escaped quotes when rescuing', () => {
    const parsed = parseAudioResponse('{"transcripcion": "dijo \\"vale\\" y se fue", "respuesta": "- cor');
    expect(parsed?.transcript).toBe('dijo "vale" y se fue');
  });

  it('returns null when there is nothing usable', () => {
    expect(parseAudioResponse('esto no es json')).toBeNull();
    expect(parseAudioResponse('{"otra_cosa": 1}')).toEqual({ transcript: '', answer: '' });
  });

  it('tolerates absent fields', () => {
    expect(parseAudioResponse('{"transcripcion": "Hola"}')).toEqual({
      transcript: 'Hola',
      answer: '',
    });
  });
});

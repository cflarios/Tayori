import type { Settings } from '@shared/types';
import { getSecret } from '../config/secrets';
import { GeminiLiveSTT } from './gemini-live';
import { GeminiAudioSTT, type AudioAnswerContext } from './gemini-audio';
import { testWhisperBinary, WhisperLocalSTT } from './whisper-local';
import type { STTProvider } from './types';

export type { STTProvider, STTStartOptions, TranscriptEvent, DirectAnswerEvent } from './types';
export type { AudioAnswerContext } from './gemini-audio';

/**
 * Construye el motor de transcripción según los settings.
 *
 * Añadir un motor nuevo (Deepgram, Soniox) es añadir un `case` aquí y un
 * archivo que implemente `STTProvider`; el orquestador no cambia.
 */
/**
 * Prueba de verdad el motor de transcripción configurado.
 *
 * "De verdad" es la parte importante: con Gemini Live abre una sesión y
 * negocia el modelo; con Whisper local ejecuta el binario sobre un WAV
 * generado al vuelo. Comprobar sólo que existe el archivo o que hay una key no
 * habría detectado ni el stub `main.exe` ni un modelo Live no habilitado en la
 * cuenta, que son justo los dos fallos que se han dado.
 */
export async function testSTTConnection(
  settings: Settings
): Promise<{ ok: boolean; detail: string }> {
  try {
    if (settings.sttProviderId === 'gemini-live' || settings.sttProviderId === 'gemini-audio') {
      const apiKey = getSecret('google');
      if (!apiKey) {
        return { ok: false, detail: 'Falta la API key de Google. Configúrala más arriba.' };
      }
      if (settings.sttProviderId === 'gemini-audio') {
        return await new GeminiAudioSTT(
          apiKey,
          settings.llmModels.gemini || 'gemini-2.5-flash',
          () => ({ systemPrompt: '', history: [] })
        ).testConnection();
      }
      return await new GeminiLiveSTT(apiKey).testConnection(settings.language);
    }

    return await testWhisperBinary(settings.whisperModel);
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

export function createSTTProvider(
  settings: Settings,
  /** Sólo lo usa el motor de audio directo, que compone la consulta él mismo. */
  answerContext?: () => AudioAnswerContext
): STTProvider {
  switch (settings.sttProviderId) {
    case 'gemini-live': {
      const apiKey = getSecret('google');
      if (!apiKey) {
        throw new Error(
          'Falta la API key de Google. Configúrala en el dashboard para usar Gemini Live, ' +
            'o cambia la transcripción a Whisper local.'
        );
      }
      return new GeminiLiveSTT(apiKey);
    }

    case 'gemini-audio': {
      const apiKey = getSecret('google');
      if (!apiKey) {
        throw new Error(
          'Falta la API key de Google. El modo de audio directo manda el sonido al propio ' +
            'modelo de Gemini, así que la necesita.'
        );
      }
      if (!answerContext) {
        // Sin contexto no hay ni prompt ni memoria: mejor fallar aquí que
        // responder con el system prompt vacío y no entender por qué.
        throw new Error('El motor de audio directo requiere el contexto de respuesta.');
      }
      return new GeminiAudioSTT(apiKey, settings.llmModels.gemini || 'gemini-2.5-flash', answerContext);
    }

    case 'whisper-local':
      // `create` lanza con un mensaje que indica qué falta descargar y dónde.
      return WhisperLocalSTT.create(settings.whisperModel);

    default: {
      // Si se añade un id al tipo y no se maneja aquí, TypeScript falla el build.
      const exhaustive: never = settings.sttProviderId;
      throw new Error(`Motor de transcripción desconocido: ${String(exhaustive)}`);
    }
  }
}

import type { Settings } from '@shared/types';
import { getSecret } from '../config/secrets';
import { GeminiLiveSTT } from './gemini-live';
import { WhisperLocalSTT } from './whisper-local';
import type { STTProvider } from './types';

export type { STTProvider, STTStartOptions, TranscriptEvent } from './types';

/**
 * Construye el motor de transcripción según los settings.
 *
 * Añadir un motor nuevo (Deepgram, Soniox) es añadir un `case` aquí y un
 * archivo que implemente `STTProvider`; el orquestador no cambia.
 */
export function createSTTProvider(settings: Settings): STTProvider {
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

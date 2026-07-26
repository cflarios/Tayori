import type { Settings } from '@shared/types';
import { getSecret } from '../config/secrets';
import { GeminiLiveSTT } from './gemini-live';
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
      // Se implementa en la fase 7. El mensaje es explícito para que el usuario
      // sepa que la opción existe pero aún no está lista, en lugar de fallar
      // con un error genérico.
      throw new Error('Whisper local todavía no está implementado. Usa Gemini Live por ahora.');

    default: {
      // Si se añade un id al tipo y no se maneja aquí, TypeScript falla el build.
      const exhaustive: never = settings.sttProviderId;
      throw new Error(`Motor de transcripción desconocido: ${String(exhaustive)}`);
    }
  }
}

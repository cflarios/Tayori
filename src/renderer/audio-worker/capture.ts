import { TARGET_SAMPLE_RATE, type Speaker } from '@shared/types';
import { PCM_WORKLET_NAME, PCM_WORKLET_SOURCE, type WorkletMessage } from './pcm-worklet';

/**
 * Captura de audio de dos fuentes independientes:
 *   - `me`   → micrófono (`getUserMedia`)
 *   - `them` → salida del sistema (`getDisplayMedia` con loopback)
 *
 * Mantenerlas separadas es lo que permite saber quién habla sin diarización:
 * el hablante se deduce del stream de origen.
 */

export interface CaptureCallbacks {
  onChunk: (speaker: Speaker, pcm: ArrayBuffer) => void;
  onPeak: (speaker: Speaker, peak: number) => void;
  onError: (message: string) => void;
}

interface Lane {
  stream: MediaStream;
  context: AudioContext;
  node: AudioWorkletNode;
}

const lanes = new Map<Speaker, Lane>();
let workletUrl: string | null = null;

/** Registra el worklet en un AudioContext, compilándolo desde un Blob URL. */
async function attachWorklet(context: AudioContext): Promise<void> {
  if (!workletUrl) {
    workletUrl = URL.createObjectURL(new Blob([PCM_WORKLET_SOURCE], { type: 'text/javascript' }));
  }
  await context.audioWorklet.addModule(workletUrl);
}

/**
 * Conecta un MediaStream al worklet y empieza a emitir PCM.
 *
 * No se conecta a `context.destination` a propósito: hacerlo reproduciría el
 * audio capturado por los altavoces, creando un bucle de realimentación con
 * el loopback del sistema.
 */
async function buildLane(
  speaker: Speaker,
  stream: MediaStream,
  callbacks: CaptureCallbacks
): Promise<Lane> {
  const context = new AudioContext();
  await attachWorklet(context);

  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, PCM_WORKLET_NAME, {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    processorOptions: { targetRate: TARGET_SAMPLE_RATE },
  });

  node.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
    const { pcm, peak } = event.data;
    callbacks.onPeak(speaker, peak);
    if (pcm) callbacks.onChunk(speaker, pcm);
  };

  node.onprocessorerror = () => {
    callbacks.onError(`El procesador de audio de "${speaker}" falló.`);
  };

  source.connect(node);
  return { stream, context, node };
}

/** Loopback del sistema: lo que se oye por los altavoces = la otra persona. */
async function captureLoopback(): Promise<MediaStream> {
  // `video: true` es obligatorio para que getDisplayMedia funcione en Electron,
  // aunque sólo queramos el audio. El main responde con audio:'loopback'.
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

  // Soltamos el video de inmediato: mantenerlo consumiría GPU y memoria por
  // frames que nadie mira.
  for (const track of stream.getVideoTracks()) {
    track.stop();
    stream.removeTrack(track);
  }

  if (stream.getAudioTracks().length === 0) {
    throw new Error(
      'La captura de pantalla no devolvió audio. Comprueba que Windows tenga un dispositivo de salida activo.'
    );
  }
  return stream;
}

/** Micrófono: lo que dices tú. */
function captureMicrophone(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      // Desactivados a propósito: no queremos que el micrófono cancele el audio
      // del otro lado, porque ya lo capturamos por separado con el loopback.
      // Con la cancelación activa, el mic borraría parte de esa señal.
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: true,
    },
    video: false,
  });
}

export async function startCapture(
  captureMic: boolean,
  callbacks: CaptureCallbacks
): Promise<{ micActive: boolean; loopbackActive: boolean }> {
  await stopCapture();

  let micActive = false;

  // El loopback es la fuente imprescindible: sin ella no hay nada que
  // transcribir de la reunión. Si falla, propagamos el error en lugar de
  // arrancar una sesión que no oye a nadie.
  const loopback = await captureLoopback();
  lanes.set('them', await buildLane('them', loopback, callbacks));

  if (captureMic) {
    // El micrófono es opcional: si el usuario lo tiene desconectado o niega el
    // permiso, seguimos escuchando a la otra parte en lugar de fallar entero.
    try {
      const mic = await captureMicrophone();
      lanes.set('me', await buildLane('me', mic, callbacks));
      micActive = true;
    } catch (err) {
      callbacks.onError(
        `No se pudo abrir el micrófono (se sigue escuchando la reunión): ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  // Si llegamos aquí, el loopback está activo: captureLoopback() lanza si no.
  return { micActive, loopbackActive: true };
}

export async function stopCapture(): Promise<void> {
  for (const [, lane] of lanes) {
    lane.node.port.onmessage = null;
    lane.node.disconnect();
    for (const track of lane.stream.getTracks()) track.stop();
    // Cerrar el AudioContext libera el hilo de audio; sin esto se acumulan
    // contextos en cada start/stop hasta agotar el límite de Chromium.
    await lane.context.close().catch(() => undefined);
  }
  lanes.clear();
}

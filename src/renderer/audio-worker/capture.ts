import { DEFAULT_UI_LANG, translate, type UIKey, type UILang } from '@shared/i18n';
import { TARGET_SAMPLE_RATE, type Speaker } from '@shared/types';
import { PCM_WORKLET_NAME, PCM_WORKLET_SOURCE, type WorkletMessage } from './pcm-worklet';

/**
 * Audio capture from two independent sources:
 *   - `me`   → microphone (`getUserMedia`)
 *   - `them` → system output (`getDisplayMedia` with loopback)
 *
 * Keeping them separate is what lets us know who's talking without diarization:
 * the speaker is deduced from the source stream.
 */

/**
 * Translating from the hidden window.
 *
 * Its errors **end up in the overlay and the dashboard** —"couldn't open the
 * microphone" comes out the same place as any other capture failure—, so they
 * have to come out in the interface language. There's no React here to provide it
 * by context: it's read once and the change is followed, which is all that's
 * needed for three strings.
 */
let uiLang: UILang = DEFAULT_UI_LANG;

export function watchUILang(): void {
  void window.api.settings.get().then((settings) => {
    uiLang = settings.uiLanguage;
  });
  window.api.settings.onChange((settings) => {
    uiLang = settings.uiLanguage;
  });
}

export function t(key: UIKey, vars?: Record<string, string | number>): string {
  return translate(uiLang, key, vars);
}

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

/** Registers the worklet in an AudioContext, compiling it from a Blob URL. */
async function attachWorklet(context: AudioContext): Promise<void> {
  if (!workletUrl) {
    workletUrl = URL.createObjectURL(new Blob([PCM_WORKLET_SOURCE], { type: 'text/javascript' }));
  }
  await context.audioWorklet.addModule(workletUrl);
}

/**
 * Connects a MediaStream to the worklet and starts emitting PCM.
 *
 * It's deliberately not connected to `context.destination`: doing so would play
 * the captured audio through the speakers, creating a feedback loop with the
 * system loopback.
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
    callbacks.onError(t('err.workletFailed', { speaker }));
  };

  source.connect(node);
  return { stream, context, node };
}

/** System loopback: what you hear through the speakers = the other person. */
async function captureLoopback(): Promise<MediaStream> {
  // `video: true` is mandatory for getDisplayMedia to work in Electron, even
  // though we only want the audio. Main responds with audio:'loopback'.
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

  // We drop the video immediately: keeping it would consume GPU and memory for
  // frames no one looks at.
  for (const track of stream.getVideoTracks()) {
    track.stop();
    stream.removeTrack(track);
  }

  if (stream.getAudioTracks().length === 0) {
    throw new Error(t('err.noLoopbackAudio'));
  }
  return stream;
}

/** Microphone: what you say. `deviceId` picks a specific input; empty = default. */
async function captureMicrophone(deviceId?: string): Promise<MediaStream> {
  const audio: MediaTrackConstraints = {
    // Disabled on purpose: we don't want the microphone to cancel the audio
    // from the other side, because we already capture it separately with the
    // loopback. With cancellation on, the mic would erase part of that signal.
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: true,
  };

  if (!deviceId) {
    return navigator.mediaDevices.getUserMedia({ audio, video: false });
  }

  try {
    // `exact` so it doesn't silently open a different mic than the chosen one.
    return await navigator.mediaDevices.getUserMedia({
      audio: { ...audio, deviceId: { exact: deviceId } },
      video: false,
    });
  } catch (err) {
    // The chosen device is gone (unplugged, or a stale id from a past session):
    // fall back to the default rather than failing the whole capture. Only for
    // "not found"/"can't satisfy" errors — a permission denial would fail the
    // same way on the default and shouldn't be swallowed as if it were retried.
    const name = err instanceof Error ? err.name : '';
    if (name === 'OverconstrainedError' || name === 'NotFoundError') {
      return navigator.mediaDevices.getUserMedia({ audio, video: false });
    }
    throw err;
  }
}

export async function startCapture(
  sources: 'both' | 'system' | 'mic',
  callbacks: CaptureCallbacks,
  inputDeviceId?: string
): Promise<{ micActive: boolean; loopbackActive: boolean }> {
  await stopCapture();

  const wantsLoopback = sources === 'both' || sources === 'system';
  const wantsMic = sources === 'both' || sources === 'mic';

  let micActive = false;
  let loopbackActive = false;

  if (wantsLoopback) {
    // When the user asked for the system audio, it's the main source: if it
    // fails, we propagate instead of starting a session that hears no one. With
    // `sources === 'mic'` capture permission isn't even requested.
    const loopback = await captureLoopback();
    lanes.set('them', await buildLane('them', loopback, callbacks));
    loopbackActive = true;
  }

  if (wantsMic) {
    try {
      const mic = await captureMicrophone(inputDeviceId);
      lanes.set('me', await buildLane('me', mic, callbacks));
      micActive = true;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      // With both sources, losing the microphone degrades but doesn't prevent
      // keeping listening to the meeting. If the microphone WAS the only source
      // requested, there's nothing to degrade: it's a failure.
      if (loopbackActive) {
        callbacks.onError(t('err.micDegraded', { detail }));
      } else {
        throw new Error(t('err.micFailed', { detail }), { cause: err });
      }
    }
  }

  return { micActive, loopbackActive };
}

export async function stopCapture(): Promise<void> {
  for (const [, lane] of lanes) {
    lane.node.port.onmessage = null;
    lane.node.disconnect();
    for (const track of lane.stream.getTracks()) track.stop();
    // Closing the AudioContext frees the audio thread; without this, contexts
    // pile up on every start/stop until Chromium's limit is exhausted.
    await lane.context.close().catch(() => undefined);
  }
  lanes.clear();
}

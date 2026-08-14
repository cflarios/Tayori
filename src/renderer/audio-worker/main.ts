import { TARGET_SAMPLE_RATE, type AudioLevels, type Speaker } from '@shared/types';
import { startCapture, stopCapture, t, watchUILang } from './capture';

/**
 * Audio worker entry point: a hidden window whose only job is to capture audio
 * and send PCM to the main process.
 *
 * Levels are sent throttled and chunks at the worklet's rate (~10/s per stream).
 */

const levels: AudioLevels = { me: 0, them: 0 };
/** ~20 fps for the meter: enough to look smooth without saturating the IPC. */
const LEVELS_INTERVAL_MS = 50;
let levelsTimer: number | null = null;

function startLevelsReporting(): void {
  if (levelsTimer !== null) return;
  levelsTimer = window.setInterval(() => {
    window.api.audioWorker.sendLevels({ ...levels });
    // Gentle decay: without this the bar would stay stuck at the last peak as
    // soon as the speaker pauses.
    levels.me *= 0.75;
    levels.them *= 0.75;
  }, LEVELS_INTERVAL_MS);
}

function stopLevelsReporting(): void {
  if (levelsTimer !== null) {
    window.clearInterval(levelsTimer);
    levelsTimer = null;
  }
  levels.me = 0;
  levels.them = 0;
  window.api.audioWorker.sendLevels({ ...levels });
}

const callbacks = {
  onChunk: (speaker: Speaker, pcm: ArrayBuffer): void => {
    window.api.audioWorker.sendChunk({ speaker, pcm, sampleRate: TARGET_SAMPLE_RATE });
  },
  onPeak: (speaker: Speaker, peak: number): void => {
    // We keep the maximum between reports instead of the last value, so a short
    // peak isn't lost between two timer ticks.
    if (peak > levels[speaker]) levels[speaker] = peak;
  },
  onError: (message: string): void => {
    window.api.audioWorker.reportError(message);
  },
};

window.api.audioWorker.onCommand((command) => {
  if (command.action === 'start') {
    startCapture(command.sources, callbacks)
      .then(({ micActive, loopbackActive }) => {
        startLevelsReporting();
        window.api.audioWorker.reportStarted({ micActive, loopbackActive });
      })
      .catch((err: unknown) => {
        window.api.audioWorker.reportError(
          err instanceof Error ? err.message : t('err.captureUnknown')
        );
      });
  } else {
    void stopCapture().then(() => {
      stopLevelsReporting();
      window.api.audioWorker.reportStopped();
    });
  }
});

watchUILang();
window.api.audioWorker.reportReady();

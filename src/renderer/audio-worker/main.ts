import { TARGET_SAMPLE_RATE, type AudioLevels, type Speaker } from '@shared/types';
import { startCapture, stopCapture, t, watchUILang } from './capture';

/**
 * Punto de entrada del audio worker: una ventana oculta cuyo único trabajo es
 * capturar audio y enviar PCM al proceso main.
 *
 * Los niveles se envían con throttle y los chunks al ritmo del worklet
 * (~10/s por stream).
 */

const levels: AudioLevels = { me: 0, them: 0 };
/** ~20 fps para el medidor: suficiente para verse fluido sin saturar el IPC. */
const LEVELS_INTERVAL_MS = 50;
let levelsTimer: number | null = null;

function startLevelsReporting(): void {
  if (levelsTimer !== null) return;
  levelsTimer = window.setInterval(() => {
    window.api.audioWorker.sendLevels({ ...levels });
    // Decaimiento suave: sin esto la barra se quedaría clavada en el último
    // pico en cuanto el hablante hace una pausa.
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
    // Guardamos el máximo entre reportes en lugar del último valor, para que
    // un pico corto no se pierda entre dos ticks del temporizador.
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

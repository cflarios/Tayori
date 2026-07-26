/**
 * Punto de entrada del audio worker.
 *
 * El pipeline de captura real (getUserMedia + getDisplayMedia loopback →
 * AudioWorklet → PCM16 16 kHz → IPC) se implementa en la fase 2. Por ahora
 * sólo confirma al proceso main que la ventana cargó, lo que permite verificar
 * que las tres entradas del renderer se construyen y se resuelven bien.
 */

window.api.audioWorker.reportReady();

window.api.audioWorker.onCommand((command) => {
  console.log('[audio-worker] comando recibido (aún sin implementar):', command);
});

/**
 * AudioWorkletProcessor que convierte el audio del grafo a PCM16 mono a la
 * frecuencia que espera el STT.
 *
 * Se escribe como string y se registra con un Blob URL en lugar de como
 * archivo aparte: `audioWorklet.addModule()` necesita una URL servida, y en
 * producción los assets de Vite tienen nombres con hash. El Blob evita
 * depender de la ruta final del bundle.
 *
 * El resampleo es interpolación lineal, no un filtro polifásico. Es suficiente
 * porque el destino es reconocimiento de voz a 16 kHz: el aliasing por encima
 * de 8 kHz no afecta a la inteligibilidad de la palabra, y evita meter una
 * dependencia de DSP en el hot path del audio.
 */
export const PCM_WORKLET_NAME = 'pcm-downsampler';

/** Mensaje que el worklet manda al hilo principal del renderer. */
export interface WorkletMessage {
  /** PCM16 little-endian. Ausente si sólo se reporta nivel. */
  pcm?: ArrayBuffer;
  /** Pico de amplitud en [0,1] del bloque, para el medidor visual. */
  peak: number;
}

export const PCM_WORKLET_SOURCE = /* js */ `
class PcmDownsampler extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const targetRate = options.processorOptions.targetRate;

    // Cuántas muestras de entrada equivalen a una de salida.
    this.ratio = sampleRate / targetRate;
    // Acumulador de muestras de ENTRADA pendientes de remuestrear.
    this.inBuf = [];
    // Posición fraccionaria de lectura dentro de inBuf.
    this.position = 0;
    // Acumulador de muestras de SALIDA ya remuestreadas.
    this.outBuf = [];
    // ~100 ms por mensaje. process() se llama cada 128 frames (~2,9 ms a
    // 44,1 kHz); emitir en cada llamada serían ~344 mensajes IPC por segundo
    // y por stream, así que acumulamos hasta tener un bloque útil.
    this.chunkSize = Math.round(targetRate / 10);
    // Pico del bloque actual, se reinicia al emitir.
    this.peak = 0;
  }

  process(inputs) {
    const input = inputs[0];
    // Un input vacío ocurre mientras el grafo aún no arranca; devolver true
    // mantiene el procesador vivo esperando audio.
    if (!input || input.length === 0 || !input[0]) return true;

    const channels = input.length;
    const frames = input[0].length;

    // Mezcla a mono promediando: más robusto que quedarse con el canal
    // izquierdo, porque algunos dispositivos dejan un canal en silencio.
    for (let i = 0; i < frames; i++) {
      let sum = 0;
      for (let c = 0; c < channels; c++) sum += input[c][i];
      const mono = sum / channels;
      const abs = mono < 0 ? -mono : mono;
      if (abs > this.peak) this.peak = abs;
      this.inBuf.push(mono);
    }

    // Remuestrea todo lo que se pueda con los datos disponibles.
    while (this.position + 1 < this.inBuf.length) {
      const idx = Math.floor(this.position);
      const frac = this.position - idx;
      const a = this.inBuf[idx];
      const b = this.inBuf[idx + 1];
      this.outBuf.push(a + (b - a) * frac);
      this.position += this.ratio;
    }

    // Descarta la entrada ya consumida para que el acumulador no crezca.
    const consumed = Math.floor(this.position);
    if (consumed > 0) {
      this.inBuf = this.inBuf.slice(consumed);
      this.position -= consumed;
    }

    // Emite sólo cuando hay un bloque completo.
    while (this.outBuf.length >= this.chunkSize) {
      const block = this.outBuf.splice(0, this.chunkSize);
      const pcm = new Int16Array(block.length);
      for (let i = 0; i < block.length; i++) {
        // Recorta antes de escalar: un valor fuera de [-1,1] daría wraparound
        // en el entero y un chasquido muy audible.
        const s = block[i] < -1 ? -1 : block[i] > 1 ? 1 : block[i];
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      // Transferir el buffer evita copiarlo en cada bloque.
      this.port.postMessage({ pcm: pcm.buffer, peak: this.peak }, [pcm.buffer]);
      this.peak = 0;
    }

    return true;
  }
}

registerProcessor('${PCM_WORKLET_NAME}', PcmDownsampler);
`;

/**
 * AudioWorkletProcessor que convierte el audio del grafo a PCM16 mono a la
 * frecuencia que espera el STT.
 *
 * Se escribe como string y se registra con un Blob URL en lugar de como
 * archivo aparte: `audioWorklet.addModule()` necesita una URL servida, y en
 * producción los assets de Vite tienen nombres con hash. El Blob evita
 * depender de la ruta final del bundle.
 *
 * ## Por qué hay un filtro antes del resampleo
 *
 * La primera versión decimaba con interpolación lineal y nada más, razonando
 * que "el aliasing por encima de 8 kHz no afecta a la inteligibilidad". **Ese
 * razonamiento estaba del revés** y fue la causa de que la transcripción fuera
 * mediocre con los DOS motores, que es lo que delató que el fallo estaba aguas
 * arriba de ambos.
 *
 * Al bajar de 48 kHz a 16 kHz, todo lo que hay por encima de 8 kHz no
 * desaparece: se **pliega** hacia abajo y aterriza dentro de la banda de la
 * voz. Las sibilantes (s, f, z, ch) tienen ahí buena parte de su energía, así
 * que acaban superpuestas sobre las vocales. El efecto perverso es que
 * vocalizar con más énfasis lo **empeora**, porque mete más energía en la banda
 * que se va a plegar.
 *
 * La interpolación lineal atenúa algo, pero como filtro es pésima (unos -3 dB
 * en la mitad de Nyquist). Por eso va delante un Butterworth a 7 kHz.
 *
 * El **orden 8** (cuatro biquads) no es exceso de celo: se midió. Con orden 4
 * un tono de 12 kHz seguía saliendo a -23 dB, que sobre una consonante sorda es
 * perfectamente audible para el reconocedor. Con orden 8 baja de -40 dB, y el
 * coste son cuatro multiplicaciones más por muestra. `pcm-worklet.test.ts`
 * ejecuta el worklet de verdad y fija ambos números.
 *
 * ## Por qué no hay ni un `push` aquí dentro
 *
 * `process()` corre en el hilo de audio, con deadline de tiempo real y sin
 * margen. La versión anterior usaba arrays JS con `push` por muestra y
 * `slice`/`splice` en cada llamada (~cada 2,7 ms): eso es basura para el GC en
 * el peor sitio posible, y con Whisper y Ollama comiéndose la CPU se traduce en
 * bloques perdidos, que es más audio roto llegando al reconocedor. Todo el
 * estado son `Float32Array` con índices y `copyWithin`.
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
/**
 * Biquad en forma directa II transpuesta. Estado plano (dos variables) en lugar
 * de un objeto por sección: se ejecuta por muestra y no puede asignar nada.
 */
class Biquad {
  constructor(sampleRate, cutoff, q) {
    const w0 = 2 * Math.PI * (cutoff / sampleRate);
    const cos0 = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);

    const a0 = 1 + alpha;
    this.b0 = ((1 - cos0) / 2) / a0;
    this.b1 = (1 - cos0) / a0;
    this.b2 = this.b0;
    this.a1 = (-2 * cos0) / a0;
    this.a2 = (1 - alpha) / a0;

    this.z1 = 0;
    this.z2 = 0;
  }

  process(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}

class PcmDownsampler extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const targetRate = options.processorOptions.targetRate;

    // Cuántas muestras de entrada equivalen a una de salida.
    this.ratio = sampleRate / targetRate;

    // Antialiasing a 0,4375 · targetRate (7 kHz para 16 kHz). Se deja margen
    // bajo Nyquist para que la caída haya hecho su trabajo antes del pliegue.
    // Las Q son las de un Butterworth de 8º orden en cascada: plano en la banda
    // de paso, que es lo que importa cuando lo que sigue es un reconocedor.
    const cutoff = 0.4375 * targetRate;
    this.lowpass = [
      new Biquad(sampleRate, cutoff, 0.50979558),
      new Biquad(sampleRate, cutoff, 0.60134489),
      new Biquad(sampleRate, cutoff, 0.89997622),
      new Biquad(sampleRate, cutoff, 2.56291545),
    ];

    // Entrada ya filtrada, pendiente de remuestrear. Holgado: a 48 kHz un
    // bloque son 128 muestras y se drena en cada llamada.
    this.inBuf = new Float32Array(4096);
    this.inLen = 0;
    // Posición fraccionaria de lectura dentro de inBuf.
    this.position = 0;

    // ~100 ms por mensaje. process() se llama cada 128 frames (~2,7 ms a
    // 48 kHz); emitir en cada llamada serían ~375 mensajes IPC por segundo y
    // por stream, así que acumulamos hasta tener un bloque útil.
    this.chunkSize = Math.round(targetRate / 10);
    this.outBuf = new Float32Array(this.chunkSize);
    this.outLen = 0;

    // Pico del bloque actual, se reinicia al emitir.
    this.peak = 0;
  }

  emit() {
    const pcm = new Int16Array(this.outLen);
    for (let i = 0; i < this.outLen; i++) {
      // Recorta antes de escalar: un valor fuera de [-1,1] daría wraparound
      // en el entero y un chasquido muy audible.
      const s = this.outBuf[i] < -1 ? -1 : this.outBuf[i] > 1 ? 1 : this.outBuf[i];
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    // Transferir el buffer evita copiarlo en cada bloque.
    this.port.postMessage({ pcm: pcm.buffer, peak: this.peak }, [pcm.buffer]);
    this.outLen = 0;
    this.peak = 0;
  }

  process(inputs) {
    const input = inputs[0];
    // Un input vacío ocurre mientras el grafo aún no arranca; devolver true
    // mantiene el procesador vivo esperando audio.
    if (!input || input.length === 0 || !input[0]) return true;

    const channels = input.length;
    const frames = input[0].length;

    for (let i = 0; i < frames; i++) {
      // Mezcla a mono promediando: más robusto que quedarse con el canal
      // izquierdo, porque algunos dispositivos dejan un canal en silencio.
      let sum = 0;
      for (let c = 0; c < channels; c++) sum += input[c][i];
      const mono = sum / channels;

      // El pico se mide ANTES de filtrar: el medidor debe reflejar lo que entra
      // por el micrófono, no lo que queda después de recortar agudos.
      const abs = mono < 0 ? -mono : mono;
      if (abs > this.peak) this.peak = abs;

      let filtered = mono;
      for (let s = 0; s < this.lowpass.length; s++) filtered = this.lowpass[s].process(filtered);
      // Si el buffer se llena es que el consumidor se quedó atrás; se descarta
      // la muestra en lugar de crecer sin límite dentro del hilo de audio.
      if (this.inLen < this.inBuf.length) this.inBuf[this.inLen++] = filtered;
    }

    // Remuestrea todo lo que se pueda con los datos disponibles.
    while (this.position + 1 < this.inLen) {
      const idx = this.position | 0;
      const frac = this.position - idx;
      const a = this.inBuf[idx];
      const b = this.inBuf[idx + 1];
      this.outBuf[this.outLen++] = a + (b - a) * frac;
      if (this.outLen >= this.chunkSize) this.emit();
      this.position += this.ratio;
    }

    // Descarta la entrada ya consumida. copyWithin mueve dentro del mismo
    // buffer: sin asignar nada.
    const consumed = this.position | 0;
    if (consumed > 0) {
      this.inBuf.copyWithin(0, consumed, this.inLen);
      this.inLen -= consumed;
      this.position -= consumed;
    }

    return true;
  }
}

registerProcessor('${PCM_WORKLET_NAME}', PcmDownsampler);
`;

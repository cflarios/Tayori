/**
 * AudioWorkletProcessor that converts the graph's audio to mono PCM16 at the
 * rate the STT expects.
 *
 * It's written as a string and registered with a Blob URL instead of as a
 * separate file: `audioWorklet.addModule()` needs a served URL, and in
 * production Vite's assets have hashed names. The Blob avoids depending on the
 * bundle's final path.
 *
 * ## Why there's a filter before the resampling
 *
 * The first version decimated with linear interpolation and nothing else,
 * reasoning that "aliasing above 8 kHz doesn't affect intelligibility". **That
 * reasoning was backwards** and was the cause of transcription being mediocre
 * with BOTH engines, which is what gave away that the bug was upstream of both.
 *
 * When dropping from 48 kHz to 16 kHz, everything above 8 kHz doesn't disappear:
 * it **folds** downward and lands inside the voice band. The sibilants (s, f, z,
 * ch) have a good part of their energy there, so they end up superimposed on the
 * vowels. The perverse effect is that vocalizing with more emphasis makes it
 * **worse**, because it puts more energy into the band that's going to fold.
 *
 * Linear interpolation attenuates a bit, but as a filter it's terrible (about
 * -3 dB at half of Nyquist). That's why a Butterworth at 7 kHz goes in front.
 *
 * The **8th order** (four biquads) isn't overkill: it was measured. With order 4
 * a 12 kHz tone still came out at -23 dB, which over a voiceless consonant is
 * perfectly audible to the recognizer. With order 8 it drops below -40 dB, and
 * the cost is four more multiplications per sample. `pcm-worklet.test.ts` runs
 * the real worklet and pins both numbers.
 *
 * ## Why there's not a single `push` in here
 *
 * `process()` runs on the audio thread, with a real-time deadline and no margin.
 * The previous version used JS arrays with `push` per sample and `slice`/`splice`
 * on every call (~every 2.7 ms): that's garbage for the GC in the worst possible
 * place, and with Whisper and Ollama eating the CPU it translates to dropped
 * blocks, which is more broken audio reaching the recognizer. All the state is
 * `Float32Array` with indices and `copyWithin`.
 */
export const PCM_WORKLET_NAME = 'pcm-downsampler';

/** Message the worklet sends to the renderer's main thread. */
export interface WorkletMessage {
  /** PCM16 little-endian. Absent if only level is reported. */
  pcm?: ArrayBuffer;
  /** Amplitude peak in [0,1] of the block, for the visual meter. */
  peak: number;
}

export const PCM_WORKLET_SOURCE = /* js */ `
/**
 * Biquad in transposed direct form II. Flat state (two variables) instead of an
 * object per section: it runs per sample and can't allocate anything.
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

    // How many input samples equal one output sample.
    this.ratio = sampleRate / targetRate;

    // Antialiasing at 0.4375 · targetRate (7 kHz for 16 kHz). Margin is left
    // below Nyquist so the rolloff has done its job before the fold. The Qs are
    // those of an 8th-order Butterworth in cascade: flat in the passband, which
    // is what matters when what follows is a recognizer.
    const cutoff = 0.4375 * targetRate;
    this.lowpass = [
      new Biquad(sampleRate, cutoff, 0.50979558),
      new Biquad(sampleRate, cutoff, 0.60134489),
      new Biquad(sampleRate, cutoff, 0.89997622),
      new Biquad(sampleRate, cutoff, 2.56291545),
    ];

    // Already-filtered input, pending resampling. Generous: at 48 kHz a block is
    // 128 samples and it's drained on every call.
    this.inBuf = new Float32Array(4096);
    this.inLen = 0;
    // Fractional read position within inBuf.
    this.position = 0;

    // ~100 ms per message. process() is called every 128 frames (~2.7 ms at
    // 48 kHz); emitting on every call would be ~375 IPC messages per second per
    // stream, so we accumulate until we have a useful block.
    this.chunkSize = Math.round(targetRate / 10);
    this.outBuf = new Float32Array(this.chunkSize);
    this.outLen = 0;

    // Peak of the current block, reset on emit.
    this.peak = 0;
  }

  emit() {
    const pcm = new Int16Array(this.outLen);
    for (let i = 0; i < this.outLen; i++) {
      // Clip before scaling: a value outside [-1,1] would wrap around in the
      // integer and produce a very audible click.
      const s = this.outBuf[i] < -1 ? -1 : this.outBuf[i] > 1 ? 1 : this.outBuf[i];
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    // Transferring the buffer avoids copying it on every block.
    this.port.postMessage({ pcm: pcm.buffer, peak: this.peak }, [pcm.buffer]);
    this.outLen = 0;
    this.peak = 0;
  }

  process(inputs) {
    const input = inputs[0];
    // An empty input happens while the graph hasn't started yet; returning true
    // keeps the processor alive waiting for audio.
    if (!input || input.length === 0 || !input[0]) return true;

    const channels = input.length;
    const frames = input[0].length;

    for (let i = 0; i < frames; i++) {
      // Mix to mono by averaging: more robust than keeping the left channel,
      // because some devices leave one channel silent.
      let sum = 0;
      for (let c = 0; c < channels; c++) sum += input[c][i];
      const mono = sum / channels;

      // The peak is measured BEFORE filtering: the meter should reflect what
      // comes in through the microphone, not what's left after trimming highs.
      const abs = mono < 0 ? -mono : mono;
      if (abs > this.peak) this.peak = abs;

      let filtered = mono;
      for (let s = 0; s < this.lowpass.length; s++) filtered = this.lowpass[s].process(filtered);
      // If the buffer fills up the consumer fell behind; the sample is dropped
      // instead of growing without limit inside the audio thread.
      if (this.inLen < this.inBuf.length) this.inBuf[this.inLen++] = filtered;
    }

    // Resample as much as possible with the available data.
    while (this.position + 1 < this.inLen) {
      const idx = this.position | 0;
      const frac = this.position - idx;
      const a = this.inBuf[idx];
      const b = this.inBuf[idx + 1];
      this.outBuf[this.outLen++] = a + (b - a) * frac;
      if (this.outLen >= this.chunkSize) this.emit();
      this.position += this.ratio;
    }

    // Discard the already-consumed input. copyWithin moves within the same
    // buffer: without allocating anything.
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

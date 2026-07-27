/**
 * Segmentador de habla por energía.
 *
 * Whisper no transcribe en streaming: hay que darle trozos completos. Este VAD
 * decide dónde cortar, detectando cuándo alguien empieza y deja de hablar.
 *
 * Es un detector por energía RMS con suelo de ruido adaptativo, no Silero. La
 * alternativa (`@ricky0123/vad-web` + `onnxruntime-node`) es más precisa
 * rechazando ruido que no es voz, pero arrastra un módulo nativo que habría que
 * recompilar contra el ABI de Electron. Para lo único que necesitamos aquí
 * —saber dónde termina un turno— la energía basta, y el propio Whisper filtra
 * después lo que no sea habla.
 */

export interface VADOptions {
  sampleRate: number;
  /** Silencio necesario para cerrar una intervención. */
  silenceMs?: number;
  /** Audio que se conserva antes del inicio detectado, para no cortar sílabas. */
  prefixPaddingMs?: number;
  /** Duración mínima para considerar que hubo habla y no un golpe. */
  minSpeechMs?: number;
  /** Corte forzado: sin esto, alguien que habla sin pausas nunca se transcribiría. */
  maxUtteranceMs?: number;
}

/** Un turno de habla cerrado, listo para transcribir. */
export interface Utterance {
  pcm: Int16Array;
  durationMs: number;
  /** `true` si se cortó por longitud máxima en lugar de por silencio. */
  forced: boolean;
}

const FRAME_MS = 20;

export class EnergyVAD {
  private readonly frameSize: number;
  private readonly silenceFrames: number;
  private readonly prefixFrames: number;
  private readonly minSpeechFrames: number;
  private readonly maxFrames: number;

  /** Frames anteriores al habla, para el padding inicial. */
  private preRoll: Int16Array[] = [];
  /** Frames del turno en curso. */
  private active: Int16Array[] = [];
  private speaking = false;
  private silenceRun = 0;
  private speechFrames = 0;
  /** Resto de muestras que no completó un frame. */
  private carry: Int16Array = new Int16Array(0);

  /**
   * Suelo de ruido estimado. Arranca alto a propósito y baja: empezar bajo
   * haría que el ruido ambiente se tomara por voz durante los primeros segundos.
   */
  private noiseFloor = 0.02;

  /** Frames seguidos clasificados como habla. Ver el rescate del enganche. */
  private speechRun = 0;

  /**
   * A partir de aquí se deja de creer que sea habla de verdad. 30 s: largo para
   * que un monólogo normal no lo toque, corto para que el enganche se corrija
   * dentro de la misma conversación y no al día siguiente.
   */
  private static readonly LATCH_FRAMES = Math.round(30_000 / FRAME_MS);

  constructor(options: VADOptions) {
    const rate = options.sampleRate;
    this.frameSize = Math.round((rate * FRAME_MS) / 1000);
    this.silenceFrames = Math.round((options.silenceMs ?? 700) / FRAME_MS);
    this.prefixFrames = Math.round((options.prefixPaddingMs ?? 300) / FRAME_MS);
    this.minSpeechFrames = Math.round((options.minSpeechMs ?? 250) / FRAME_MS);
    this.maxFrames = Math.round((options.maxUtteranceMs ?? 20_000) / FRAME_MS);
  }

  /**
   * Alimenta PCM y devuelve los turnos que se hayan cerrado.
   *
   * Devuelve un array porque un push grande puede cerrar más de uno.
   */
  push(pcm: Int16Array): Utterance[] {
    const closed: Utterance[] = [];

    // Une el resto anterior con lo nuevo y procesa por frames completos.
    const joined = new Int16Array(this.carry.length + pcm.length);
    joined.set(this.carry, 0);
    joined.set(pcm, this.carry.length);

    let offset = 0;
    while (offset + this.frameSize <= joined.length) {
      const frame = joined.subarray(offset, offset + this.frameSize);
      offset += this.frameSize;

      const utterance = this.processFrame(frame);
      if (utterance) closed.push(utterance);
    }

    this.carry = joined.slice(offset);
    return closed;
  }

  private processFrame(frame: Int16Array): Utterance | null {
    const energy = rms(frame);
    // Umbral relativo al ruido: un margen fijo fallaría entre un micro de
    // portátil y uno de diadema, que difieren en un orden de magnitud.
    const isSpeech = energy > this.noiseFloor * 2.5 && energy > 0.006;

    if (!isSpeech) {
      // El suelo sólo se actualiza en silencio, o la propia voz lo arrastraría
      // hacia arriba hasta dejar de detectarse.
      this.noiseFloor = this.noiseFloor * 0.95 + energy * 0.05;
      this.speechRun = 0;
    } else {
      this.speechRun += 1;
      /*
       * Rescate del enganche.
       *
       * Actualizar el suelo SÓLO en silencio tiene un fallo que se manifiesta
       * después de un rato: si el ruido de fondo sube por encima de 2,5× el
       * suelo aprendido —el ventilador acelerando porque Whisper y el LLM están
       * comiendo CPU, o el AGC del micrófono subiendo ganancia— cada frame pasa
       * a contar como habla. Entonces el suelo ya no vuelve a actualizarse
       * nunca, porque sólo se actualizaba en silencio, y el VAD se queda
       * enganchado: todo sale por corte forzado a 20 s y la transcripción se
       * vuelve inservible. Visto desde fuera: "deja de responder".
       *
       * Nadie habla sin parar `LATCH_FRAMES` seguidos. Superado eso, lo que
       * estamos midiendo es ruido, así que se deja que el suelo lo aprenda.
       */
      if (this.speechRun > EnergyVAD.LATCH_FRAMES) {
        this.noiseFloor = this.noiseFloor * 0.98 + energy * 0.02;
      }
    }

    if (!this.speaking) {
      if (isSpeech) {
        this.speaking = true;
        this.speechFrames = 1;
        this.silenceRun = 0;
        // El pre-roll evita comerse la primera sílaba, que es justo la que
        // desambigua muchas preguntas.
        this.active = [...this.preRoll, copy(frame)];
        this.preRoll = [];
      } else {
        this.preRoll.push(copy(frame));
        if (this.preRoll.length > this.prefixFrames) this.preRoll.shift();
      }
      return null;
    }

    this.active.push(copy(frame));

    if (isSpeech) {
      this.speechFrames += 1;
      this.silenceRun = 0;
    } else {
      this.silenceRun += 1;
    }

    if (this.silenceRun >= this.silenceFrames) return this.close(false);
    if (this.active.length >= this.maxFrames) return this.close(true);
    return null;
  }

  private close(forced: boolean): Utterance | null {
    const frames = this.active;
    const speechFrames = this.speechFrames;

    this.active = [];
    this.speaking = false;
    this.silenceRun = 0;
    this.speechFrames = 0;

    // Un golpe en la mesa supera el umbral un instante; sin este filtro se
    // mandaría a Whisper y devolvería basura o alucinaciones.
    if (speechFrames < this.minSpeechFrames) return null;

    return { pcm: concat(frames), durationMs: frames.length * FRAME_MS, forced };
  }

  /**
   * Cierra el turno en curso, si supera el mínimo. Se usa al parar la captura
   * para no perder la última frase.
   */
  flush(): Utterance | null {
    if (!this.speaking) return null;
    return this.close(true);
  }

  reset(): void {
    this.preRoll = [];
    this.active = [];
    this.carry = new Int16Array(0);
    this.speaking = false;
    this.silenceRun = 0;
    this.speechFrames = 0;
    this.speechRun = 0;
    this.noiseFloor = 0.02;
  }

  /** Suelo de ruido actual. Sólo para diagnóstico. */
  get currentNoiseFloor(): number {
    return this.noiseFloor;
  }
}

/** Energía RMS normalizada a [0,1]. */
function rms(frame: Int16Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) {
    const sample = (frame[i] ?? 0) / 32768;
    sum += sample * sample;
  }
  return Math.sqrt(sum / frame.length);
}

function copy(frame: Int16Array): Int16Array {
  return Int16Array.from(frame);
}

function concat(frames: Int16Array[]): Int16Array {
  let total = 0;
  for (const frame of frames) total += frame.length;

  const out = new Int16Array(total);
  let offset = 0;
  for (const frame of frames) {
    out.set(frame, offset);
    offset += frame.length;
  }
  return out;
}

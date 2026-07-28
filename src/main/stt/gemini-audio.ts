import { EventEmitter } from 'node:events';
import { GoogleGenAI, Type } from '@google/genai';
import type { Speaker, STTProviderId } from '@shared/types';
import { EnergyVAD, type Utterance } from '../core/vad';
import { toWav } from './wav';
import type { STTProvider, STTStartOptions } from './types';

/**
 * Audio directo al modelo: sin capa de transcripción por medio.
 *
 * El resto de motores hacen `audio → texto → modelo`, y ese primer salto es
 * donde se rompía todo: si el reconocedor entiende "Are y'all gonna eat?" a
 * partir de una frase en español, el modelo responde impecablemente a algo que
 * nadie dijo. Aquí el WAV del turno va **al propio modelo de lenguaje**, que
 * oye el acento, la entonación y las palabras a medio pronunciar, y devuelve
 * transcripción y respuesta en la misma llamada.
 *
 * Consecuencias que conviene tener presentes:
 *
 * - **Ya no hay dos oportunidades de fallar.** Una mala transcripción sigue
 *   siendo posible, pero deja de contaminar la respuesta: el modelo no la lee,
 *   la escribe.
 * - **Sigue haciendo falta el VAD.** Alguien tiene que decidir cuándo termina
 *   el turno; esto no es streaming. Para eso está Gemini Live.
 * - **El audio sale de la máquina.** Es el precio, y es el mismo que ya se
 *   pagaba con Gemini Live.
 *
 * Se pide salida estructurada en lugar de parsear texto libre: con
 * `responseSchema` la separación entre lo que se oyó y lo que se contesta viene
 * garantizada por la API, no por una expresión regular que se rompe el día que
 * el modelo decide adornar la respuesta.
 */

/** Qué se le pide al modelo por cada turno de audio. */
const INSTRUCTION = [
  'Escucha el audio adjunto.',
  '',
  '1. Transcríbelo literalmente en el campo "transcripcion", en el idioma en que',
  '   se habla. Si no se entiende nada inteligible, deja el campo vacío.',
  '2. Si el audio contiene una pregunta o petición dirigida a la persona a la que',
  '   ayudas, respóndela en "respuesta" siguiendo tus instrucciones de formato.',
  '   Si es un saludo, una prueba de sonido o un comentario que no pide nada,',
  '   deja "respuesta" vacía.',
].join('\n');

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    transcripcion: { type: Type.STRING },
    respuesta: { type: Type.STRING },
  },
  required: ['transcripcion', 'respuesta'],
};

/** Lo que el orquestador aporta en cada turno: prompt y memoria. */
export interface AudioAnswerContext {
  systemPrompt: string;
  history: { question: string; answer: string }[];
}

/**
 * Lee la respuesta estructurada, tolerando que venga cortada.
 *
 * `responseSchema` garantiza la forma cuando el modelo llega al final, pero no
 * que llegue: si se agota `maxOutputTokens` el JSON sale truncado y `JSON.parse`
 * lanza. Ya no debería pasar con el razonamiento desactivado, pero una respuesta
 * larga siempre puede rozar el tope, y perder el turno entero por una comilla
 * que falta es un mal negocio: se rescata al menos la transcripción.
 */
export function parseAudioResponse(raw: string): { transcript: string; answer: string } | null {
  try {
    const parsed = JSON.parse(raw) as { transcripcion?: string; respuesta?: string };
    return {
      transcript: (parsed.transcripcion ?? '').trim(),
      answer: (parsed.respuesta ?? '').trim(),
    };
  } catch {
    // Rescate: el campo `transcripcion` va primero en el esquema, así que suele
    // estar completo aunque `respuesta` se haya quedado a medias.
    const salvaged = /"transcripcion"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(raw);
    if (!salvaged?.[1]) return null;
    try {
      return { transcript: (JSON.parse(`"${salvaged[1]}"`) as string).trim(), answer: '' };
    } catch {
      return null;
    }
  }
}

/** Carril por hablante: su VAD y su cola en serie. */
class Lane {
  private readonly vad: EnergyVAD;
  /** En serie: dos llamadas a la vez desordenarían la conversación. */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly speaker: Speaker,
    private readonly run: (utterance: Utterance) => Promise<void>,
    sampleRate: number
  ) {
    this.vad = new EnergyVAD({ sampleRate, silenceMs: 700, maxUtteranceMs: 20_000 });
  }

  push(pcm: Int16Array): void {
    for (const utterance of this.vad.push(pcm)) {
      if (utterance.forced) {
        console.warn(
          `[gemini-audio:${this.speaker}] corte forzado a ` +
            `${Math.round(utterance.durationMs / 1000)}s (suelo ${this.vad.currentNoiseFloor.toFixed(4)})`
        );
      }
      this.queue = this.queue.then(() => this.run(utterance));
    }
  }

  reset(): void {
    this.vad.reset();
  }
}

export class GeminiAudioSTT implements STTProvider {
  readonly id: STTProviderId = 'gemini-audio';
  readonly answersDirectly = true;
  readonly events = new EventEmitter();

  private lanes = new Map<Speaker, Lane>();
  private client: GoogleGenAI | null = null;
  private stopped = false;

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    /** Se consulta en cada turno, no al arrancar: el prompt y la memoria cambian. */
    private readonly context: () => AudioAnswerContext
  ) {}

  async start(options: STTStartOptions): Promise<void> {
    await this.stop();
    this.stopped = false;
    this.client = new GoogleGenAI({ apiKey: this.apiKey });

    for (const speaker of options.speakers) {
      this.lanes.set(
        speaker,
        new Lane(speaker, (utterance) => this.handle(speaker, utterance, options), options.sampleRate)
      );
    }
    console.log(`[gemini-audio] audio directo con "${this.model}" · sin capa de transcripción`);
  }

  push(speaker: Speaker, pcm: Buffer): void {
    if (this.stopped) return;
    const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
    this.lanes.get(speaker)?.push(samples);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    for (const lane of this.lanes.values()) lane.reset();
    this.lanes.clear();
    this.client = null;
    return Promise.resolve();
  }

  private async handle(
    speaker: Speaker,
    utterance: Utterance,
    options: STTStartOptions
  ): Promise<void> {
    const client = this.client;
    if (!client || this.stopped) return;

    const wav = toWav(utterance.pcm, options.sampleRate);
    const { systemPrompt, history } = this.context();
    const startedAt = Date.now();

    try {
      const response = await client.models.generateContent({
        model: this.model,
        contents: [
          // La memoria va como turnos reales, igual que en el proveedor de texto.
          ...history
            .filter((turn) => turn.question.trim() && turn.answer.trim())
            .flatMap((turn) => [
              { role: 'user', parts: [{ text: turn.question }] },
              { role: 'model', parts: [{ text: turn.answer }] },
            ]),
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'audio/wav', data: wav.toString('base64') } },
              { text: INSTRUCTION },
            ],
          },
        ],
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          /*
           * Sin esto llegaban JSON cortados a media cadena
           * ("Unterminated string in JSON at position 59"). Gemini 2.5 razona
           * por defecto, y **los tokens de razonamiento se descuentan de
           * `maxOutputTokens`**: se gastaban pensando y la respuesta se cortaba
           * antes de cerrar las comillas. Aquí el razonamiento no aporta —hay
           * que transcribir y contestar breve— y además es latencia pura.
           */
          thinkingConfig: { thinkingBudget: 0 },
          maxOutputTokens: 1_200,
        },
      });

      if (this.stopped) return;

      const raw = response.text;
      if (!raw) {
        console.warn(`[gemini-audio:${speaker}] respuesta vacía del modelo`);
        return;
      }

      const parsed = parseAudioResponse(raw);
      if (!parsed) {
        // Un JSON roto no puede tumbar el turno: se registra el crudo recortado
        // para poder diagnosticarlo y se sigue escuchando.
        console.warn(
          `[gemini-audio:${speaker}] respuesta no parseable, se descarta el turno: ` +
            JSON.stringify(raw.slice(0, 200))
        );
        return;
      }
      const { transcript, answer } = parsed;
      const tookMs = Date.now() - startedAt;

      console.log(
        `[gemini-audio:${speaker}] ${tookMs}ms · "${transcript.slice(0, 60)}" · ` +
          `${answer ? `respuesta de ${answer.length} car.` : 'sin respuesta (no pedía nada)'}`
      );

      // La transcripción se emite siempre: el overlay y el historial la
      // necesitan aunque el modelo decida que no había nada que responder.
      if (transcript) {
        this.events.emit('segment', { speaker, text: transcript, isFinal: true });
      }
      if (answer) {
        this.events.emit('answer', { speaker, question: transcript, answer, model: this.model });
      }
    } catch (err) {
      if (this.stopped) return;
      this.events.emit(
        'error',
        new Error(
          `[gemini-audio:${speaker}] ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
  }

  /** Una llamada mínima para el botón de prueba del dashboard. */
  async testConnection(): Promise<{ ok: boolean; detail: string }> {
    try {
      const client = new GoogleGenAI({ apiKey: this.apiKey });
      await client.models.generateContent({
        model: this.model,
        contents: 'Di OK.',
        config: { maxOutputTokens: 8 },
      });
      return { ok: true, detail: `Conectado con "${this.model}" (audio directo).` };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }
}

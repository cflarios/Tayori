import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';
import type { Speaker, STTProviderId } from '@shared/types';
import { EnergyVAD } from '../core/vad';
import { m } from '../i18n';
import { pcmToInt16, Upsampler16to24 } from './resample';
import type { STTProvider, STTStartOptions } from './types';

/**
 * Live transcription with OpenAI's real-time API.
 *
 * Same shape as `gemini-live` and for the same reason: **one session per
 * speaker**. It costs one more connection than mixing the two streams, and it's
 * what keeps the who-said-what attribution exact — with mixed audio the
 * transcript comes out indistinguishable.
 *
 * It also has an advantage Gemini Live doesn't: it opens with
 * `intent=transcription`, so the session **is** a transcriber. Gemini forces you
 * to fight a conversational model that tries to answer —hence its silence
 * instruction and the `modelTurn` that gets thrown away— and here that doesn't
 * exist: there's no generated output to pay for or to discard.
 *
 * Two things about this API that shape the whole file:
 *
 *  - **It only accepts PCM at 24 kHz.** The SDK's types say so plainly and the
 *    app's whole pipeline runs at 16 kHz, so the frequency has to be raised
 *    along the way. See `resample.ts`, which explains why linear interpolation
 *    is enough here and why the state between blocks isn't optional.
 *  - **THIS app decides the turn, not the server.** `gpt-live-transcribe`
 *    **doesn't accept `turn_detection`** —it rejects it with "Turn detection is
 *    not supported for this transcription model"— so it goes as `null` and it's
 *    the client that closes each turn with `input_audio_buffer.commit`. The
 *    usual `EnergyVAD`, the same one as whisper-local, is used to know when.
 *
 * **The second one is what really matters, and it's easy to miss.** The model
 * emits the partials on its own as the audio arrives, so without committing the
 * transcription **shows on screen and looks like everything works** — but a final
 * segment never arrives, and auto-trigger only evaluates finals. The result would
 * be an app that transcribes perfectly and never answers, without a single error
 * anywhere. That's why the commit has a test.
 */

/**
 * The model, and why this one.
 *
 * It's OpenAI's recommendation for live audio —mics, calls, streams—, which is
 * literally this app's case. The other two that were considered don't fit, and
 * it's worth writing down so no one "adds" them later thinking they improve
 * something:
 *
 *  - `gpt-transcribe` is the one recommended for **recorded** speech. It's not
 *    worse: it's for something else. It's available in the `openai-transcribe`
 *    engine, which works on already-closed turns and there it is the right one.
 *  - `gpt-4o-transcribe-diarize` separates speakers. **This app already knows
 *    who's talking** —the mic is "me" and the loopback is "them"— and that
 *    decision was made deliberately from the start: the stream's origin is more
 *    exact than any diarization. On top of that it doesn't accept a `prompt`, so
 *    it would cost the vocabulary bias, which is the cheapest quality lever there
 *    is here. The only thing it would add is telling several people apart
 *    **within** "them" in a four-person meeting, which is a different feature and
 *    not an improvement to this one.
 */
export const OPENAI_LIVE_MODEL = 'gpt-live-transcribe';

/**
 * The real-time API, in transcription mode.
 *
 * It can be replaced with another URL, and it's not decoration: it's what lets
 * you stand up a real WebSocket in the tests and check **what's sent over the
 * wire**. The two bugs this file has had —`turn_detection` wrong and the missing
 * commit— were exactly there, and a mocked client would have passed both.
 */
const REALTIME_URL = 'wss://api.openai.com/v1/realtime?intent=transcription';

/** What the API requires. See `resample.ts`. */
const REALTIME_SAMPLE_RATE = 24_000;

/** Reconnect backoff: a long session is closed by design, as in Gemini. */
const RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 5_000, 10_000];

/**
 * Minimum bytes before closing a turn.
 *
 * The API rejects a commit over a buffer with less than ~100 ms of audio. At
 * 24 kHz and 16 bits that's 4,800 bytes; 5,000 are required so as not to risk it
 * at the edge. Without this guard, a turn the VAD closes right at the start
 * produces a session error for every throat-clear.
 */
const MIN_COMMIT_BYTES = 5_000;

/**
 * Models that reject the `prompt` bias.
 *
 * Same pattern as `EFFORT_UNSUPPORTED` in `claude.ts` and `KNOWN_THINKERS` in
 * `ollama.ts`, and for the same reason: which parameters each transcription
 * model accepts can't be known from here with certainty, and getting it wrong
 * **takes down the whole session** instead of degrading. The docs say this model
 * supports "keyword hints", so it's sent; if some day a model rejects it, the
 * first session learns it, retries without it and the following ones come out
 * fine — with the warning in the log, because losing the vocabulary is really
 * losing quality.
 */
const PROMPT_UNSUPPORTED = new Set<string>();

/**
 * Handshake cap.
 *
 * Same reason as in `gemini-live`, where it cost an afternoon: if the socket
 * never gets established, the promise neither resolves nor rejects and
 * `startTranscription` stays hung forever — the capture announcing "Listening",
 * audio coming in, and neither transcription nor error anywhere.
 */
const CONNECT_TIMEOUT_MS = 15_000;

/** One lane = one WebSocket dedicated to a speaker. */
class Lane {
  private socket: WebSocket | null = null;
  private closed = false;
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private readonly upsampler = new Upsampler16to24();
  /**
   * The turn detector. It's the same as whisper-local's and with the same
   * thresholds: having "when a sentence ends" decided in a single place is what
   * makes switching engines not change the feel of the app.
   */
  private readonly vad: EnergyVAD;
  /** Audio sent and not yet closed. The API rejects a nearly-empty commit. */
  private uncommittedBytes = 0;
  /** What's transcribed of the current turn, glued raw. See `handleMessage`. */
  private turnText = '';

  /**
   * Audio that arrives while the session reconnects. Capped: we prefer losing
   * old audio to growing without a ceiling during a long outage.
   */
  private pending: Buffer[] = [];
  private static readonly MAX_PENDING_CHUNKS = 50; // ~5 s at 100 ms/chunk

  constructor(
    private readonly speaker: Speaker,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly options: STTStartOptions,
    private readonly emitter: EventEmitter,
    private readonly url: string = REALTIME_URL
  ) {
    this.vad = new EnergyVAD({
      sampleRate: options.sampleRate,
      silenceMs: 700,
      maxUtteranceMs: 20_000,
    });
  }

  /**
   * Closes the open turn.
   *
   * The VAD's `maxUtteranceMs` also acts as a hard cap: someone who rambles for
   * twenty seconds produces a forced cut and it closes there anyway, instead of
   * letting the server's buffer grow without limit.
   */
  private commit(): void {
    if (this.uncommittedBytes < MIN_COMMIT_BYTES) return;
    this.uncommittedBytes = 0;
    try {
      this.socket?.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
    } catch {
      // Dead socket: the `close` and its reconnection pick it up.
    }
  }

  connect(): Promise<void> {
    this.closed = false;

    return new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.url, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      this.socket = socket;

      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.close();
        reject(new Error(`[openai-live:${this.speaker}] handshake sin respuesta en 15s`));
      }, CONNECT_TIMEOUT_MS);

      const settle = (err?: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) reject(err);
        else resolve();
      };

      socket.on('open', () => {
        socket.send(JSON.stringify(this.sessionConfig()));
        this.reconnectAttempt = 0;
        // Fresh state with a fresh session: the server's buffer is empty, so
        // carrying over the previous count would commit over nothing.
        this.upsampler.reset();
        this.vad.reset();
        this.uncommittedBytes = 0;
        this.turnText = '';
        this.flushPending();
        settle();
      });

      socket.on('message', (raw) => this.handleMessage(raw.toString()));

      socket.on('error', (err: Error) => {
        // During the handshake it's the real cause —401, network down— and it
        // has to be returned instead of letting the clock run out and saying "no
        // response", which sends you looking in the wrong place.
        if (!settled) {
          settle(new Error(`[openai-live:${this.speaker}] ${err.message}`));
          return;
        }
        this.emitter.emit('error', new Error(`[openai-live:${this.speaker}] ${err.message}`));
      });

      socket.on('close', (code: number, reason: Buffer) => {
        this.socket = null;
        if (!settled) {
          const detail = reason.toString().trim();
          settle(
            new Error(
              `[openai-live:${this.speaker}] cerrado durante el handshake` +
                (detail ? `: ${detail} (código ${code})` : ` con código ${code}`)
            )
          );
          return;
        }
        // A close after being up and running is normal: the session has a
        // duration limit. It reconnects unless we stopped on purpose.
        if (!this.closed) this.scheduleReconnect();
      });
    });
  }

  /**
   * The session config, copied from the reference and not deduced.
   *
   * `turn_detection: null` is mandatory with this model: anything else it rejects
   * outright —"Turn detection is not supported for this transcription model"— and
   * the session never starts. It was discovered by running it, after putting in a
   * `semantic_vad` that seemed reasonable and that the docs themselves didn't use.
   * The lesson is the usual one in this file: what the reference says is copied,
   * not improved.
   *
   * With the turn off, the one closing it is this app. See `send()`.
   */
  private sessionConfig(): unknown {
    const languages =
      this.options.language && this.options.language !== 'auto'
        ? { languages: [this.options.language] }
        : {};

    const vocabulary = this.options.vocabulary?.length ?? 0;

    return {
      type: 'session.update',
      session: {
        type: 'transcription',
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: REALTIME_SAMPLE_RATE },
            transcription: {
              model: this.model,
              ...languages,
              // The vocabulary bias, which in an interview is gold: company
              // names and acronyms are exactly what a generalist ASR botches.
              ...(vocabulary && !PROMPT_UNSUPPORTED.has(this.model)
                ? {
                    prompt: `Expect these terms: ${this.options.vocabulary!.slice(0, 60).join(', ')}`,
                  }
                : {}),
            },
            turn_detection: null,
          },
        },
      },
    };
  }

  private handleMessage(raw: string): void {
    let event: { type?: string; delta?: string; transcript?: string; error?: { message?: string } };
    try {
      event = JSON.parse(raw) as typeof event;
    } catch {
      return; // A message that isn't JSON is none of our business.
    }

    switch (event.type) {
      /*
       * The partials arrive via `delta` and the close via `completed`. Both are
       * emitted: the overlay paints the partial so you can see the thing is
       * alive, and `isFinal` is what lets the question detector evaluate the turn
       * a single time, once it's no longer going to change.
       */
      /*
       * Both are emitted as **cumulative**, and that's the fix for a bug seen on
       * screen: the sentence came out twice.
       *
       * The `delta`s are incremental and the `completed` brings the WHOLE turn,
       * so letting the buffer concatenate the two wrote everything twice. And on
       * top of that the first copy came out with split words —"conoz ca",
       * "ingen ieros"— because joining token fragments with the buffer's space
       * heuristic inserts separators where they don't belong.
       *
       * It's solved by accumulating here, which is where you know how this
       * protocol works: the deltas are glued **raw**, without inventing spaces,
       * and what's sent outward is always the complete turn so far.
       */
      case 'conversation.item.input_audio_transcription.delta':
        if (event.delta) {
          this.turnText += event.delta;
          this.emitter.emit('segment', {
            speaker: this.speaker,
            text: this.turnText,
            isFinal: false,
            cumulative: true,
          });
        }
        return;

      case 'conversation.item.input_audio_transcription.completed':
        // The `completed` text is the good one: it comes already revised and punctuated.
        if (event.transcript) {
          this.emitter.emit('segment', {
            speaker: this.speaker,
            text: event.transcript,
            isFinal: true,
            cumulative: true,
          });
        }
        this.turnText = '';
        return;

      /*
       * An `error` arrives **inside** a socket that's still open, so without
       * looking at it the session would stay alive and mute: audio coming in, not
       * a word going out and no failure in sight. It's the pattern this project
       * chases everywhere.
       */
      case 'error': {
        const message = event.error?.message ?? m('err.sessionError');

        /*
         * A `prompt` rejection can't cost the whole session.
         *
         * Which parameters each transcription model accepts can't be known from
         * here with certainty —the docs talk about "keyword hints" without giving
         * the field name— and getting it wrong here **takes down the whole
         * transcription** instead of degrading. So if it's rejected, the model is
         * noted and it reconnects without bias: quality is lost on proper nouns,
         * which is much better than losing the transcription.
         */
        if (/prompt/i.test(message) && !PROMPT_UNSUPPORTED.has(this.model)) {
          PROMPT_UNSUPPORTED.add(this.model);
          console.warn(
            `[openai-live] "${this.model}" no acepta el sesgo por prompt; se reconecta sin él. ` +
              'Los nombres propios y las siglas se van a reconocer peor.'
          );
          this.socket?.close();
          return;
        }

        this.emitter.emit('error', new Error(`[openai-live:${this.speaker}] ${message}`));
        return;
      }

      default:
        return;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    const delay =
      RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)] ?? 10_000;
    this.reconnectAttempt += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.closed) return;
      this.connect().catch((err: unknown) => {
        this.emitter.emit(
          'error',
          new Error(
            `[openai-live:${this.speaker}] falló la reconexión: ${
              err instanceof Error ? err.message : String(err)
            }`
          )
        );
        this.scheduleReconnect();
      });
    }, delay);
  }

  private flushPending(): void {
    const queued = this.pending;
    this.pending = [];
    for (const chunk of queued) this.send(chunk);
  }

  push(pcm: Buffer): void {
    if (this.closed) return;
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.pending.push(pcm);
      if (this.pending.length > Lane.MAX_PENDING_CHUNKS) this.pending.shift();
      return;
    }
    this.send(pcm);
  }

  private send(pcm: Buffer): void {
    /*
     * The resampling goes here and not in the caller because the upsampler **has
     * state**: it's per lane, and sharing one between the two speakers would mix
     * the phase of two different audios.
     */
    const samples = pcmToInt16(pcm);
    const up = this.upsampler.process(samples);
    if (up.length === 0) return;

    const audio = Buffer.from(up.buffer, up.byteOffset, up.length * 2).toString('base64');
    try {
      this.socket?.send(JSON.stringify({ type: 'input_audio_buffer.append', audio }));
      this.uncommittedBytes += up.length * 2;

      /*
       * And here the turn is closed. The VAD is fed with the ORIGINAL 16 kHz
       * audio —the one with calibrated thresholds— and is only used as a signal
       * of "a sentence ended here": the audio already traveled via the append, so
       * what it returns is discarded.
       *
       * Without this the transcription would show on screen and a final segment
       * would never arrive, so auto-trigger wouldn't fire even once. It's the
       * kind of failure that looks like "the app transcribes but doesn't answer".
       */
      if (this.vad.push(samples).length > 0) this.commit();
    } catch {
      // A failed send is almost always a dead socket: the `close` is left to
      // trigger the reconnection instead of screaming on every chunk.
      this.socket = null;
      this.pending.push(pcm);
      if (this.pending.length > Lane.MAX_PENDING_CHUNKS) this.pending.shift();
    }
  }

  close(): void {
    // Close whatever turn was open before leaving: if someone stops listening
    // right after speaking, that last sentence still counts and without the
    // commit it would stay a partial forever.
    this.vad.flush();
    this.commit();

    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.pending = [];
    try {
      this.socket?.close();
    } catch {
      // Closing an already-dead socket throws; it doesn't matter, it's the state we wanted.
    }
    this.socket = null;
  }
}

export class OpenAILiveSTT implements STTProvider {
  readonly id: STTProviderId = 'openai-live';
  readonly events = new EventEmitter();

  private lanes = new Map<Speaker, Lane>();

  constructor(
    private readonly apiKey: string,
    private readonly model: string = OPENAI_LIVE_MODEL,
    /** Only the tests use it, to talk to a local WebSocket. */
    private readonly url: string = REALTIME_URL
  ) {}

  async start(options: STTStartOptions): Promise<void> {
    await this.stop();

    for (const speaker of options.speakers) {
      this.lanes.set(
        speaker,
        new Lane(speaker, this.apiKey, this.model, options, this.events, this.url)
      );
    }

    // In parallel: in series the handshakes would add up and the first second of
    // the meeting would come in untranscribed.
    await Promise.all([...this.lanes.values()].map((lane) => lane.connect()));
  }

  push(speaker: Speaker, pcm: Buffer): void {
    this.lanes.get(speaker)?.push(pcm);
  }

  async stop(): Promise<void> {
    for (const lane of this.lanes.values()) lane.close();
    this.lanes.clear();
  }

  /**
   * Opens a real session and closes it. It's what's behind "Test transcription":
   * checking that the key exists wouldn't have caught any of the real failures
   * of this project.
   */
  async testConnection(language: string): Promise<{ ok: boolean; detail: string }> {
    const probe = new Lane(
      'them',
      this.apiKey,
      this.model,
      { sampleRate: 16_000, language, speakers: ['them'] },
      new EventEmitter(),
      this.url
    );
    try {
      await probe.connect();
      return { ok: true, detail: m('diag.openaiLiveOk', { model: this.model }) };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    } finally {
      probe.close();
    }
  }
}

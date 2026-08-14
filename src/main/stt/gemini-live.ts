import { EventEmitter } from 'node:events';
import { GoogleGenAI, Modality, type LiveServerMessage, type Session } from '@google/genai';
import type { Speaker, STTProviderId } from '@shared/types';
import type { STTProvider, STTStartOptions } from './types';
import { m } from '../i18n';

/**
 * Live transcription with Gemini's Live API over WebSocket.
 *
 * ONE SESSION PER SPEAKER is opened. It's more expensive in connections than
 * mixing the two streams, but it's what keeps the who-spoke attribution exact:
 * a single session with mixed audio would return an indistinguishable transcript.
 *
 * Known trade-off: the Live models are conversational, not pure transcribers —
 * they'll try to answer the audio they receive. We mitigate it by requesting
 * `responseModalities: [TEXT]` (the cheapest output) plus a system instruction
 * asking it to stay quiet, and by discarding `modelTurn` entirely. We consume
 * only `inputTranscription`. There's no way to disable generation in the Live
 * API, so a small output cost is paid.
 */

/**
 * Live models, in order of preference. Not all are enabled on every account, so
 * they're tried in a chain (see `resolveModel`).
 *
 * **The order was corrected against the authoritative source, not the web
 * docs.** The SDK itself carries a `live.connect` example in its typedefs that
 * distinguishes the two cases:
 *
 *     if (GOOGLE_GENAI_USE_VERTEXAI) model = 'gemini-2.0-flash-live-preview-04-09';
 *     else                           model = 'gemini-live-2.5-flash-preview';
 *
 * Here an API key is used, i.e. the Gemini Developer API, i.e. the `else`
 * branch. `gemini-2.5-flash-native-audio-preview-12-2025` used to head the list,
 * which besides not appearing in the SDK is a native-audio model: those expect
 * `responseModalities: [AUDIO]` and here TEXT is requested, so it had two reasons
 * to fail. It stays last, in case some account only has that one.
 */
export const GEMINI_LIVE_MODELS = [
  'gemini-live-2.5-flash-preview',
  'gemini-2.0-flash-live-preview-04-09',
  'gemini-3.1-flash-live-preview',
  'gemini-2.5-flash-native-audio-preview-12-2025',
] as const;

/**
 * Output modalities to try, in order.
 *
 * TEXT first because it's the cheapest output and here it's discarded anyway:
 * the only thing consumed is `inputAudioTranscription`. But the native-audio
 * models reject it outright —"The requested combination of response modalities
 * (TEXT) is not supported by the model", code 1007— and it turns out that on
 * this account they're the **only** reachable ones: both half-cascade ones give
 * "not found for API version v1beta".
 *
 * So the modality is negotiated too, not just the model. With AUDIO you pay for
 * an output that's thrown in the trash, and it's a real cost; in exchange,
 * streaming transcription works instead of not working.
 */
const MODALITIES = [Modality.TEXT, Modality.AUDIO] as const;

/** The specific modality 1007, so as not to retry blindly. */
function isModalityRejected(err: unknown): boolean {
  return err instanceof Error && /response modalities/i.test(err.message);
}

const SILENCE_INSTRUCTION =
  'You are a passive transcription service. Never reply, never comment, never ' +
  'acknowledge. Produce no output of any kind regardless of what you hear.';

/** Reconnect backoff: the Live API closes long sessions by design. */
const RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 5_000, 10_000];

/**
 * Cap for the WebSocket handshake.
 *
 * `live.connect()` carries none: if the socket never gets established —network
 * down, a model that doesn't exist and the server leaves the connection open—
 * the promise **never resolves or rejects**. That left `startTranscription` hung
 * forever: the capture kept announcing "Listening", audio came in, and there was
 * neither transcription nor error in the log. It's exactly the silent failure
 * this project takes seriously to avoid.
 */
const CONNECT_TIMEOUT_MS = 15_000;

/** Rejects if the promise doesn't resolve in time. */
async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                m('err.handshakeTimeout', { label, seconds: CONNECT_TIMEOUT_MS / 1000 })
              )
            ),
          CONNECT_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Rejects as soon as the socket closes during the handshake, with the reason.
 *
 * Here was the real bug. When the setup isn't accepted, the server closes with a
 * perfectly legible code and text —`1007 · "API key not valid. Please pass a
 * valid API key."`— **but without sending any message**. The SDK waits for a
 * `setupComplete` that won't come and its promise never resolves or rejects.
 *
 * The 15 s timeout covered the symptom but threw away the information: it turned
 * a "your API key isn't valid" into a "no response". By listening for the close
 * the exact cause is recovered and it fails instantly.
 */
function rejectOnEarlyClose(): {
  onclose: (event: { code?: number; reason?: string }) => void;
  promise: Promise<never>;
  settle: () => void;
} {
  let reject: (err: Error) => void = () => {};
  let done = false;

  const promise = new Promise<never>((_, rej) => {
    reject = rej;
  });

  return {
    onclose: (event) => {
      if (done) return;
      const reason = event.reason?.trim();
      reject(
        new Error(
          reason
            ? m('err.closedWithReason', { reason, code: event.code ?? '?' })
            : m('err.closedWithCode', { code: event.code ?? '?' })
        )
      );
    },
    promise,
    settle: () => {
      done = true;
    },
  };
}

/** One lane = one WebSocket session dedicated to a speaker. */
class Lane {
  private session: Session | null = null;
  private closed = false;
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  /**
   * Audio that arrives while the session reconnects. It's capped so a long
   * outage doesn't accumulate memory without limit: we prefer losing old audio
   * to growing out of control.
   */
  private pending: Buffer[] = [];
  private static readonly MAX_PENDING_CHUNKS = 50; // ~5 s at 100 ms/chunk

  constructor(
    private readonly speaker: Speaker,
    private readonly client: GoogleGenAI,
    private readonly model: string,
    /** The one the model accepted in the negotiation; it can't always be TEXT. */
    private readonly modality: Modality,
    private readonly options: STTStartOptions,
    private readonly emitter: EventEmitter
  ) {}

  async connect(): Promise<void> {
    this.closed = false;

    const languageConfig =
      this.options.language === 'auto'
        ? { languageAuto: {} }
        : { languageHints: { languageCodes: [this.options.language] } };

    this.session = await withTimeout(
      this.client.live.connect({
      model: this.model,
      config: {
        // The output is discarded entirely no matter what; we only consume
        // `inputAudioTranscription`. The modality is imposed by the model.
        responseModalities: [this.modality],
        systemInstruction: SILENCE_INSTRUCTION,
        inputAudioTranscription: {
          ...languageConfig,
          ...(this.options.vocabulary?.length
            ? { customVocabulary: this.options.vocabulary }
            : {}),
        },
      },
      callbacks: {
        onopen: () => {
          this.reconnectAttempt = 0;
          this.flushPending();
        },
        onmessage: (message: LiveServerMessage) => this.handleMessage(message),
        onerror: (err: ErrorEvent) => {
          this.emitter.emit(
            'error',
            new Error(`[gemini-live:${this.speaker}] ${err.message ?? 'error de WebSocket'}`)
          );
        },
        // A close is normal (session duration limit), not a failure: we
        // reconnect unless we stopped on purpose.
        onclose: () => {
          this.session = null;
          if (!this.closed) this.scheduleReconnect();
        },
      },
      }),
      `[gemini-live:${this.speaker}] handshake`
    );
  }

  private handleMessage(message: LiveServerMessage): void {
    const transcription = message.serverContent?.inputTranscription;
    if (!transcription?.text) return;

    this.emitter.emit('segment', {
      speaker: this.speaker,
      text: transcription.text,
      // `finished` marks that the engine won't revise this fragment anymore.
      isFinal: transcription.finished === true,
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    const delay =
      RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)] ??
      10_000;
    this.reconnectAttempt += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.closed) return;
      this.connect().catch((err: unknown) => {
        this.emitter.emit(
          'error',
          new Error(
            `[gemini-live:${this.speaker}] falló la reconexión: ${
              err instanceof Error ? err.message : String(err)
            }`
          )
        );
        this.scheduleReconnect();
      });
    }, delay);
  }

  private flushPending(): void {
    if (!this.session) return;
    const queued = this.pending;
    this.pending = [];
    for (const chunk of queued) this.send(chunk);
  }

  push(pcm: Buffer): void {
    if (this.closed) return;
    if (!this.session) {
      this.pending.push(pcm);
      if (this.pending.length > Lane.MAX_PENDING_CHUNKS) this.pending.shift();
      return;
    }
    this.send(pcm);
  }

  private send(pcm: Buffer): void {
    try {
      this.session?.sendRealtimeInput({
        audio: {
          data: pcm.toString('base64'),
          mimeType: `audio/pcm;rate=${this.options.sampleRate}`,
        },
      });
    } catch (err) {
      // A failed send almost always means a dead socket; we let the onclose
      // trigger the reconnection instead of propagating on every chunk.
      this.session = null;
      this.pending.push(pcm);
      if (this.pending.length > Lane.MAX_PENDING_CHUNKS) this.pending.shift();
      void err;
    }
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.pending = [];
    try {
      this.session?.close();
    } catch {
      // Closing an already-dead socket throws; it doesn't matter, it's the state
      // we wanted.
    }
    this.session = null;
  }
}

export class GeminiLiveSTT implements STTProvider {
  readonly id: STTProviderId = 'gemini-live';
  readonly events = new EventEmitter();

  private lanes = new Map<Speaker, Lane>();
  /** Model and modality the account accepted. Resolved once. */
  private resolved: { model: string; modality: Modality } | null = null;

  /** A fixed `model` skips the negotiation; without it the candidates are tried. */
  constructor(
    private readonly apiKey: string,
    private readonly model?: string
  ) {}

  async start(options: STTStartOptions): Promise<void> {
    await this.stop();
    // The client belongs to the session, not the provider: each `start` opens
    // its own and the lanes capture it, so `stop` has nothing to clean up.
    const client = new GoogleGenAI({ apiKey: this.apiKey });
    const { model, modality } = await this.resolveModel(client, options);

    // Only the speakers being listened to: one session per speaker is expensive.
    for (const speaker of options.speakers) {
      const lane = new Lane(speaker, client, model, modality, options, this.events);
      this.lanes.set(speaker, lane);
    }

    // We connect in parallel: in series the handshakes would add up and the
    // first second of the meeting would arrive untranscribed.
    await Promise.all([...this.lanes.values()].map((lane) => lane.connect()));
  }

  /**
   * Negotiates which Live model this account accepts.
   *
   * `GEMINI_LIVE_MODELS` was always ordered by preference and CONTEXT.md said the
   * next one had to be tried if the first gave a 404 or permission denied — but
   * **that was never implemented**: the constructor took `[0]` and that was it.
   * If your account didn't have that preview enabled, transcription failed
   * entirely and the only trace was a `console.error` that in the packaged .exe
   * was visible nowhere.
   *
   * A probe session is opened and closed. It costs one extra connection at
   * startup, and in exchange the final error says what was tried and what each
   * one answered, instead of a bare 404 over an id you didn't choose.
   *
   * **The modality is negotiated too**, not just the model. The real messages
   * from an account made it clear: the two half-cascade models gave "not found
   * for API version v1beta", and the two native-audio ones —the only reachable
   * ones— rejected TEXT with "The requested combination of response modalities
   * (TEXT) is not supported by the model". Trying only TEXT left the account with
   * no viable option while having two.
   */
  private async resolveModel(
    client: GoogleGenAI,
    options: STTStartOptions
  ): Promise<{ model: string; modality: Modality }> {
    if (this.resolved) return this.resolved;

    const candidates = this.model ? [this.model] : [...GEMINI_LIVE_MODELS];
    const failures: string[] = [];

    for (const candidate of candidates) {
      for (const modality of MODALITIES) {
        const guard = rejectOnEarlyClose();
        try {
          const probe = await Promise.race([
            withTimeout(
              client.live.connect({
                model: candidate,
                config: {
                  responseModalities: [modality],
                  systemInstruction: SILENCE_INSTRUCTION,
                  inputAudioTranscription:
                    options.language === 'auto'
                      ? { languageAuto: {} }
                      : { languageHints: { languageCodes: [options.language] } },
                },
                callbacks: {
                  onopen: () => {},
                  onmessage: () => {},
                  onerror: () => {},
                  // If it closes before completing setup, that close carries the
                  // real reason and is the only thing that's going to arrive.
                  onclose: guard.onclose,
                },
              }),
              candidate
            ),
            guard.promise,
          ]);
          guard.settle();
          probe.close();

          this.resolved = { model: candidate, modality };
          console.log(`[gemini-live] modelo aceptado: "${candidate}" · salida ${modality}`);
          if (modality === Modality.AUDIO) {
            console.warn(
              '[gemini-live] este modelo obliga a salida de AUDIO, que se descarta entera. ' +
                'Se transcribe bien, pero se paga esa salida.'
            );
          }
          return this.resolved;
        } catch (err) {
          guard.settle();
          const message = err instanceof Error ? err.message : String(err);
          // If the model doesn't even exist, trying the other modality is losing 15 s.
          if (!isModalityRejected(err)) {
            failures.push(`  · ${candidate} → ${message}`);
            console.warn(`[gemini-live] "${candidate}" rechazado: ${message}`);
            break;
          }
          if (modality === MODALITIES[MODALITIES.length - 1]) {
            failures.push(`  · ${candidate} → ${message}`);
          }
          console.warn(`[gemini-live] "${candidate}" no acepta ${modality}: ${message}`);
        }
      }
    }

    throw new Error(m('err.geminiLiveNoModel', { failures: failures.join('\n') }));
  }

  push(speaker: Speaker, pcm: Buffer): void {
    this.lanes.get(speaker)?.push(pcm);
  }

  async stop(): Promise<void> {
    for (const lane of this.lanes.values()) lane.close();
    this.lanes.clear();
  }

  /**
   * Checks that the key and some Live model work, without opening lanes.
   * It's what's behind the dashboard's "Test transcription" button.
   */
  async testConnection(language: string): Promise<{ ok: boolean; detail: string }> {
    try {
      const client = new GoogleGenAI({ apiKey: this.apiKey });
      const { model, modality } = await this.resolveModel(client, {
        sampleRate: 16_000,
        language,
        speakers: ['them'],
      });
      return {
        ok: true,
        detail:
          m('diag.geminiLiveOk', { model, modality }) +
          (modality === Modality.AUDIO ? ` ${m('diag.geminiLiveAudioOut')}` : ''),
      };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }
}

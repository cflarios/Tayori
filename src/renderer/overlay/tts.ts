import { useEffect, useState } from 'react';
import type { Settings } from '@shared/types';

/**
 * Speaks answers aloud, one at a time.
 *
 * A singleton because the audio output is one: starting a new utterance stops
 * whatever was playing. Two engines land here — the browser's `speechSynthesis`
 * (Web Speech, plays itself on the default output) and the buffer engines
 * (OpenAI and Piper), whose audio the main process returns and we play through
 * the chosen output with `setSinkId`. The React hook below exposes which answer
 * is currently speaking so a button can toggle play/stop.
 *
 * A generation `token` guards the async gap: synthesis takes a moment (a cloud
 * round-trip, or Piper spawning), long enough to click again before the button
 * re-renders. Every `speak`/`stop` bumps the token; a request whose token is
 * stale after an await bows out, so a second click can never leave two clips
 * playing at once.
 */

type Listener = (speakingId: string | null) => void;

class TtsController {
  private listeners = new Set<Listener>();
  private speakingId: string | null = null;
  private audio: HTMLAudioElement | null = null;
  private token = 0;

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    cb(this.speakingId);
    return () => {
      this.listeners.delete(cb);
    };
  }

  get current(): string | null {
    return this.speakingId;
  }

  private set(id: string | null): void {
    this.speakingId = id;
    for (const cb of this.listeners) cb(id);
  }

  stop(): void {
    // Bumping the token invalidates any in-flight synthesis, so a request that
    // resolves after this returns won't start playing.
    this.token++;
    window.speechSynthesis?.cancel();
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
    this.set(null);
  }

  /** Speaks `text`, tagged with `id` so the UI can show which answer is playing. */
  async speak(id: string, text: string, settings: Settings): Promise<void> {
    this.stop();
    const trimmed = text.trim();
    if (!trimmed) return;
    const myToken = this.token;
    this.set(id);
    try {
      if (settings.ttsProviderId === 'webspeech') {
        await this.speakWebSpeech(myToken, trimmed, settings);
      } else {
        await this.speakBuffer(myToken, trimmed, settings);
      }
    } catch {
      // A failed synthesis or playback shouldn't leave the button stuck "playing".
      if (this.token === myToken) this.set(null);
    }
  }

  private speakWebSpeech(myToken: number, text: string, settings: Settings): Promise<void> {
    return new Promise((resolve) => {
      const synth = window.speechSynthesis;
      if (!synth) {
        this.set(null);
        resolve();
        return;
      }
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = settings.ttsRate || 1;
      if (settings.ttsVoice) {
        const voice = synth.getVoices().find((v) => v.voiceURI === settings.ttsVoice);
        if (voice) utter.voice = voice;
      }
      const done = (): void => {
        if (this.token === myToken) this.set(null);
        resolve();
      };
      utter.onend = done;
      utter.onerror = done;
      synth.speak(utter);
    });
  }

  private async speakBuffer(myToken: number, text: string, settings: Settings): Promise<void> {
    const res = await window.api.tts.synthesize(text);
    // Superseded by a newer speak/stop while we awaited the (possibly slow)
    // synthesis: drop this one silently.
    if (this.token !== myToken) return;
    if (!res) {
      this.set(null);
      return;
    }
    const audio = new Audio(`data:${res.mime};base64,${res.audioBase64}`);
    const sinkable = audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    if (settings.outputDeviceId && typeof sinkable.setSinkId === 'function') {
      await sinkable.setSinkId(settings.outputDeviceId).catch(() => undefined);
    }
    if (this.token !== myToken) return; // superseded while awaiting setSinkId
    this.audio = audio;
    audio.onended = (): void => {
      if (this.token === myToken) this.set(null);
    };
    audio.onerror = (): void => {
      if (this.token === myToken) this.set(null);
    };
    await audio.play().catch(() => undefined);
  }
}

export const tts = new TtsController();

/** The id of the answer currently being spoken, or `null`. Re-renders on change. */
export function useSpeaking(): string | null {
  const [id, setId] = useState<string | null>(tts.current);
  useEffect(() => tts.subscribe(setId), []);
  return id;
}

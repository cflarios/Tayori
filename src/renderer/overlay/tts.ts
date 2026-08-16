import { useEffect, useState } from 'react';
import type { Settings } from '@shared/types';

/**
 * Speaks answers aloud, one at a time.
 *
 * A singleton because the audio output is one: starting a new utterance stops
 * whatever was playing. Two engines land here — the browser's `speechSynthesis`
 * (Web Speech, plays itself on the default output) and the buffer engines
 * (OpenAI now, Piper/Kokoro later), whose audio the main process returns and we
 * play through the chosen output with `setSinkId`. The React hook below exposes
 * which answer is currently speaking so a button can toggle play/stop.
 */

type Listener = (speakingId: string | null) => void;

class TtsController {
  private listeners = new Set<Listener>();
  private speakingId: string | null = null;
  private audio: HTMLAudioElement | null = null;

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
    this.set(id);
    try {
      if (settings.ttsProviderId === 'webspeech') {
        await this.speakWebSpeech(id, trimmed, settings);
      } else {
        await this.speakBuffer(id, trimmed, settings);
      }
    } catch {
      // A failed synthesis or playback shouldn't leave the button stuck "playing".
      if (this.speakingId === id) this.set(null);
    }
  }

  private speakWebSpeech(id: string, text: string, settings: Settings): Promise<void> {
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
        if (this.speakingId === id) this.set(null);
        resolve();
      };
      utter.onend = done;
      utter.onerror = done;
      synth.speak(utter);
    });
  }

  private async speakBuffer(id: string, text: string, settings: Settings): Promise<void> {
    const res = await window.api.tts.synthesize(text);
    // `null` = the active provider isn't a buffer engine (or isn't wired). Nothing
    // to play; clear the state so the button doesn't hang.
    if (!res || this.speakingId !== id) {
      if (this.speakingId === id) this.set(null);
      return;
    }
    const audio = new Audio(`data:${res.mime};base64,${res.audioBase64}`);
    const sinkable = audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    if (settings.outputDeviceId && typeof sinkable.setSinkId === 'function') {
      await sinkable.setSinkId(settings.outputDeviceId).catch(() => undefined);
    }
    if (this.speakingId !== id) return; // superseded while awaiting setSinkId
    this.audio = audio;
    const done = (): void => {
      if (this.speakingId === id) this.set(null);
    };
    audio.onended = done;
    audio.onerror = done;
    await audio.play();
  }
}

export const tts = new TtsController();

/** The id of the answer currently being spoken, or `null`. Re-renders on change. */
export function useSpeaking(): string | null {
  const [id, setId] = useState<string | null>(tts.current);
  useEffect(() => tts.subscribe(setId), []);
  return id;
}

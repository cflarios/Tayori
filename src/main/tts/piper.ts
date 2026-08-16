import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { m } from '../i18n';
import { findPiperBinary, getVoicePath, isVoiceInstalled } from './piper-assets';
import type { TTSProvider, TTSResult, TTSSynthesizeOptions } from './types';

/**
 * Local neural TTS with the Piper binary.
 *
 * One-shot per answer: text in on stdin, a WAV out on a temp file, read back and
 * returned base64. No long-lived process — synthesis is fast and the answers are
 * short, so the ~launch cost isn't worth a resident server (unlike Whisper's).
 *
 * `--length_scale` is the inverse of speed (higher = slower), so a rate of 1.25×
 * maps to 0.8. `--espeak_data` and the cwd point at the binary's own folder,
 * where the release unpacks `espeak-ng-data` and the onnxruntime DLLs.
 */
export const piperTTS: TTSProvider = {
  async synthesize({ text, voice, rate }: TTSSynthesizeOptions): Promise<TTSResult> {
    const binary = findPiperBinary();
    if (!binary) throw new Error(m('tts.err.piperNoExe'));
    if (!voice || !isVoiceInstalled(voice)) throw new Error(m('tts.err.piperNoVoice'));

    const dir = dirname(binary);
    const tmp = mkdtempSync(join(tmpdir(), 'piper-'));
    const outFile = join(tmp, 'out.wav');

    const args = [
      '--model',
      getVoicePath(voice),
      '--output_file',
      outFile,
      '--length_scale',
      String(rate > 0 ? 1 / rate : 1),
    ];
    const espeak = join(dir, 'espeak-ng-data');
    if (existsSync(espeak)) args.push('--espeak_data', espeak);

    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(binary, args, { cwd: dir });
        let stderr = '';
        child.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString();
        });
        child.on('error', reject);
        child.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(m('tts.err.piperRun', { detail: stderr.trim() })));
        });
        child.stdin.write(text);
        child.stdin.end();
      });

      const wav = readFileSync(outFile);
      return { audioBase64: wav.toString('base64'), mime: 'audio/wav' };
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  },
};

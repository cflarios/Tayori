/**
 * Cabecera WAV para PCM16 mono.
 *
 * Vive aparte porque lo necesitan dos motores por motivos distintos:
 * `whisper-cli` y `whisper-server` leen archivos o multipart, y Gemini quiere
 * el audio como `inlineData` con un mime reconocible. Ninguno acepta PCM crudo.
 */
export function toWav(pcm: Int16Array, sampleRate: number): Buffer {
  const dataBytes = pcm.length * 2;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // tamaño del bloque fmt
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits por muestra
  header.write('data', 36);
  header.writeUInt32LE(dataBytes, 40);

  return Buffer.concat([header, Buffer.from(pcm.buffer, pcm.byteOffset, dataBytes)]);
}

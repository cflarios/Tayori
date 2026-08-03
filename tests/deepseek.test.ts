import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { DeepSeekProvider, DEEPSEEK_MODELS } from '../src/main/llm/deepseek';
import type { AnswerRequest } from '../src/main/llm/types';

/**
 * DeepSeek contra un servidor de verdad.
 *
 * Su API es compatible con la de OpenAI, y precisamente por eso conviene
 * comprobarlo en lugar de darlo por hecho: "compatible" no es "idéntica", y lo
 * que aquí se usa es Chat Completions, no la Responses API. Un mock validaría
 * la llamada que escribimos, no la que el servidor entiende.
 */

let received: Record<string, unknown>[] = [];
let server: Server;
let baseUrl = '';

beforeEach(async () => {
  received = [];

  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      received.push(JSON.parse(raw || '{}') as Record<string, unknown>);
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      for (const piece of ['DevOps ', 'es una cultura.']) {
        res.write(
          `data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`
        );
      }
      res.write('data: [DONE]\n\n');
      res.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const request = (patch: Partial<AnswerRequest> = {}): AnswerRequest => ({
  systemPrompt: 'Eres un asistente.',
  transcript: 'THEM: ¿qué es DevOps?',
  maxTokens: 700,
  ...patch,
});

async function collect(iterable: AsyncIterable<string>): Promise<string> {
  let out = '';
  for await (const chunk of iterable) out += chunk;
  return out;
}

const provider = (model = 'deepseek-v4-flash'): DeepSeekProvider =>
  new DeepSeekProvider('sk-test', model, baseUrl);

describe('DeepSeekProvider', () => {
  it('devuelve el texto que llega en trozos', async () => {
    const text = await collect(
      provider().streamAnswer(request(), new AbortController().signal)
    );
    expect(text).toBe('DevOps es una cultura.');
  });

  it('manda el system prompt y el historial como mensajes reales', async () => {
    await collect(
      provider().streamAnswer(
        request({
          history: [
            { question: '¿A qué te dedicas?', answer: 'Soy comercial.' },
            // Un turno a medias no se manda: ocupa y no aporta.
            { question: 'Y esto', answer: '  ' },
          ],
        }),
        new AbortController().signal
      )
    );

    const messages = received[0]!.messages as Array<{ role: string; content: string }>;
    expect(messages[0]).toEqual({ role: 'system', content: 'Eres un asistente.' });
    expect(messages[1]).toEqual({ role: 'user', content: '¿A qué te dedicas?' });
    expect(messages[2]).toEqual({ role: 'assistant', content: 'Soy comercial.' });
    expect(messages).toHaveLength(4);
  });

  it('respeta el tope de tokens', async () => {
    await collect(
      provider().streamAnswer(request({ maxTokens: 2_200 }), new AbortController().signal)
    );
    expect(received[0]!.max_tokens).toBe(2_200);
  });

  it('NO manda la captura, porque ningún modelo suyo la entiende', async () => {
    /*
     * Enviarla sería la forma más cara de que no pase nada: se paga el ancho de
     * banda y el modelo contesta igual que sin ella. Y tampoco se le dice que
     * hay una imagen — decírselo sin mandarla es invitarle a inventársela.
     */
    await collect(
      provider().streamAnswer(
        request({ images: [{ mime: 'image/jpeg', base64: 'QUJD' }] }),
        new AbortController().signal
      )
    );

    const cuerpo = JSON.stringify(received[0]);
    expect(cuerpo).not.toContain('QUJD');
    expect(cuerpo).not.toContain('captura');
  });

  it('cancelar no es un error que enseñar', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      collect(provider().streamAnswer(request(), controller.signal))
    ).resolves.toBe('');
  });
});

describe('catálogo de DeepSeek', () => {
  it('declara que NINGUNO lee imágenes', () => {
    /*
     * Es lo que hace que el selector del modelo de pantalla los marque «sin
     * visión» y avise. Ponerlos a `true` por descuido dejaría los dos botones
     * de pantalla fallando con un modelo que la app dijo que servía.
     */
    for (const model of DEEPSEEK_MODELS) {
      expect(model.supportsVision, model.id).toBe(false);
    }
  });

  it('son los dos ids que DeepSeek publica hoy', () => {
    // R1 y deepseek-chat ya no están en su catálogo; quien conserve acceso los
    // escribe a mano en «Otro…».
    expect(DEEPSEEK_MODELS.map((m) => m.id)).toEqual(['deepseek-v4-flash', 'deepseek-v4-pro']);
  });
});

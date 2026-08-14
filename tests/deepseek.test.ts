import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { DeepSeekProvider, DEEPSEEK_MODELS } from '../src/main/llm/deepseek';
import type { AnswerRequest } from '../src/main/llm/types';

/**
 * DeepSeek against a real server.
 *
 * Its API is compatible with OpenAI's, and precisely for that reason it's worth
 * checking instead of taking it for granted: "compatible" isn't "identical", and
 * what's used here is Chat Completions, not the Responses API. A mock would
 * validate the call we write, not the one the server understands.
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
  it('returns the text that arrives in pieces', async () => {
    const text = await collect(
      provider().streamAnswer(request(), new AbortController().signal)
    );
    expect(text).toBe('DevOps es una cultura.');
  });

  it('sends the system prompt and the history as real messages', async () => {
    await collect(
      provider().streamAnswer(
        request({
          history: [
            { question: '¿A qué te dedicas?', answer: 'Soy comercial.' },
            // A half-finished turn isn't sent: it takes up room and adds nothing.
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

  it('respects the token cap', async () => {
    await collect(
      provider().streamAnswer(request({ maxTokens: 2_200 }), new AbortController().signal)
    );
    expect(received[0]!.max_tokens).toBe(2_200);
  });

  it("does NOT send the capture, because none of its models understands it", async () => {
    /*
     * Sending it would be the most expensive way for nothing to happen: you pay
     * the bandwidth and the model answers the same as without it. And it isn't
     * told there's an image either — telling it without sending it is inviting it
     * to invent it.
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

  it("cancelling isn't an error to show", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      collect(provider().streamAnswer(request(), controller.signal))
    ).resolves.toBe('');
  });
});

describe('DeepSeek catalog', () => {
  it('declares that NONE reads images', () => {
    /*
     * It's what makes the screen-model selector mark them «no vision» and warn.
     * Setting them to `true` by oversight would leave both screen buttons
     * failing with a model the app said was usable.
     */
    for (const model of DEEPSEEK_MODELS) {
      expect(model.supportsVision, model.id).toBe(false);
    }
  });

  it('are the two ids DeepSeek publishes today', () => {
    // R1 and deepseek-chat are no longer in its catalog; whoever keeps access
    // writes them by hand in «Other…».
    expect(DEEPSEEK_MODELS.map((m) => m.id)).toEqual(['deepseek-v4-flash', 'deepseek-v4-pro']);
  });
});

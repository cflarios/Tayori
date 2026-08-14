import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { OpenAIProvider } from '../src/main/llm/openai';
import { LLMError, type AnswerRequest } from '../src/main/llm/types';

/**
 * The OpenAI provider against a **real** server.
 *
 * It's the same decision as with the MQTT broker and for the same reason: with a
 * mocked client, sending the wrong parameter —or the wrong event— would pass the
 * test just the same. What has to be checked here isn't that we call the SDK,
 * it's what reaches the other side and what's done with what comes back.
 *
 * The server speaks the Responses API over SSE: the app sees no difference, and
 * the events are the same ones the installed SDK pins.
 */

/** What the server received in the last request, to be able to assert it. */
let received: Record<string, unknown>[] = [];
/** Responses the server will give, in order. One per request. */
let scripted: Array<{ status: number; events?: unknown[]; body?: unknown }> = [];
let server: Server;

beforeEach(async () => {
  received = [];
  scripted = [];

  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      received.push(JSON.parse(raw || '{}') as Record<string, unknown>);
      const next = scripted.shift() ?? { status: 200, events: [] };

      if (next.status !== 200) {
        res.writeHead(next.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(next.body));
        return;
      }

      res.writeHead(200, { 'content-type': 'text/event-stream' });
      for (const event of next.events ?? []) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      res.write('data: [DONE]\n\n');
      res.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${port}/v1`;
});

afterEach(async () => {
  delete process.env.OPENAI_BASE_URL;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const request = (patch: Partial<AnswerRequest> = {}): AnswerRequest => ({
  systemPrompt: 'Eres un asistente.',
  transcript: 'THEM: ¿qué sabes de Kubernetes?',
  maxTokens: 700,
  ...patch,
});

const textEvents = (...deltas: string[]): unknown[] => [
  ...deltas.map((delta) => ({ type: 'response.output_text.delta', delta })),
  { type: 'response.completed', response: { id: 'resp_1' } },
];

async function collect(iterable: AsyncIterable<string>): Promise<string> {
  let out = '';
  for await (const chunk of iterable) out += chunk;
  return out;
}

describe('OpenAIProvider · what goes out to the API', () => {
  it('returns the text that arrives in pieces', async () => {
    scripted.push({ status: 200, events: textEvents('Kubernetes ', 'orquesta contenedores.') });

    const provider = new OpenAIProvider('sk-test', 'gpt-5.6-terra');
    const text = await collect(provider.streamAnswer(request(), new AbortController().signal));

    expect(text).toBe('Kubernetes orquesta contenedores.');
  });

  it("doesn't let OpenAI store the answer", async () => {
    // The Responses API's default is `store: true`: the answer stays in the
    // account and can be retrieved later via API. This app exists so that what's
    // said in a meeting stays nowhere, so this parameter is one of the ones that
    // aren't touched.
    scripted.push({ status: 200, events: textEvents('ok') });

    const provider = new OpenAIProvider('sk-test', 'gpt-5.6-terra');
    await collect(provider.streamAnswer(request(), new AbortController().signal));

    expect(received[0]!.store).toBe(false);
  });

  it("lends budget for reasoning on top of the answer's cap", async () => {
    // `max_output_tokens` counts reasoning and text together: with a bare cap, a
    // model that thinks spends it all and finishes without writing anything.
    scripted.push({ status: 200, events: textEvents('ok') });

    const provider = new OpenAIProvider('sk-test', 'gpt-5.6-terra');
    await collect(provider.streamAnswer(request({ maxTokens: 2_200 }), new AbortController().signal));

    expect(received[0]!.reasoning).toEqual({ effort: 'low' });
    expect(received[0]!.max_output_tokens).toBeGreaterThan(2_200 * 2);
  });

  it('sends the history as real messages, not inside the prompt', async () => {
    // It's what makes the model treat its previous answers as things it said.
    // Summarizing them in the text doesn't produce the same effect.
    scripted.push({ status: 200, events: textEvents('ok') });

    const provider = new OpenAIProvider('sk-test', 'gpt-5.6-terra');
    await collect(
      provider.streamAnswer(
        request({
          history: [
            { question: '¿A qué te dedicas?', answer: 'Soy comercial.' },
            // A half-finished turn isn't sent: it takes up room and adds nothing.
            { question: 'Y esto', answer: '   ' },
          ],
        }),
        new AbortController().signal
      )
    );

    const input = received[0]!.input as Array<{ role: string; content: unknown }>;
    expect(input[0]).toEqual({ role: 'user', content: '¿A qué te dedicas?' });
    expect(input[1]).toEqual({ role: 'assistant', content: 'Soy comercial.' });
    expect(input).toHaveLength(3);
    expect(received[0]!.instructions).toBe('Eres un asistente.');
  });

  it('attaches the capture as an image and leaves the instruction behind it', async () => {
    scripted.push({ status: 200, events: textEvents('ok') });

    const provider = new OpenAIProvider('sk-test', 'gpt-5.6-terra');
    await collect(
      provider.streamAnswer(
        request({ images: [{ mime: 'image/jpeg', base64: 'QUJD' }] }),
        new AbortController().signal
      )
    );

    const input = received[0]!.input as Array<{ content: Array<Record<string, string>> }>;
    const content = input.at(-1)!.content;
    expect(content[0]!.type).toBe('input_image');
    expect(content[0]!.image_url).toBe('data:image/jpeg;base64,QUJD');
    // The text goes after the image: the model interprets it better when the
    // instruction comes next and can refer to it.
    expect(content[1]!.type).toBe('input_text');
  });
});

describe('OpenAIProvider · what comes back', () => {
  it("a refusal doesn't leave the panel blank", async () => {
    // It arrives inside a 200, as content of another type — just like Claude's
    // `stop_reason: refusal`. Without looking at it, the overlay would be left
    // empty without saying why.
    scripted.push({
      status: 200,
      events: [
        { type: 'response.refusal.delta', delta: 'No puedo ayudar con eso.' },
        { type: 'response.completed', response: { id: 'resp_1' } },
      ],
    });

    const provider = new OpenAIProvider('sk-test', 'gpt-5.6-terra');
    await expect(
      collect(provider.streamAnswer(request(), new AbortController().signal))
    ).rejects.toThrow(LLMError);
  });

  it('running out of budget is explained, not kept quiet', async () => {
    // The stream ends clean and with no text. Saying "it returned no text" leads
    // nowhere; this does point at what to touch.
    scripted.push({
      status: 200,
      events: [
        {
          type: 'response.incomplete',
          response: { id: 'resp_1', incomplete_details: { reason: 'max_output_tokens' } },
        },
      ],
    });

    const provider = new OpenAIProvider('sk-test', 'gpt-5.6-terra');
    // Without readable settings, `m()` falls back to the default language, English.
    await expect(
      collect(provider.streamAnswer(request(), new AbortController().signal))
    ).rejects.toThrow(/spent its whole budget reasoning/);
  });

  it("a model that doesn't reason is learned on the fly and doesn't fail again", async () => {
    /*
     * It's the failure that left Haiku 4.5 dead in Claude, traced over: a
     * parameter the user doesn't know is sent makes ALL their questions fail.
     * With the ids hand-typed in «Other…», here it can happen with any old model.
     */
    scripted.push({
      status: 400,
      body: { error: { message: "Unsupported parameter: 'reasoning' is not supported with this model." } },
    });
    scripted.push({ status: 200, events: textEvents('respuesta sin razonar') });

    const provider = new OpenAIProvider('sk-test', 'modelo-sin-razonamiento');
    const text = await collect(provider.streamAnswer(request(), new AbortController().signal));

    expect(text).toBe('respuesta sin razonar');
    // The retry goes without the block and without the token loan: there's
    // nothing to think about, so the short cap is the right one again.
    expect(received[1]!.reasoning).toBeUndefined();
    expect(received[1]!.max_output_tokens).toBe(700);
  });

  it("cancelling isn't an error to show", async () => {
    // When another question arrives the previous one is aborted on purpose. That
    // mustn't paint an error in the overlay: the stale answer is what's surplus.
    scripted.push({ status: 200, events: textEvents('lo que sea') });

    const controller = new AbortController();
    controller.abort();

    const provider = new OpenAIProvider('sk-test', 'gpt-5.6-terra');
    await expect(collect(provider.streamAnswer(request(), controller.signal))).resolves.toBe('');
  });
});

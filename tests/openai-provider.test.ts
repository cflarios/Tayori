import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { OpenAIProvider } from '../src/main/llm/openai';
import { LLMError, type AnswerRequest } from '../src/main/llm/types';

/**
 * El proveedor de OpenAI contra un servidor **de verdad**.
 *
 * Es la misma decisión que con el broker de MQTT y por el mismo motivo: con el
 * cliente simulado, mandar el parámetro equivocado —o el evento equivocado—
 * pasaría el test igual. Lo que hay que comprobar aquí no es que llamemos al
 * SDK, es qué llega al otro lado y qué se hace con lo que vuelve.
 *
 * El servidor habla la Responses API por SSE: la app no ve la diferencia, y
 * los eventos son los mismos que fija el SDK instalado.
 */

/** Lo que el servidor recibió en la última petición, para poder afirmarlo. */
let received: Record<string, unknown>[] = [];
/** Respuestas que dará el servidor, en orden. Una por petición. */
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

describe('OpenAIProvider · lo que sale hacia la API', () => {
  it('devuelve el texto que llega en trozos', async () => {
    scripted.push({ status: 200, events: textEvents('Kubernetes ', 'orquesta contenedores.') });

    const provider = new OpenAIProvider('sk-test', 'gpt-5.6-terra');
    const text = await collect(provider.streamAnswer(request(), new AbortController().signal));

    expect(text).toBe('Kubernetes orquesta contenedores.');
  });

  it('no deja que OpenAI guarde la respuesta', async () => {
    // El defecto de la Responses API es `store: true`: la respuesta se queda en
    // la cuenta y se puede recuperar luego por API. Esta app existe para que lo
    // que se dice en una reunión no se quede en ningún sitio, así que este
    // parámetro es de los que no se tocan.
    scripted.push({ status: 200, events: textEvents('ok') });

    const provider = new OpenAIProvider('sk-test', 'gpt-5.6-terra');
    await collect(provider.streamAnswer(request(), new AbortController().signal));

    expect(received[0]!.store).toBe(false);
  });

  it('presta presupuesto para razonar además del tope de la respuesta', async () => {
    // `max_output_tokens` cuenta razonamiento y texto juntos: con el tope seco,
    // un modelo que piensa se lo gasta entero y termina sin escribir nada.
    scripted.push({ status: 200, events: textEvents('ok') });

    const provider = new OpenAIProvider('sk-test', 'gpt-5.6-terra');
    await collect(provider.streamAnswer(request({ maxTokens: 2_200 }), new AbortController().signal));

    expect(received[0]!.reasoning).toEqual({ effort: 'low' });
    expect(received[0]!.max_output_tokens).toBeGreaterThan(2_200 * 2);
  });

  it('manda el historial como mensajes de verdad, no dentro del prompt', async () => {
    // Es lo que hace que el modelo trate sus respuestas anteriores como cosas
    // que dijo él. Resumirlas en el texto no produce el mismo efecto.
    scripted.push({ status: 200, events: textEvents('ok') });

    const provider = new OpenAIProvider('sk-test', 'gpt-5.6-terra');
    await collect(
      provider.streamAnswer(
        request({
          history: [
            { question: '¿A qué te dedicas?', answer: 'Soy comercial.' },
            // Un turno a medias no se manda: ocupa y no aporta.
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

  it('adjunta la captura como imagen y deja la instrucción detrás', async () => {
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
    // El texto va después de la imagen: el modelo la interpreta mejor cuando la
    // instrucción viene a continuación y puede referirse a ella.
    expect(content[1]!.type).toBe('input_text');
  });
});

describe('OpenAIProvider · lo que vuelve', () => {
  it('una negativa no deja el panel en blanco', async () => {
    // Llega dentro de un 200, como contenido de otro tipo — igual que el
    // `stop_reason: refusal` de Claude. Sin mirarlo, el overlay se quedaría
    // vacío sin decir por qué.
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

  it('quedarse sin presupuesto se explica, no se calla', async () => {
    // El stream termina limpio y sin texto. Decir "no devolvió texto" no lleva
    // a ninguna parte; esto sí señala qué tocar.
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
    // Sin ajustes legibles, `m()` cae al idioma por defecto, que es el inglés.
    await expect(
      collect(provider.streamAnswer(request(), new AbortController().signal))
    ).rejects.toThrow(/spent its whole budget reasoning/);
  });

  it('un modelo que no razona se aprende en caliente y no vuelve a fallar', async () => {
    /*
     * Es el fallo que dejó a Haiku 4.5 muerto en Claude, calcado: un parámetro
     * que el usuario no sabe que se envía hace fallar TODAS sus preguntas. Con
     * los ids escritos a mano en «Otro…», aquí puede pasar con cualquier modelo
     * antiguo.
     */
    scripted.push({
      status: 400,
      body: { error: { message: "Unsupported parameter: 'reasoning' is not supported with this model." } },
    });
    scripted.push({ status: 200, events: textEvents('respuesta sin razonar') });

    const provider = new OpenAIProvider('sk-test', 'modelo-sin-razonamiento');
    const text = await collect(provider.streamAnswer(request(), new AbortController().signal));

    expect(text).toBe('respuesta sin razonar');
    // El reintento va sin el bloque y sin el préstamo de tokens: no hay nada
    // que pensar, así que el tope corto vuelve a ser el bueno.
    expect(received[1]!.reasoning).toBeUndefined();
    expect(received[1]!.max_output_tokens).toBe(700);
  });

  it('cancelar no es un error que enseñar', async () => {
    // Cuando llega otra pregunta se aborta la anterior a propósito. Eso no debe
    // pintar un error en el overlay: la respuesta obsoleta es lo que sobra.
    scripted.push({ status: 200, events: textEvents('lo que sea') });

    const controller = new AbortController();
    controller.abort();

    const provider = new OpenAIProvider('sk-test', 'gpt-5.6-terra');
    await expect(collect(provider.streamAnswer(request(), controller.signal))).resolves.toBe('');
  });
});

import { EventEmitter } from 'node:events';
import mqtt, { type MqttClient } from 'mqtt';
import { IPC } from '@shared/ipc';
import { mqttTopics, type Answer, type MqttStatus, type Settings } from '@shared/types';
import { getSecret } from '../config/secrets';

/**
 * Publica las respuestas en un broker MQTT.
 *
 * ## Qué es y qué no es
 *
 * Es una **salida hacia otra cosa**, no una función de la app. El caso que la
 * motivó es un ESP32 suscrito al tema que recibe la respuesta de un test y hace
 * lo que su dueño haya programado con ella. Nuestra responsabilidad termina en
 * el `publish`: lo que ocurra al otro lado es de quien montó el dispositivo.
 *
 * ## Sólo respuestas terminadas
 *
 * `answer` se emite en **cada tick del streaming**, así que publicar todo lo que
 * pasa por aquí sería inundar el broker con decenas de mensajes por respuesta,
 * cada uno un prefijo del siguiente. Un microcontrolador no quiere ver crecer
 * una frase: quiere la frase. Se publica cuando `status === 'done'`, una vez por
 * respuesta.
 *
 * Las que fallan o se abortan **no se publican**. Una placa que actúa sobre la
 * respuesta de un test no puede distinguir "esto es un error" de "esto es la
 * respuesta" sin que se lo digan, y mandar un error por el mismo tema donde
 * espera letras es pedir que actúe sobre basura.
 *
 * ## QoS 1 y sin retención
 *
 * **QoS 1** porque perder la respuesta es el fallo que importa: el usuario ya
 * pagó la consulta y está esperando a que su cacharro reaccione. **Sin retener**
 * porque un mensaje retenido se entrega al suscribirse, así que una placa que
 * arranca por la mañana ejecutaría la respuesta del test de ayer.
 */

/** Un broker que no contesta en este tiempo no está ahí. */
const CONNECT_TIMEOUT_MS = 8_000;

class MqttBridge extends EventEmitter {
  private client: MqttClient | null = null;
  private state: MqttStatus['state'] = 'off';
  private failure: string | undefined;
  private published = 0;
  private topic = '';

  /** Arranca, para o reconecta según los ajustes. Idempotente. */
  apply(settings: Settings): void {
    if (!settings.mqttEnabled) {
      this.stop();
      return;
    }

    const topics = mqttTopics(settings.mqttTopic);
    // Cualquier cambio de destino o de credenciales obliga a reconectar: el
    // cliente de MQTT fija usuario, contraseña y URL al conectar.
    const signature = [settings.mqttUrl, settings.mqttUsername, topics.json].join('|');
    if (this.client && signature === this.signature) return;

    this.stop();
    this.signature = signature;
    this.topic = topics.json;
    this.start(settings);
  }

  private signature = '';

  private start(settings: Settings): void {
    this.state = 'connecting';
    this.failure = undefined;
    this.emitStatus();

    const password = getSecret('mqtt');

    try {
      const client = mqtt.connect(settings.mqttUrl.trim(), {
        connectTimeout: CONNECT_TIMEOUT_MS,
        // Un identificador estable por máquina evita que dos reconexiones
        // seguidas se echen la una a la otra del broker, que es lo que pasa
        // cuando dos clientes comparten client id.
        clientId: `tayori-${process.pid}`,
        reconnectPeriod: 5_000,
        ...(settings.mqttUsername.trim() ? { username: settings.mqttUsername.trim() } : {}),
        ...(password ? { password } : {}),
      });

      client.on('connect', () => {
        this.state = 'connected';
        this.failure = undefined;
        console.log(`[mqtt] conectado a ${settings.mqttUrl} · tema "${this.topic}"`);
        this.emitStatus();
      });

      client.on('reconnect', () => {
        // No se pisa un error ya mostrado: si la causa fue "credenciales mal",
        // el reintento no la arregla y borrarla dejaría la pantalla en blanco.
        if (this.state !== 'error') this.state = 'connecting';
        this.emitStatus();
      });

      client.on('error', (err: Error) => {
        this.state = 'error';
        this.failure = friendlyError(err);
        console.error('[mqtt]', err.message);
        this.emitStatus();
      });

      client.on('close', () => {
        if (this.state === 'connected') {
          this.state = 'connecting';
          this.emitStatus();
        }
      });

      this.client = client;
    } catch (err) {
      // `connect()` lanza en el acto con una URL que no se puede ni parsear.
      this.state = 'error';
      this.failure = friendlyError(err instanceof Error ? err : new Error(String(err)));
      this.emitStatus();
    }
  }

  stop(): void {
    if (!this.client && this.state === 'off') return;

    const client = this.client;
    this.client = null;
    this.signature = '';
    this.state = 'off';
    this.failure = undefined;
    this.topic = '';
    if (client) {
      // `true` fuerza el cierre sin esperar al DISCONNECT: al salir de la app
      // no hay tiempo para una despedida cortés.
      client.end(true);
      console.log('[mqtt] desconectado');
    }
    this.emitStatus();
  }

  getStatus(): MqttStatus {
    return {
      state: this.state,
      published: this.published,
      topic: this.topic,
      ...(this.failure ? { error: this.failure } : {}),
    };
  }

  /**
   * Reenvía al broker lo que ya se difunde a las ventanas.
   *
   * Mismo enganche que el espejo del móvil, y por la misma razón: lo que ve el
   * overlay es lo que puede ver el broker, sin una lista aparte que se quede
   * desfasada cuando alguien añada un evento.
   */
  publish(channel: string, payload: unknown): void {
    if (channel !== IPC.onAnswer || !this.client) return;

    const answer = payload as Answer;
    if (answer?.status !== 'done' || !answer.text.trim()) return;
    // `answer` llega en cada tick del streaming; sólo el último trae `done`,
    // pero una respuesta ya publicada no debe repetirse si el estado se vuelve
    // a difundir por cualquier motivo.
    if (answer.id === this.lastPublished) return;
    this.lastPublished = answer.id;

    this.send(answer);
  }

  private lastPublished = '';

  /** Publica de verdad, en los dos temas. */
  private send(answer: Answer): void {
    const client = this.client;
    if (!client) return;

    const topics = mqttTopics(this.topic);
    const body = JSON.stringify({
      id: answer.id,
      trigger: answer.trigger,
      question: answer.question,
      answer: answer.text,
      providerId: answer.providerId,
      model: answer.model,
      at: answer.createdAt,
    });

    const options = { qos: 1 as const, retain: false };
    client.publish(topics.json, body, options);
    // El texto pelado va aparte para que una placa no necesite un parser de
    // JSON: se suscribe a `<tema>/text` y lee la respuesta y nada más.
    client.publish(topics.text, answer.text, options, (err) => {
      if (err) {
        console.error('[mqtt] no se pudo publicar:', err.message);
        return;
      }
      this.published += 1;
      this.emitStatus();
    });
  }

  /**
   * Publica una respuesta de prueba.
   *
   * Existe por lo de siempre en este proyecto: un montaje que no funciona y uno
   * que sí se ven idénticos desde aquí hasta que llega el primer mensaje, y
   * esperar a la primera respuesta real para descubrir que el tema estaba mal
   * es descubrirlo en el peor momento.
   */
  test(): { ok: boolean; error?: string } {
    if (!this.client || this.state !== 'connected') {
      return { ok: false, error: 'No hay conexión con el broker.' };
    }
    this.send({
      id: `test-${Date.now()}`,
      status: 'done',
      trigger: 'manual-input',
      question: 'Mensaje de prueba del asistente',
      text: 'Si ves esto en tu dispositivo, el montaje funciona.',
      providerId: 'claude',
      model: 'prueba',
      createdAt: Date.now(),
    });
    return { ok: true };
  }

  private emitStatus(): void {
    this.emit('status', this.getStatus());
  }
}

/** Traduce los fallos de red a algo que diga qué mirar. */
function friendlyError(err: Error): string {
  const message = err.message;

  if (/ECONNREFUSED/i.test(message)) {
    return 'El broker rechazó la conexión. Comprueba la dirección y que esté escuchando en ese puerto.';
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(message)) {
    return 'No se encontró ese host. Revisa la dirección del broker.';
  }
  if (/Not authorized|bad user name or password/i.test(message)) {
    return 'El broker rechazó el usuario o la contraseña.';
  }
  if (/Missing protocol|Invalid URL|unsupported/i.test(message)) {
    return 'La URL no vale. Tiene que empezar por mqtt:// o mqtts:// e incluir el puerto.';
  }
  return message;
}

export const mqttBridge = new MqttBridge();

import { EventEmitter } from 'node:events';
import mqtt, { type MqttClient } from 'mqtt';
import { IPC } from '@shared/ipc';
import { mqttTopics, type Answer, type MqttStatus, type Settings } from '@shared/types';
import { getSecret } from '../config/secrets';
import { m } from '../i18n';

/**
 * Publishes the answers to an MQTT broker.
 *
 * ## What it is and what it isn't
 *
 * It's an **outlet toward something else**, not an app feature. The case that
 * motivated it is an ESP32 subscribed to the topic that receives a quiz's answer
 * and does whatever its owner programmed with it. Our responsibility ends at the
 * `publish`: whatever happens on the other side belongs to whoever built the
 * device.
 *
 * ## Finished answers only
 *
 * `answer` is emitted on **every streaming tick**, so publishing everything that
 * passes through here would flood the broker with dozens of messages per answer,
 * each one a prefix of the next. A microcontroller doesn't want to watch a
 * sentence grow: it wants the sentence. It's published when `status === 'done'`,
 * once per answer.
 *
 * The ones that fail or are aborted are **not published**. A board that acts on
 * a quiz's answer can't tell "this is an error" apart from "this is the answer"
 * without being told, and sending an error over the same topic where it expects
 * letters is asking it to act on garbage.
 *
 * ## QoS 1 and no retention
 *
 * **QoS 1** because losing the answer is the failure that matters: the user
 * already paid for the query and is waiting for their gadget to react. **Not
 * retained** because a retained message is delivered on subscribe, so a board
 * that boots up in the morning would run yesterday's quiz answer.
 */

/** A broker that doesn't answer in this time isn't there. */
const CONNECT_TIMEOUT_MS = 8_000;

class MqttBridge extends EventEmitter {
  private client: MqttClient | null = null;
  private state: MqttStatus['state'] = 'off';
  private failure: string | undefined;
  private published = 0;
  private topic = '';

  /** Starts, stops or reconnects according to the settings. Idempotent. */
  apply(settings: Settings): void {
    if (!settings.mqttEnabled) {
      this.stop();
      return;
    }

    const topics = mqttTopics(settings.mqttTopic);
    // Any change of destination or credentials forces a reconnect: the MQTT
    // client fixes user, password and URL on connect.
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
        // A stable per-machine identifier keeps two consecutive reconnections
        // from kicking each other off the broker, which is what happens when two
        // clients share a client id.
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
        // An already-shown error isn't overwritten: if the cause was "bad
        // credentials", the retry doesn't fix it and clearing it would blank the
        // screen.
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
      // `connect()` throws on the spot with a URL that can't even be parsed.
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
      // `true` forces the close without waiting for the DISCONNECT: on app exit
      // there's no time for a polite goodbye.
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
   * Forwards to the broker what's already broadcast to the windows.
   *
   * Same hook as the phone mirror, and for the same reason: what the overlay
   * sees is what the broker can see, without a separate list that falls out of
   * date when someone adds an event.
   */
  publish(channel: string, payload: unknown): void {
    if (channel !== IPC.onAnswer || !this.client) return;

    const answer = payload as Answer;
    if (answer?.status !== 'done' || !answer.text.trim()) return;
    // `answer` arrives on every streaming tick; only the last one carries
    // `done`, but an already-published answer must not repeat if the state gets
    // broadcast again for any reason.
    if (answer.id === this.lastPublished) return;
    this.lastPublished = answer.id;

    this.send(answer);
  }

  private lastPublished = '';

  /** Actually publishes, on both topics. */
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
    // The bare text goes separately so a board doesn't need a JSON parser: it
    // subscribes to `<topic>/text` and reads the answer and nothing else.
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
   * Publishes a test answer.
   *
   * It exists for the usual reason in this project: a setup that doesn't work and
   * one that does look identical from here until the first message arrives, and
   * waiting for the first real answer to find out the topic was wrong is finding
   * out at the worst moment.
   */
  test(): { ok: boolean; error?: string } {
    if (!this.client || this.state !== 'connected') {
      return { ok: false, error: m('mq.errNoConnection') };
    }
    this.send({
      id: `test-${Date.now()}`,
      status: 'done',
      trigger: 'manual-input',
      // The test message is read by a person on their gadget, so it goes in the
      // interface language like everything else.
      question: m('mq.testQuestion'),
      text: m('mq.testText'),
      providerId: 'claude',
      model: 'test',
      createdAt: Date.now(),
    });
    return { ok: true };
  }

  private emitStatus(): void {
    this.emit('status', this.getStatus());
  }
}

/** Translates the network failures into something that says what to look at. */
function friendlyError(err: Error): string {
  const message = err.message;

  if (/ECONNREFUSED/i.test(message)) {
    return m('mq.errRefused');
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(message)) {
    return m('mq.errNoHost');
  }
  if (/Not authorized|bad user name or password/i.test(message)) {
    return m('mq.errAuth');
  }
  if (/Missing protocol|Invalid URL|unsupported/i.test(message)) {
    return m('mq.errBadUrl');
  }
  return message;
}

export const mqttBridge = new MqttBridge();

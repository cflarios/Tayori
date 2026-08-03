import { EventEmitter } from 'node:events';
import { createSocket } from 'node:dgram';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import qrcode from 'qrcode-generator';
import { IPC } from '@shared/ipc';
import type { Answer, CaptureStatus, PhoneMirrorStatus, Settings } from '@shared/types';
import { renderPhonePage } from './phone-page';
import { DEFAULT_UI_LANG, translate, type UIKey, type UILang } from '@shared/i18n';

/**
 * Espejo en el teléfono: un servidor HTTP diminuto que sirve las respuestas a
 * un navegador del móvil.
 *
 * ## Por qué existe
 *
 * El overlay resuelve "que no se vea en la grabación". No resuelve el caso de
 * **compartir la pantalla entera**, donde lo que hay en tu monitor está por
 * definición al otro lado — ni una cámara, ni alguien mirando el monitor de al
 * lado. Sacar la respuesta a un segundo dispositivo es la única forma de que no
 * esté en la pantalla compartida en absoluto.
 *
 * ## Server-Sent Events y no WebSocket
 *
 * El flujo es de una sola dirección —el escritorio manda, el teléfono lee— y
 * eso es exactamente lo que SSE hace de fábrica:
 *
 * - **Cero dependencias.** Node no trae servidor de WebSocket; SSE es
 *   `res.write()` sobre el mismo `http` que ya sirve la página.
 * - **Reconecta solo.** `EventSource` reintenta sin código nuestro, y en un
 *   móvil la conexión se cae cada vez que se bloquea la pantalla. Con WebSocket
 *   ese bucle de reconexión hay que escribirlo, y es justo donde salen los
 *   fallos raros.
 * - **Un socket colgado no es un fallo.** El `retry:` inicial y los pings
 *   mantienen viva la conexión frente a la radio del teléfono, que corta lo que
 *   lleve quieto un rato.
 *
 * Lo que SSE no da es el canal de vuelta. No hace falta: el teléfono no manda
 * nada, y que **no pueda** mandar nada es una propiedad, no una carencia.
 *
 * ## Qué se publica y qué no
 *
 * Respuestas, el estado de la captura y el "conversación nueva". **La
 * transcripción no.** Es lo que dijo la otra persona, y ponerla en un segundo
 * dispositivo por comodidad multiplica por dos los sitios donde vive sin que
 * nadie lo haya pedido. Si algún día se añade, hay que volver a tocar el README
 * y CONTEXT §4 en el mismo commit, como con el historial.
 */

/** Preferido por ser fácil de reconocer en un log; si está tomado, da igual cuál. */
const PREFERRED_PORT = 8317;

/** Tantas como guarda el overlay: es la misma pregunta ("¿qué dijo antes?"). */
const MAX_ANSWERS = 20;

/**
 * Comentario periódico para que la conexión no se dé por muerta.
 *
 * La radio de un móvil y cualquier caja intermedia cortan lo que lleve un rato
 * en silencio, y una respuesta puede tardar minutos en llegar.
 */
const PING_MS = 15_000;

class PhoneBridge extends EventEmitter {
  private server: Server | null = null;
  private clients = new Set<ServerResponse>();
  private ping: NodeJS.Timeout | null = null;

  /**
   * Token de emparejamiento, nuevo en cada arranque.
   *
   * Que caduque al reiniciar es deliberado: un enlace guardado en el móvil deja
   * de valer solo, sin que nadie tenga que acordarse de revocarlo. El precio es
   * volver a escanear el QR, que cuesta dos segundos.
   */
  private token = '';
  private port = 0;
  private lan = false;
  private failure: string | undefined;

  /**
   * El idioma en el que se sirve la página, copiado de los ajustes.
   *
   * Se guarda en lugar de leer el almacén desde aquí: este archivo no toca
   * Electron —es un servidor HTTP y nada más— y traerse `settingsStore` sólo
   * para una cadena obligaría a levantar medio proceso principal para probarlo.
   */
  private lang: UILang = DEFAULT_UI_LANG;

  private say(key: UIKey): string {
    return translate(this.lang, key);
  }

  /** Lo que ya ha pasado, para quien abre el teléfono a mitad de una respuesta. */
  private answers: Answer[] = [];
  private capture: CaptureStatus | null = null;

  /** El QR se calcula al arrancar: la URL no cambia mientras el servidor viva. */
  private qr: boolean[][] = [];
  private urls: string[] = [];

  /** Arranca, para o reinicia según los ajustes. Idempotente. */
  apply(settings: Settings): void {
    // Se copia siempre, incluso al apagarlo: cambiar el idioma con el espejo
    // parado y encenderlo después tiene que dar la página en el idioma nuevo.
    this.lang = settings.uiLanguage;

    if (!settings.phoneMirrorEnabled) {
      this.stop();
      return;
    }
    // Cambiar el alcance obliga a volver a escuchar en otra interfaz, así que
    // es un reinicio de verdad —y con él, un token nuevo.
    if (this.server && this.lan === settings.phoneMirrorLan) return;
    this.stop();
    this.start(settings.phoneMirrorLan);
  }

  private start(lan: boolean): void {
    this.lan = lan;
    this.token = randomBytes(16).toString('hex');
    this.failure = undefined;

    const host = lan ? '0.0.0.0' : '127.0.0.1';
    const server = createServer((req, res) => this.route(req, res));
    let retried = false;

    server.on('error', (err: NodeJS.ErrnoException) => {
      // Un puerto ocupado no es motivo para no tener espejo: la URL se enseña
      // entera y el QR se genera después de saber el puerto, así que cualquiera
      // sirve. El 0 deja elegir al sistema.
      if (err.code === 'EADDRINUSE' && !retried) {
        retried = true;
        console.warn(`[phone] puerto ${PREFERRED_PORT} ocupado, pidiendo uno libre`);
        server.listen(0, host);
        return;
      }
      this.failure = err.message;
      console.error('[phone] no se pudo abrir el servidor:', err.message);
      this.stop();
    });

    server.on('listening', () => {
      const address = server.address();
      this.port = typeof address === 'object' && address ? address.port : PREFERRED_PORT;
      console.log(
        `[phone] espejo en ${host}:${this.port} · ${lan ? 'red local' : 'sólo esta máquina'}`
      );
      // Preguntar por la ruta es asíncrono, así que el enlace y el QR llegan un
      // instante después de estar escuchando. El estado se difunde ahí y no
      // aquí: un `running: true` con la URL vacía es peor que esperar 5 ms.
      void this.refreshLinks();
    });

    this.server = server;
    server.listen(PREFERRED_PORT, host);

    this.ping = setInterval(() => {
      for (const client of this.clients) client.write(': ping\n\n');
    }, PING_MS);
  }

  stop(): void {
    // Parar lo ya parado no es un cambio de estado. Sin esta salida, cada
    // `apply()` con el espejo apagado difundiría un estado idéntico, y quien
    // espera un cambio —el dashboard, y los tests— vería uno que no ocurrió.
    if (!this.server && !this.token) return;

    if (this.ping) {
      clearInterval(this.ping);
      this.ping = null;
    }
    // Cerrar el servidor NO cierra las conexiones SSE abiertas: son keep-alive
    // y `close()` sólo deja de aceptar nuevas. Sin esto, `close` no termina
    // nunca y el puerto se queda tomado hasta que se cierre la app.
    for (const client of this.clients) client.end();
    this.clients.clear();

    const server = this.server;
    this.server = null;
    if (server) {
      server.closeAllConnections();
      server.close();
      console.log('[phone] espejo apagado');
    }

    this.token = '';
    this.port = 0;
    this.urls = [];
    this.qr = [];
    // Las respuestas NO se tiran aquí. Encender el acceso desde la red local en
    // mitad de una entrevista reinicia el servidor, y vaciar el buffer dejaría
    // el teléfono en blanco justo después de emparejarlo. Se vacían cuando se
    // vacía la conversación, que es cuando dejan de tener sentido.
    this.emitStatus();
  }

  getStatus(): PhoneMirrorStatus {
    const [url = '', ...alternates] = this.urls;
    return {
      running: this.server !== null && this.port !== 0,
      lan: this.lan,
      url,
      alternates,
      qr: this.qr,
      clients: this.clients.size,
      error: this.failure,
    };
  }

  /**
   * Reenvía al teléfono lo que ya se difunde a las ventanas.
   *
   * Se engancha a los dos `broadcast()` que existen —el de `index.ts` y el del
   * orquestador— en lugar de suscribirse a los eventos internos de cada pieza.
   * Así el espejo no puede quedarse atrás cuando alguien añada un evento nuevo
   * al overlay: o pasa por aquí, o tampoco lo ve el overlay.
   */
  publish(channel: string, payload: unknown): void {
    if (!this.server) return;

    if (channel === IPC.onAnswer) {
      const answer = payload as Answer;
      if (!answer?.id) return;
      this.remember(answer);
      this.send('answer', answer);
    } else if (channel === IPC.onConversationReset) {
      this.answers = [];
      this.send('reset', null);
    } else if (channel === IPC.onCaptureStatus) {
      this.capture = payload as CaptureStatus;
      this.send('capture', this.capture);
    }
  }

  /** Actualiza por id: `answer` se emite en cada tick del streaming. */
  private remember(answer: Answer): void {
    const at = this.answers.findIndex((a) => a.id === answer.id);
    if (at >= 0) this.answers[at] = answer;
    else this.answers.unshift(answer);
    if (this.answers.length > MAX_ANSWERS) this.answers.length = MAX_ANSWERS;
  }

  private route(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', 'http://phone.local');

    if (!this.tokenMatches(url.searchParams.get('t'))) {
      // El caso normal aquí no es un intruso, es un enlace viejo tras reiniciar
      // el espejo. El mensaje dice qué hacer en vez de "403".
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`${this.say('ph.pgExpiredPlain')}\n`);
      return;
    }

    if (url.pathname === '/') {
      const page = renderPhonePage(this.lang);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        // Nada de esto debe quedarse en la caché del móvil: el token va en la
        // URL y la página cambia con la versión de la app.
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      });
      res.end(page);
      return;
    }

    if (url.pathname === '/events') {
      this.openStream(res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`${this.say('ph.pgNotFound')}\n`);
  }

  private openStream(res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });
    // Reintento agresivo a propósito: el corte típico es la pantalla del móvil
    // bloqueándose, y volver en tres segundos es lo que hace que parezca que
    // nunca se fue.
    res.write('retry: 3000\n\n');

    this.clients.add(res);
    res.on('close', () => {
      this.clients.delete(res);
      this.emitStatus();
    });

    this.write(res, 'hello', { answers: this.answers, capture: this.capture });
    this.emitStatus();
  }

  private send(event: string, payload: unknown): void {
    for (const client of this.clients) this.write(client, event, payload);
  }

  private write(res: ServerResponse, event: string, payload: unknown): void {
    // El JSON de una respuesta no lleva saltos de línea sin escapar, así que
    // una sola línea `data:` basta y no hace falta trocear.
    res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  }

  /**
   * Compara en tiempo constante y sin filtrar la longitud.
   *
   * Es barato y quita de en medio la pregunta: el token viaja por una red que
   * puede no ser sólo tuya, y un `===` sobre secretos es de las cosas que no
   * conviene tener que justificar más tarde.
   */
  private tokenMatches(candidate: string | null): boolean {
    if (!this.token || !candidate) return false;
    const a = Buffer.from(candidate);
    const b = Buffer.from(this.token);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  /** Calcula enlace y QR, y los difunde. Separado por ser asíncrono. */
  private async refreshLinks(): Promise<void> {
    const routed = this.lan ? await routedAddress() : null;
    // El espejo puede haberse apagado mientras se resolvía la ruta; escribir
    // ahora dejaría una URL viva en un estado que dice `running: false`.
    if (!this.server) return;

    const link = (host: string): string => `http://${host}:${this.port}/?t=${this.token}`;
    if (this.lan) {
      const addresses = orderForPhone(lanAddresses(), routed);
      // Sin ninguna IPv4 no interna no hay red a la que salir, pero el servidor
      // sí está escuchando: mejor un enlace que funciona desde esta máquina que
      // una tarjeta vacía sin explicación.
      this.urls = addresses.length > 0 ? addresses.map(link) : [link('127.0.0.1')];
    } else {
      this.urls = [link('127.0.0.1')];
    }

    this.qr = qrModules(this.urls[0] ?? '');
    this.emitStatus();
  }

  private emitStatus(): void {
    this.emit('status', this.getStatus());
  }
}

/** IPv4 de las interfaces reales de la máquina. */
function lanAddresses(): string[] {
  const found: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) found.push(entry.address);
    }
  }
  return found;
}

/**
 * Qué IPv4 usaría el sistema para salir de la máquina.
 *
 * Es la pregunta que de verdad importa —"¿por qué interfaz se sale de aquí?"— y
 * la respuesta la tiene la **tabla de rutas**, no el prefijo de la dirección.
 * Un `connect()` de UDP no manda ni un byte: sólo le pide al sistema que elija
 * la ruta hacia ese destino y fije el extremo local, que es justamente el dato
 * que queremos. No hay tráfico, no hace falta que 8.8.8.8 exista ni que haya
 * internet: basta con que exista una ruta por defecto.
 *
 * Se probó en una máquina con cuatro IPv4 —la de casa y tres de adaptadores
 * virtuales— y las tres virtuales eran indistinguibles de la buena por el
 * prefijo. Ordenar por rangos acertaba ahí de casualidad, por el orden en que
 * el sistema enumera las interfaces.
 */
export function routedAddress(): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = createSocket('udp4');
    let settled = false;

    const finish = (value: string | null): void => {
      if (settled) return;
      settled = true;
      try {
        socket.close();
      } catch {
        // Cerrar dos veces lanza; no es un error que le importe a nadie aquí.
      }
      resolve(value);
    };

    socket.once('error', () => finish(null));

    try {
      /*
       * El callback NO es opcional aquí, aunque lo parezca: `connect()` es
       * asíncrono, y leer `address()` justo después lanza `EBADF` porque el
       * socket todavía no está enlazado. Escrito de forma síncrona esta función
       * devuelve `null` **siempre** y el fallo es invisible — sigue habiendo
       * enlace, sólo que elegido por la heurística de rangos. Se detectó
       * ejecutándolo, no leyéndolo.
       */
      socket.connect(53, '8.8.8.8', () => {
        try {
          finish(socket.address().address);
        } catch {
          finish(null);
        }
      });
    } catch {
      finish(null);
    }

    // Sin ruta por defecto (offline, o sólo IPv6) el callback puede no llegar
    // nunca, y esto va en el camino de generar el enlace: no puede esperar.
    setTimeout(() => finish(null), 300).unref();
  });
}

/**
 * Ordena las IPv4 por probabilidad de ser la que el teléfono puede alcanzar.
 *
 * Una máquina de trabajo tiene varias y **la primera casi nunca es la buena**:
 * Docker instala `172.17.x`, VirtualBox `192.168.56.x`, WSL una `172.2x.x`, y
 * una VPN mete la suya. Ninguna lleva al teléfono, y un QR que apunta a la
 * equivocada falla de la peor manera posible — el navegador del móvil se queda
 * cargando y no hay ningún mensaje que diga por qué.
 *
 * Manda la tabla de rutas cuando contesta; el orden por rangos es el plan B.
 * Y pase lo que pase el dashboard enseña las demás: la heurística acierta casi
 * siempre y **cuando falla se ve la alternativa**, que es lo que la hace
 * aceptable como heurística.
 */
export function orderForPhone(addresses: string[], routed: string | null): string[] {
  const sorted = sortAddresses(addresses);
  if (!routed || !sorted.includes(routed)) return sorted;
  return [routed, ...sorted.filter((address) => address !== routed)];
}

/** El plan B: ordenar por rango cuando la tabla de rutas no dice nada. */
export function sortAddresses(addresses: string[]): string[] {
  return [...addresses].sort((a, b) => rank(a) - rank(b));
}

function rank(address: string): number {
  // Rangos de adaptadores virtuales: existen, responden y no llevan a ninguna
  // parte. Van al final aunque parezcan una red doméstica normal.
  if (address.startsWith('192.168.56.')) return 90; // VirtualBox host-only
  if (/^172\.(1[7-9]|2\d|3[01])\./.test(address)) return 91; // Docker y compañía
  if (address.startsWith('169.254.')) return 99; // link-local: no hubo DHCP

  if (address.startsWith('192.168.')) return 0; // la red de casa, casi siempre
  if (address.startsWith('10.')) return 1;
  if (/^172\.16\./.test(address)) return 2;
  return 50;
}

/** Matriz de módulos del QR, fila por fila. Vacía si no hay nada que codificar. */
function qrModules(text: string): boolean[][] {
  if (!text) return [];
  // Versión 0 = la más pequeña que quepa. Corrección M: el QR se mira en una
  // pantalla, no impreso y arrugado, así que no hace falta más redundancia.
  const code = qrcode(0, 'M');
  code.addData(text);
  code.make();
  const size = code.getModuleCount();
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => code.isDark(row, col))
  );
}

export const phoneBridge = new PhoneBridge();

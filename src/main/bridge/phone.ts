import { EventEmitter } from 'node:events';
import { createSocket } from 'node:dgram';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import qrcode from 'qrcode-generator';
import { IPC } from '@shared/ipc';
import type { Answer, CaptureStatus, PhoneMirrorStatus, Settings } from '@shared/types';
import { renderPhonePage } from './phone-page';
import { parseAnswerBlocks, parseInline, type InlineSpan } from '@shared/answer-format';
import { DEFAULT_UI_LANG, translate, type UIKey, type UILang } from '@shared/i18n';

/**
 * Phone mirror: a tiny HTTP server that serves the answers to a phone browser.
 *
 * ## Why it exists
 *
 * The overlay solves "don't show in the recording". It doesn't solve the case of
 * **sharing the whole screen**, where what's on your monitor is by definition on
 * the other side — nor a camera, nor someone looking at the monitor next to you.
 * Taking the answer to a second device is the only way for it not to be on the
 * shared screen at all.
 *
 * ## Server-Sent Events and not WebSocket
 *
 * The flow is one-directional —the desktop sends, the phone reads— and that's
 * exactly what SSE does out of the box:
 *
 * - **Zero dependencies.** Node ships no WebSocket server; SSE is `res.write()`
 *   over the same `http` that already serves the page.
 * - **Reconnects on its own.** `EventSource` retries without our code, and on a
 *   phone the connection drops every time the screen locks. With WebSocket that
 *   reconnection loop has to be written, and it's exactly where the odd bugs
 *   come out.
 * - **A hung socket isn't a failure.** The initial `retry:` and the pings keep
 *   the connection alive against the phone's radio, which cuts anything that's
 *   been still for a while.
 *
 * What SSE doesn't give is the return channel. It's not needed: the phone sends
 * nothing, and that it **can't** send anything is a property, not a shortcoming.
 *
 * ## What's published and what isn't
 *
 * Answers, the capture state and the "new conversation". **Not the transcript.**
 * It's what the other person said, and putting it on a second device for
 * convenience doubles the places where it lives without anyone asking. If it's
 * ever added, the README and CONTEXT §4 have to be touched again in the same
 * commit, as with the history.
 */

/** Preferred for being easy to recognize in a log; if it's taken, any one will do. */
const PREFERRED_PORT = 8317;

/** As many as the overlay keeps: it's the same question ("what was said before?"). */
const MAX_ANSWERS = 20;

/**
 * An answer already chunked for the phone: code, or text with its inline marks.
 * It's parsed here, in main, with the SAME `answer-format` as the overlay, and
 * travels already in blocks. That way the phone paints bold, inline code, math
 * in Unicode and robust fences without reimplementing the parser in its script —
 * and everything still goes to `textContent`, never `innerHTML`.
 */
type PhoneBlock =
  | { type: 'code'; content: string; lang?: string; open?: true }
  | { type: 'text'; spans: InlineSpan[] };

type PhoneAnswer = Answer & { blocks: PhoneBlock[] };

function toPhoneBlocks(text: string): PhoneBlock[] {
  return parseAnswerBlocks(text).map((b) =>
    b.type === 'code'
      ? {
          type: 'code' as const,
          content: b.content,
          ...(b.lang ? { lang: b.lang } : {}),
          ...(b.open ? { open: true as const } : {}),
        }
      : { type: 'text' as const, spans: parseInline(b.content) }
  );
}

/**
 * Periodic comment so the connection isn't given up for dead.
 *
 * A phone's radio and any intermediate box cut anything that's been silent for a
 * while, and an answer can take minutes to arrive.
 */
const PING_MS = 15_000;

class PhoneBridge extends EventEmitter {
  private server: Server | null = null;
  private clients = new Set<ServerResponse>();
  private ping: NodeJS.Timeout | null = null;

  /**
   * Pairing token, new on every launch.
   *
   * That it expires on restart is deliberate: a link saved on the phone stops
   * working on its own, without anyone having to remember to revoke it. The price
   * is rescanning the QR, which costs two seconds.
   */
  private token = '';
  private port = 0;
  private lan = false;
  private failure: string | undefined;

  /**
   * The language the page is served in, copied from the settings.
   *
   * It's stored instead of reading the store from here: this file doesn't touch
   * Electron —it's an HTTP server and nothing more— and pulling in
   * `settingsStore` just for one string would force standing up half the main
   * process to test it.
   */
  private lang: UILang = DEFAULT_UI_LANG;

  private say(key: UIKey): string {
    return translate(this.lang, key);
  }

  /** What has already happened, for whoever opens the phone mid-answer. */
  private answers: PhoneAnswer[] = [];
  private capture: CaptureStatus | null = null;

  /** The QR is computed at startup: the URL doesn't change while the server lives. */
  private qr: boolean[][] = [];
  private urls: string[] = [];

  /** Starts, stops or restarts according to the settings. Idempotent. */
  apply(settings: Settings): void {
    // It's always copied, even when turning it off: changing the language with
    // the mirror stopped and turning it on later must serve the page in the new
    // language.
    this.lang = settings.uiLanguage;

    if (!settings.phoneMirrorEnabled) {
      this.stop();
      return;
    }
    // Changing the scope forces listening again on another interface, so it's a
    // real restart —and with it, a new token.
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
      // A taken port is no reason to have no mirror: the URL is shown in full
      // and the QR is generated after knowing the port, so any one works. The 0
      // lets the system choose.
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
      // Asking for the route is async, so the link and the QR arrive a moment
      // after it's listening. The state is broadcast there and not here: a
      // `running: true` with an empty URL is worse than waiting 5 ms.
      void this.refreshLinks();
    });

    this.server = server;
    server.listen(PREFERRED_PORT, host);

    this.ping = setInterval(() => {
      for (const client of this.clients) client.write(': ping\n\n');
    }, PING_MS);
  }

  stop(): void {
    // Stopping the already-stopped isn't a state change. Without this exit, each
    // `apply()` with the mirror off would broadcast an identical state, and
    // whoever waits for a change —the dashboard, and the tests— would see one
    // that didn't happen.
    if (!this.server && !this.token) return;

    if (this.ping) {
      clearInterval(this.ping);
      this.ping = null;
    }
    // Closing the server does NOT close the open SSE connections: they're
    // keep-alive and `close()` only stops accepting new ones. Without this,
    // `close` never finishes and the port stays taken until the app closes.
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
    // The answers are NOT dropped here. Turning on local-network access
    // mid-interview restarts the server, and emptying the buffer would blank the
    // phone right after pairing it. They're emptied when the conversation is
    // emptied, which is when they stop making sense.
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
   * Forwards to the phone what's already broadcast to the windows.
   *
   * It hooks into the two `broadcast()`s that exist —the one in `index.ts` and
   * the orchestrator's— instead of subscribing to each piece's internal events.
   * That way the mirror can't fall behind when someone adds a new event to the
   * overlay: either it passes through here, or the overlay doesn't see it either.
   */
  publish(channel: string, payload: unknown): void {
    if (!this.server) return;

    if (channel === IPC.onAnswer) {
      const answer = payload as Answer;
      if (!answer?.id) return;
      // It's chunked here and stored already chunked, so the reconnection
      // `hello` also sends the blocks and the phone reparses nothing.
      const enriched: PhoneAnswer = { ...answer, blocks: toPhoneBlocks(answer.text) };
      this.remember(enriched);
      this.send('answer', enriched);
    } else if (channel === IPC.onConversationReset) {
      this.answers = [];
      this.send('reset', null);
    } else if (channel === IPC.onCaptureStatus) {
      this.capture = payload as CaptureStatus;
      this.send('capture', this.capture);
    }
  }

  /** Updates by id: `answer` is emitted on every streaming tick. */
  private remember(answer: PhoneAnswer): void {
    const at = this.answers.findIndex((a) => a.id === answer.id);
    if (at >= 0) this.answers[at] = answer;
    else this.answers.unshift(answer);
    if (this.answers.length > MAX_ANSWERS) this.answers.length = MAX_ANSWERS;
  }

  private route(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', 'http://phone.local');

    if (!this.tokenMatches(url.searchParams.get('t'))) {
      // The normal case here isn't an intruder, it's an old link after
      // restarting the mirror. The message says what to do instead of "403".
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`${this.say('ph.pgExpiredPlain')}\n`);
      return;
    }

    if (url.pathname === '/') {
      const page = renderPhonePage(this.lang);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        // None of this should stay in the phone's cache: the token goes in the
        // URL and the page changes with the app version.
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
    // Aggressive retry on purpose: the typical drop is the phone's screen
    // locking, and coming back in three seconds is what makes it seem like it
    // never left.
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
    // An answer's JSON carries no unescaped line breaks, so a single `data:`
    // line is enough and there's no need to chunk it.
    res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  }

  /**
   * Compares in constant time and without leaking the length.
   *
   * It's cheap and gets the question out of the way: the token travels over a
   * network that may not be only yours, and a `===` over secrets is one of those
   * things you don't want to have to justify later.
   */
  private tokenMatches(candidate: string | null): boolean {
    if (!this.token || !candidate) return false;
    const a = Buffer.from(candidate);
    const b = Buffer.from(this.token);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  /** Computes link and QR, and broadcasts them. Separate for being async. */
  private async refreshLinks(): Promise<void> {
    const routed = this.lan ? await routedAddress() : null;
    // The mirror may have been turned off while the route was being resolved;
    // writing now would leave a live URL in a state that says `running: false`.
    if (!this.server) return;

    const link = (host: string): string => `http://${host}:${this.port}/?t=${this.token}`;
    if (this.lan) {
      const addresses = orderForPhone(lanAddresses(), routed);
      // With no non-internal IPv4 there's no network to go out to, but the
      // server is listening: better a link that works from this machine than an
      // empty card with no explanation.
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

/** IPv4 of the machine's real interfaces. */
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
 * Which IPv4 the system would use to go out of the machine.
 *
 * It's the question that really matters —"which interface do you go out
 * through?"— and the answer is held by the **routing table**, not the address
 * prefix. A UDP `connect()` sends not a single byte: it only asks the system to
 * choose the route to that destination and fix the local end, which is exactly
 * the datum we want. There's no traffic, 8.8.8.8 doesn't need to exist and there
 * doesn't need to be internet: it's enough for a default route to exist.
 *
 * It was tested on a machine with four IPv4s —the home one and three from
 * virtual adapters— and the three virtual ones were indistinguishable from the
 * good one by prefix. Sorting by ranges got it right there by chance, because of
 * the order in which the system enumerates the interfaces.
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
        // Closing twice throws; it's not an error anyone here cares about.
      }
      resolve(value);
    };

    socket.once('error', () => finish(null));

    try {
      /*
       * The callback is NOT optional here, even though it looks it: `connect()`
       * is async, and reading `address()` right after throws `EBADF` because the
       * socket isn't bound yet. Written synchronously this function returns
       * `null` **always** and the failure is invisible — there's still a link,
       * just one chosen by the range heuristic. It was caught by running it, not
       * by reading it.
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

    // With no default route (offline, or IPv6-only) the callback may never
    // arrive, and this is on the path of generating the link: it can't wait.
    setTimeout(() => finish(null), 300).unref();
  });
}

/**
 * Sorts the IPv4s by likelihood of being the one the phone can reach.
 *
 * A work machine has several and **the first is almost never the good one**:
 * Docker installs `172.17.x`, VirtualBox `192.168.56.x`, WSL a `172.2x.x`, and a
 * VPN adds its own. None leads to the phone, and a QR pointing to the wrong one
 * fails in the worst possible way — the phone's browser hangs loading and there's
 * no message saying why.
 *
 * The routing table rules when it answers; sorting by ranges is plan B. And no
 * matter what, the dashboard shows the others: the heuristic gets it right almost
 * always and **when it fails the alternative is visible**, which is what makes it
 * acceptable as a heuristic.
 */
export function orderForPhone(addresses: string[], routed: string | null): string[] {
  const sorted = sortAddresses(addresses);
  if (!routed || !sorted.includes(routed)) return sorted;
  return [routed, ...sorted.filter((address) => address !== routed)];
}

/** Plan B: sort by range when the routing table says nothing. */
export function sortAddresses(addresses: string[]): string[] {
  return [...addresses].sort((a, b) => rank(a) - rank(b));
}

function rank(address: string): number {
  // Virtual-adapter ranges: they exist, they respond and they lead nowhere. They
  // go last even if they look like a normal home network.
  if (address.startsWith('192.168.56.')) return 90; // VirtualBox host-only
  if (/^172\.(1[7-9]|2\d|3[01])\./.test(address)) return 91; // Docker and friends
  if (address.startsWith('169.254.')) return 99; // link-local: there was no DHCP

  if (address.startsWith('192.168.')) return 0; // the home network, almost always
  if (address.startsWith('10.')) return 1;
  if (/^172\.16\./.test(address)) return 2;
  return 50;
}

/** Matrix of QR modules, row by row. Empty if there's nothing to encode. */
function qrModules(text: string): boolean[][] {
  if (!text) return [];
  // Version 0 = the smallest that fits. Correction M: the QR is looked at on a
  // screen, not printed and crumpled, so no more redundancy is needed.
  const code = qrcode(0, 'M');
  code.addData(text);
  code.make();
  const size = code.getModuleCount();
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => code.isDark(row, col))
  );
}

export const phoneBridge = new PhoneBridge();

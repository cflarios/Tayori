import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type PhoneMirrorStatus } from '../src/shared/types';
import { networkInterfaces } from 'node:os';
import { orderForPhone, phoneBridge, routedAddress, sortAddresses } from '../src/main/bridge/phone';
import { renderPhonePage } from '../src/main/bridge/phone-page';

/**
 * The phone mirror is the first thing in this project that **accepts
 * connections**. Everything else goes outward: here someone can knock at the
 * door, so what's tested is the door.
 */

describe('the page the phone sees', () => {
  const page = renderPhonePage();

  it("doesn't depend on anything external", () => {
    // It's served to a phone that may be on a network with no internet access —a
    // guest wifi, a hotspot with no data—, so a remote font or script would leave
    // the page half-done exactly when it's needed.
    expect(page).not.toMatch(/src\s*=\s*["']https?:/i);
    expect(page).not.toMatch(/href\s*=\s*["']https?:/i);
    expect(page).not.toMatch(/@import/i);
    expect(page).not.toMatch(/url\(\s*["']?https?:/i);
  });

  it('declares a CSP that lets nothing load from outside', () => {
    expect(page).toContain("default-src 'none'");
    expect(page).toContain("connect-src 'self'");
  });

  it("carries no token inside: it reads it from the URL", () => {
    // It's what leaves this function with no injection surface to audit: there's
    // no datum to interpolate, so there's nothing to escape.
    expect(page).toContain("new URLSearchParams(location.search).get('t')");
    expect(page).not.toMatch(/t=[0-9a-f]{8}/);
  });

  it('paints the model text with textContent, never with innerHTML', () => {
    // An answer is text from a language model, i.e. an untrusted input like any
    // other: an `<img onerror>` can't end up executing on the phone.
    const uses = page.match(/innerHTML/g) ?? [];
    expect(uses).toHaveLength(1);
    // The only use is the card's static skeleton, without interpolating anything.
    expect(page).toContain(
      `node.innerHTML = '<div class="q"></div><div class="a"></div><div class="meta"></div>'`
    );
  });
});

describe('the ordering of the network addresses', () => {
  it("prefers the home network over Docker's", () => {
    expect(sortAddresses(['172.17.0.1', '192.168.1.42'])[0]).toBe('192.168.1.42');
  });

  it('puts the VirtualBox adapter below a real 10.x', () => {
    // 192.168.56.x looks like a home network and leads nowhere: it's the exact
    // trap that motivated ordering instead of taking the first.
    expect(sortAddresses(['192.168.56.1', '10.0.0.7'])).toEqual(['10.0.0.7', '192.168.56.1']);
  });

  it('sends the link-local to the end, which means there was no DHCP', () => {
    const sorted = sortAddresses(['169.254.3.9', '172.16.0.5']);
    expect(sorted[sorted.length - 1]).toBe('169.254.3.9');
  });

  it("doesn't touch the list it receives", () => {
    const original = ['172.17.0.1', '192.168.1.42'];
    sortAddresses(original);
    expect(original).toEqual(['172.17.0.1', '192.168.1.42']);
  });

  /*
   * The real case that forced looking at the routing table: a machine with the
   * home network and three virtual adapters, all looking like a home network. By
   * prefix they're indistinguishable, so ordering by ranges got it right only by
   * the order in which the system enumerates the interfaces.
   */
  it('puts first the address the system actually goes out through', () => {
    const real = ['192.168.121.1', '192.168.1.4', '192.168.52.1', '172.22.128.1'];
    expect(orderForPhone(real, '192.168.1.4')[0]).toBe('192.168.1.4');
  });

  it('loses none when reordering: the rest are still there as an alternative', () => {
    const real = ['192.168.121.1', '192.168.1.4', '172.22.128.1'];
    expect(orderForPhone(real, '192.168.1.4')).toHaveLength(3);
    expect(orderForPhone(real, '192.168.1.4')).toEqual(expect.arrayContaining(real));
  });

  it("falls back to the by-ranges order if the routing table doesn't answer", () => {
    // Offline, or IPv6 only: `routedAddress()` returns null and you can't be left
    // without a link because of that.
    expect(orderForPhone(['172.17.0.1', '192.168.1.42'], null)).toEqual([
      '192.168.1.42',
      '172.17.0.1',
    ]);
  });

  it('the route the system returns is an address of ours, or none', async () => {
    /*
     * You can't require a concrete value: it depends on the machine and on
     * whether there's a default route. What you can require is that, if it
     * answers, it be an IPv4 of this machine — returning someone else's would be
     * worse than not answering.
     *
     * This test wouldn't have caught the bug this function had (reading
     * `address()` right after `connect()`, which throws `EBADF` and leaves it
     * returning `null` forever); that came out of running it. It's here for the
     * other thing: that it doesn't throw, doesn't hang and doesn't invent
     * addresses.
     */
    const mine = Object.values(networkInterfaces())
      .flatMap((entries) => entries ?? [])
      .filter((entry) => entry.family === 'IPv4')
      .map((entry) => entry.address);

    const routed = await routedAddress();
    if (routed !== null) expect(mine).toContain(routed);
  });

  it("ignores a route that isn't among the interfaces", () => {
    // It can happen with a VPN that routes through an address `networkInterfaces`
    // doesn't list. Putting it in the list would give a link to an IP that isn't ours.
    expect(orderForPhone(['192.168.1.42'], '10.8.0.1')).toEqual(['192.168.1.42']);
  });
});

describe('the mirror server', () => {
  afterAll(() => phoneBridge.stop());

  async function start(): Promise<PhoneMirrorStatus> {
    // `apply()` is idempotent on purpose —reapplying the same settings restarts
    // nothing— so each test starts from stopped or it would be left waiting for
    // an event that isn't going to come.
    phoneBridge.stop();
    const listening = new Promise<void>((resolve) => phoneBridge.once('status', () => resolve()));
    // No LAN: the test has no reason to open a port to the outside.
    phoneBridge.apply({ ...DEFAULT_SETTINGS, phoneMirrorEnabled: true, phoneMirrorLan: false });
    await listening;
    return phoneBridge.getStatus();
  }

  it('serves the page only with the correct token', async () => {
    const status = await start();
    expect(status.running).toBe(true);
    expect(status.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?t=[0-9a-f]{32}$/);

    const ok = await fetch(status.url);
    expect(ok.status).toBe(200);
    // The title is put by the script from the translations table, so what goes in
    // the HTML is the language and the dictionary, not the phrase.
    const html = await ok.text();
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('Answers will show up here');
  });

  it('rejects a wrong, absent or wrong-length token', async () => {
    const status = await start();
    const base = status.url.split('?')[0] ?? '';

    for (const url of [base, `${base}?t=`, `${base}?t=corto`, `${base}?t=${'0'.repeat(32)}`]) {
      const res = await fetch(url);
      expect(res.status).toBe(403);
      // The normal case isn't an intruder, it's an old link: the body says what to
      // do instead of blurting out a number.
      expect(await res.text()).toContain('Scan the QR code');
    }
  });

  it('gives a new token on each startup, so the old link expires', async () => {
    const first = await start();
    phoneBridge.stop();
    const second = await start();

    expect(second.url).not.toBe(first.url);
    expect((await fetch(first.url)).status).toBe(403);
  });

  it('leaves the link dead on stopping it, without depending on the socket closing', async () => {
    const status = await start();
    phoneBridge.stop();
    expect(phoneBridge.getStatus().running).toBe(false);

    /*
     * `server.close()` is async: it stops accepting connections, but a request
     * that arrives in that same tick can still get in. What really shuts the door
     * is that the token is deleted **synchronously**, so in that window the
     * response is 403 and not content.
     *
     * That's why this test accepts both outcomes: the guarantee isn't the speed
     * of the close, it's that there's no token to get in with. Asserting the
     * connection rejection made the test pass by luck, depending on how fast the
     * machine was.
     */
    const response = await fetch(status.url).catch(() => null);
    if (response) {
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain('<title>Espejo</title>');
    }
  });
});

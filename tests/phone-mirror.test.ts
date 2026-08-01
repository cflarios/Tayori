import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type PhoneMirrorStatus } from '../src/shared/types';
import { networkInterfaces } from 'node:os';
import { orderForPhone, phoneBridge, routedAddress, sortAddresses } from '../src/main/bridge/phone';
import { renderPhonePage } from '../src/main/bridge/phone-page';

/**
 * El espejo del teléfono es la primera cosa de este proyecto que **acepta
 * conexiones**. Todo lo demás sale hacia fuera: aquí alguien puede llamar a la
 * puerta, así que lo que se prueba es la puerta.
 */

describe('la página que ve el teléfono', () => {
  const page = renderPhonePage();

  it('no depende de nada externo', () => {
    // Se sirve a un móvil que puede estar en una red sin salida a internet —una
    // wifi de invitados, un hotspot sin datos—, así que una fuente o un script
    // remoto dejarían la página a medias justo cuando hace falta.
    expect(page).not.toMatch(/src\s*=\s*["']https?:/i);
    expect(page).not.toMatch(/href\s*=\s*["']https?:/i);
    expect(page).not.toMatch(/@import/i);
    expect(page).not.toMatch(/url\(\s*["']?https?:/i);
  });

  it('declara una CSP que no deja cargar nada de fuera', () => {
    expect(page).toContain("default-src 'none'");
    expect(page).toContain("connect-src 'self'");
  });

  it('no lleva ningún token dentro: lo lee de la URL', () => {
    // Es lo que deja esta función sin superficie de inyección que auditar: no
    // hay ningún dato que interpolar, así que no hay nada que escapar.
    expect(page).toContain("new URLSearchParams(location.search).get('t')");
    expect(page).not.toMatch(/t=[0-9a-f]{8}/);
  });

  it('pinta el texto del modelo con textContent, nunca con innerHTML', () => {
    // Una respuesta es texto de un modelo de lenguaje, o sea una entrada no
    // fiable como cualquier otra: un `<img onerror>` no puede acabar
    // ejecutándose en el teléfono.
    const uses = page.match(/innerHTML/g) ?? [];
    expect(uses).toHaveLength(1);
    // El único uso es el esqueleto estático de la tarjeta, sin interpolar nada.
    expect(page).toContain(
      `node.innerHTML = '<div class="q"></div><div class="a"></div><div class="meta"></div>'`
    );
  });
});

describe('el orden de las direcciones de red', () => {
  it('prefiere la red doméstica a la de Docker', () => {
    expect(sortAddresses(['172.17.0.1', '192.168.1.42'])[0]).toBe('192.168.1.42');
  });

  it('deja el adaptador de VirtualBox por debajo de una 10.x real', () => {
    // 192.168.56.x parece una red de casa y no lleva a ninguna parte: es la
    // trampa exacta que motivó ordenar en lugar de coger la primera.
    expect(sortAddresses(['192.168.56.1', '10.0.0.7'])).toEqual(['10.0.0.7', '192.168.56.1']);
  });

  it('manda al final la link-local, que significa que no hubo DHCP', () => {
    const sorted = sortAddresses(['169.254.3.9', '172.16.0.5']);
    expect(sorted[sorted.length - 1]).toBe('169.254.3.9');
  });

  it('no toca la lista que recibe', () => {
    const original = ['172.17.0.1', '192.168.1.42'];
    sortAddresses(original);
    expect(original).toEqual(['172.17.0.1', '192.168.1.42']);
  });

  /*
   * El caso real que obligó a mirar la tabla de rutas: una máquina con la red
   * de casa y tres adaptadores virtuales, todos con pinta de red doméstica. Por
   * prefijo son indistinguibles, así que ordenar por rangos acertaba sólo por
   * el orden en que el sistema enumera las interfaces.
   */
  it('pone primero la dirección por la que el sistema sale de verdad', () => {
    const real = ['192.168.121.1', '192.168.1.4', '192.168.52.1', '172.22.128.1'];
    expect(orderForPhone(real, '192.168.1.4')[0]).toBe('192.168.1.4');
  });

  it('no pierde ninguna al reordenar: las demás siguen ahí como alternativa', () => {
    const real = ['192.168.121.1', '192.168.1.4', '172.22.128.1'];
    expect(orderForPhone(real, '192.168.1.4')).toHaveLength(3);
    expect(orderForPhone(real, '192.168.1.4')).toEqual(expect.arrayContaining(real));
  });

  it('cae al orden por rangos si la tabla de rutas no contesta', () => {
    // Offline, o sólo IPv6: `routedAddress()` devuelve null y no se puede
    // quedar sin enlace por eso.
    expect(orderForPhone(['172.17.0.1', '192.168.1.42'], null)).toEqual([
      '192.168.1.42',
      '172.17.0.1',
    ]);
  });

  it('la ruta que devuelve el sistema es una dirección nuestra, o ninguna', async () => {
    /*
     * No se puede exigir un valor concreto: depende de la máquina y de si hay
     * ruta por defecto. Lo que sí se puede exigir es que, si contesta, sea una
     * IPv4 de esta máquina — devolver la de otro sería peor que no contestar.
     *
     * Este test no habría cazado el fallo que tuvo esta función (leer
     * `address()` justo después de `connect()`, que lanza `EBADF` y la deja
     * devolviendo `null` para siempre); eso salió ejecutándola. Está aquí para
     * lo otro: que no lance, que no cuelgue y que no invente direcciones.
     */
    const mine = Object.values(networkInterfaces())
      .flatMap((entries) => entries ?? [])
      .filter((entry) => entry.family === 'IPv4')
      .map((entry) => entry.address);

    const routed = await routedAddress();
    if (routed !== null) expect(mine).toContain(routed);
  });

  it('ignora una ruta que no está entre las interfaces', () => {
    // Puede pasar con una VPN que enruta por una dirección que `networkInterfaces`
    // no lista. Meterla en la lista daría un enlace a una IP que no es nuestra.
    expect(orderForPhone(['192.168.1.42'], '10.8.0.1')).toEqual(['192.168.1.42']);
  });
});

describe('el servidor del espejo', () => {
  afterAll(() => phoneBridge.stop());

  async function start(): Promise<PhoneMirrorStatus> {
    // `apply()` es idempotente a propósito —volver a aplicar los mismos ajustes
    // no reinicia nada— así que cada test arranca desde parado o se quedaría
    // esperando un evento que no va a llegar.
    phoneBridge.stop();
    const listening = new Promise<void>((resolve) => phoneBridge.once('status', () => resolve()));
    // Sin LAN: el test no tiene por qué abrir un puerto hacia fuera.
    phoneBridge.apply({ ...DEFAULT_SETTINGS, phoneMirrorEnabled: true, phoneMirrorLan: false });
    await listening;
    return phoneBridge.getStatus();
  }

  it('sirve la página sólo con el token correcto', async () => {
    const status = await start();
    expect(status.running).toBe(true);
    expect(status.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?t=[0-9a-f]{32}$/);

    const ok = await fetch(status.url);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain('<title>Espejo</title>');
  });

  it('rechaza un token equivocado, ausente o de otra longitud', async () => {
    const status = await start();
    const base = status.url.split('?')[0] ?? '';

    for (const url of [base, `${base}?t=`, `${base}?t=corto`, `${base}?t=${'0'.repeat(32)}`]) {
      const res = await fetch(url);
      expect(res.status).toBe(403);
      // El caso normal no es un intruso, es un enlace viejo: el cuerpo dice
      // qué hacer en lugar de soltar un número.
      expect(await res.text()).toContain('Vuelve a escanear');
    }
  });

  it('da un token nuevo en cada arranque, así que el enlace viejo caduca', async () => {
    const first = await start();
    phoneBridge.stop();
    const second = await start();

    expect(second.url).not.toBe(first.url);
    expect((await fetch(first.url)).status).toBe(403);
  });

  it('deja el enlace muerto al pararlo, sin depender de que el socket se cierre', async () => {
    const status = await start();
    phoneBridge.stop();
    expect(phoneBridge.getStatus().running).toBe(false);

    /*
     * `server.close()` es asíncrono: deja de aceptar conexiones, pero una
     * petición que llegue en ese mismo tick todavía puede entrar. Lo que cierra
     * la puerta de verdad es que el token se borra **de forma síncrona**, así
     * que en esa ventana la respuesta es 403 y no contenido.
     *
     * Por eso este test acepta las dos salidas: la garantía no es la velocidad
     * del cierre, es que no hay ningún token con el que entrar. Afirmar el
     * rechazo de conexión hacía pasar el test por suerte, según lo rápido que
     * fuera la máquina.
     */
    const response = await fetch(status.url).catch(() => null);
    if (response) {
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain('<title>Espejo</title>');
    }
  });
});

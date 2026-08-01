/**
 * La página que ve el teléfono.
 *
 * Es un HTML autocontenido y **sin ninguna interpolación**: el token no se
 * escribe aquí dentro, lo lee el propio script de `location.search`. Eso no es
 * casualidad, es lo que hace que esta función no tenga superficie de inyección
 * que auditar — no hay ningún dato del usuario que pueda acabar en el marcado.
 *
 * Tampoco carga nada de fuera. Se sirve desde el propio proceso principal a un
 * teléfono que puede no tener salida a internet (una red de invitados, un
 * hotspot sin datos), así que una fuente o un script remoto dejarían la página
 * a medias justo cuando más falta hace. Es la misma regla que la guía de
 * modelos: sin `<script src>`, sin CSS externo, sin imágenes remotas.
 *
 * El texto de las respuestas se pinta **siempre con `textContent`**, nunca con
 * `innerHTML`. Viene de un modelo de lenguaje, que es una fuente tan poco de
 * fiar como cualquier otra entrada: un `<img onerror>` en una respuesta no
 * puede convertirse en código ejecutándose en el teléfono.
 */
export function renderPhonePage(): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'">
<meta name="color-scheme" content="dark">
<title>Espejo</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif;
    background: #0f1115;
    color: #e8eaed;
    -webkit-font-smoothing: antialiased;
    padding: env(safe-area-inset-top) 14px calc(24px + env(safe-area-inset-bottom));
    line-height: 1.55;
  }
  header {
    position: sticky; top: 0; z-index: 2;
    display: flex; align-items: center; gap: 9px;
    padding: 14px 0 12px;
    background: linear-gradient(#0f1115 72%, transparent);
  }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: #535861; flex: none; }
  body[data-link="open"] .dot { background: #34d399; }
  body[data-link="lost"] .dot { background: #f87171; }
  #link { font-size: 13px; color: #9aa0a6; flex: 1; }
  #capture { font-size: 12px; color: #7c8288; }
  .answer {
    background: #171a21;
    border: 1px solid rgba(255,255,255,.07);
    border-radius: 14px;
    padding: 14px 16px;
    margin-bottom: 12px;
  }
  /* La primera es la que se lee de reojo: separada y sin competencia visual. */
  .answer:first-of-type { border-color: rgba(96,165,250,.32); }
  .answer.old { opacity: .62; }
  .q { font-size: 12.5px; color: #fbbf24; margin-bottom: 7px; }
  .a { font-size: 17px; white-space: pre-wrap; word-wrap: break-word; }
  .a.pending { color: #9aa0a6; font-style: italic; }
  .a.failed { color: #fca5a5; font-style: normal; }
  pre {
    background: #0c0e12;
    border: 1px solid rgba(255,255,255,.07);
    border-radius: 9px;
    padding: 11px 12px;
    margin: 9px 0;
    overflow-x: auto;
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    font-size: 13.5px;
    line-height: 1.5;
    white-space: pre;
  }
  .meta { font-size: 11px; color: #6b7075; margin-top: 8px; font-family: ui-monospace, Menlo, Consolas, monospace; }
  #empty { color: #7c8288; font-size: 14px; text-align: center; padding: 56px 20px; }
  footer { color: #5f656b; font-size: 11.5px; text-align: center; padding-top: 18px; }
</style>
</head>
<body data-link="wait">
  <header>
    <span class="dot"></span>
    <span id="link">Conectando…</span>
    <span id="capture"></span>
  </header>
  <main id="list"></main>
  <div id="empty">Aquí aparecerán las respuestas.<br>Mantén la pantalla encendida.</div>
  <footer>Sólo mientras el ordenador esté encendido y en la misma red.</footer>

<script>
(function () {
  var list = document.getElementById('list');
  var empty = document.getElementById('empty');
  var link = document.getElementById('link');
  var capture = document.getElementById('capture');
  var token = new URLSearchParams(location.search).get('t') || '';
  /* id → nodo, para actualizar EN SITIO. \`answer\` llega en cada tick del
     streaming: sin esto serían decenas de copias de la misma respuesta. */
  var nodes = new Map();
  var order = [];

  function setLink(state, text) {
    document.body.dataset.link = state;
    link.textContent = text;
  }

  /* Partidor mínimo de vallas \`\`\`, el mismo trato que en el overlay: el
     texto va en nodos de texto y el código en <pre>. No es Markdown y no debe
     convertirse en Markdown — es el único formato que el prompt promete. */
  function paint(el, text) {
    el.textContent = '';
    var parts = String(text).split(/\`\`\`/);
    for (var i = 0; i < parts.length; i++) {
      var chunk = parts[i];
      if (i % 2 === 1) {
        var pre = document.createElement('pre');
        // La primera línea de una valla es el lenguaje, no código.
        pre.textContent = chunk.replace(/^[a-zA-Z0-9+#.-]*\\n/, '');
        el.appendChild(pre);
      } else if (chunk) {
        el.appendChild(document.createTextNode(chunk));
      }
    }
  }

  function render(answer) {
    var node = nodes.get(answer.id);
    if (!node) {
      node = document.createElement('article');
      node.className = 'answer';
      node.innerHTML = '<div class="q"></div><div class="a"></div><div class="meta"></div>';
      nodes.set(answer.id, node);
      order.unshift(answer.id);
      list.prepend(node);
      empty.style.display = 'none';
      // Una respuesta nueva mientras miras una anterior: se sube sola, que es
      // lo que quieres de un segundo dispositivo que consultas de reojo.
      if (window.scrollY < 120) window.scrollTo({ top: 0, behavior: 'smooth' });
      trim();
    }
    for (var i = 0; i < order.length; i++) {
      var other = nodes.get(order[i]);
      if (other) other.classList.toggle('old', order[i] !== order[0]);
    }

    node.querySelector('.q').textContent = answer.question || '';
    var body = node.querySelector('.a');
    if (answer.status === 'thinking') {
      body.className = 'a pending';
      body.textContent = 'Pensando…';
    } else if (answer.status === 'error') {
      body.className = 'a failed';
      body.textContent = answer.error || 'Falló la respuesta.';
    } else if (answer.status === 'aborted' && !answer.text) {
      body.className = 'a pending';
      body.textContent = 'Cancelada.';
    } else {
      body.className = 'a';
      paint(body, answer.text || '');
    }
    node.querySelector('.meta').textContent =
      (answer.model || '') + (answer.status === 'streaming' ? ' · escribiendo…' : '');
  }

  function trim() {
    while (order.length > 20) {
      var id = order.pop();
      var node = nodes.get(id);
      if (node) node.remove();
      nodes.delete(id);
    }
  }

  function clear() {
    nodes.forEach(function (node) { node.remove(); });
    nodes.clear();
    order = [];
    empty.style.display = '';
  }

  function showCapture(status) {
    if (!status) { capture.textContent = ''; return; }
    capture.textContent =
      status.state === 'listening' ? 'escuchando' :
      status.state === 'error' ? 'error de captura' : 'en pausa';
  }

  var source = new EventSource('/events?t=' + encodeURIComponent(token));

  source.addEventListener('open', function () { setLink('open', 'Conectado'); });

  /* El primer mensaje trae lo que ya había: quien abre el teléfono a mitad de
     una respuesta tiene que verla, no esperar a la siguiente. */
  source.addEventListener('hello', function (event) {
    var data = JSON.parse(event.data);
    clear();
    for (var i = data.answers.length - 1; i >= 0; i--) render(data.answers[i]);
    showCapture(data.capture);
    setLink('open', 'Conectado');
  });

  source.addEventListener('answer', function (event) { render(JSON.parse(event.data)); });
  source.addEventListener('reset', function () { clear(); });
  source.addEventListener('capture', function (event) { showCapture(JSON.parse(event.data)); });

  /* EventSource reconecta solo, así que esto informa en vez de reintentar. La
     causa normal en un móvil es la pantalla bloqueada, no un fallo. */
  source.addEventListener('error', function () {
    if (source.readyState === EventSource.CLOSED) {
      setLink('lost', 'Enlace caducado — vuelve a escanear el código');
    } else {
      setLink('lost', 'Reconectando…');
    }
  });
})();
</script>
</body>
</html>
`;
}

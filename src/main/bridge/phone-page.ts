import { translate, type UIKey, type UILang } from '@shared/i18n';

/**
 * La página que ve el teléfono.
 *
 * Es un HTML autocontenido y **ningún dato del usuario entra en el marcado**:
 * el token no se escribe aquí dentro, lo lee el propio script de
 * `location.search`. Eso no es casualidad, es lo que deja esta función casi sin
 * superficie de inyección que auditar.
 *
 * Lo único que se interpola es la **tabla de traducciones**, que es texto
 * nuestro y no de nadie de fuera. Aun así viaja como un JSON con los `<`
 * escapados: la regla de que nada que se meta en un `<script>` pueda cerrarlo
 * no admite excepciones por «esto lo escribimos nosotros», porque el día que
 * alguien añada una clave con marcado dentro ya nadie se acuerda de la
 * excepción. El script lo lee y lo pinta con `textContent`.
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
export function renderPhonePage(lang: UILang = 'en'): string {
  /** Lo que el script de la página necesita decir, ya traducido. */
  const words: Record<string, string> = {};
  const say = (short: string, key: UIKey): void => {
    words[short] = translate(lang, key);
  };
  say('title', 'ph.pgTitle');
  say('connecting', 'ph.pgConnecting');
  say('connected', 'ph.pgConnected');
  say('reconnecting', 'ph.pgReconnecting');
  say('expired', 'ph.pgExpired');
  say('empty', 'ph.pgEmpty');
  say('foot', 'ph.pgFoot');
  say('thinking', 'ph.pgThinking');
  say('failed', 'ph.pgFailed');
  say('cancelled', 'ph.pgCancelled');
  say('writing', 'ph.pgWriting');
  say('capListening', 'ph.pgListening');
  say('capError', 'ph.pgCaptureError');
  say('capPaused', 'ph.pgPaused');

  // El escape estándar de JSON dentro de un `<script>`: sin él, un `</script>`
  // en cualquier valor cerraría la etiqueta antes de tiempo.
  const dict = JSON.stringify(words).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'">
<meta name="color-scheme" content="dark">
<title></title>
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
    <span id="link"></span>
    <span id="capture"></span>
  </header>
  <main id="list"></main>
  <div id="empty"></div>
  <footer id="foot"></footer>

<script>
(function () {
  /* Los textos, escritos por el proceso principal en el idioma de la app. Van
     todos a nodos de texto: aquí no se construye marcado con ellos. */
  var T = ${dict};

  var list = document.getElementById('list');
  var empty = document.getElementById('empty');
  var link = document.getElementById('link');
  var capture = document.getElementById('capture');
  var token = new URLSearchParams(location.search).get('t') || '';

  document.title = T.title;
  link.textContent = T.connecting;
  document.getElementById('foot').textContent = T.foot;
  /* Dos frases y un salto de línea, sin marcado: un <br> obligaría a partir la
     clave en dos y a que el traductor no viera la frase entera. */
  T.empty.split('\\n').forEach(function (line, i) {
    if (i) empty.appendChild(document.createElement('br'));
    empty.appendChild(document.createTextNode(line));
  });
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
      body.textContent = T.thinking;
    } else if (answer.status === 'error') {
      body.className = 'a failed';
      body.textContent = answer.error || T.failed;
    } else if (answer.status === 'aborted' && !answer.text) {
      body.className = 'a pending';
      body.textContent = T.cancelled;
    } else {
      body.className = 'a';
      paint(body, answer.text || '');
    }
    node.querySelector('.meta').textContent =
      (answer.model || '') + (answer.status === 'streaming' ? ' · ' + T.writing : '');
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
      status.state === 'listening' ? T.capListening :
      status.state === 'error' ? T.capError : T.capPaused;
  }

  var source = new EventSource('/events?t=' + encodeURIComponent(token));

  source.addEventListener('open', function () { setLink('open', T.connected); });

  /* El primer mensaje trae lo que ya había: quien abre el teléfono a mitad de
     una respuesta tiene que verla, no esperar a la siguiente. */
  source.addEventListener('hello', function (event) {
    var data = JSON.parse(event.data);
    clear();
    for (var i = data.answers.length - 1; i >= 0; i--) render(data.answers[i]);
    showCapture(data.capture);
    setLink('open', T.connected);
  });

  source.addEventListener('answer', function (event) { render(JSON.parse(event.data)); });
  source.addEventListener('reset', function () { clear(); });
  source.addEventListener('capture', function (event) { showCapture(JSON.parse(event.data)); });

  /* EventSource reconecta solo, así que esto informa en vez de reintentar. La
     causa normal en un móvil es la pantalla bloqueada, no un fallo. */
  source.addEventListener('error', function () {
    if (source.readyState === EventSource.CLOSED) {
      setLink('lost', T.expired);
    } else {
      setLink('lost', T.reconnecting);
    }
  });
})();
</script>
</body>
</html>
`;
}

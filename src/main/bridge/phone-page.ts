import { translate, type UIKey, type UILang } from '@shared/i18n';

/**
 * The page the phone sees.
 *
 * It's self-contained HTML and **no user data enters the markup**: the token
 * isn't written in here, the script itself reads it from `location.search`.
 * That's not chance, it's what leaves this function with almost no injection
 * surface to audit.
 *
 * The only thing interpolated is the **translation table**, which is our text
 * and not anyone's from outside. Even so it travels as JSON with the `<`s
 * escaped: the rule that nothing put into a `<script>` can close it admits no
 * exceptions for "we wrote this ourselves", because the day someone adds a key
 * with markup inside, no one remembers the exception anymore. The script reads it
 * and paints it with `textContent`.
 *
 * It also loads nothing from outside. It's served from the main process itself to
 * a phone that may have no internet access (a guest network, a hotspot with no
 * data), so a remote font or script would leave the page half-done exactly when
 * it's needed most. It's the same rule as the model guide: no `<script src>`, no
 * external CSS, no remote images.
 *
 * The answers' text is painted **always with `textContent`**, never with
 * `innerHTML`. It comes from a language model, which is a source as untrustworthy
 * as any other input: an `<img onerror>` in an answer can't turn into code
 * running on the phone.
 */
export function renderPhonePage(lang: UILang = 'en'): string {
  /** What the page's script needs to say, already translated. */
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
  say('copy', 'ph.pgCopy');
  say('copied', 'ph.pgCopied');

  // The standard JSON escape inside a `<script>`: without it, a `</script>` in
  // any value would close the tag prematurely.
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
  /* The first one is the one read out of the corner of the eye: set apart and with no visual competition. */
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
  .a strong { font-weight: 600; color: #f4f5f7; }
  .a code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: .9em; background: rgba(255,255,255,.08); border-radius: 4px; padding: 1px 5px; }
  .code { margin: 9px 0; }
  .code__bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; background: #0c0e12; border: 1px solid rgba(255,255,255,.07); border-bottom: 0; border-radius: 9px 9px 0 0; padding: 5px 8px 5px 11px; }
  .code__lang { font-size: 11px; color: #6b7075; font-family: ui-monospace, Menlo, Consolas, monospace; }
  .copy { font: inherit; font-size: 11.5px; color: #cfe0ff; background: rgba(76,141,255,.22); border: 0; border-radius: 6px; padding: 4px 11px; cursor: pointer; }
  .copy:active { background: rgba(76,141,255,.42); color: #fff; }
  .code pre { margin: 0; border-top: 0; border-radius: 0 0 9px 9px; }
  .tok-com { color: #6b7280; font-style: italic; }
  .tok-str { color: #9ece6a; }
  .tok-num { color: #e0af68; }
  .tok-kw { color: #7aa2f7; }
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
  /* The texts, written by the main process in the app's language. They all go
     to text nodes: no markup is built with them here. */
  var T = ${dict};

  var list = document.getElementById('list');
  var empty = document.getElementById('empty');
  var link = document.getElementById('link');
  var capture = document.getElementById('capture');
  var token = new URLSearchParams(location.search).get('t') || '';

  document.title = T.title;
  link.textContent = T.connecting;
  document.getElementById('foot').textContent = T.foot;
  /* Two sentences and a line break, no markup: a <br> would force splitting the
     key in two and the translator not seeing the whole sentence. */
  T.empty.split('\\n').forEach(function (line, i) {
    if (i) empty.appendChild(document.createElement('br'));
    empty.appendChild(document.createTextNode(line));
  });
  /* id → node, to update IN PLACE. \`answer\` arrives on every tick of the
     streaming: without this it would be dozens of copies of the same answer. */
  var nodes = new Map();
  var order = [];

  function setLink(state, text) {
    document.body.dataset.link = state;
    link.textContent = text;
  }

  /* The blocks come already parsed from main (the same answer-format as the
     overlay): code, or text with inline marks. Everything is painted with
     textContent and nodes, never as markup — the text comes from a model and
     isn't trustworthy. */
  var KW = {};
  ('function return if else for while const let var class def import from export new await async ' +
    'public private protected static void int long float double string bool boolean char true false ' +
    'null None nil undefined self this super struct enum match case switch break continue in of and ' +
    'or not is lambda try except catch finally throw raise yield with as elif do end then type ' +
    'interface extends implements typeof instanceof delete package use fn mut pub')
    .split(' ')
    .forEach(function (k) { KW[k] = 1; });

  var TOK = /(\\/\\/[^\\n]*|#[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)|("[^"\\n]*"|'[^'\\n]*')|(\\b\\d[\\w.]*\\b)|([A-Za-z_$][\\w$]*)/g;

  /* Minimal and safe highlighting: comments, strings, numbers and a set of
     keywords. Each token goes in its span with textContent. */
  function highlight(pre, src) {
    var last = 0, m;
    TOK.lastIndex = 0;
    while ((m = TOK.exec(src))) {
      if (m.index > last) pre.appendChild(document.createTextNode(src.slice(last, m.index)));
      var cls = m[1] ? 'tok-com' : m[2] ? 'tok-str' : m[3] ? 'tok-num' : (KW[m[4]] ? 'tok-kw' : '');
      if (cls) {
        var sp = document.createElement('span');
        sp.className = cls;
        sp.textContent = m[0];
        pre.appendChild(sp);
      } else {
        pre.appendChild(document.createTextNode(m[0]));
      }
      last = TOK.lastIndex;
    }
    if (last < src.length) pre.appendChild(document.createTextNode(src.slice(last)));
  }

  /* navigator.clipboard doesn't exist over http (insecure context), which is
     exactly how the phone connects to the LAN. execCommand does, so there's a fallback. */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () { legacyCopy(text); });
      return;
    }
    legacyCopy(text);
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  function makeCode(block) {
    var box = document.createElement('div');
    box.className = 'code';
    var bar = document.createElement('div');
    bar.className = 'code__bar';
    var lang = document.createElement('span');
    lang.className = 'code__lang';
    lang.textContent = block.lang || '';
    bar.appendChild(lang);
    if (block.open) {
      /* Fence still open during streaming: incomplete code would be copied, so
         instead of the button it says it's being written. */
      var w = document.createElement('span');
      w.className = 'code__lang';
      w.textContent = T.writing;
      bar.appendChild(w);
    } else {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy';
      btn.textContent = T.copy;
      btn.addEventListener('click', function () {
        copyText(block.content);
        btn.textContent = T.copied;
        setTimeout(function () { btn.textContent = T.copy; }, 1400);
      });
      bar.appendChild(btn);
    }
    var pre = document.createElement('pre');
    highlight(pre, block.content);
    box.appendChild(bar);
    box.appendChild(pre);
    return box;
  }

  function paint(el, blocks) {
    el.textContent = '';
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.type === 'code') { el.appendChild(makeCode(b)); continue; }
      var spans = b.spans || [];
      for (var j = 0; j < spans.length; j++) {
        var s = spans[j];
        if (s.type === 'bold') {
          var st = document.createElement('strong');
          st.textContent = s.text;
          el.appendChild(st);
        } else if (s.type === 'code') {
          var cd = document.createElement('code');
          cd.textContent = s.text;
          el.appendChild(cd);
        } else {
          el.appendChild(document.createTextNode(s.text));
        }
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
      // A new answer while you're looking at a previous one: it scrolls up on
      // its own, which is what you want from a second device you glance at.
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
      paint(body, answer.blocks || []);
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

  /* The first message brings what was already there: whoever opens the phone
     mid-answer has to see it, not wait for the next one. */
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

  /* EventSource reconnects on its own, so this informs instead of retrying. The
     normal cause on a phone is the locked screen, not a failure. */
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

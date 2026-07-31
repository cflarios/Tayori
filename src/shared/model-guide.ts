import { adviseLocalModels, type SystemSpecs } from './types';

/**
 * La guía de modelos, como documento.
 *
 * La tarjeta del dashboard responde "¿qué me pongo?" en dos líneas, y eso es lo
 * que hace falta con la ventana abierta. Esto responde a la pregunta de al lado
 * —"¿y por qué, y qué más hay, y cuánto cuesta?"— que necesita tablas, tramos y
 * comparativas, y que en una columna de ajustes sería un muro.
 *
 * Se genera y se abre en el navegador en lugar de vivir en una ventana propia:
 * una ventana más de Electron es una ventana más que registrar en la protección
 * de captura, y la regla de oro de este proyecto es que el modo invisible se
 * verifica, no se asume. Un documento no tiene ese riesgo, se puede guardar, e
 * imprimir, y leer con la app cerrada.
 */

/** Escapa lo que venga de fuera: el nombre de la CPU y de la GPU los da el sistema. */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Un modelo local, con lo que de verdad decide si sirve.
 *
 * `weight` es el tamaño de la descarga cuantizada a 4 bits, que es lo que ocupa
 * en disco y, aproximadamente, en memoria. `needs` es la RAM que conviene tener
 * libre contando el sistema y la ventana de contexto.
 */
interface LocalModel {
  id: string;
  weight: string;
  needs: string;
  note: string;
}

const CHAT_MODELS: LocalModel[] = [
  {
    id: 'llama3.2:1b',
    weight: '~1,3 GB',
    needs: '4 GB',
    note: 'El mínimo viable. Sirve para reformular y resumir, no para razonar.',
  },
  {
    id: 'llama3.2:3b',
    weight: '~2 GB',
    needs: '8 GB',
    note: 'El equilibrio para una máquina modesta. Responde rápido en CPU.',
  },
  {
    id: 'qwen2.5:7b',
    weight: '~4,7 GB',
    needs: '8–16 GB',
    note: 'Mejor en preguntas técnicas que llama3.2:3b, a cambio de latencia.',
  },
  {
    id: 'llama3.1:8b',
    weight: '~4,9 GB',
    needs: '16 GB',
    note: 'El caballo de batalla. Buen equilibrio si hay GPU que lo sostenga.',
  },
  {
    id: 'qwen2.5:14b',
    weight: '~9 GB',
    needs: '32 GB',
    note: 'Calidad alta. Sin GPU dedicada, demasiado lento para conversar.',
  },
];

const VISION_MODELS: LocalModel[] = [
  {
    id: 'moondream',
    weight: '~1,7 GB',
    needs: '4 GB',
    note: 'Visión mínima. Describe una pantalla; no lee un enunciado largo con fiabilidad.',
  },
  {
    id: 'qwen2.5vl:3b',
    weight: '~3,2 GB',
    needs: '8 GB',
    note: 'El multimodal pequeño que mejor lee texto de pantalla.',
  },
  {
    id: 'gemma3:4b',
    weight: '~3,3 GB',
    needs: '8 GB',
    note: 'Multimodal de propósito general. Alternativa si qwen2.5vl no convence.',
  },
  {
    id: 'qwen2.5vl:7b',
    weight: '~6 GB',
    needs: '16 GB',
    note: 'El punto dulce para las acciones de pantalla en local.',
  },
  {
    id: 'llava:13b',
    weight: '~8 GB',
    needs: '16–32 GB',
    note: 'Veterano y muy probado. Peor con texto pequeño que qwen2.5vl.',
  },
  {
    id: 'qwen2.5vl:32b',
    weight: '~21 GB',
    needs: '48 GB o GPU de 24 GB',
    note: 'Lo mejor en local para leer pantallas. Pide máquina de verdad.',
  },
];

/**
 * Nube, ordenada por lo que cuesta.
 *
 * Los precios de Anthropic están verificados contra su referencia y llevan
 * fecha; los de Google no se copian porque no se pudieron verificar igual, y
 * una cifra inventada en una tabla de precios es peor que una remisión.
 */
interface CloudModel {
  id: string;
  label: string;
  price: string;
  vision: string;
  note: string;
}

const CLOUD_MODELS: CloudModel[] = [
  {
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    price: '1 $ / 5 $ por millón de tokens (entrada / salida)',
    vision: 'Sí, en resolución estándar',
    note:
      'El más barato de Anthropic y el de menor latencia. Lee capturas, pero a menor ' +
      'resolución que los Claude 5: para un enunciado con letra pequeña es el primero que falla.',
  },
  {
    id: 'claude-sonnet-5',
    label: 'Claude Sonnet 5',
    price: '3 $ / 15 $ (introductorio 2 $ / 10 $ hasta el 31-08-2026)',
    vision: 'Sí, alta resolución (2576 px)',
    note:
      'La opción por defecto de esta app, y con razón: lee bien una captura y responde ' +
      'rápido. Si sólo vas a configurar un modelo, éste.',
  },
  {
    id: 'claude-opus-5',
    label: 'Claude Opus 5',
    price: '5 $ / 25 $',
    vision: 'Sí, alta resolución (2576 px)',
    note:
      'Para los ejercicios que Sonnet no saca. Cuesta el doble por token y responde más ' +
      'despacio: tiene sentido como modelo SÓLO de pantalla, no para conversar.',
  },
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    price: 'Consulta ai.google.dev/pricing — suele ser el más barato de la nube',
    vision: 'Sí',
    note:
      'La misma clave sirve para la transcripción con Gemini Live, así que con una sola ' +
      'credencial tienes oído y respuesta. El precio no se reproduce aquí porque no se pudo ' +
      'verificar con la misma fuente que los de Anthropic.',
  },
];

/** Combinaciones que responden a "y yo qué pongo". */
interface Recipe {
  title: string;
  who: string;
  chat: string;
  screen: string;
  cost: string;
}

const RECIPES: Recipe[] = [
  {
    title: 'Todo local, sin conexión y sin coste',
    who: 'Te preocupa que salga algo de tu máquina, o no quieres pagar nada.',
    chat: 'Ollama · llama3.2:3b',
    screen: 'Ollama · qwen2.5vl:7b',
    cost: '0 €, a cambio de latencia y de acertar menos leyendo capturas.',
  },
  {
    title: 'Local para hablar, nube para la pantalla',
    who: 'La combinación que más gente querría: barata en lo frecuente, buena en lo difícil.',
    chat: 'Ollama · llama3.2:3b',
    screen: 'Claude Sonnet 5',
    cost: 'Sólo pagas las pulsaciones de Ctrl+Alt+C y Ctrl+Alt+Q. Céntimos por sesión.',
  },
  {
    title: 'Todo nube, lo más barato que funciona',
    who: 'No quieres instalar nada y tu máquina no da para modelos locales.',
    chat: 'Claude Haiku 4.5 o Gemini 2.5 Flash',
    screen: 'Claude Sonnet 5',
    cost: 'Bajo, pero se paga cada pregunta: también las que dispara la escucha automática.',
  },
  {
    title: 'Sin concesiones',
    who: 'Una prueba técnica de verdad y prefieres no arriesgar.',
    chat: 'Claude Sonnet 5',
    screen: 'Claude Opus 5',
    cost: 'El más caro de la lista, y aun así son céntimos por ejercicio.',
  },
];

/** Genera la guía completa como un HTML autocontenido. */
export function renderModelGuide(specs: SystemSpecs, generatedAt = new Date()): string {
  const advice = adviseLocalModels(specs);
  const fecha = generatedAt.toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const localRow = (m: LocalModel): string => `
    <tr>
      <td><code>${esc(m.id)}</code></td>
      <td class="num">${esc(m.weight)}</td>
      <td class="num">${esc(m.needs)}</td>
      <td>${esc(m.note)}</td>
    </tr>`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Qué modelo usar · Interview Helper</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto; padding: 48px 24px 96px; max-width: 900px;
    font-family: 'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif;
    font-size: 16px; line-height: 1.65; color: #e8eaed; background: #0e1015;
  }
  h1 { font-size: 30px; line-height: 1.2; margin: 0 0 8px; }
  h2 { font-size: 21px; margin: 48px 0 4px; padding-top: 24px; border-top: 1px solid rgba(255,255,255,.09); }
  h3 { font-size: 16px; margin: 28px 0 4px; color: #93c5fd; }
  p { margin: 12px 0; }
  .lead { color: #9aa0a6; font-size: 17px; margin-bottom: 32px; }
  code { font-family: 'Cascadia Mono', Consolas, monospace; font-size: .9em;
         background: rgba(255,255,255,.08); border-radius: 4px; padding: 1px 5px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14.5px; }
  th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid rgba(255,255,255,.07);
           vertical-align: top; }
  th { color: #9aa0a6; font-weight: 600; font-size: 12.5px; text-transform: uppercase;
       letter-spacing: .05em; }
  td.num { white-space: nowrap; color: #c8ccd0; }
  .box { border: 1px solid rgba(255,255,255,.1); border-radius: 10px; padding: 16px 20px;
         margin: 20px 0; background: rgba(255,255,255,.03); }
  .box--you { border-color: rgba(96,165,250,.35); background: rgba(96,165,250,.07); }
  .box--warn { border-color: rgba(251,191,36,.32); background: rgba(251,191,36,.07); }
  .box h3 { margin-top: 0; }
  .specs { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 0; padding: 0; list-style: none; }
  .specs li { background: rgba(255,255,255,.06); border-radius: 6px; padding: 5px 10px; font-size: 14px; }
  .recipe { border-left: 3px solid #60a5fa; padding-left: 16px; margin: 24px 0; }
  .recipe dl { display: grid; grid-template-columns: max-content 1fr; gap: 2px 14px; margin: 8px 0 0;
               font-size: 14.5px; }
  .recipe dt { color: #9aa0a6; }
  .recipe dd { margin: 0; }
  footer { margin-top: 64px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,.09);
           color: #7c8288; font-size: 13.5px; }
  @media print {
    body { color: #000; background: #fff; max-width: none; }
    h2, footer { border-color: #ccc; }
    .box, .specs li, code { background: #f4f4f4; border-color: #ddd; }
    h3, .recipe { color: inherit; border-color: #888; }
  }
</style>
</head>
<body>

<h1>Qué modelo usar</h1>
<p class="lead">
  Guía generada para tu equipo el ${esc(fecha)}. Elegir mal un modelo local cuesta una
  descarga de varios gigas para acabar con respuestas de un minuto; elegir mal uno de
  pago cuesta dinero por cada frase de una reunión. Esto es lo que encaja con lo que
  tienes.
</p>

<div class="box box--you">
  <h3>Tu equipo</h3>
  <ul class="specs">
    <li><strong>${specs.totalMemoryGB} GB</strong> de RAM</li>
    <li>${specs.cpuCores} núcleos · ${esc(specs.cpuModel)}</li>
    ${specs.gpu ? `<li>GPU: <strong>${esc(specs.gpu)}</strong></li>` : '<li>GPU: no identificada</li>'}
  </ul>
  <p>${esc(advice.tier)}. ${esc(advice.caveat)}</p>
  <p style="margin-bottom:0; color:#9aa0a6; font-size:14.5px">
    ${
      specs.gpu
        ? 'Ese consejo habla de la RAM, que es lo único que se mide con certeza. Tu tarjeta ' +
          'gráfica aparece ahí arriba, pero <strong>no sabemos cuánta memoria tiene</strong>, y ' +
          'es justo el dato que decide si un modelo vuela o se arrastra — ver «Lo que esta guía ' +
          'no sabe», al final.'
        : 'No se pudo identificar la tarjeta gráfica, así que da por hecho el caso lento: sin ' +
          'GPU que lo sostenga, un modelo local tarda segundos por respuesta.'
    }
  </p>
</div>

<h2>La decisión son dos, no una</h2>
<p>
  La app usa un modelo para <strong>conversar</strong> —lo que oye por el micrófono y por
  el sistema— y puede usar <strong>otro distinto</strong> para las acciones de pantalla
  (<code>Ctrl+Alt+C</code> resolver código, <code>Ctrl+Alt+Q</code> responder un test).
  Se separan en <em>dashboard → Modelo para la pantalla</em>, y conviene separarlos porque
  piden cosas opuestas:
</p>
<table>
  <tr><th>Tarea</th><th>Qué necesita</th><th>Por qué</th></tr>
  <tr>
    <td><strong>Conversar</strong></td>
    <td>Latencia</td>
    <td>La respuesta se lee de reojo mientras alguien te mira a la cara. Llega muchas veces por sesión.</td>
  </tr>
  <tr>
    <td><strong>Pantalla</strong></td>
    <td>Vista y cabeza</td>
    <td>Hay que leer un enunciado en una captura y no equivocarse. Llega pocas veces, y cada una importa.</td>
  </tr>
</table>
<p>
  De ahí que la combinación más razonable para mucha gente sea un modelo local pequeño
  para hablar y uno bueno de pago para la pantalla: lo frecuente sale gratis y lo difícil
  sale bien.
</p>

<div class="box box--warn">
  <strong>El modelo de pantalla tiene que admitir imágenes.</strong> Si eliges uno sin
  visión, los dos botones fallan con un aviso en lugar de inventarse el enunciado. En
  Ollama eso descarta a <code>llama3.2</code>, <code>qwen2.5</code> y <code>mistral</code>
  —son de texto— y deja a los de la tabla de multimodales.
</div>

<h2>Modelos locales (Ollama)</h2>
<p>
  No cuestan dinero y no envían nada fuera de tu máquina. El coste es la velocidad, y
  depende de si el modelo cabe en la GPU: si no cabe, Ollama lo reparte con la CPU y la
  velocidad se desploma aunque quepa en memoria. Regla de bolsillo: un modelo cuantizado
  a 4 bits ocupa unos <strong>0,6 GB por cada mil millones de parámetros</strong>.
</p>

<h3>Para conversar</h3>
<table>
  <tr><th>Modelo</th><th>Descarga</th><th>RAM recomendada</th><th>Notas</th></tr>
  ${CHAT_MODELS.map(localRow).join('')}
</table>

<h3>Para leer la pantalla (multimodales)</h3>
<table>
  <tr><th>Modelo</th><th>Descarga</th><th>RAM recomendada</th><th>Notas</th></tr>
  ${VISION_MODELS.map(localRow).join('')}
</table>
<p>
  Se instalan con <code>ollama pull &lt;modelo&gt;</code> desde una terminal. Para tu
  equipo, la app recomienda <code>${esc(advice.chat.model)}</code> para conversar y
  <code>${esc(advice.vision.model)}</code> para la pantalla.
</p>

<h2>Modelos de pago, de más barato a más caro</h2>
<p>
  Los precios de Anthropic están verificados contra su referencia oficial y son por millón
  de tokens. Un token viene a ser tres cuartos de palabra; lo que se paga en cada consulta
  es el contexto que envías (tu CV, la transcripción, la captura) más lo que responde.
</p>
<table>
  <tr><th>Modelo</th><th>Precio</th><th>Ve imágenes</th><th>Notas</th></tr>
  ${CLOUD_MODELS.map(
    (m) => `
  <tr>
    <td><code>${esc(m.id)}</code><br><span style="color:#9aa0a6;font-size:13px">${esc(m.label)}</span></td>
    <td class="num">${esc(m.price)}</td>
    <td class="num">${esc(m.vision)}</td>
    <td>${esc(m.note)}</td>
  </tr>`
  ).join('')}
</table>

<h3>Cuánto cuesta de verdad una pulsación de pantalla</h3>
<p>
  Una captura no es gratis: la app la manda a 1600 px de ancho, y a esa resolución un
  modelo con visión de alta resolución la cobra como <strong>unos 4.800 tokens de
  entrada</strong>. Con una respuesta de tamaño normal, y contando el prompt del sistema,
  sale aproximadamente:
</p>
<table>
  <tr><th>Modelo de pantalla</th><th>Coste aproximado por pulsación</th></tr>
  <tr><td>Claude Haiku 4.5</td><td class="num">medio céntimo</td></tr>
  <tr><td>Claude Sonnet 5</td><td class="num">unos 2 céntimos</td></tr>
  <tr><td>Claude Opus 5</td><td class="num">unos 4 céntimos</td></tr>
</table>
<p>
  Son órdenes de magnitud, no una factura: el coste real depende de cuánto contexto tengas
  cargado. La conclusión práctica es que el modo pantalla es barato aunque uses el modelo
  caro — <strong>lo que suma es la escucha automática</strong>, que dispara una consulta
  por cada pregunta que oye.
</p>
<p>
  Haiku 4.5 aparece más barato de lo que su precio sugiere porque además lee las imágenes
  a menor resolución, así que gasta menos tokens por captura. Es la misma razón por la que
  falla antes con letra pequeña: <em>está viendo menos</em>.
</p>

<h2>Combinaciones recomendadas</h2>
${RECIPES.map(
  (r) => `
<div class="recipe">
  <h3>${esc(r.title)}</h3>
  <p style="margin:4px 0 0">${esc(r.who)}</p>
  <dl>
    <dt>Conversar</dt><dd>${esc(r.chat)}</dd>
    <dt>Pantalla</dt><dd>${esc(r.screen)}</dd>
    <dt>Coste</dt><dd>${esc(r.cost)}</dd>
  </dl>
</div>`
).join('')}

<h2>Lo que esta guía no sabe</h2>
<p>
  <strong>La VRAM de tu tarjeta gráfica.</strong> Es el número que de verdad decide si un
  modelo local va rápido, y no hay forma fiable de leerlo desde la app sin invocar
  utilidades del sistema. Por eso las recomendaciones se apoyan en la RAM, que sí se mide.
  Si tu GPU tiene menos memoria de la que ocupa el modelo, irá mucho más lento de lo que
  esta guía sugiere.
</p>
<p>
  <strong>Los precios cambian y los modelos también.</strong> Los de Anthropic están
  verificados a la fecha de arriba; los nombres de los modelos de Ollama envejecen. Antes
  de descargar varios gigas, la lista viva está en
  <code>ollama.com/library</code>, y los precios en
  <code>platform.claude.com/docs/en/pricing</code> y <code>ai.google.dev/pricing</code>.
</p>
<p>
  <strong>Qué tal se le da a un modelo TU examen.</strong> Nada sustituye a probarlo: haz
  una captura de un ejercicio que ya sepas resolver y compara. Es el único dato que
  importa y se consigue en dos minutos.
</p>

<footer>
  Generado por Interview Helper para este equipo. Este documento no se envía a ningún
  sitio: se ha escrito en tu carpeta de datos y se ha abierto en tu navegador.
</footer>

</body>
</html>`;
}

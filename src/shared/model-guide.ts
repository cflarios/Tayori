import { DEFAULT_UI_LANG, translate, type UIKey, type UILang } from './i18n';
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
 *
 * **Toda la prosa son claves de la tabla de traducciones**, incluidas las notas
 * de cada modelo. Es un documento que lee una persona, así que sigue al idioma
 * de la interfaz como cualquier otra pantalla; lo que no se traduce son los ids
 * de los modelos, que son nombres propios, ni las cifras.
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
 * `weightGB` es el tamaño de la descarga cuantizada a 4 bits, que es lo que
 * ocupa en disco y, aproximadamente, en memoria — va como número porque el
 * separador decimal no es el mismo en los dos idiomas. `needs` es la RAM que
 * conviene tener libre contando el sistema y la ventana de contexto, y se deja
 * como texto porque son cifras y guiones: igual en cualquier idioma.
 */
interface LocalModel {
  id: string;
  weightGB: number;
  needs: string;
  note: UIKey;
}

const CHAT_MODELS: LocalModel[] = [
  { id: 'llama3.2:1b', weightGB: 1.3, needs: '4 GB', note: 'guide.llama1b' },
  { id: 'llama3.2:3b', weightGB: 2, needs: '8 GB', note: 'guide.llama3b' },
  { id: 'qwen2.5:7b', weightGB: 4.7, needs: '8–16 GB', note: 'guide.qwen7b' },
  { id: 'llama3.1:8b', weightGB: 4.9, needs: '16 GB', note: 'guide.llama8b' },
  { id: 'qwen2.5:14b', weightGB: 9, needs: '32 GB', note: 'guide.qwen14b' },
];

const VISION_MODELS: LocalModel[] = [
  { id: 'moondream', weightGB: 1.7, needs: '4 GB', note: 'guide.moondream' },
  { id: 'qwen2.5vl:3b', weightGB: 3.2, needs: '8 GB', note: 'guide.qwenvl3b' },
  { id: 'gemma3:4b', weightGB: 3.3, needs: '8 GB', note: 'guide.gemma3' },
  { id: 'qwen2.5vl:7b', weightGB: 6, needs: '16 GB', note: 'guide.qwenvl7b' },
  { id: 'llava:13b', weightGB: 8, needs: '16–32 GB', note: 'guide.llava13b' },
  { id: 'qwen2.5vl:32b', weightGB: 21, needs: '48 GB · 24 GB VRAM', note: 'guide.qwenvl32b' },
];

/**
 * Nube, ordenada por lo que cuesta.
 *
 * Los precios de Anthropic y los de OpenAI están verificados contra la
 * referencia oficial de cada uno y llevan fecha; los de Google no se copian
 * porque no se pudieron verificar igual, y una cifra inventada en una tabla de
 * precios es peor que una remisión a la página del proveedor.
 */
interface CloudModel {
  id: string;
  label: string;
  price: UIKey;
  vision: UIKey;
  note: UIKey;
}

const CLOUD_MODELS: CloudModel[] = [
  {
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    price: 'guide.priceHaiku45',
    vision: 'guide.visionStd',
    note: 'guide.haiku45',
  },
  {
    id: 'claude-sonnet-5',
    label: 'Claude Sonnet 5',
    price: 'guide.priceSonnet5',
    vision: 'guide.visionHigh',
    note: 'guide.sonnet5',
  },
  {
    id: 'claude-opus-5',
    label: 'Claude Opus 5',
    price: 'guide.priceOpus5',
    vision: 'guide.visionHigh',
    note: 'guide.opus5',
  },
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    price: 'guide.priceGemini',
    vision: 'guide.visionYes',
    note: 'guide.gemini25flash',
  },
  {
    id: 'gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    price: 'guide.priceLuna',
    vision: 'guide.visionYes',
    note: 'guide.luna',
  },
  {
    id: 'gpt-5.6-terra',
    label: 'GPT-5.6 Terra',
    price: 'guide.priceTerra',
    vision: 'guide.visionYes',
    note: 'guide.terra',
  },
  {
    id: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    price: 'guide.priceDsFlash',
    vision: 'guide.visionNo',
    note: 'guide.dsFlash',
  },
  {
    id: 'deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    price: 'guide.priceDsPro',
    vision: 'guide.visionNo',
    note: 'guide.dsPro',
  },
  {
    id: 'gpt-5.6-sol',
    label: 'GPT-5.6 Sol',
    price: 'guide.priceSol',
    vision: 'guide.visionYes',
    note: 'guide.sol',
  },
];

/** Combinaciones que responden a "y yo qué pongo". */
interface Recipe {
  title: UIKey;
  who: UIKey;
  /** Los dos modelos van tal cual: son nombres propios. */
  chat: string;
  screen: string;
  cost: UIKey;
}

const RECIPES: Recipe[] = [
  {
    title: 'guide.recipe1Title',
    who: 'guide.recipe1Who',
    chat: 'Ollama · llama3.2:3b',
    screen: 'Ollama · qwen2.5vl:7b',
    cost: 'guide.recipe1Cost',
  },
  {
    title: 'guide.recipe2Title',
    who: 'guide.recipe2Who',
    chat: 'Ollama · llama3.2:3b',
    screen: 'Claude Sonnet 5',
    cost: 'guide.recipe2Cost',
  },
  {
    title: 'guide.recipe3Title',
    who: 'guide.recipe3Who',
    chat: 'DeepSeek V4 Flash · GPT-5.6 Luna',
    screen: 'Claude Sonnet 5',
    cost: 'guide.recipe3Cost',
  },
  {
    title: 'guide.recipe4Title',
    who: 'guide.recipe4Who',
    chat: 'Claude Sonnet 5',
    screen: 'Claude Opus 5',
    cost: 'guide.recipe4Cost',
  },
];

/** Lo que cuesta cada pulsación de pantalla, por modelo. */
const SCREEN_COSTS: { label: string; cost: UIKey }[] = [
  { label: 'GPT-5.6 Luna', cost: 'guide.costLuna' },
  { label: 'Claude Haiku 4.5', cost: 'guide.costHaiku' },
  { label: 'GPT-5.6 Terra', cost: 'guide.costTerra' },
  { label: 'Claude Sonnet 5', cost: 'guide.costSonnet' },
  { label: 'Claude Opus 5', cost: 'guide.costOpus' },
  { label: 'GPT-5.6 Sol', cost: 'guide.costSol' },
];

/** El locale con el que `Intl` formatea fechas y decimales. */
const LOCALE: Record<UILang, string> = { en: 'en-GB', es: 'es-ES' };

/** Genera la guía completa como un HTML autocontenido. */
export function renderModelGuide(
  specs: SystemSpecs,
  lang: UILang = DEFAULT_UI_LANG,
  generatedAt = new Date()
): string {
  const advice = adviseLocalModels(specs);
  const locale = LOCALE[lang];

  /** Traduce y escapa de una vez: todo esto acaba dentro del marcado. */
  const t = (key: UIKey, vars?: Record<string, string | number>): string =>
    esc(translate(lang, key, vars));

  /** Lo mismo, pero dejando pasar el marcado que la propia clave trae dentro. */
  const raw = (key: UIKey, vars?: Record<string, string | number>): string =>
    translate(lang, key, vars);

  const date = generatedAt.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const localRow = (model: LocalModel): string => `
    <tr>
      <td><code>${esc(model.id)}</code></td>
      <td class="num">~${model.weightGB.toLocaleString(locale)} GB</td>
      <td class="num">${esc(model.needs)}</td>
      <td>${t(model.note)}</td>
    </tr>`;

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${t('guide.docTitle')}</title>
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

<h1>${t('guide.docTitle')}</h1>
<p class="lead">${t('guide.lead', { date })}</p>

<div class="box box--you">
  <h3>${t('guide.yourMachine')}</h3>
  <ul class="specs">
    <li><strong>${specs.totalMemoryGB} GB</strong> ${t('local.ram')}</li>
    <li>${t('local.cores', { cores: specs.cpuCores, cpu: specs.cpuModel })}</li>
    ${
      specs.gpu
        ? `<li>${t('local.gpu')} <strong>${esc(specs.gpu)}</strong></li>`
        : `<li>${t('guide.gpuUnknown')}</li>`
    }
  </ul>
  <p>${t(advice.tier, { ram: specs.totalMemoryGB })}. ${t(advice.caveat)}</p>
  <p style="margin-bottom:0; color:#9aa0a6; font-size:14.5px">
    ${specs.gpu ? raw('guide.gpuKnownNote') : raw('guide.gpuMissingNote')}
  </p>
</div>

<h2>${t('guide.h2Decision')}</h2>
<p>${raw('guide.decisionIntro')}</p>
<table>
  <tr><th>${t('guide.thTask')}</th><th>${t('guide.thNeeds')}</th><th>${t('guide.thWhy')}</th></tr>
  <tr>
    <td><strong>${t('guide.taskChat')}</strong></td>
    <td>${t('guide.needsLatency')}</td>
    <td>${t('guide.whyChat')}</td>
  </tr>
  <tr>
    <td><strong>${t('guide.taskScreen')}</strong></td>
    <td>${t('guide.needsEyes')}</td>
    <td>${t('guide.whyScreen')}</td>
  </tr>
</table>
<p>${t('guide.decisionOutro')}</p>

<div class="box box--warn">${raw('guide.visionWarn')}</div>

<h2>${t('guide.h2Local')}</h2>
<p>${raw('guide.localIntro')}</p>

<h3>${t('local.forChat')}</h3>
<table>
  <tr><th>${t('guide.thModel')}</th><th>${t('guide.thDownload')}</th><th>${t('guide.thRam')}</th><th>${t('guide.thNotes')}</th></tr>
  ${CHAT_MODELS.map(localRow).join('')}
</table>

<h3>${t('guide.h3Vision')}</h3>
<table>
  <tr><th>${t('guide.thModel')}</th><th>${t('guide.thDownload')}</th><th>${t('guide.thRam')}</th><th>${t('guide.thNotes')}</th></tr>
  ${VISION_MODELS.map(localRow).join('')}
</table>
<p>${raw('guide.pullNote', {
  chat: esc(advice.chat.model),
  vision: esc(advice.vision.model),
})}</p>

<h2>${t('guide.h2Cloud')}</h2>
<p>${t('guide.cloudIntro')}</p>
<p>${raw('guide.cloudGoogleNote')}</p>
<table>
  <tr><th>${t('guide.thModel')}</th><th>${t('guide.thPrice')}</th><th>${t('guide.thSeesImages')}</th><th>${t('guide.thNotes')}</th></tr>
  ${CLOUD_MODELS.map(
    (model) => `
  <tr>
    <td><code>${esc(model.id)}</code><br><span style="color:#9aa0a6;font-size:13px">${esc(model.label)}</span></td>
    <td class="num">${t(model.price)}</td>
    <td class="num">${t(model.vision)}</td>
    <td>${t(model.note)}</td>
  </tr>`
  ).join('')}
</table>

<h3>${t('guide.h3Cost')}</h3>
<p>${raw('guide.costIntro')}</p>
<table>
  <tr><th>${t('guide.thScreenModel')}</th><th>${t('guide.thCostEach')}</th></tr>
  ${SCREEN_COSTS.map(
    (row) => `<tr><td>${esc(row.label)}</td><td class="num">${t(row.cost)}</td></tr>`
  ).join('')}
</table>
<p>${raw('guide.costOutro')}</p>
<p>${raw('guide.costHaikuNote')}</p>

<h2>${t('guide.h2Recipes')}</h2>
${RECIPES.map(
  (recipe) => `
<div class="recipe">
  <h3>${t(recipe.title)}</h3>
  <p style="margin:4px 0 0">${t(recipe.who)}</p>
  <dl>
    <dt>${t('guide.taskChat')}</dt><dd>${esc(recipe.chat)}</dd>
    <dt>${t('guide.taskScreen')}</dt><dd>${esc(recipe.screen)}</dd>
    <dt>${t('guide.dtCost')}</dt><dd>${t(recipe.cost)}</dd>
  </dl>
</div>`
).join('')}

<h2>${t('guide.h2Unknown')}</h2>
<p>${raw('guide.unknownVram')}</p>
<p>${raw('guide.unknownPrices')}</p>
<p>${raw('guide.unknownYourExam')}</p>

<footer>${t('guide.footer')}</footer>

</body>
</html>`;
}

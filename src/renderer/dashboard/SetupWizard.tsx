import { useCallback, useEffect, useState } from 'react';
import {
  adviseLocalModels,
  CONTEXT_KIND_LABEL,
  type SecretKey,
  type SecretsPresence,
  type Settings,
  type SetupProgress,
  type SystemSpecs,
} from '@shared/types';
import type { WhisperProgress } from '@shared/ipc';
import { Icon } from './icons';

/**
 * Asistente de primera configuración.
 *
 * ## Qué problema resuelve
 *
 * La tarjeta de «Primeros pasos» que había antes era una **lista de tareas**:
 * decía qué faltaba y te mandaba a la sección correspondiente a hacerlo tú. Eso
 * sirve si ya sabes lo que es un proveedor, una API key y un modelo con visión.
 * Para quien abre la app por primera vez, cada paso era una decisión con
 * vocabulario propio, y la primera de todas —«local o nube»— exige saber cuánta
 * RAM tienes y si tu GPU sirve. Nadie tiene por qué saber eso para probar una
 * app.
 *
 * El asistente **lo hace**, no lo pide: mide el equipo, recomienda un camino con
 * el motivo, instala Ollama si hace falta, descarga los modelos que le pegan a
 * esa máquina y deja también resuelta la transcripción — que es el paso que se
 * olvida y sin el cual la app no oye nada.
 *
 * ## Las dos reglas que lo gobiernan
 *
 * - **Nada se instala ni se descarga sin pedirlo.** Cada acción que toca la
 *   máquina va detrás de un botón que dice antes qué va a hacer. No hay ninguna
 *   ruta que instale al arrancar.
 * - **Se puede salir en cualquier momento.** Quien ya sabe lo que hace cierra el
 *   asistente y usa el dashboard. Un asistente del que no se puede escapar es
 *   una jaula, no una ayuda.
 */

type Step = 'welcome' | 'brain' | 'voice' | 'context' | 'done';
type Path = 'cloud' | 'local';

export function SetupWizard({
  settings,
  presence,
  patch,
  saveSecret,
  onClose,
}: {
  settings: Settings;
  presence: SecretsPresence;
  patch: (p: Partial<Settings>) => Promise<void>;
  saveSecret: (key: SecretKey, value: string) => Promise<void>;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>('welcome');
  const [path, setPath] = useState<Path | null>(null);
  const [specs, setSpecs] = useState<SystemSpecs | null>(null);

  useEffect(() => {
    void window.api.system.getSpecs().then(setSpecs);
  }, []);

  const steps: Step[] = ['welcome', 'brain', 'voice', 'context', 'done'];
  const at = steps.indexOf(step);

  return (
    <div className="wiz">
      <header className="wiz__head">
        <div>
          <div className="wiz__eyebrow">Configuración guiada</div>
          <h1 className="wiz__title">{TITLES[step]}</h1>
        </div>
        {/* Salir siempre visible: quien sabe lo que hace no debería tener que
            terminar un asistente para llegar a los ajustes. */}
        <button className="btn btn--ghost" onClick={onClose}>
          Salir del asistente
        </button>
      </header>

      <div className="wiz__rail">
        {steps.map((id, index) => (
          <span
            key={id}
            className={`wiz__dot${index === at ? ' wiz__dot--now' : ''}${index < at ? ' wiz__dot--done' : ''}`}
          />
        ))}
      </div>

      <div className="wiz__body">
        {step === 'welcome' && (
          <Welcome
            specs={specs}
            onPick={(chosen) => {
              setPath(chosen);
              setStep('brain');
            }}
          />
        )}

        {step === 'brain' && path === 'cloud' && (
          <CloudStep
            settings={settings}
            presence={presence}
            patch={patch}
            saveSecret={saveSecret}
            onDone={() => setStep('voice')}
            onBack={() => setStep('welcome')}
          />
        )}

        {step === 'brain' && path === 'local' && (
          <LocalStep
            settings={settings}
            specs={specs}
            patch={patch}
            onDone={() => setStep('voice')}
            onBack={() => setStep('welcome')}
          />
        )}

        {step === 'voice' && (
          <VoiceStep
            settings={settings}
            presence={presence}
            patch={patch}
            onDone={() => setStep('context')}
          />
        )}

        {step === 'context' && (
          <ContextStep settings={settings} patch={patch} onDone={() => setStep('done')} />
        )}

        {step === 'done' && <DoneStep settings={settings} onClose={onClose} patch={patch} />}
      </div>
    </div>
  );
}

const TITLES: Record<Step, string> = {
  welcome: '¿Quién va a responder?',
  brain: 'Configurando el modelo',
  voice: '¿Cómo se convierte la voz en texto?',
  context: 'Lo que el modelo debe saber de ti',
  done: 'Listo',
};

// ────────────────────────────── 1 · Bienvenida ──────────────────────────────

/**
 * La elección local/nube, con el equipo ya medido.
 *
 * La recomendación se calcula, no se sortea: por debajo de 16 GB un modelo local
 * decente no cabe, y sin GPU dedicada la latencia arruina el caso de uso —la
 * respuesta se lee mientras alguien te mira—. Se dice el porqué junto a la
 * recomendación para que se pueda llevar la contraria con criterio.
 */
function Welcome({ specs, onPick }: { specs: SystemSpecs | null; onPick: (path: Path) => void }) {
  if (!specs) return <p className="wiz__lead">Midiendo tu equipo…</p>;

  const advice = adviseLocalModels(specs);
  const localIsViable = specs.totalMemoryGB >= 16 && Boolean(specs.gpu);

  return (
    <>
      <p className="wiz__lead">
        La app necesita un modelo que redacte las respuestas. Hay dos formas, y la diferencia real
        es dónde corre y quién paga.
      </p>

      <div className="specs">
        <span className="specs__item">
          <strong>{specs.totalMemoryGB} GB</strong> de RAM
        </span>
        <span className="specs__item">
          {specs.cpuCores} núcleos · {specs.cpuModel}
        </span>
        {specs.gpu && (
          <span className="specs__item">
            GPU: <strong>{specs.gpu}</strong>
          </span>
        )}
      </div>

      <p className="wiz__note">{advice.tier}</p>

      <div className="wiz__paths">
        <PathCard
          icon="cloud"
          title="En la nube"
          recommended={!localIsViable}
          bullets={[
            'Nada que instalar: pegas una API key y ya responde.',
            'La mejor calidad, y responde en uno o dos segundos.',
            'Pagas por uso al proveedor. Tu voz transcrita sale de tu equipo.',
          ]}
          cta="Usar un proveedor de pago"
          onPick={() => onPick('cloud')}
        />
        <PathCard
          icon="laptop"
          title="En tu equipo"
          recommended={localIsViable}
          bullets={[
            'Gratis y sin cuenta. Nada de lo que digas sale de la máquina.',
            'Hay que instalar Ollama y descargar varios GB de modelos.',
            'La calidad y la velocidad dependen de tu hardware.',
          ]}
          cta="Instalarlo todo aquí"
          onPick={() => onPick('local')}
        />
      </div>

      <p className="wiz__note">
        {localIsViable
          ? 'Tu equipo da la talla para lo local, así que es lo que te recomiendo: sale gratis y no envías nada. Puedes cambiar de idea después sin perder nada.'
          : 'Con este equipo lo local iría lento y se equivocaría leyendo capturas, así que te recomiendo la nube. Puedes probar lo local igualmente: el asistente te dirá qué modelos te pegan.'}
      </p>
    </>
  );
}

function PathCard({
  icon,
  title,
  bullets,
  cta,
  recommended,
  onPick,
}: {
  icon: 'cloud' | 'laptop';
  title: string;
  bullets: string[];
  cta: string;
  recommended: boolean;
  onPick: () => void;
}) {
  return (
    <section className={`pathcard${recommended ? ' pathcard--pick' : ''}`}>
      <div className="pathcard__head">
        <span className="hero__icon">
          <Icon name={icon} size={19} />
        </span>
        <h2 className="pathcard__title">{title}</h2>
        {recommended && <span className="badge badge--ok">recomendado</span>}
      </div>
      <ul className="pathcard__list">
        {bullets.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <button className="btn btn--primary" onClick={onPick}>
        {cta}
      </button>
    </section>
  );
}

// ──────────────────────────── 2a · Camino nube ────────────────────────────

const CLOUD_PROVIDERS = [
  {
    id: 'claude' as const,
    secret: 'anthropic' as const,
    label: 'Claude (Anthropic)',
    model: 'claude-sonnet-5',
    where: 'console.anthropic.com → API Keys',
    note: 'La mejor calidad de respuesta y de lectura de pantalla.',
  },
  {
    id: 'gemini' as const,
    secret: 'google' as const,
    label: 'Gemini (Google)',
    model: 'gemini-2.5-flash',
    where: 'aistudio.google.com → Get API key',
    note: 'Más barato, y la misma clave sirve para transcribir en directo.',
  },
  {
    id: 'openai' as const,
    secret: 'openai' as const,
    label: 'ChatGPT (OpenAI)',
    model: 'gpt-5.6-terra',
    where: 'platform.openai.com → API keys',
    note: 'Si ya pagas OpenAI. Responde, pero no transcribe: eso pide otra clave.',
  },
];

function CloudStep({
  settings,
  presence,
  patch,
  saveSecret,
  onDone,
  onBack,
}: {
  settings: Settings;
  presence: SecretsPresence;
  patch: (p: Partial<Settings>) => Promise<void>;
  saveSecret: (key: SecretKey, value: string) => Promise<void>;
  onDone: () => void;
  onBack: () => void;
}) {
  const [choice, setChoice] = useState(CLOUD_PROVIDERS[0]!);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Se indexa por la clave del propio proveedor y no con una cadena de
  // ternarios: con dos proveedores aquello se leía, con el tercero ya era una
  // rama que hay que actualizar cada vez y que no avisa cuando se olvida.
  const alreadyThere = presence[choice.secret];

  const apply = async (): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      if (key.trim()) await saveSecret(choice.secret, key.trim());

      /*
       * Se deja el proveedor puesto ANTES de probar: `testConnection` usa el
       * proveedor activo de los ajustes, así que probar antes de guardarlo
       * comprobaría el anterior y diría que todo va bien mientras la clave
       * nueva sigue sin validar.
       */
      /*
       * Se fusiona con lo que ya hubiera. La primera versión reescribía el mapa
       * entero y borraba el modelo de Ollama de quien pasara por aquí a probar
       * la nube: elegir un proveedor no es motivo para tirar la configuración
       * de los otros dos.
       */
      await patch({
        llmProviderId: choice.id,
        llmModels: { ...settings.llmModels, [choice.id]: choice.model },
      });

      const result = await window.api.llm.testConnection();
      if (!result.ok) {
        setError(result.error ?? 'La conexión falló.');
        return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="wiz__lead">
        Elige el proveedor y pega su clave. Se guarda cifrada en tu perfil de Windows y no se
        muestra de vuelta.
      </p>

      <div className="wiz__choices">
        {CLOUD_PROVIDERS.map((provider) => (
          <button
            key={provider.id}
            className={`choice${choice.id === provider.id ? ' choice--on' : ''}`}
            onClick={() => setChoice(provider)}
          >
            <span className="choice__title">{provider.label}</span>
            <span className="choice__note">{provider.note}</span>
          </button>
        ))}
      </div>

      <label className="wiz__label" htmlFor="wiz-key">
        API key {alreadyThere && <span className="badge badge--ok">ya tienes una</span>}
      </label>
      <div className="field">
        <input
          id="wiz-key"
          type="password"
          value={key}
          placeholder={alreadyThere ? 'Déjalo vacío para usar la que ya guardaste' : 'Pega aquí la clave'}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (key.trim() || alreadyThere)) void apply();
          }}
        />
      </div>
      <p className="wiz__note">Dónde sacarla: {choice.where}</p>

      {error && <div className="warn">{error}</div>}

      <div className="field wiz__actions">
        <button className="btn" onClick={onBack} disabled={busy}>
          Atrás
        </button>
        <button
          className="btn btn--primary"
          disabled={busy || (!key.trim() && !alreadyThere)}
          onClick={() => void apply()}
        >
          {busy ? 'Probando la clave…' : 'Guardar y probar'}
        </button>
      </div>
    </>
  );
}

// ──────────────────────────── 2b · Camino local ────────────────────────────

/**
 * Instalar Ollama y bajar los modelos que le pegan a este equipo.
 *
 * Los modelos salen de `adviseLocalModels`, que ya existía para la tarjeta del
 * dashboard: el mismo criterio, aplicado sin que nadie tenga que leerlo. Se
 * descargan **dos** porque conversar y leer la pantalla piden cosas distintas —
 * uno rápido y uno con visión—, que es la conclusión que este proyecto ya había
 * sacado y que un usuario nuevo no tiene forma de saber.
 */
function LocalStep({
  settings,
  specs,
  patch,
  onDone,
  onBack,
}: {
  settings: Settings;
  specs: SystemSpecs | null;
  patch: (p: Partial<Settings>) => Promise<void>;
  onDone: () => void;
  onBack: () => void;
}) {
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState<SetupProgress | null>(null);
  const [error, setError] = useState('');

  const check = useCallback((): void => {
    void window.api.ollama.getStatus().then((status) => setReachable(status.reachable));
  }, []);

  useEffect(() => {
    check();
    void window.api.setup.canInstall().then(setCanInstall);
    return window.api.setup.onProgress(setProgress);
  }, [check]);

  const install = async (): Promise<void> => {
    setBusy('Instalando Ollama…');
    setError('');
    try {
      const result = await window.api.setup.installOllama();
      if (!result.ok) {
        setError(result.error ?? 'No se pudo instalar.');
        return;
      }
      setReachable(true);
    } finally {
      setBusy('');
      setProgress(null);
    }
  };

  const advice = specs ? adviseLocalModels(specs) : null;

  const download = async (): Promise<void> => {
    if (!advice) return;
    setBusy('Descargando modelos…');
    setError('');
    try {
      for (const model of [advice.chat.model, advice.vision.model]) {
        const result = await window.api.setup.pullModel(model);
        if (!result.ok) {
          setError(result.error ?? `No se pudo descargar ${model}.`);
          return;
        }
      }

      /*
       * Los dos papeles quedan separados desde el primer día: el de conversar
       * pide latencia y el de la pantalla pide vista.
       *
       * Se fusiona con lo que ya hubiera, por lo mismo que en el camino de la
       * nube: elegir local no es motivo para borrar el modelo que alguien tenía
       * elegido en Claude, Gemini o ChatGPT. La versión anterior escribía el
       * mapa entero a mano, así que además había que acordarse de añadirle una
       * clave con cada proveedor nuevo — y el `as` la dejaba pasar callando.
       */
      await patch({
        llmProviderId: 'ollama',
        llmModels: { ...settings.llmModels, ollama: advice.chat.model },
        screenProviderId: 'ollama',
        screenModel: advice.vision.model,
      });
      onDone();
    } finally {
      setBusy('');
      setProgress(null);
    }
  };

  const pct =
    progress?.totalBytes && progress.totalBytes > 0
      ? Math.round(((progress.receivedBytes ?? 0) / progress.totalBytes) * 100)
      : null;

  return (
    <>
      {reachable === false && (
        <>
          <p className="wiz__lead">
            Ollama es el programa que ejecuta los modelos en tu equipo. No lo tienes instalado.
          </p>
          {canInstall ? (
            <>
              <p className="wiz__note">
                Lo instalo con <code>winget</code>, el gestor de paquetes de Windows — así no
                descargo ningún ejecutable por mi cuenta. Windows te pedirá permiso con su propio
                aviso.
              </p>
              <div className="field wiz__actions">
                <button className="btn" onClick={onBack} disabled={Boolean(busy)}>
                  Atrás
                </button>
                <button className="btn btn--primary" disabled={Boolean(busy)} onClick={() => void install()}>
                  {busy || 'Instalar Ollama'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="warn">
                Este equipo no tiene <code>winget</code>, así que no puedo instalarlo sin
                descargarme un ejecutable por mi cuenta — y eso no lo voy a hacer. Instálalo desde{' '}
                <strong>ollama.com/download</strong> y pulsa «Volver a comprobar».
              </div>
              <div className="field wiz__actions">
                <button className="btn" onClick={onBack}>
                  Atrás
                </button>
                <button className="btn btn--primary" onClick={check}>
                  Volver a comprobar
                </button>
              </div>
            </>
          )}
        </>
      )}

      {reachable === true && advice && (
        <>
          <p className="wiz__lead">
            Ollama está listo. Estos son los dos modelos que le pegan a tu equipo: uno para
            conversar y otro para leer la pantalla.
          </p>

          <div className="wiz__models">
            <div className="wizmodel">
              <span className="wizmodel__role">Para conversar</span>
              <code className="wizmodel__id">{advice.chat.model}</code>
              <span className="wizmodel__note">{advice.chat.note}</span>
            </div>
            <div className="wizmodel">
              <span className="wizmodel__role">Para leer la pantalla</span>
              <code className="wizmodel__id">{advice.vision.model}</code>
              <span className="wizmodel__note">{advice.vision.note}</span>
            </div>
          </div>

          <div className="warn">{advice.caveat}</div>

          <p className="wiz__note">
            Son varios GB entre los dos y se descargan una sola vez. Verás el tamaño exacto en
            cuanto empiece.
          </p>

          {busy && (
            <div className="progress">
              <div className="progress__label">
                {progress?.model ? `${progress.model} — ` : ''}
                {progress?.message ?? busy}
                {pct !== null ? ` · ${pct}%` : ''}
              </div>
              <div className="progress__bar">
                <div className="progress__fill" style={{ width: `${pct ?? 0}%` }} />
              </div>
            </div>
          )}

          {error && <div className="warn">{error}</div>}

          <div className="field wiz__actions">
            <button className="btn" onClick={onBack} disabled={Boolean(busy)}>
              Atrás
            </button>
            <button className="btn btn--primary" disabled={Boolean(busy)} onClick={() => void download()}>
              {busy ? 'Descargando…' : 'Descargar y configurar'}
            </button>
          </div>
        </>
      )}

      {reachable === null && <p className="wiz__lead">Buscando Ollama en tu equipo…</p>}
    </>
  );
}

// ────────────────────────────── 3 · Voz a texto ──────────────────────────────

/**
 * El paso que se olvida.
 *
 * Un usuario que pega una clave de Claude y da por terminada la configuración se
 * queda con la app **muda**: el motor de transcripción por defecto es Gemini
 * Live, que necesita una clave de Google que esa persona no tiene. El síntoma es
 * el peor posible —escucha encendida, medidores moviéndose y ni una palabra
 * transcrita— así que aquí se resuelve de una vez, eligiendo un motor que de
 * verdad pueda funcionar con lo que hay configurado.
 */
function VoiceStep({
  settings,
  presence,
  patch,
  onDone,
}: {
  settings: Settings;
  presence: SecretsPresence;
  patch: (p: Partial<Settings>) => Promise<void>;
  onDone: () => void;
}) {
  const [status, setStatus] = useState({ binaryInstalled: false, modelInstalled: false });
  const [progress, setProgress] = useState<WhisperProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void window.api.whisper.getStatus().then(setStatus);
    return window.api.whisper.onProgress(setProgress);
  }, []);

  const ready = status.binaryInstalled && status.modelInstalled;
  const canUseGemini = presence.google;

  const pickGemini = async (): Promise<void> => {
    await patch({ sttProviderId: 'gemini-live' });
    onDone();
  };

  const pickWhisper = async (): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      if (!ready) {
        const result = await window.api.whisper.install();
        if (!result.ok) {
          setError(result.error ?? 'Falló la descarga.');
          return;
        }
      }
      await patch({ sttProviderId: 'whisper-local' });
      onDone();
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const pct =
    progress && progress.totalBytes > 0
      ? Math.round((progress.receivedBytes / progress.totalBytes) * 100)
      : null;

  return (
    <>
      <p className="wiz__lead">
        Para saber qué te preguntan hay que convertir el audio en texto. Dos formas, y la
        diferencia es dónde va tu voz.
      </p>

      <div className="wiz__choices">
        <button className="choice" disabled={!canUseGemini} onClick={() => void pickGemini()}>
          <span className="choice__title">Gemini Live · ~300 ms</span>
          <span className="choice__note">
            {canUseGemini
              ? 'Lo más rápido. Usa la clave de Google que ya has puesto; el audio se envía a Google.'
              : 'Necesita una clave de Google, y no has configurado ninguna.'}
          </span>
        </button>

        <button className="choice" disabled={busy} onClick={() => void pickWhisper()}>
          <span className="choice__title">Whisper local · ~1–2 s</span>
          <span className="choice__note">
            {ready
              ? 'Ya instalado. Funciona sin conexión y tu voz no sale del equipo.'
              : 'Tu voz no sale del equipo. Hay que descargar unos 150 MB una sola vez.'}
          </span>
        </button>
      </div>

      {busy && (
        <div className="progress">
          <div className="progress__label">
            {progress?.target === 'binary' ? 'Ejecutable' : 'Modelo'}
            {pct !== null ? ` — ${pct}%` : ''}
          </div>
          <div className="progress__bar">
            <div className="progress__fill" style={{ width: `${pct ?? 0}%` }} />
          </div>
        </div>
      )}

      {error && <div className="warn">{error}</div>}

      {settings.sttProviderId === 'gemini-live' && !canUseGemini && (
        <div className="warn">
          Ahora mismo está puesto Gemini Live y no hay clave de Google: si sales sin elegir, la app
          no transcribirá nada.
        </div>
      )}
    </>
  );
}

// ─────────────────────────────── 4 · Contexto ───────────────────────────────

/**
 * El CV, que es lo que separa una respuesta correcta de una tuya.
 *
 * Se puede saltar —quien viene a probar la app no tiene por qué pegar su vida
 * laboral en el primer minuto— pero se explica qué se pierde, porque el modelo
 * tiene **prohibido** inventarse experiencia y sin esto las respuestas salen
 * genéricas sin que se entienda por qué.
 */
function ContextStep({
  settings,
  patch,
  onDone,
}: {
  settings: Settings;
  patch: (p: Partial<Settings>) => Promise<void>;
  onDone: () => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (): Promise<void> => {
    setBusy(true);
    try {
      if (text.trim()) {
        await patch({
          contextPacks: [
            ...settings.contextPacks,
            {
              id: crypto.randomUUID(),
              name: CONTEXT_KIND_LABEL.cv,
              content: text.trim(),
              enabled: true,
              kind: 'cv',
              profiles: [settings.promptProfileId],
            },
          ],
        });
      }
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="wiz__lead">
        Pega tu CV, o un resumen: empresas, años, tecnologías, logros con cifras. Es la única
        fuente de datos concretos sobre ti que el modelo puede citar.
      </p>
      <p className="wiz__note">
        Sin esto las respuestas son correctas pero genéricas — el modelo tiene prohibido inventarse
        experiencia. Puedes dejarlo para luego y pegarlo en «Contexto».
      </p>

      <textarea
        placeholder="Pega tu CV o un resumen de tu experiencia…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ minHeight: 200 }}
      />

      <div className="field wiz__actions">
        <button className="btn" onClick={onDone} disabled={busy}>
          Ahora no
        </button>
        <button className="btn btn--primary" disabled={busy || !text.trim()} onClick={() => void save()}>
          Guardar y terminar
        </button>
      </div>
    </>
  );
}

// ──────────────────────────────── 5 · Listo ────────────────────────────────

function DoneStep({
  settings,
  patch,
  onClose,
}: {
  settings: Settings;
  patch: (p: Partial<Settings>) => Promise<void>;
  onClose: () => void;
}) {
  const finish = (): void => {
    void patch({ onboardingDone: true }).then(onClose);
  };

  const model = settings.llmModels[settings.llmProviderId];

  return (
    <>
      <p className="wiz__lead">Ya está todo puesto. Esto es lo que ha quedado configurado:</p>

      <ul className="wiz__summary">
        <li>
          <Icon name="check" size={15} /> Responde <strong>{model || settings.llmProviderId}</strong>{' '}
          ({settings.llmProviderId})
        </li>
        <li>
          <Icon name="check" size={15} /> Transcribe{' '}
          <strong>{STT_LABEL[settings.sttProviderId]}</strong>
        </li>
        <li>
          <Icon name="check" size={15} />{' '}
          {settings.contextPacks.some((pack) => pack.kind === 'cv' && pack.content.trim())
            ? 'Tu CV está cargado'
            : 'Sin CV: las respuestas serán genéricas hasta que lo pegues en «Contexto»'}
        </li>
      </ul>

      <p className="wiz__note">
        El overlay ya está en pantalla, arriba a la derecha. Pulsa el punto de la izquierda para
        empezar a escuchar, o <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd> para resolver lo que
        tengas en pantalla. Todo esto se cambia luego desde este mismo dashboard.
      </p>

      <div className="field wiz__actions">
        <button className="btn btn--primary" onClick={finish}>
          Empezar a usar la app
        </button>
      </div>
    </>
  );
}

const STT_LABEL: Record<Settings['sttProviderId'], string> = {
  'gemini-live': 'Gemini Live (en la nube)',
  'gemini-audio': 'Gemini audio directo',
  'openai-live': 'OpenAI en directo (en la nube)',
  'openai-transcribe': 'OpenAI por turnos (en la nube)',
  'whisper-local': 'Whisper local (sin conexión)',
};

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WhisperProgress } from '@shared/ipc';
import {
  adviseLocalModels,
  autoTriggerIsInert,
  clampFontScale,
  CONTEXT_KIND_LABEL,
  DEFAULT_HOTKEYS,
  FONT_SCALE,
  HOTKEY_LABEL,
  packsForProfile,
  PROFILE_SLOTS,
  screenModelFor,
  speakersFor,
} from '@shared/types';
import { acceleratorFromEvent, duplicateAccelerators, formatAccelerator } from '@shared/accelerator';
import type {
  AudioLevels,
  CaptureStatus,
  ContextPack,
  Conversation,
  ConversationSummary,
  HotkeyMap,
  LLMProviderId,
  ModelInfo,
  OllamaStatus,
  SecretKey,
  SecretsPresence,
  Settings,
  SystemSpecs,
  ContextKind,
} from '@shared/types';

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className="switch"
      data-on={on}
      aria-pressed={on}
      onClick={() => onChange(!on)}
    >
      <span className="switch__knob" />
    </button>
  );
}

function Row({
  label,
  desc,
  children,
}: {
  label: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="row">
      <div>
        <div className="row__label">{label}</div>
        {desc && <div className="row__desc">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

/**
 * Campo de API key. El valor guardado nunca se lee de vuelta — el main sólo
 * informa si existe o no. Por eso el input siempre arranca vacío y escribir
 * algo nuevo sobrescribe lo anterior.
 */
function SecretField({
  label,
  hint,
  present,
  onSave,
  onClear,
}: {
  label: string;
  hint: string;
  present: boolean;
  onSave: (value: string) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (): Promise<void> => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await onSave(draft);
      setDraft('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="row__label">{label}</span>
        <span className={present ? 'badge badge--ok' : 'badge badge--missing'}>
          {present ? 'configurada' : 'sin configurar'}
        </span>
      </div>
      <div className="row__desc">{hint}</div>
      <div className="field">
        <input
          type="password"
          value={draft}
          placeholder={present ? '•••••••• (escribe para reemplazar)' : 'Pega tu API key'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
          }}
        />
        <button className="btn" disabled={busy || !draft.trim()} onClick={() => void save()}>
          Guardar
        </button>
        {present && (
          <button className="btn btn--danger" disabled={busy} onClick={() => void onClear()}>
            Borrar
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Panel de captura. Además de ser el control de encendido, es el instrumento
 * que permite comprobar de un vistazo que los DOS streams llegan por separado:
 * si al hablar sólo se mueve "Yo" y al reproducir un vídeo sólo se mueve
 * "Ellos", el pipeline está bien.
 */
function CaptureCard({ status, levels }: { status: CaptureStatus; levels: AudioLevels }) {
  const [busy, setBusy] = useState(false);
  const listening = status.state === 'listening';

  const toggle = async (): Promise<void> => {
    setBusy(true);
    try {
      if (listening) await window.api.capture.stop();
      else await window.api.capture.start();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" id="capture">
      <h2 className="card__title">Captura de audio</h2>
      <p className="card__hint">
        Dos fuentes independientes: tu micrófono y la salida del sistema. Mantenerlas separadas es lo
        que permite distinguir quién habla sin diarización.
      </p>

      <Row
        label={listening ? 'Escuchando' : 'En pausa'}
        desc={
          status.state === 'error'
            ? (status.error ?? 'Error desconocido')
            : `Micrófono: ${status.micActive ? 'activo' : 'inactivo'} · Sistema: ${
                status.loopbackActive ? 'activo' : 'inactivo'
              }`
        }
      >
        <button className="btn" disabled={busy || status.state === 'starting'} onClick={() => void toggle()}>
          {status.state === 'starting' ? 'Iniciando…' : listening ? 'Detener' : 'Empezar a escuchar'}
        </button>
      </Row>

      <div className="meters">
        <div className="meter">
          <span className="meter__label">Yo (micrófono)</span>
          <div className="meter__bar">
            <div className="meter__fill" style={{ width: `${Math.min(levels.me * 140, 100)}%` }} />
          </div>
        </div>
        <div className="meter">
          <span className="meter__label">Ellos (sistema)</span>
          <div className="meter__bar">
            <div
              className="meter__fill meter__fill--them"
              style={{ width: `${Math.min(levels.them * 140, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export function DashboardApp() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [presence, setPresence] = useState<SecretsPresence>({ anthropic: false, google: false });
  const [status, setStatus] = useState<CaptureStatus>({
    state: 'idle',
    micActive: false,
    loopbackActive: false,
  });
  const [levels, setLevels] = useState<AudioLevels>({ me: 0, them: 0 });

  useEffect(() => {
    const { api } = window;
    void api.settings.get().then(setSettings);
    void api.secrets.getPresence().then(setPresence);
    void api.capture.getStatus().then(setStatus);

    const unsubs = [
      api.settings.onChange(setSettings),
      api.capture.onStatus(setStatus),
      api.capture.onLevels(setLevels),
    ];
    return () => unsubs.forEach((off) => off());
  }, []);

  const patch = useCallback(async (p: Partial<Settings>): Promise<void> => {
    setSettings(await window.api.settings.update(p));
  }, []);

  const saveSecret = useCallback(async (key: SecretKey, value: string): Promise<void> => {
    setPresence(await window.api.secrets.set(key, value));
  }, []);

  const clearSecret = useCallback(async (key: SecretKey): Promise<void> => {
    setPresence(await window.api.secrets.clear(key));
  }, []);

  if (!settings) return <div className="shell">Cargando…</div>;

  return (
    <div className="shell">
      <h1 className="shell__title">Interview Helper</h1>
      <p className="shell__subtitle">
        Asistente de IA en tiempo real. Configuración local; nada se sube a ningún servidor propio.
      </p>

      {/* Arriba del todo mientras haga falta: es lo que hay que hacer ANTES de
          tocar nada de lo demás. */}
      {!settings.onboardingDone && (
        <OnboardingCard
          settings={settings}
          presence={presence}
          status={status}
          patch={patch}
        />
      )}

      <CaptureCard status={status} levels={levels} />

      <section className="card">
        <h2 className="card__title">Visibilidad</h2>
        <p className="card__hint">
          Controla si el overlay aparece cuando compartes pantalla o grabas.
        </p>

        <Row
          label="Modo invisible"
          desc="Activado, el overlay se excluye de la captura de pantalla a nivel del compositor de Windows. Desactívalo para grabar demos o depurar la interfaz."
        >
          <Switch
            on={settings.stealthEnabled}
            onChange={(v) => {
              void window.api.window.setStealth(v);
            }}
          />
        </Row>

        <Row
          label="Clics atravesables"
          desc="El overlay ignora el ratón y los clics llegan a la ventana de abajo. Recomendado durante una llamada."
        >
          <Switch
            on={settings.clickThrough}
            onChange={(v) => {
              void window.api.window.setClickThrough(v);
            }}
          />
        </Row>

        {/*
          La opacidad y el tamaño de letra existían en `Settings` y sólo se
          podían tocar editando el JSON: el overlay los aplicaba pero nadie
          tenía cómo cambiarlos.
        */}
        <Row
          label="Opacidad del overlay"
          desc="Bajarla deja entrever lo que hay debajo. Por debajo del 60 % el texto empieza a costar de leer sobre fondos claros."
        >
          <div className="slider">
            <input
              type="range"
              min={0.3}
              max={1}
              step={0.05}
              value={settings.overlayOpacity}
              onChange={(e) => void patch({ overlayOpacity: Number(e.target.value) })}
            />
            <span className="slider__value">{Math.round(settings.overlayOpacity * 100)} %</span>
          </div>
        </Row>

        <Row
          label="Tamaño del texto"
          desc="Afecta a la respuesta, al código y a la transcripción; los controles se quedan igual. Los tamaños S/M/L/XL agrandan la ventana, no la letra: esto es lo que hace falta en un monitor 4K."
        >
          <div className="slider">
            <input
              type="range"
              min={FONT_SCALE.min}
              max={FONT_SCALE.max}
              step={FONT_SCALE.step}
              value={settings.overlayFontScale}
              onChange={(e) =>
                void patch({ overlayFontScale: clampFontScale(Number(e.target.value)) })
              }
            />
            <span className="slider__value">{Math.round(settings.overlayFontScale * 100)} %</span>
          </div>
        </Row>

        <Row
          label="Modo compacto"
          desc="Deja sólo la respuesta: pliega los perfiles, la transcripción y el pie de atajos. También se activa con el botón de plegar del overlay."
        >
          <Switch
            on={settings.overlayCompact}
            onChange={(v) => void patch({ overlayCompact: v })}
          />
        </Row>

        {!settings.stealthEnabled && (
          <div className="warn">
            El modo invisible está desactivado: el overlay <strong>sí</strong> aparecerá si
            compartes pantalla.
          </div>
        )}

        <div className="warn">
          <strong>Qué protege y qué no.</strong> El modo invisible excluye la ventana del pipeline
          de captura (screen share, OBS, grabadores). No te protege de una cámara apuntando a la
          pantalla, no oculta el proceso frente a software de proctoring que enumere ventanas, y no
          oculta lo que digas por el micrófono.
        </div>
      </section>

      <section className="card" id="keys">
        <h2 className="card__title">API keys</h2>
        <p className="card__hint">
          Se guardan cifradas con DPAPI en tu perfil de Windows y sólo las lee el proceso principal.
          Nunca se muestran de vuelta ni salen de esta máquina salvo hacia el proveedor que elijas.
        </p>

        <SecretField
          label="Anthropic (Claude)"
          hint="console.anthropic.com → API Keys"
          present={presence.anthropic}
          onSave={(v) => saveSecret('anthropic', v)}
          onClear={() => clearSecret('anthropic')}
        />
        <SecretField
          label="Google (Gemini)"
          hint="aistudio.google.com → Get API key. Necesaria también para la transcripción con Gemini Live."
          present={presence.google}
          onSave={(v) => saveSecret('google', v)}
          onClear={() => clearSecret('google')}
        />
      </section>

      <ModelCard settings={settings} patch={patch} />
      {/* Justo detrás del modelo de respuestas: se lee como "y para la pantalla,
          esto otro", que es exactamente la decisión que hay que tomar ahí. */}
      <ScreenModelCard settings={settings} patch={patch} />
      <LocalModelGuide />
      <TranscriptionCard settings={settings} patch={patch} />
      <BehaviourCard settings={settings} patch={patch} />
      {/* El contexto va ANTES del historial: es lo que se toca antes de cada
          reunión, mientras que el historial se consulta de vez en cuando. Y
          además el historial crece, así que dejarlo delante obligaba a bajar
          media pantalla para llegar a lo que sí se edita a menudo. */}
      <ContextCard settings={settings} patch={patch} />
      <HistoryCard settings={settings} patch={patch} />
      <HotkeysCard settings={settings} patch={patch} />
      <DiagnosticsCard />

      {/* La guía se puede recuperar: esconderla no debería ser irreversible. */}
      {settings.onboardingDone && (
        <button
          className="btn btn--ghost"
          onClick={() => void patch({ onboardingDone: false })}
        >
          Volver a ver los primeros pasos
        </button>
      )}
    </div>
  );
}

// ───────────────────── Modelo para las acciones de pantalla ─────────────────────

/**
 * Con qué se resuelven el código y los tests de la pantalla.
 *
 * Antes había un solo modelo para todo, y las dos tareas piden cosas opuestas:
 * lo hablado necesita **latencia**, porque la respuesta se lee mientras alguien
 * te mira; lo de la pantalla necesita **vista y cabeza**, porque hay que leer un
 * enunciado en una captura y no equivocarse. Un modelo local pequeño sirve para
 * lo primero y no para lo segundo; uno grande de pago, al revés, es caro para
 * cada frase suelta de una reunión.
 */
function ScreenModelCard({ settings, patch }: { settings: Settings; patch: PatchFn }) {
  /*
   * El resultado se guarda JUNTO al proveedor que lo pidió, y se descarta por
   * comparación al pintar. Es el mismo patrón que el selector principal, y por
   * la misma razón: la lista de Ollama viaja por red, el usuario puede cambiar
   * de proveedor mientras llega, y una respuesta lenta del anterior pintaría
   * los modelos equivocados. Guardar el par también evita tener que limpiar el
   * estado dentro del efecto, que es lo que caza `set-state-in-effect`.
   */
  const [loaded, setLoaded] = useState<{ providerId: string; list: ModelInfo[] }>({
    providerId: '',
    list: [],
  });
  const provider = settings.screenProviderId;
  const target = screenModelFor(settings);

  useEffect(() => {
    if (provider === 'same') return;
    let live = true;
    void window.api.llm
      .listModelsFor(provider)
      .then((list) => {
        if (live) setLoaded({ providerId: provider, list });
      })
      .catch(() => {
        if (live) setLoaded({ providerId: provider, list: [] });
      });
    return () => {
      live = false;
    };
  }, [provider]);

  const models = loaded.providerId === provider ? loaded.list : [];

  const chosen = models.find((m) => m.id === target.model);
  const blind = chosen && !chosen.supportsVision;

  return (
    <section className="card" id="screen-model">
      <h2 className="card__title">Modelo para la pantalla</h2>
      <p className="card__hint">
        El que resuelve <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd> (código) y{' '}
        <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Q</kbd> (tests). Puede ser distinto del que responde a
        lo que se habla: aquello pide rapidez, y esto pide leer bien una captura.{' '}
        <strong>Tiene que admitir imágenes.</strong>
      </p>

      <Row
        label="Proveedor"
        desc="«El mismo» usa el modelo de respuestas de arriba, que es como funcionaba antes."
      >
        <select
          value={provider}
          onChange={(e) =>
            void patch({
              screenProviderId: e.target.value as Settings['screenProviderId'],
              // Cambiar de proveedor invalida el modelo elegido: los ids no se
              // parecen en nada entre Claude, Gemini y Ollama.
              screenModel: '',
            })
          }
        >
          <option value="same">El mismo que para responder</option>
          <option value="claude">Claude (nube)</option>
          <option value="gemini">Gemini (nube)</option>
          <option value="ollama">Ollama (local)</option>
        </select>
      </Row>

      {provider !== 'same' && (
        <Row
          label="Modelo"
          desc={
            models.length === 0
              ? 'Sin modelos disponibles. Si es Ollama, comprueba que el servidor está corriendo.'
              : 'Sólo los que admiten imágenes pueden leer tu pantalla.'
          }
        >
          <select
            value={target.model}
            onChange={(e) => void patch({ screenModel: e.target.value })}
          >
            {/* Un select controlado necesita SIEMPRE una option con su valor, o
                el navegador pinta la primera como elegida sin disparar onChange
                y la UI miente. Ya costó un rato una vez. */}
            {!models.some((m) => m.id === target.model) && (
              <option value={target.model}>{target.model || '— elige un modelo —'}</option>
            )}
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
                {model.supportsVision ? ' · ve imágenes' : ' · sin visión'}
              </option>
            ))}
          </select>
        </Row>
      )}

      {blind && (
        <div className="warn">
          <strong>{target.model}</strong> no admite imágenes, así que no puede leer la pantalla:
          los botones de código y de test fallarán con un aviso en lugar de responder. Elige un
          multimodal — con Ollama, <code>qwen2.5vl</code>, <code>llava</code> o{' '}
          <code>gemma3</code>.
        </div>
      )}

      {provider === 'same' && settings.llmProviderId === 'ollama' && (
        <div className="warn">
          Estás usando Ollama para todo. Si el modelo elegido no ve imágenes, las acciones de
          pantalla no funcionarán: aquí es donde conviene separarlas y dejar un multimodal sólo
          para esto.
        </div>
      )}
    </section>
  );
}

// ─────────────────────── Guía de modelos locales ───────────────────────

/**
 * Qué modelo local pedirle a esta máquina.
 *
 * La pregunta no tiene respuesta genérica —el mismo modelo es instantáneo con
 * GPU y tarda un minuto sin ella— y equivocarse cuesta una descarga de varios
 * gigas. Se mide lo que se puede medir y se dice claramente lo que no: la VRAM,
 * que es lo que de verdad decide si un modelo cabe en la tarjeta, no se puede
 * leer de forma fiable desde aquí.
 */
function LocalModelGuide() {
  const [specs, setSpecs] = useState<SystemSpecs | null>(null);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    void window.api.system.getSpecs().then(setSpecs);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(''), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!specs) return null;

  const advice = adviseLocalModels(specs);
  const pull = (model: string): void => {
    void window.api.clipboard.write(`ollama pull ${model}`).then(() => setCopied(model));
  };

  return (
    <section className="card" id="local-models">
      <h2 className="card__title">Qué modelo local le pega a tu equipo</h2>
      <p className="card__hint">
        Ollama no cuesta dinero y no envía nada fuera de tu máquina, pero elegir mal cuesta una
        descarga de varios gigas para acabar con respuestas de un minuto. Esto es lo que encaja con
        lo que tienes.
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

      <p className="card__hint" style={{ marginTop: 12, marginBottom: 4 }}>
        {advice.tier}
      </p>

      <Row label="Para conversar" desc={advice.chat.note}>
        <button className="btn btn--small" onClick={() => pull(advice.chat.model)}>
          {copied === advice.chat.model ? '¡copiado!' : `ollama pull ${advice.chat.model}`}
        </button>
      </Row>

      <Row label="Para leer la pantalla" desc={advice.vision.note}>
        <button className="btn btn--small" onClick={() => pull(advice.vision.model)}>
          {copied === advice.vision.model ? '¡copiado!' : `ollama pull ${advice.vision.model}`}
        </button>
      </Row>

      <div className="warn">{advice.caveat}</div>

      <p className="card__hint" style={{ marginTop: 12, marginBottom: 0 }}>
        La VRAM de la tarjeta gráfica —el dato que de verdad decide si un modelo va rápido— no se
        puede leer de forma fiable desde aquí, así que <strong>no se estima</strong>: estas
        recomendaciones se basan en la RAM. Si el modelo no cabe en la GPU, Ollama lo reparte con
        la CPU y va mucho más lento, aunque quepa en memoria. Los nombres pueden cambiar con el
        tiempo; la lista viva está en <code>ollama.com/library</code>.
      </p>
    </section>
  );
}

// ──────────────────────────── Primeros pasos ────────────────────────────

/**
 * Qué hay que hacer para que la app sirva de algo, en orden y con su estado.
 *
 * El overlay ya avisaba de que faltaba un proveedor, pero eso sólo cubre el
 * primer paso de cuatro y no dice cuáles son los otros tres. Los dos que se
 * saltaba la gente son los que más se notan: **probar la conexión** —una clave
 * mal pegada no da síntomas hasta la primera pregunta, y entonces parece que
 * falla la app— y **pegar el CV**, sin el cual las respuestas salen correctas
 * pero genéricas, porque el modelo tiene prohibido inventarse experiencia.
 *
 * Desaparece sola al completarse, y se puede descartar: quien ya sabe lo que
 * hace no tiene por qué cargar con una lista de tareas encima de su
 * configuración para siempre.
 */
function OnboardingCard({
  settings,
  presence,
  status,
  patch,
}: {
  settings: Settings;
  presence: SecretsPresence;
  status: CaptureStatus;
  patch: PatchFn;
}) {
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState<{ ok: boolean; error?: string } | null>(null);

  const hasProvider =
    (settings.llmProviderId === 'ollama' && Boolean(settings.llmModels.ollama)) ||
    (settings.llmProviderId === 'claude' && presence.anthropic) ||
    (settings.llmProviderId === 'gemini' && presence.google);

  const hasContext = settings.contextPacks.some(
    (pack) => pack.enabled && pack.kind !== 'vocabulary' && pack.content.trim().length > 40
  );

  const listening = status.state === 'listening';
  const steps = [
    {
      done: hasProvider,
      title: 'Configura un proveedor de IA',
      desc: 'Pega tu clave de Anthropic o de Google. Ollama no necesita clave, pero sí que elijas un modelo.',
      action: { label: 'Ir a las claves', run: () => scrollToCard('keys') },
    },
    {
      done: tested?.ok === true,
      title: 'Comprueba que la clave funciona',
      desc:
        tested && !tested.ok
          ? (tested.error ?? 'Falló la conexión.')
          : 'Una clave mal pegada no da ningún síntoma hasta la primera pregunta, y entonces parece que la app está rota.',
      action: {
        label: testing ? 'Probando…' : 'Probar ahora',
        run: () => {
          setTesting(true);
          void window.api.llm
            .testConnection()
            .then(setTested)
            .finally(() => setTesting(false));
        },
      },
    },
    {
      done: hasContext,
      title: 'Pega tu CV o tus notas',
      desc: 'Es la única fuente de datos concretos sobre ti. Sin esto las respuestas son correctas pero genéricas: el modelo tiene prohibido inventarse experiencia.',
      action: { label: 'Ir al contexto', run: () => scrollToCard('context') },
    },
    {
      done: listening,
      title: 'Empieza a escuchar',
      desc: 'Comprueba que los medidores se mueven al hablar y al reproducir audio. Puedes hacerlo desde el propio overlay.',
      action: { label: 'Ir a la captura', run: () => scrollToCard('capture') },
    },
  ];

  const pending = steps.filter((step) => !step.done).length;

  return (
    <section className="card card--onboarding">
      <h2 className="card__title">
        Primeros pasos {pending === 0 ? '· todo listo' : `· faltan ${pending}`}
      </h2>
      <p className="card__hint">
        Cuatro cosas y ya está. Esta tarjeta desaparece cuando las completes.
      </p>

      <ol className="steps">
        {steps.map((step) => (
          <li key={step.title} className={`step${step.done ? ' step--done' : ''}`}>
            <span className="step__mark" aria-hidden="true">
              {step.done ? '✓' : ''}
            </span>
            <div className="step__body">
              <div className="step__title">{step.title}</div>
              <div className="step__desc">{step.desc}</div>
            </div>
            {!step.done && (
              <button className="btn btn--small" onClick={step.action.run}>
                {step.action.label}
              </button>
            )}
          </li>
        ))}
      </ol>

      <div className="row">
        <div>
          <div className="row__label">Ocultar esta guía</div>
          <div className="row__desc">
            Puedes volver a verla desde aquí mismo si algún día hace falta.
          </div>
        </div>
        <button className="btn" onClick={() => void patch({ onboardingDone: true })}>
          {pending === 0 ? 'Hecho' : 'Ocultar de todas formas'}
        </button>
      </div>
    </section>
  );
}

/** Lleva a la tarjeta correspondiente; el dashboard es una columna larga. */
function scrollToCard(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─────────────────────────────── Atajos ───────────────────────────────

/**
 * Un atajo, capturado pulsándolo.
 *
 * Se captura en lugar de escribirse porque el formato es de Electron
 * (`Control+Shift+S`) y nadie tiene por qué conocerlo; y porque teclear un
 * acelerador inválido no da error, sólo un atajo que no se registra.
 *
 * El `input` es de sólo lectura a propósito: lo que vale es la pulsación, no lo
 * que se pueda pegar dentro.
 */
function HotkeyField({
  action,
  accelerator,
  failed,
  duplicated,
  onChange,
}: {
  action: keyof HotkeyMap;
  accelerator: string;
  failed: boolean;
  duplicated: boolean;
  onChange: (accelerator: string) => void;
}) {
  const [capturing, setCapturing] = useState(false);
  const [rejected, setRejected] = useState(false);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    event.preventDefault();

    // Escape sale sin cambiar nada: hace falta una salida que no sea asignar
    // algo, porque el campo se traga todas las pulsaciones mientras captura.
    if (event.key === 'Escape') {
      setCapturing(false);
      setRejected(false);
      event.currentTarget.blur();
      return;
    }

    const next = acceleratorFromEvent(event);
    if (!next) {
      // Sólo se avisa si la tecla no era un modificador suelto: al componer
      // Ctrl+Shift+X pasas por "Ctrl" y por "Ctrl+Shift", y marcar eso como
      // error haría parpadear el aviso en cada intento legítimo.
      if (!['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) setRejected(true);
      return;
    }

    setRejected(false);
    setCapturing(false);
    onChange(next);
    event.currentTarget.blur();
  };

  return (
    <Row
      label={HOTKEY_LABEL[action]}
      desc={
        rejected
          ? 'Un atajo global necesita al menos Ctrl, Alt o Shift: sin modificador, esa tecla dejaría de funcionar en todo el sistema.'
          : failed
            ? 'Windows rechazó este atajo: otra aplicación ya lo tiene tomado. Elige otro.'
            : duplicated
              ? 'Repetido: dos acciones con el mismo atajo hacen que sólo funcione una.'
              : undefined
      }
    >
      <input
        type="text"
        readOnly
        className={`hotkey${failed || duplicated || rejected ? ' hotkey--bad' : ''}`}
        style={{ width: 190, flex: 'none' }}
        value={capturing ? 'Pulsa la combinación…' : formatAccelerator(accelerator)}
        onFocus={() => setCapturing(true)}
        onBlur={() => {
          setCapturing(false);
          setRejected(false);
        }}
        onKeyDown={onKeyDown}
      />
    </Row>
  );
}

/**
 * Los atajos, editables.
 *
 * `HotkeyMap` existía desde el principio y sólo se podía cambiar editando
 * `settings.json` a mano. No es un lujo: un acelerador global se lo quita a la
 * aplicación que tenga el foco, así que cualquier elección por defecto choca
 * con el editor, el juego o la distribución de teclado de alguien.
 */
function HotkeysCard({ settings, patch }: { settings: Settings; patch: PatchFn }) {
  const [failed, setFailed] = useState<string[]>([]);

  useEffect(() => {
    void window.api.hotkeys.getFailed().then(setFailed);
    return window.api.hotkeys.onFailures(setFailed);
  }, []);

  const duplicated = duplicateAccelerators(settings.hotkeys);
  const actions = Object.keys(HOTKEY_LABEL) as (keyof HotkeyMap)[];

  return (
    <section className="card">
      <h2 className="card__title">Atajos de teclado</h2>
      <p className="card__hint">
        Son <strong>globales</strong>: funcionan con el foco en la videollamada, y por eso se los
        quitan a la aplicación que lo tenga. Pulsa un campo y teclea la combinación que quieras.
      </p>

      {failed.length > 0 && (
        <div className="warn">
          {failed.length === 1 ? (
            <>
              Windows rechazó este atajo:{' '}
              <strong>{formatAccelerator(failed[0] ?? '')}</strong>. Otra aplicación lo tiene
              tomado, así que <strong>no hará nada</strong> hasta que elijas otro.
            </>
          ) : (
            <>
              Windows rechazó estos atajos:{' '}
              <strong>{failed.map(formatAccelerator).join(', ')}</strong>. Otra aplicación los
              tiene tomados, así que <strong>no harán nada</strong> hasta que elijas otros.
            </>
          )}
        </div>
      )}

      {actions.map((action) => (
        <HotkeyField
          key={action}
          action={action}
          accelerator={settings.hotkeys[action]}
          failed={failed.includes(settings.hotkeys[action])}
          duplicated={duplicated.has(settings.hotkeys[action])}
          onChange={(accelerator) =>
            void patch({ hotkeys: { ...settings.hotkeys, [action]: accelerator } })
          }
        />
      ))}

      <div className="row">
        <div>
          <div className="row__label">Restablecer</div>
          <div className="row__desc">Devuelve los diez atajos a sus valores de fábrica.</div>
        </div>
        <button className="btn" onClick={() => void patch({ hotkeys: DEFAULT_HOTKEYS })}>
          Valores por defecto
        </button>
      </div>
    </section>
  );
}

// ────────────────────────────── Diagnóstico ──────────────────────────────

/**
 * Logs y prueba del motor de transcripción.
 *
 * Existe porque en el `.exe` empaquetado **no había ningún sitio donde mirar**:
 * los `console.*` del main sólo se veían arrancando desde una terminal. Un fallo
 * de Gemini Live y una sala en silencio producían exactamente la misma pantalla.
 */
function DiagnosticsCard() {
  const [log, setLog] = useState('');
  const [location, setLocation] = useState('');
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; detail: string } | null>(null);

  const refresh = useCallback((): void => {
    void window.api.logs.read().then(setLog);
  }, []);

  useEffect(() => {
    refresh();
    void window.api.logs.location().then(setLocation);
  }, [refresh]);

  const runTest = async (): Promise<void> => {
    setTesting(true);
    setResult(null);
    try {
      // La prueba escribe en el log, así que se relee después: el detalle
      // completo (qué modelos se probaron y qué contestó cada uno) está ahí.
      setResult(await window.api.transcript.testConnection());
      refresh();
    } finally {
      setTesting(false);
    }
  };

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(log);
    setCopied(true);
    setTimeout(() => setCopied(false), 1_500);
  };

  return (
    <section className="card">
      <h2 className="card__title">Diagnóstico</h2>
      <p className="card__hint">
        Si algo no funciona, esto es lo que hay que mirar antes que nada. El registro se guarda en{' '}
        <code>{location || 'tu carpeta de datos'}</code>.
      </p>

      <Row
        label="Probar la transcripción"
        desc="Conecta de verdad con el motor configurado: con Gemini Live negocia el modelo, con Whisper ejecuta el binario sobre un audio de prueba."
      >
        <button className="btn" disabled={testing} onClick={() => void runTest()}>
          {testing ? 'Probando…' : 'Probar'}
        </button>
      </Row>

      {result && (
        <div className={result.ok ? 'diag diag--ok' : 'warn'}>
          <strong>{result.ok ? 'Funciona.' : 'Falló.'}</strong> {result.detail}
        </div>
      )}

      <div className="field" style={{ marginTop: 12 }}>
        <button className="btn" onClick={refresh}>
          Actualizar registro
        </button>
        <button className="btn" disabled={!log} onClick={() => void copy()}>
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>

      <pre className="logview">{log || 'Todavía no hay nada registrado en esta sesión.'}</pre>
    </section>
  );
}

// ────────────────────────────── Historial ──────────────────────────────

const dateFormat = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Historial de conversaciones.
 *
 * Esta tarjeta es la que hace visible que la app **sí** escribe en disco, algo
 * que durante toda su vida anterior no hacía. Por eso enseña la ruta exacta y
 * el botón de borrar todo está aquí y no escondido: si vas a guardar
 * transcripciones de otras personas, tienes que poder ver qué hay y quitarlo.
 */
function HistoryCard({ settings, patch }: { settings: Settings; patch: PatchFn }) {
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Conversation | null>(null);
  const [location, setLocation] = useState('');
  const [confirmingClear, setConfirmingClear] = useState(false);
  /**
   * Cuántas conversaciones se pintan de golpe.
   *
   * Pintarlas todas hacía que la página creciera sin techo: con cincuenta
   * conversaciones, cualquier ajuste que estuviera debajo quedaba a media
   * pantalla de scroll. Se enseñan las recientes, que son las que se consultan.
   */
  const [showAll, setShowAll] = useState(false);
  const VISIBLE = 5;

  const refresh = useCallback((): void => {
    void window.api.history.list().then(setItems);
  }, []);

  useEffect(() => {
    refresh();
    void window.api.history.location().then(setLocation);
    // Empezar una conversación nueva desde el overlay debe verse aquí sin
    // tener que cerrar y reabrir el dashboard.
    return window.api.history.onReset(refresh);
  }, [refresh]);

  // El detalle se pide bajo demanda: la lista sólo trae cabeceras, y cargar
  // cada transcripción completa para pintar una lista no tendría sentido.
  useEffect(() => {
    if (!openId) return;
    let cancelled = false;
    void window.api.history.get(openId).then((conversation) => {
      if (!cancelled) setDetail(conversation);
    });
    return () => {
      cancelled = true;
    };
  }, [openId]);

  const remove = async (id: string): Promise<void> => {
    setItems(await window.api.history.remove(id));
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
    }
  };

  const clearAll = async (): Promise<void> => {
    setItems(await window.api.history.clear());
    setOpenId(null);
    setDetail(null);
    setConfirmingClear(false);
  };

  return (
    <section className="card">
      <h2 className="card__title">Historial de conversaciones</h2>
      <p className="card__hint">
        Se guardan en tu máquina, en texto plano, y no se envían a ningún sitio. Incluyen la
        transcripción completa: eso significa lo que dijo la otra persona, no sólo lo que
        preguntaste tú.
      </p>

      <Row
        label="Guardar conversaciones"
        desc={
          settings.historyEnabled
            ? `Activo. Se escriben en ${location || 'tu carpeta de datos'}.`
            : 'Apagado. Nada toca el disco: la app vuelve a escuchar sin guardar.'
        }
      >
        <Switch
          on={settings.historyEnabled}
          onChange={(v) => void patch({ historyEnabled: v })}
        />
      </Row>

      {items.length === 0 && (
        <p className="card__hint" style={{ marginBottom: 0 }}>
          {settings.historyEnabled
            ? 'Todavía no hay ninguna conversación guardada.'
            : 'No hay nada guardado.'}
        </p>
      )}

      {(showAll ? items : items.slice(0, VISIBLE)).map((item) => (
        <div key={item.id} className="conv">
          <div className="conv__head">
            <button
              className="conv__title"
              onClick={() => setOpenId(openId === item.id ? null : item.id)}
            >
              <span className="conv__name">{item.title}</span>
              <span className="conv__meta">
                {dateFormat.format(item.startedAt)} · {item.turnCount} respuesta
                {item.turnCount === 1 ? '' : 's'} · {item.segmentCount} intervencion
                {item.segmentCount === 1 ? '' : 'es'}
              </span>
            </button>
            <button className="btn btn--danger" onClick={() => void remove(item.id)}>
              Borrar
            </button>
          </div>

          {openId === item.id && detail?.id === item.id && (
            <div className="conv__body">
              {detail.turns.map((turn) => (
                <div key={turn.id} className="turn">
                  <div className="turn__q">{turn.question || '(sin pregunta aislada)'}</div>
                  <div className={`turn__a${turn.error ? ' turn__a--error' : ''}`}>
                    {turn.error ?? turn.answer}
                  </div>
                  <div className="turn__meta">
                    {turn.providerId} · {turn.model} · {turn.trigger}
                  </div>
                </div>
              ))}

              {detail.segments.length > 0 && (
                <>
                  <div className="conv__subtitle">Transcripción</div>
                  <div className="conv__transcript">
                    {detail.segments.map((seg) => (
                      <div key={seg.id} className="conv__line">
                        <span className={`transcript-who transcript-who--${seg.speaker}`}>
                          {seg.speaker === 'me' ? 'Yo' : 'Ellos'}
                        </span>
                        <span>{seg.text}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      ))}

      {items.length > VISIBLE && (
        <div className="field">
          <button className="btn" onClick={() => setShowAll(!showAll)}>
            {showAll
              ? `Mostrar solo las ${VISIBLE} últimas`
              : `Ver las ${items.length} conversaciones`}
          </button>
        </div>
      )}

      {items.length > 0 && (
        <div className="field">
          {confirmingClear ? (
            <>
              <span className="row__desc" style={{ flex: 1 }}>
                Se borran las {items.length} conversaciones. No hay deshacer.
              </span>
              <button className="btn btn--danger" onClick={() => void clearAll()}>
                Sí, borrar todo
              </button>
              <button className="btn" onClick={() => setConfirmingClear(false)}>
                Cancelar
              </button>
            </>
          ) : (
            <button className="btn btn--danger" onClick={() => setConfirmingClear(true)}>
              Borrar todo el historial
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────── Modelo ───────────────────────────────

type PatchFn = (p: Partial<Settings>) => Promise<void>;

function ModelCard({ settings, patch }: { settings: Settings; patch: PatchFn }) {
  const provider = settings.llmProviderId;

  /**
   * El resultado se guarda junto al proveedor al que corresponde, y se descarta
   * por comparación al renderizar. Así se evita el bug de que un `listModels()`
   * lento del proveedor A resuelva después de cambiar a B y muestre los modelos
   * equivocados — y no hace falta limpiar el estado dentro del efecto.
   */
  const [loaded, setLoaded] = useState<{ provider: LLMProviderId; models: ModelInfo[] } | null>(
    null
  );
  const [tested, setTested] = useState<{
    provider: LLMProviderId;
    result: { ok: boolean; error?: string };
  } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.api.llm
      .listModels()
      .then(async (models) => {
        if (cancelled) return;
        setLoaded({ provider, models });

        // Si el modelo guardado no está entre los cargados, hay que PERSISTIR
        // uno. Un <select> controlado cuyo `value` no existe entre sus <option>
        // pinta la primera opción como elegida pero no dispara `onChange`: la
        // UI decía "llama3.2:3b" mientras los settings seguían con "", y cada
        // respuesta fallaba con "no hay ningún modelo seleccionado".
        const stored = await window.api.settings.get();
        const currentModel = stored.llmModels[provider];
        const first = models[0];
        if (!first || models.some((m) => m.id === currentModel)) return;
        // Se relee del main en lugar de usar el `settings` del render: entre
        // que se pidió la lista y llegó, el usuario ha podido tocar otro ajuste.
        await patch({ llmModels: { ...stored.llmModels, [provider]: first.id } });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ provider, models: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [provider, patch]);

  const models = loaded?.provider === provider ? loaded.models : [];
  const test = tested?.provider === provider ? tested.result : null;
  const selectedModel = settings.llmModels[provider];
  /** Mientras la lista carga (o si el modelo guardado ya no existe) el valor
   *  no está entre las opciones; sin este hueco el select mentiría. */
  const modelMissing = !models.some((m) => m.id === selectedModel);

  const runTest = async (): Promise<void> => {
    setBusy(true);
    try {
      setTested({ provider, result: await window.api.llm.testConnection() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2 className="card__title">Modelo de respuestas</h2>
      <p className="card__hint">Quién genera las sugerencias que ves en el overlay.</p>

      <Row label="Proveedor">
        <select
          value={settings.llmProviderId}
          onChange={(e) => void patch({ llmProviderId: e.target.value as LLMProviderId })}
        >
          <option value="claude">Claude (Anthropic)</option>
          <option value="gemini">Gemini (Google)</option>
          <option value="ollama">Ollama (local)</option>
        </select>
      </Row>

      <Row
        label="Modelo"
        desc={
          // El diagnóstico detallado lo da el panel de estado de abajo; aquí
          // solo se apunta hacia él para no decir lo mismo dos veces.
          provider === 'ollama' && models.length === 0
            ? 'Sin modelos disponibles. Mira el estado de Ollama más abajo.'
            : undefined
        }
      >
        <select
          value={modelMissing ? '' : selectedModel}
          disabled={models.length === 0}
          onChange={(e) =>
            void patch({
              llmModels: { ...settings.llmModels, [provider]: e.target.value },
            })
          }
        >
          {modelMissing && (
            <option value="">{models.length === 0 ? '—' : '— elige un modelo —'}</option>
          )}
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </Row>

      <div className="field">
        <button className="btn" disabled={busy} onClick={() => void runTest()}>
          {busy ? 'Probando…' : 'Probar conexión'}
        </button>
        {test && (
          <span className={test.ok ? 'badge badge--ok' : 'badge badge--missing'}>
            {test.ok ? 'conexión correcta' : (test.error ?? 'falló')}
          </span>
        )}
      </div>

      {/*
        La ventana de contexto se enseña si Ollama se usa PARA ALGO, aunque sea
        sólo para la pantalla: el recorte silencioso es igual de dañino ahí, y
        más difícil de sospechar, porque una captura ocupa muchos tokens.
      */}
      {(provider === 'ollama' || settings.screenProviderId === 'ollama') && (
        <Row
          label="Ventana de contexto de Ollama"
          desc="Ollama NO usa la del modelo: aplica 2048 tokens por defecto y descarta lo que no cabe SIN dar ningún error, empezando por el principio. El síntoma es que el modelo olvida lo que le acabas de decir. Subirlo gasta más memoria."
        >
          <select
            value={settings.ollamaContextTokens}
            onChange={(e) => void patch({ ollamaContextTokens: Number(e.target.value) })}
          >
            <option value={2048}>2048 · el defecto de Ollama</option>
            <option value={4096}>4096</option>
            <option value={8192}>8192 · recomendado</option>
            <option value={16384}>16384 · con CV largo o capturas</option>
            <option value={32768}>32768 · pide bastante memoria</option>
          </select>
        </Row>
      )}

      {provider === 'ollama' && <OllamaStatusPanel />}
    </section>
  );
}

/**
 * Estado de Ollama. Distingue los tres casos que importan, porque "no aparece
 * ningún modelo" tiene causas muy distintas y soluciones distintas: no está
 * instalado, está instalado pero parado, o corre sin modelos descargados.
 */
function OllamaStatusPanel() {
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [checking, setChecking] = useState(true);
  /** Se incrementa para relanzar el sondeo desde el botón. */
  const [attempt, setAttempt] = useState(0);

  // El efecto solo llama a setState desde el callback de la promesa; poner el
  // `setChecking(true)` aquí dentro dispararía renders en cascada.
  useEffect(() => {
    let cancelled = false;
    void window.api.ollama
      .getStatus()
      .then((next) => {
        if (cancelled) return;
        setStatus(next);
        setChecking(false);
      })
      .catch(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const probe = (): void => {
    setChecking(true);
    setAttempt((n) => n + 1);
  };

  return (
    <div className="ollama">
      <div className="ollama__head">
        <span className="row__label">Estado de Ollama</span>
        {checking && <span className="badge badge--missing">comprobando…</span>}
        {!checking && status?.reachable && (
          <span className="badge badge--ok">
            detectado{status.version ? ` · v${status.version}` : ''}
          </span>
        )}
        {!checking && status && !status.reachable && (
          <span className="badge badge--missing">no detectado</span>
        )}
        <span className="statusbar__spacer" style={{ flex: 1 }} />
        <button className="btn" onClick={probe} disabled={checking}>
          Volver a comprobar
        </button>
      </div>

      {!checking && status && !status.reachable && (
        <div className="warn">
          {status.error} Instálalo desde <strong>ollama.com</strong> y déjalo corriendo; el
          servidor arranca solo tras la instalación.
        </div>
      )}

      {!checking && status?.reachable && status.models.length === 0 && (
        <div className="warn">
          Ollama está corriendo pero no tiene ningún modelo descargado. Descarga uno desde una
          terminal, por ejemplo: <code>ollama pull llama3.2</code>
        </div>
      )}

      {!checking && status?.reachable && status.models.length > 0 && (
        <>
          <div className="row__desc" style={{ marginTop: 10 }}>
            {status.models.length} modelo{status.models.length === 1 ? '' : 's'} detectado
            {status.models.length === 1 ? '' : 's'} automáticamente:
          </div>
          <ul className="ollama__list">
            {status.models.map((m) => (
              <li key={m.id}>
                {m.id}
                {m.supportsVision && <span className="badge badge--ok">visión</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ──────────────────────────── Transcripción ────────────────────────────

function TranscriptionCard({ settings, patch }: { settings: Settings; patch: PatchFn }) {
  const [status, setStatus] = useState({ binaryInstalled: false, modelInstalled: false });
  const [progress, setProgress] = useState<WhisperProgress | null>(null);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback((): void => {
    void window.api.whisper.getStatus().then(setStatus);
  }, []);

  useEffect(() => {
    refresh();
    return window.api.whisper.onProgress(setProgress);
  }, [refresh, settings.whisperModel]);

  const install = async (): Promise<void> => {
    setInstalling(true);
    setError(null);
    try {
      const result = await window.api.whisper.install();
      if (!result.ok) setError(result.error ?? 'Falló la descarga.');
      refresh();
    } finally {
      setInstalling(false);
      setProgress(null);
    }
  };

  const ready = status.binaryInstalled && status.modelInstalled;
  const pct =
    progress && progress.totalBytes > 0
      ? Math.round((progress.receivedBytes / progress.totalBytes) * 100)
      : null;

  return (
    <section className="card">
      <h2 className="card__title">Transcripción</h2>
      <p className="card__hint">
        Gemini Live transcribe en ~300 ms pero envía el audio a Google. Whisper local no sale de tu
        máquina, a cambio de ~1–2 s de latencia.
      </p>

      <Row
        label="Qué se escucha"
        desc={AUDIO_SOURCE_HINT[settings.audioSources]}
      >
        <select
          value={settings.audioSources}
          onChange={(e) =>
            void patch({ audioSources: e.target.value as Settings['audioSources'] })
          }
        >
          <option value="both">Micrófono y salida del sistema</option>
          <option value="system">Solo la salida del sistema</option>
          <option value="mic">Solo el micrófono</option>
        </select>
      </Row>

      <Row label="Motor">
        <select
          value={settings.sttProviderId}
          onChange={(e) =>
            void patch({ sttProviderId: e.target.value as Settings['sttProviderId'] })
          }
        >
          <option value="gemini-live">Gemini Live (nube, más rápido)</option>
          <option value="gemini-audio">Gemini audio directo (el modelo oye tu voz)</option>
          <option value="whisper-local">Whisper local (offline, privado)</option>
        </select>
      </Row>

      {settings.sttProviderId === 'gemini-audio' && (
        <div className="diag diag--ok">
          El audio va <strong>directo al modelo</strong>, sin pasar por un reconocedor. Una mala
          transcripción deja de poder estropear la respuesta, porque el modelo oye tu voz en lugar
          de leer lo que otro entendió. Usa el modelo de Gemini que elijas más arriba, y el
          detector de preguntas no interviene: decide el propio modelo si lo que dijiste pedía
          respuesta.
        </div>
      )}

      <Row
        label="Idioma"
        desc="Automático detecta el idioma; fijarlo mejora la precisión cuando aciertas."
      >
        <select value={settings.language} onChange={(e) => void patch({ language: e.target.value })}>
          <option value="auto">Automático</option>
          <option value="es">Español</option>
          <option value="en">Inglés</option>
          <option value="pt">Portugués</option>
          <option value="fr">Francés</option>
          <option value="de">Alemán</option>
        </select>
      </Row>

      {/*
        El aviso es fuerte porque el fallo es silencioso y muy desconcertante:
        pasó de verdad con el idioma en inglés y alguien hablando español.
        Whisper devolvía "Are y'all gonna eat?" y el modelo respondía a eso.
      */}
      {settings.language !== 'auto' && (
        <div className="warn">
          Estás forzando <strong>{LANGUAGE_LABEL[settings.language] ?? settings.language}</strong>.
          Si hablas en otro idioma <strong>no verás ningún error</strong>: el reconocedor devuelve
          texto plausible en el idioma que le impongas, inventado a partir de los sonidos. Si las
          respuestas no tienen nada que ver con lo que preguntaste, esto es lo primero que hay que
          mirar.
        </div>
      )}

      {settings.sttProviderId === 'whisper-local' && (
        <>
          <Row
            label="Modelo de Whisper"
            desc={
              settings.language === 'en' || settings.language === 'auto'
                ? 'Modelos más grandes transcriben mejor y tardan más.'
                : 'Modelos más grandes transcriben mejor y tardan más. Fuera del inglés la ' +
                  'diferencia entre Base y Small es grande: si las palabras salen cambiadas, ' +
                  'es lo primero que conviene subir.'
            }
          >
            <select
              value={settings.whisperModel}
              onChange={(e) => void patch({ whisperModel: e.target.value })}
            >
              {WHISPER_MODEL_OPTIONS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </Row>

          <Row
            label={ready ? 'Whisper listo' : 'Whisper sin instalar'}
            desc={
              ready
                ? 'Ejecutable y modelo descargados. Funciona sin conexión.'
                : `Falta ${!status.binaryInstalled ? 'el ejecutable (7,6 MB)' : ''}${
                    !status.binaryInstalled && !status.modelInstalled ? ' y ' : ''
                  }${!status.modelInstalled ? 'el modelo' : ''}. Se descargan una sola vez.`
            }
          >
            {!ready && (
              <button className="btn" disabled={installing} onClick={() => void install()}>
                {installing ? 'Descargando…' : 'Descargar'}
              </button>
            )}
            {ready && <span className="badge badge--ok">instalado</span>}
          </Row>

          {installing && (
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
        </>
      )}
    </section>
  );
}

/**
 * Por defecto el auto-disparo ignora tu propia voz (solo evalúa intervenciones
 * del interlocutor), así que esta opción decide sobre todo qué entra en el
 * CONTEXTO enviado al modelo. Los textos lo dicen explícitamente porque es la
 * confusión natural — y avisan de la combinación que deja el disparo inerte.
 */
const AUDIO_SOURCE_HINT: Record<Settings['audioSources'], string> = {
  both:
    'El modelo sabe lo que ya has respondido, así que no te sugiere repetirlo. ' +
    'Por defecto el auto-disparo no reacciona a tu propia voz.',
  system:
    'Tu micrófono no se abre siquiera. Evita cualquier posibilidad de que tus ' +
    'respuestas entren en el contexto, a cambio de que el modelo no sepa qué has dicho ya.',
  mic:
    'Solo se transcribe lo que dices tú. Útil para dictar notas, no para una entrevista: ' +
    'el interlocutor no se escucha, así que el auto-disparo por defecto no puede saltar.',
};

/**
 * El equilibrio correcto depende de para qué uses la app, así que los textos
 * describen el caso de uso y no el algoritmo: nadie elige "recall" a ciegas.
 */
const SENSITIVITY_HINT: Record<Settings['autoTriggerSensitivity'], string> = {
  strict:
    'Solo dispara con interrogativo al principio, signo de interrogación o "cuéntame…". ' +
    'Casi nunca molesta, pero se le escapan preguntas que el reconocedor entrega sin signos.',
  balanced:
    'Añade interrogativos acentuados en cualquier posición y fórmulas como "me recomiendas". ' +
    'Recupera la mayoría de preguntas reales a cambio de algún disparo de más.',
  all:
    'Responde a todo lo que no sea un saludo o una prueba de audio. Es lo que quieres si eres ' +
    'tú quien dicta las preguntas; en una entrevista real interrumpirá constantemente.',
};

/** Nombres de los hablantes en los avisos, para no repetirlos en cada texto. */
const SPEAKER_LABEL: Record<'me' | 'them' | 'any', string> = {
  me: 'tu micrófono',
  them: 'el interlocutor',
  any: 'cualquiera de los dos',
};

const LANGUAGE_LABEL: Record<string, string> = {
  es: 'Español',
  en: 'Inglés',
  pt: 'Portugués',
  fr: 'Francés',
  de: 'Alemán',
};

/** Duplicado a propósito: el renderer no puede importar del proceso main. */
const WHISPER_MODEL_OPTIONS = [
  { id: 'tiny', label: 'Tiny (74 MB) — el más rápido' },
  { id: 'base', label: 'Base (141 MB) — justo en español' },
  { id: 'small', label: 'Small (465 MB) — recomendado en español' },
];

// ────────────────────────────── Comportamiento ──────────────────────────────

function BehaviourCard({ settings, patch }: { settings: Settings; patch: PatchFn }) {
  return (
    <section className="card">
      <h2 className="card__title">Comportamiento</h2>
      <p className="card__hint">Cuándo responde el asistente y con cuánto contexto.</p>

      <Row
        label="Respuestas automáticas"
        desc="Con la heurística activa, detecta preguntas dirigidas a ti y responde sin que pulses nada. El hotkey manual funciona en todos los modos."
      >
        <select
          value={settings.autoTriggerMode}
          onChange={(e) =>
            void patch({ autoTriggerMode: e.target.value as Settings['autoTriggerMode'] })
          }
        >
          <option value="off">Solo con hotkey</option>
          <option value="heuristic">Automático (heurística local)</option>
        </select>
      </Row>

      {settings.autoTriggerMode !== 'off' && (
        <>
          <Row
            label="Quién dispara la respuesta"
            desc="Por defecto solo el interlocutor: responder a lo que dices tú no tiene sentido en una entrevista. Cámbialo si usas la app para dictar las preguntas tú mismo."
          >
            <select
              value={settings.autoTriggerSpeaker}
              onChange={(e) =>
                void patch({
                  autoTriggerSpeaker: e.target.value as Settings['autoTriggerSpeaker'],
                })
              }
            >
              <option value="them">El interlocutor</option>
              <option value="me">Mi micrófono</option>
              <option value="any">Cualquiera de los dos</option>
            </select>
          </Row>

          <Row
            label="Cuándo considera que es una pregunta"
            desc={SENSITIVITY_HINT[settings.autoTriggerSensitivity]}
          >
            <select
              value={settings.autoTriggerSensitivity}
              onChange={(e) =>
                void patch({
                  autoTriggerSensitivity: e.target.value as Settings['autoTriggerSensitivity'],
                })
              }
            >
              <option value="strict">Estricto · solo señales claras</option>
              <option value="balanced">Equilibrado · recomendado</option>
              <option value="all">Todo · cualquier intervención</option>
            </select>
          </Row>

          {/* La combinación imposible no da ningún síntoma: el audio llega, se
              transcribe, y el disparo descarta todo en silencio. Por eso se
              avisa aquí y no solo en el log del proceso principal. */}
          {autoTriggerIsInert(settings) && (
            <div className="warn">
              El auto-disparo espera a <strong>{SPEAKER_LABEL[settings.autoTriggerSpeaker]}</strong>,
              pero «Qué se escucha» solo abre{' '}
              {speakersFor(settings.audioSources)
                .map((s) => SPEAKER_LABEL[s])
                .join(' y ')}
              : <strong>nunca se disparará ninguna respuesta automática</strong>. Cambia una de las
              dos cosas, o usa <kbd>Ctrl</kbd>+<kbd>Enter</kbd> para preguntar a mano.
            </div>
          )}
        </>
      )}

      <Row
        label="Ventana de voz"
        desc="Segundos de TRANSCRIPCIÓN que acompañan a cada pregunta. No afecta a la memoria del asistente: sus propias respuestas anteriores se envían siempre. Por debajo de 30 s se pierde el hilo de lo que dijo el interlocutor."
      >
        <input
          type="number"
          min={10}
          max={300}
          step={5}
          style={{ width: 90, flex: 'none' }}
          value={settings.manualContextSeconds}
          onChange={(e) =>
            void patch({ manualContextSeconds: Math.max(10, Number(e.target.value) || 30) })
          }
        />
      </Row>

      <Row label="Perfil de respuesta" desc="Adapta el tono y la estructura al tipo de reunión.">
        <select
          value={settings.promptProfileId}
          onChange={(e) =>
            void patch({ promptProfileId: e.target.value as Settings['promptProfileId'] })
          }
        >
          <option value="interview">Entrevista de trabajo</option>
          <option value="meeting">Reunión genérica</option>
          <option value="lecture">Clase o charla</option>
          <option value="support">Soporte técnico</option>
          <option value="coding">Código (resolver ejercicios)</option>
          <option value="quiz">Test (opción múltiple)</option>
          <option value="custom">Personalizado</option>
        </select>
      </Row>

      {/*
        Se enseña siempre, no sólo con el perfil "Código" puesto: el camino
        normal al modo código es Ctrl+Alt+C, que resuelve la pantalla SIN tocar
        el perfil. Esconder este ajuste detrás del perfil lo dejaría invisible
        justo para quien más lo va a usar.
      */}
      <Row
        label="Lenguaje del modo código"
        desc="En qué lenguaje se escriben las soluciones de Ctrl+Alt+C. Con «auto» lo deduce de lo que se vea en la pantalla, que es lo correcto si el editor ya tiene uno elegido."
      >
        <input
          type="text"
          placeholder="auto"
          style={{ width: 140, flex: 'none' }}
          value={settings.codeLanguage}
          onChange={(e) => void patch({ codeLanguage: e.target.value })}
        />
      </Row>

      {settings.promptProfileId === 'custom' && (
        <textarea
          placeholder="Describe cómo debe comportarse el asistente…"
          value={settings.customPrompt}
          onChange={(e) => void patch({ customPrompt: e.target.value })}
          style={{ marginTop: 10 }}
        />
      )}
    </section>
  );
}

// ──────────────────────────── Context packs ────────────────────────────

const PROFILE_LABEL: Record<Settings['promptProfileId'], string> = {
  interview: 'Entrevista de trabajo',
  meeting: 'Reunión genérica',
  lecture: 'Clase o charla',
  support: 'Soporte técnico',
  coding: 'Código',
  quiz: 'Test',
  custom: 'Personalizado',
};

/** Qué pedirle al usuario en cada hueco, y por qué le conviene rellenarlo. */
const SLOT_HELP: Record<ContextKind, { placeholder: string; hint: string }> = {
  cv: {
    placeholder: 'Pega tu CV, o un resumen de tu experiencia: empresas, años, tecnologías, logros con cifras…',
    hint: 'La única fuente de datos concretos sobre ti. Sin esto las respuestas son correctas pero genéricas, y el modelo tiene prohibido inventarse experiencia.',
  },
  job: {
    placeholder: 'Pega la oferta: responsabilidades, stack, requisitos…',
    hint: 'Decide QUÉ destacar de tu experiencia y con qué vocabulario. No se usa para atribuirte nada que no esté en tu CV.',
  },
  qa: {
    placeholder:
      '¿Cuál es tu mayor debilidad?\n— Tiendo a meterme en el detalle; lo compenso con revisiones a mitad de sprint.\n\n¿Por qué dejaste tu último trabajo?\n— …',
    hint: 'Preguntas que ya sabes que van a caer, con tu respuesta. Si la pregunta encaja, el modelo la reutiliza casi literal en vez de improvisar una versión aguada.',
  },
  vocabulary: {
    placeholder: 'Kubernetes, Grafana, EmployeeBridge, Marta Ibáñez, CI/CD…',
    hint: 'Separados por comas o saltos de línea. Van directos al reconocedor de voz: es lo que arregla los nombres propios y las siglas que salen mal transcritas.',
  },
  notes: {
    placeholder: 'Cualquier cosa que convenga que el modelo sepa.',
    hint: 'Notas de apoyo sin tratamiento especial.',
  },
};

/**
 * Contexto guiado por perfil.
 *
 * Antes esto era una lista de cajas de texto libre con nombre, todas activas a
 * la vez en cualquier reunión. Funcionaba, pero dejaba dos cosas al usuario que
 * no tenía por qué resolver: **qué** conviene preparar, y **acordarse de
 * activar y desactivar** los packs al cambiar de tipo de reunión.
 *
 * Ahora el perfil activo manda: enseña sus huecos con nombre y sólo ese
 * material llega al modelo. Por debajo siguen siendo packs, así que quien
 * quiera algo distinto lo añade abajo.
 */
function ContextCard({ settings, patch }: { settings: Settings; patch: PatchFn }) {
  const packs = settings.contextPacks;
  const profile = settings.promptProfileId;
  const slots = PROFILE_SLOTS[profile];

  const write = (next: ContextPack[]): void => void patch({ contextPacks: next });

  const update = (id: string, changes: Partial<ContextPack>): void =>
    write(packs.map((p) => (p.id === id ? { ...p, ...changes } : p)));

  const remove = (id: string): void => write(packs.filter((p) => p.id !== id));

  /** El pack de este hueco para el perfil activo, si ya existe. */
  const slotPack = (kind: ContextKind): ContextPack | undefined =>
    packs.find((p) => p.kind === kind && p.profiles.includes(profile));

  /**
   * Escribe en un hueco, creándolo si hace falta. Se crea al primer carácter y
   * no al renderizar: si no, abrir el dashboard dejaría packs vacíos sembrados.
   */
  const writeSlot = (kind: ContextKind, content: string): void => {
    const existing = slotPack(kind);
    if (existing) {
      update(existing.id, { content });
      return;
    }
    write([
      ...packs,
      {
        id: crypto.randomUUID(),
        name: CONTEXT_KIND_LABEL[kind],
        content,
        enabled: true,
        kind,
        profiles: [profile],
      },
    ]);
  };

  const addOwn = (): void =>
    write([
      ...packs,
      {
        id: crypto.randomUUID(),
        name: 'Nuevo contexto',
        content: '',
        enabled: true,
        kind: 'notes',
        // Sin perfiles = se aplica siempre, que es como se comportaba todo
        // antes de que los perfiles existieran.
        profiles: [],
      },
    ]);

  // Los que no ocupan un hueco del perfil activo: packs propios del usuario y
  // los de otros perfiles, que conviene poder ver y editar sin cambiar de modo.
  const others = packs.filter((p) => !slots.includes(p.kind) || !p.profiles.includes(profile));
  const activeNow = packsForProfile(packs, profile).filter((p) => p.content.trim());

  return (
    <section className="card" id="context">
      <h2 className="card__title">Contexto</h2>
      <p className="card__hint">
        Lo que preparas aquí es lo que separa una respuesta genérica de una tuya. Cada tipo se le
        explica al modelo de forma distinta, así que una respuesta preparada se reutiliza en vez de
        parafrasearse.
      </p>

      <div className="ctxbar">
        <span className="ctxbar__label">Preparando para</span>
        <strong className="ctxbar__profile">{PROFILE_LABEL[profile]}</strong>
        <span className="ctxbar__spacer" />
        <span className="ctxbar__active">
          {activeNow.length
            ? `${activeNow.length} en uso: ${activeNow.map((p) => p.name).join(', ')}`
            : 'nada activo todavía'}
        </span>
      </div>

      {slots.map((kind) => (
        <ContextSlot
          key={kind}
          kind={kind}
          pack={slotPack(kind)}
          onChange={(content) => writeSlot(kind, content)}
          onToggle={(on) => {
            const existing = slotPack(kind);
            if (existing) update(existing.id, { enabled: on });
          }}
        />
      ))}

      <div className="ctxbar" style={{ marginTop: 18 }}>
        <span className="ctxbar__label">Otros contextos</span>
        <span className="ctxbar__spacer" />
        <span className="ctxbar__active">Sin perfil marcado, se aplican siempre</span>
      </div>

      {others.length === 0 && (
        <p className="card__hint" style={{ marginBottom: 0 }}>
          Ninguno. Los huecos de arriba cubren lo habitual.
        </p>
      )}

      {others.map((pack) => (
        <div key={pack.id} className="pack">
          <div className="pack__head">
            <input
              type="text"
              value={pack.name}
              onChange={(e) => update(pack.id, { name: e.target.value })}
            />
            <select
              value={pack.kind}
              onChange={(e) => update(pack.id, { kind: e.target.value as ContextKind })}
            >
              {(Object.keys(CONTEXT_KIND_LABEL) as ContextKind[]).map((k) => (
                <option key={k} value={k}>
                  {CONTEXT_KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <Switch on={pack.enabled} onChange={(v) => update(pack.id, { enabled: v })} />
            <button className="btn btn--danger" onClick={() => remove(pack.id)}>
              Quitar
            </button>
          </div>
          <div className="pack__profiles">
            {(Object.keys(PROFILE_LABEL) as Settings['promptProfileId'][]).map((p) => (
              <label key={p} className="pack__profile">
                <input
                  type="checkbox"
                  checked={pack.profiles.includes(p)}
                  onChange={(e) =>
                    update(pack.id, {
                      profiles: e.target.checked
                        ? [...pack.profiles, p]
                        : pack.profiles.filter((x) => x !== p),
                    })
                  }
                />
                {PROFILE_LABEL[p]}
              </label>
            ))}
          </div>
          <textarea
            placeholder="Pega aquí el texto…"
            value={pack.content}
            onChange={(e) => update(pack.id, { content: e.target.value })}
          />
        </div>
      ))}

      <div className="field">
        <button className="btn" onClick={addOwn}>
          Añadir contexto propio
        </button>
      </div>
    </section>
  );
}

/** Un hueco con nombre del perfil activo, con importación de archivo. */
function ContextSlot({
  kind,
  pack,
  onChange,
  onToggle,
}: {
  kind: ContextKind;
  pack: ContextPack | undefined;
  onChange: (content: string) => void;
  onToggle: (on: boolean) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const help = SLOT_HELP[kind];

  // Se lee en el renderer con FileReader: no hace falta cruzar el IPC ni pedirle
  // al proceso principal acceso al disco para algo que el usuario acaba de
  // elegir en un diálogo.
  const importFile = (file: File): void => {
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result ?? ''));
    reader.readAsText(file);
  };

  return (
    <div className="pack">
      <div className="pack__head">
        <strong className="slot__title">{CONTEXT_KIND_LABEL[kind]}</strong>
        {pack && <Switch on={pack.enabled} onChange={onToggle} />}
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Importar .txt / .md
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,text/plain,text/markdown"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importFile(file);
            // Se limpia para que elegir el MISMO archivo otra vez vuelva a
            // disparar el evento.
            e.target.value = '';
          }}
        />
      </div>
      <p className="slot__hint">{help.hint}</p>
      <textarea
        placeholder={help.placeholder}
        value={pack?.content ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

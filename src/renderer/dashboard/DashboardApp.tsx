import { useCallback, useEffect, useState } from 'react';
import type { WhisperProgress } from '@shared/ipc';
import { autoTriggerIsInert, speakersFor } from '@shared/types';
import type {
  AudioLevels,
  CaptureStatus,
  ContextPack,
  Conversation,
  ConversationSummary,
  LLMProviderId,
  ModelInfo,
  OllamaStatus,
  SecretKey,
  SecretsPresence,
  Settings,
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
    <section className="card">
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

      <section className="card">
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
      <TranscriptionCard settings={settings} patch={patch} />
      <BehaviourCard settings={settings} patch={patch} />
      <HistoryCard settings={settings} patch={patch} />
      <ContextCard settings={settings} patch={patch} />
      <DiagnosticsCard />
    </div>
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

      {items.map((item) => (
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
          <option value="custom">Personalizado</option>
        </select>
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

function ContextCard({ settings, patch }: { settings: Settings; patch: PatchFn }) {
  const packs = settings.contextPacks;

  const update = (id: string, changes: Partial<ContextPack>): void => {
    void patch({ contextPacks: packs.map((p) => (p.id === id ? { ...p, ...changes } : p)) });
  };

  const add = (): void => {
    void patch({
      contextPacks: [
        ...packs,
        { id: crypto.randomUUID(), name: 'Nuevo contexto', content: '', enabled: true },
      ],
    });
  };

  const remove = (id: string): void => {
    void patch({ contextPacks: packs.filter((p) => p.id !== id) });
  };

  return (
    <section className="card">
      <h2 className="card__title">Contexto</h2>
      <p className="card__hint">
        Tu CV, la descripción del puesto, notas técnicas. Es la única fuente de datos concretos que
        el modelo puede usar, y lo que evita que invente experiencia que no tienes. También sesga el
        reconocedor de voz hacia los nombres propios y siglas que aparezcan aquí.
      </p>

      {packs.length === 0 && (
        <p className="card__hint" style={{ marginBottom: 0 }}>
          Sin contexto, las respuestas serán genéricas pero correctas.
        </p>
      )}

      {packs.map((pack) => (
        <div key={pack.id} className="pack">
          <div className="pack__head">
            <input
              type="text"
              value={pack.name}
              onChange={(e) => update(pack.id, { name: e.target.value })}
            />
            <Switch on={pack.enabled} onChange={(v) => update(pack.id, { enabled: v })} />
            <button className="btn btn--danger" onClick={() => remove(pack.id)}>
              Quitar
            </button>
          </div>
          <textarea
            placeholder="Pega aquí el texto…"
            value={pack.content}
            onChange={(e) => update(pack.id, { content: e.target.value })}
          />
        </div>
      ))}

      <div className="field">
        <button className="btn" onClick={add}>
          Añadir contexto
        </button>
      </div>
    </section>
  );
}

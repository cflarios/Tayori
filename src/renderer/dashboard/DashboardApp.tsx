import { useCallback, useEffect, useState } from 'react';
import type { WhisperProgress } from '@shared/ipc';
import type {
  AudioLevels,
  CaptureStatus,
  ContextPack,
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
      <ContextCard settings={settings} patch={patch} />
    </div>
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
      .then((models) => {
        if (!cancelled) setLoaded({ provider, models });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ provider, models: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [provider]);

  const models = loaded?.provider === provider ? loaded.models : [];
  const test = tested?.provider === provider ? tested.result : null;

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
          value={settings.llmModels[settings.llmProviderId]}
          disabled={models.length === 0}
          onChange={(e) =>
            void patch({
              llmModels: { ...settings.llmModels, [settings.llmProviderId]: e.target.value },
            })
          }
        >
          {models.length === 0 && <option value="">—</option>}
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
          <option value="whisper-local">Whisper local (offline, privado)</option>
        </select>
      </Row>

      <Row label="Idioma" desc="Automático detecta el idioma; fijarlo mejora la precisión.">
        <select value={settings.language} onChange={(e) => void patch({ language: e.target.value })}>
          <option value="auto">Automático</option>
          <option value="es">Español</option>
          <option value="en">Inglés</option>
          <option value="pt">Portugués</option>
          <option value="fr">Francés</option>
          <option value="de">Alemán</option>
        </select>
      </Row>

      {settings.sttProviderId === 'whisper-local' && (
        <>
          <Row
            label="Modelo de Whisper"
            desc="Modelos más grandes transcriben mejor y tardan más."
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
 * El auto-disparo ya ignora tu propia voz (solo evalúa intervenciones del
 * interlocutor), así que esta opción decide qué entra en el CONTEXTO enviado al
 * modelo, no cuándo se dispara. Los textos lo dicen explícitamente porque es la
 * confusión natural.
 */
const AUDIO_SOURCE_HINT: Record<Settings['audioSources'], string> = {
  both:
    'El modelo sabe lo que ya has respondido, así que no te sugiere repetirlo. ' +
    'El auto-disparo nunca reacciona a tu propia voz.',
  system:
    'Tu micrófono no se abre siquiera. Evita cualquier posibilidad de que tus ' +
    'respuestas entren en el contexto, a cambio de que el modelo no sepa qué has dicho ya.',
  mic: 'Solo se transcribe lo que dices tú. Útil para dictar notas, no para una entrevista.',
};

/** Duplicado a propósito: el renderer no puede importar del proceso main. */
const WHISPER_MODEL_OPTIONS = [
  { id: 'tiny', label: 'Tiny (74 MB) — el más rápido' },
  { id: 'base', label: 'Base (141 MB) — recomendado' },
  { id: 'small', label: 'Small (465 MB) — más preciso' },
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

      <Row
        label="Contexto enviado"
        desc="Segundos de conversación que acompañan a cada pregunta."
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

import { useCallback, useEffect, useState } from 'react';
import type { LLMProviderId, SecretKey, SecretsPresence, Settings } from '@shared/types';

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

export function DashboardApp() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [presence, setPresence] = useState<SecretsPresence>({ anthropic: false, google: false });

  useEffect(() => {
    const { api } = window;
    void api.settings.get().then(setSettings);
    void api.secrets.getPresence().then(setPresence);
    return api.settings.onChange(setSettings);
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

      <section className="card">
        <h2 className="card__title">Modelo</h2>
        <p className="card__hint">Quién genera las respuestas.</p>

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

        <Row label="Transcripción" desc="Gemini Live es más rápido; Whisper local funciona sin red.">
          <select
            value={settings.sttProviderId}
            onChange={(e) =>
              void patch({ sttProviderId: e.target.value as Settings['sttProviderId'] })
            }
          >
            <option value="gemini-live">Gemini Live (nube)</option>
            <option value="whisper-local">Whisper local (offline)</option>
          </select>
        </Row>
      </section>
    </div>
  );
}

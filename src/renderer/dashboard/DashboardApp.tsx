import { useCallback, useEffect, useRef, useState } from 'react';
import type { WhisperProgress } from '@shared/ipc';
import {
  adviseLocalModels,
  autoTriggerIsInert,
  clampFontScale,
  DEFAULT_HOTKEYS,
  FONT_SCALE,
  HOTKEY_LABEL,
  normalizeModelId,
  mqttTopics,
  packsForProfile,
  PROFILE_SLOTS,
  providerIsReady,
  screenModelFor,
  speakersFor,
} from '@shared/types';
import {
  acceleratorFromEvent,
  duplicateAccelerators,
  formatAccelerator,
} from '@shared/accelerator';
import { translate, UI_LANG_LABEL, UI_LANGS, type UIKey, type UILang } from '@shared/i18n';
import { LangProvider, renderMarkup, Tx, useT } from '@renderer/i18n';
import { Icon, type IconName } from './icons';
import { SetupWizard } from './SetupWizard';
import type {
  AudioLevels,
  CaptureStatus,
  ContextPack,
  Conversation,
  ConversationSummary,
  HotkeyMap,
  LLMProviderId,
  ModelInfo,
  MqttStatus,
  OllamaStatus,
  PhoneMirrorStatus,
  SecretKey,
  SecretsPresence,
  Settings,
  Skill,
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

/**
 * Una fila de ajuste: etiqueta, explicación y su control a la derecha.
 *
 * El icono es opcional y no es adorno: en una columna de doce filas seguidas es
 * lo que permite volver a encontrar la que buscas sin releer las etiquetas. Se
 * pone donde ayuda a distinguir —dos interruptores parecidos, una lista de
 * ajustes larga— y se omite donde la fila ya es única en su tarjeta.
 */
function Row({
  label,
  desc,
  icon,
  children,
}: {
  label: string;
  desc?: React.ReactNode;
  icon?: IconName;
  children?: React.ReactNode;
}) {
  return (
    <div className="row">
      {icon && (
        <span className="row__icon">
          <Icon name={icon} size={16} />
        </span>
      )}
      <div className="row__text">
        <div className="row__label">{label}</div>
        {desc && <div className="row__desc">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

/**
 * Enlace a otra sección. Existe porque partir el dashboard en secciones tiene
 * un coste: dos ajustes que se explican el uno al otro dejan de verse a la vez.
 * Donde eso pasa —«qué se escucha» y el disparo automático— se pone el salto en
 * lugar de repetir el texto.
 */
function Jump({
  to,
  go,
  children,
}: {
  to: SectionId;
  go: (id: SectionId) => void;
  children: string;
}) {
  return (
    <button className="jump" onClick={() => go(to)}>
      {children}
      <Icon name="arrow" size={14} />
    </button>
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
  /** Qué se pide, si no es una API key. El componente lo reutiliza el broker. */
  placeholder = 'keys.placeholder',
  onSave,
  onClear,
  /**
   * Comprueba que la clave sirve de verdad, aquí mismo.
   *
   * Estaba abajo, en la tarjeta del modelo, y probaba **el proveedor activo**:
   * para saber si la clave de DeepSeek valía había que cambiarse a DeepSeek,
   * probar y volver. La pregunta que uno se hace al pegar una clave es "¿esta
   * sirve?", y se responde donde se pega.
   */
  onTest,
}: {
  label: UIKey;
  hint: UIKey;
  present: boolean;
  placeholder?: UIKey;
  onSave: (value: string) => Promise<void>;
  onClear: () => Promise<void>;
  onTest?: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const t = useT();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [tested, setTested] = useState<{ ok: boolean; error?: string } | null>(null);

  const save = async (): Promise<void> => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await onSave(draft);
      setDraft('');
      // Una clave nueva invalida el veredicto anterior: dejarlo puesto diría
      // "conexión correcta" sobre la clave que se acaba de reemplazar.
      setTested(null);
    } finally {
      setBusy(false);
    }
  };

  const test = async (): Promise<void> => {
    if (!onTest) return;
    setBusy(true);
    setTested(null);
    try {
      setTested(await onTest());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="row__label">{t(label)}</span>
        <span className={present ? 'badge badge--ok' : 'badge badge--missing'}>
          {present ? t('keys.configured') : t('keys.missing')}
        </span>
      </div>
      <div className="row__desc">{t(hint)}</div>
      <div className="field">
        <input
          type="password"
          value={draft}
          placeholder={present ? t('keys.replace') : t(placeholder)}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
          }}
        />
        <button className="btn" disabled={busy || !draft.trim()} onClick={() => void save()}>
          {t('keys.save')}
        </button>
        {onTest && present && (
          <button className="btn" disabled={busy} onClick={() => void test()}>
            {busy ? t('keys.testing') : t('keys.test')}
          </button>
        )}
        {present && (
          <button className="btn btn--danger" disabled={busy} onClick={() => void onClear()}>
            {t('keys.clear')}
          </button>
        )}
      </div>
      {tested && (
        <div className="field">
          <span className={tested.ok ? 'badge badge--ok' : 'badge badge--missing'}>
            {tested.ok ? t('keys.ok') : (tested.error ?? t('keys.failed'))}
          </span>
        </div>
      )}
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
  const t = useT();
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
      <h2 className="card__title">{t('aud.captureTitle')}</h2>
      <p className="card__hint">{t('aud.captureHint')}</p>

      <Row
        icon="power"
        label={listening ? t('aud.listening') : t('aud.paused')}
        desc={
          status.state === 'error'
            ? (status.error ?? t('overlay.unknownError'))
            : t('aud.devices', {
                mic: status.micActive ? t('aud.active') : t('aud.inactive'),
                system: status.loopbackActive ? t('aud.active') : t('aud.inactive'),
              })
        }
      >
        <button
          className="btn btn--primary"
          disabled={busy || status.state === 'starting'}
          onClick={() => void toggle()}
        >
          {status.state === 'starting'
            ? t('overlay.starting')
            : listening
              ? t('aud.stop')
              : t('aud.start')}
        </button>
      </Row>

      {/* Los medidores son el instrumento, no un adorno: si al hablar sólo se
          mueve "Yo" y al reproducir un vídeo sólo se mueve "Ellos", los dos
          streams llegan de verdad por separado. */}
      <div className="meters">
        <div className="meter">
          <span className="meter__label">
            <Icon name="mic" size={14} />
            Yo (micrófono)
          </span>
          <div className="meter__bar">
            <div className="meter__fill" style={{ width: `${Math.min(levels.me * 140, 100)}%` }} />
          </div>
        </div>
        <div className="meter">
          <span className="meter__label">
            <Icon name="speaker" size={14} />
            Ellos (sistema)
          </span>
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

// ──────────────────────── Secciones y navegación ────────────────────────

/**
 * El dashboard era **una sola columna** con doce tarjetas, de los primeros
 * pasos al registro de diagnóstico. Funcionaba mientras hubo cuatro; con doce,
 * encontrar un ajuste era recordar a qué altura del scroll estaba, y los avisos
 * que importan —no hay proveedor configurado, Windows rechazó un atajo— caían
 * fuera de la pantalla justo cuando hacían falta.
 *
 * Ahora cada grupo es una sección con su propia navegación. Tres consecuencias
 * que van juntas y conviene no separar:
 *
 * - **La cabecera del panel es la que titula**, así que las tarjetas que son
 *   únicas en su sección ya no repiten título ni explicación. Dos veces lo
 *   mismo en la misma pantalla es ruido, no refuerzo.
 * - **Los avisos suben a la barra lateral** como un punto ámbar. Un problema
 *   que sólo se ve entrando en la sección donde vive es un problema que nadie
 *   ve: el aviso tiene que llegar antes que la navegación.
 * - **El interruptor de escucha vive en la cabecera**, visible desde cualquier
 *   sección. Es el control más usado y estaba enterrado en una tarjeta.
 */
type SectionId =
  | 'general'
  | 'audio'
  | 'phone'
  | 'mqtt'
  | 'models'
  | 'transcription'
  | 'behaviour'
  | 'context'
  | 'skills'
  | 'history'
  | 'hotkeys'
  | 'diagnostics'
  | 'about';

/**
 * Las secciones, con sus textos como CLAVES y no como texto.
 *
 * El `hint` era `React.ReactNode` porque uno de ellos llevaba `<strong>`
 * dentro. Ahora todos son claves y el marcado se resuelve con `<Tx>`, que
 * interpreta `**negrita**`: así la tabla de traducciones puede guardarlos como
 * cadenas, que es lo único que sabe guardar.
 */
const SECTIONS: Record<SectionId, { icon: IconName; label: UIKey; hint: UIKey }> = {
  general: { icon: 'sliders', label: 'sec.general', hint: 'sec.generalHint' },
  audio: { icon: 'mic', label: 'sec.audio', hint: 'sec.audioHint' },
  phone: { icon: 'phone', label: 'sec.phone', hint: 'sec.phoneHint' },
  mqtt: { icon: 'broadcast', label: 'sec.mqtt', hint: 'sec.mqttHint' },
  models: { icon: 'cpu', label: 'sec.models', hint: 'sec.modelsHint' },
  transcription: {
    icon: 'waveform',
    label: 'sec.transcription',
    hint: 'sec.transcriptionHint',
  },
  behaviour: { icon: 'bolt', label: 'sec.behaviour', hint: 'sec.behaviourHint' },
  context: { icon: 'file', label: 'sec.context', hint: 'sec.contextHint' },
  skills: { icon: 'sparkles', label: 'sec.skills', hint: 'sec.skillsHint' },
  history: { icon: 'history', label: 'sec.history', hint: 'sec.historyHint' },
  hotkeys: { icon: 'keyboard', label: 'sec.hotkeys', hint: 'sec.hotkeysHint' },
  diagnostics: { icon: 'activity', label: 'sec.diagnostics', hint: 'sec.diagnosticsHint' },
  about: { icon: 'book', label: 'sec.about', hint: 'sec.aboutHint' },
};

const SECTION_ORDER: SectionId[] = [
  'general',
  'audio',
  'phone',
  'mqtt',
  'models',
  'transcription',
  'behaviour',
  'context',
  'skills',
  'history',
  'hotkeys',
  'diagnostics',
  'about',
];

/**
 * La sección se recuerda entre aperturas. El dashboard se abre y se cierra
 * muchas veces seguidas mientras se afina algo —cambiar el modelo, probar,
 * volver— y devolver siempre a «General» obliga a repetir el mismo clic.
 */
const SECTION_KEY = 'dashboard.section';

function storedSection(): SectionId {
  try {
    const saved = localStorage.getItem(SECTION_KEY);
    if (saved && saved in SECTIONS) return saved as SectionId;
  } catch {
    // Un almacenamiento no disponible no es motivo para no abrir los ajustes.
  }
  return 'general';
}

export function DashboardApp() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [presence, setPresence] = useState<SecretsPresence>({
    anthropic: false,
    google: false,
    openai: false,
    deepseek: false,
    mqtt: false,
  });
  const [status, setStatus] = useState<CaptureStatus>({
    state: 'idle',
    micActive: false,
    loopbackActive: false,
  });
  const [levels, setLevels] = useState<AudioLevels>({ me: 0, them: 0 });
  const [section, setSection] = useState<SectionId>(storedSection);
  /**
   * Sube aquí desde `HotkeysCard` porque ya no basta con pintarlo dentro: la
   * barra lateral marca la sección que tiene un problema, y para eso el aviso
   * tiene que existir aunque esa sección no esté montada.
   */
  const [failedHotkeys, setFailedHotkeys] = useState<string[]>([]);
  /** Reabierto a mano desde el pie de la barra lateral. */
  const [wizard, setWizard] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const { api } = window;
    void api.settings.get().then(setSettings);
    void api.secrets.getPresence().then(setPresence);
    void api.capture.getStatus().then(setStatus);
    void api.hotkeys.getFailed().then(setFailedHotkeys);

    const unsubs = [
      api.settings.onChange(setSettings),
      api.capture.onStatus(setStatus),
      api.capture.onLevels(setLevels),
      api.hotkeys.onFailures(setFailedHotkeys),
    ];
    return () => unsubs.forEach((off) => off());
  }, []);

  const go = useCallback((next: SectionId): void => {
    setSection(next);
    try {
      localStorage.setItem(SECTION_KEY, next);
    } catch {
      // Recordar la sección es una comodidad, no un requisito.
    }
  }, []);

  // Cambiar de sección tiene que empezar por arriba: heredar el scroll de la
  // anterior deja la nueva empezada por la mitad sin ninguna razón visible.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [section]);

  const patch = useCallback(async (p: Partial<Settings>): Promise<void> => {
    setSettings(await window.api.settings.update(p));
  }, []);

  const saveSecret = useCallback(async (key: SecretKey, value: string): Promise<void> => {
    setPresence(await window.api.secrets.set(key, value));
  }, []);

  const clearSecret = useCallback(async (key: SecretKey): Promise<void> => {
    setPresence(await window.api.secrets.clear(key));
  }, []);

  if (!settings) return <div className="loading">…</div>;

  /*
   * El asistente sustituye al dashboard entero mientras está abierto, y no es
   * una sección más: quien lo necesita no sabe todavía qué significan las
   * secciones. Se abre solo la primera vez y se puede volver a llamar desde el
   * pie de la barra lateral.
   */
  if (!settings.onboardingDone || wizard) {
    return (
      <SetupWizard
        settings={settings}
        presence={presence}
        patch={patch}
        saveSecret={saveSecret}
        onClose={() => {
          setWizard(false);
          // Salir del asistente cuenta como "ya no me lo enseñes": si no,
          // cerrarlo lo volvería a abrir en el siguiente render.
          if (!settings.onboardingDone) void patch({ onboardingDone: true });
        }}
      />
    );
  }

  const meta = SECTIONS[section];

  /*
   * Este componente provee el idioma, así que no puede leerlo con `useT()`.
   * Traduce a mano contra los settings, que es de donde salía igualmente.
   */
  const t = (key: UIKey, vars?: Record<string, string | number>): string =>
    translate(settings.uiLanguage, key, vars);

  /*
   * Qué secciones piden atención. Son exactamente los avisos que ya existían
   * dentro de cada tarjeta: lo único nuevo es que ahora se ven sin entrar. Un
   * aviso que hay que ir a buscar no avisa de nada — el caso que lo motivó es
   * el auto-disparo inerte, que no da ningún síntoma salvo silencio.
   */
  const alerts: Partial<Record<SectionId, boolean>> = {
    general: !settings.stealthEnabled,
    audio: status.state === 'error',
    models: !providerIsReady(settings, presence),
    behaviour: autoTriggerIsInert(settings),
    hotkeys: failedHotkeys.length > 0 || duplicateAccelerators(settings.hotkeys).size > 0,
  };

  return (
    <LangProvider lang={settings.uiLanguage}>
      <div className="app">
        <aside className="nav">
          <div className="nav__brand">
            <div className="nav__eyebrow">Ajustes</div>
            <div className="nav__app">Tayori</div>
          </div>

          <nav className="nav__list">
            {SECTION_ORDER.map((id) => (
              <button
                key={id}
                className="navitem"
                aria-current={id === section}
                onClick={() => go(id)}
              >
                <Icon name={SECTIONS[id].icon} />
                <span className="navitem__label">{t(SECTIONS[id].label)}</span>
                {alerts[id] && <span className="navitem__dot" title={t('nav.attention')} />}
              </button>
            ))}
          </nav>

          <div className="nav__foot">
            {/* El asistente se puede volver a llamar: haberlo terminado una vez no
              debería dejarte sin él. Vive en el pie y no al final de una sección
              porque no pertenece a ninguna — las cruza todas. */}
            <button className="navitem navitem--ghost" onClick={() => setWizard(true)}>
              <Icon name="compass" />
              <span className="navitem__label">{t('nav.wizard')}</span>
            </button>
            <p className="nav__note">
              Todo se guarda en tu equipo. Nada se sube a ningún servidor propio.
            </p>
          </div>
        </aside>

        <main className="pane">
          <header className="pane__head">
            <div className="pane__heading">
              <h1 className="pane__title">{t(meta.label)}</h1>
              <p className="pane__sub">{renderMarkup(t(meta.hint))}</p>
            </div>
            {/* El control más usado de la app, alcanzable desde cualquier sección:
              antes había que llegar hasta la tarjeta de captura para pulsarlo. */}
            <ListenButton status={status} />
          </header>

          <div className="pane__body" ref={bodyRef}>
            <div className="pane__inner">
              {section === 'general' && <VisibilityCards settings={settings} patch={patch} />}

              {section === 'audio' && (
                <>
                  <CaptureCard status={status} levels={levels} />
                  <AudioSourcesCard settings={settings} patch={patch} go={go} />
                </>
              )}

              {section === 'phone' && <PhoneMirrorCard settings={settings} patch={patch} />}

              {section === 'mqtt' && (
                <MqttCard
                  settings={settings}
                  presence={presence}
                  patch={patch}
                  saveSecret={saveSecret}
                  clearSecret={clearSecret}
                />
              )}

              {section === 'models' && (
                <>
                  <ApiKeysCard
                    presence={presence}
                    saveSecret={saveSecret}
                    clearSecret={clearSecret}
                  />
                  <ModelCard settings={settings} patch={patch} />
                  {/* Justo detrás del modelo de respuestas: se lee como "y para la
                    pantalla, esto otro", que es la decisión que hay que tomar. */}
                  <ScreenModelCard settings={settings} patch={patch} />
                  <LocalModelGuide />
                </>
              )}

              {section === 'transcription' && (
                <TranscriptionCard settings={settings} patch={patch} go={go} />
              )}
              {section === 'behaviour' && (
                <BehaviourCard settings={settings} patch={patch} go={go} />
              )}
              {section === 'context' && <ContextCard settings={settings} patch={patch} />}
              {section === 'skills' && <SkillsCard settings={settings} patch={patch} />}
              {section === 'history' && <HistoryCard settings={settings} patch={patch} />}
              {section === 'hotkeys' && (
                <HotkeysCard settings={settings} patch={patch} failed={failedHotkeys} />
              )}
              {section === 'diagnostics' && <DiagnosticsCard />}
              {section === 'about' && <AboutCard />}
            </div>
          </div>
        </main>
      </div>
    </LangProvider>
  );
}

/*
 * La regla de "¿puede responder este proveedor?" vive en `shared/types.ts`.
 *
 * Estaba escrita aquí y otra vez en el overlay, con cadenas de `if` distintas,
 * y eran dos sitios que había que acordarse de tocar con cada proveedor nuevo
 * sin que nada avisara si se olvidaba uno.
 */

/**
 * Estado de la escucha, y el mando para cambiarlo.
 *
 * Es un botón y no un indicador porque son la misma pregunta: quien mira si
 * está escuchando es porque quiere que escuche. El overlay tomó esta decisión
 * antes —"el indicador **es** el mando"— y separar aquí las dos cosas dejaría
 * dos gramáticas distintas para el mismo control.
 */
function ListenButton({ status }: { status: CaptureStatus }) {
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

  const label =
    status.state === 'starting'
      ? 'Iniciando…'
      : status.state === 'error'
        ? 'Error de captura'
        : listening
          ? 'Escuchando'
          : 'En pausa';

  return (
    <button
      className="listen"
      data-state={status.state}
      disabled={busy || status.state === 'starting'}
      title={listening ? 'Detener la escucha' : 'Empezar a escuchar'}
      onClick={() => void toggle()}
    >
      <span className="listen__dot" />
      {label}
    </button>
  );
}

// ────────────────────────── General · visibilidad ──────────────────────────

/**
 * Los dos interruptores que deciden si te delata la app van destacados y
 * primero: son de los pocos ajustes que se cambian **durante** una llamada, y
 * el resto de la sección son preferencias que se tocan una vez.
 */
function VisibilityCards({ settings, patch }: { settings: Settings; patch: PatchFn }) {
  const t = useT();
  return (
    <>
      {/*
        El idioma va lo primero de todo, y no en «Acerca de» ni al final: quien
        abre los ajustes porque la app está en un idioma que no es el suyo tiene
        que encontrarlo sin leer nada más.
      */}
      <section className="card">
        <Row icon="globe" label={t('dash.language')} desc={t('dash.languageDesc')}>
          <select
            value={settings.uiLanguage}
            onChange={(e) => void patch({ uiLanguage: e.target.value as UILang })}
          >
            {UI_LANGS.map((lang) => (
              <option key={lang} value={lang}>
                {UI_LANG_LABEL[lang]}
              </option>
            ))}
          </select>
        </Row>
      </section>

      <div className="hero">
        <span className="hero__icon">
          <Icon name="eyeOff" size={19} />
        </span>
        <div className="hero__text">
          <div className="hero__title">{t('gen.stealth')}</div>
          <div className="hero__desc">{t('gen.stealthDesc')}</div>
        </div>
        <Switch
          on={settings.stealthEnabled}
          onChange={(v) => {
            void window.api.window.setStealth(v);
          }}
        />
      </div>

      <div className="hero">
        <span className="hero__icon">
          <Icon name="pointer" size={19} />
        </span>
        <div className="hero__text">
          <div className="hero__title">{t('gen.clickThrough')}</div>
          <div className="hero__desc">{t('gen.clickThroughDesc')}</div>
        </div>
        <Switch
          on={settings.clickThrough}
          onChange={(v) => {
            void window.api.window.setClickThrough(v);
          }}
        />
      </div>

      {!settings.stealthEnabled && (
        <div className="warn">
          <Tx k="gen.stealthWarn" />
        </div>
      )}

      <section className="card">
        <h2 className="card__title">{t('gen.lookTitle')}</h2>
        <p className="card__hint">{t('gen.lookHint')}</p>

        {/*
          La opacidad y el tamaño de letra existían en `Settings` y sólo se
          podían tocar editando el JSON: el overlay los aplicaba pero nadie
          tenía cómo cambiarlos.
        */}
        <Row
          icon="contrast"
          label={t('gen.opacity')}
          desc={t('gen.opacityDesc')}
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
          icon="type"
          label={t('gen.textSize')}
          desc={t('gen.textSizeDesc')}
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
          icon="collapse"
          label={t('gen.compact')}
          desc={t('gen.compactDesc')}
        >
          <Switch
            on={settings.overlayCompact}
            onChange={(v) => void patch({ overlayCompact: v })}
          />
        </Row>
      </section>

      <div className="warn">
        <Tx k="gen.protects" />
      </div>
    </>
  );
}

// ──────────────────────────── Audio · fuentes ────────────────────────────

/**
 * Qué se escucha vivía dentro de «Transcripción», que es donde se implementa y
 * no donde se busca: la pregunta que responde es de micrófonos, no de motores.
 * Su aviso más caro —la combinación que deja el auto-disparo inerte— se explica
 * en Comportamiento, así que aquí va el salto en lugar del texto repetido.
 */
function AudioSourcesCard({
  settings,
  patch,
  go,
}: {
  settings: Settings;
  patch: PatchFn;
  go: (id: SectionId) => void;
}) {
  const t = useT();
  return (
    <section className="card">
      <h2 className="card__title">{t('aud.sourcesTitle')}</h2>
      <p className="card__hint">{t('aud.sourcesHint')}</p>

      <Row
        icon="speaker"
        label={t('aud.sources')}
        desc={t(AUDIO_SOURCE_HINT[settings.audioSources])}
      >
        <select
          value={settings.audioSources}
          onChange={(e) => void patch({ audioSources: e.target.value as Settings['audioSources'] })}
        >
          <option value="both">{t('aud.both')}</option>
          <option value="system">{t('aud.systemOnly')}</option>
          <option value="mic">{t('aud.micOnly')}</option>
        </select>
      </Row>

      {autoTriggerIsInert(settings) && (
        <div className="warn">
          <Tx
            k="aud.inertWarn"
            vars={{ wanted: t(SPEAKER_LABEL[settings.autoTriggerSpeaker]) }}
          />
          <div className="field">
            <Jump to="behaviour" go={go}>
              {t('aud.seeTrigger')}
            </Jump>
          </div>
        </div>
      )}
    </section>
  );
}

// ───────────────────────── Espejo en el teléfono ─────────────────────────

/**
 * El QR, dibujado como SVG a partir de la matriz que manda el main.
 *
 * No es una imagen ni un `data:` URI: son rectángulos, así que sale nítido a
 * cualquier tamaño, no hay que ampliar la CSP y el "quiet zone" —el margen
 * blanco obligatorio de cuatro módulos, sin el cual muchos lectores no
 * enganchan— es aritmética en el `viewBox` en vez de un borde que confiar al
 * CSS.
 */
function QrCode({ modules }: { modules: boolean[][] }) {
  const t = useT();
  const size = modules.length;
  if (size === 0) return null;
  const quiet = 4;
  const side = size + quiet * 2;

  return (
    <svg
      className="qr"
      viewBox={`0 0 ${side} ${side}`}
      role="img"
      aria-label={t('ph.qrAlt')}
      shapeRendering="crispEdges"
    >
      <rect x="0" y="0" width={side} height={side} fill="#fff" />
      {modules.map((row, y) =>
        row.map((dark, x) =>
          dark ? (
            <rect key={`${x}-${y}`} x={x + quiet} y={y + quiet} width="1" height="1" fill="#000" />
          ) : null
        )
      )}
    </svg>
  );
}

/**
 * El espejo del teléfono.
 *
 * La tarjeta tiene que responder a tres preguntas, en este orden: ¿está
 * encendido?, ¿qué abro en el móvil?, y —la que de verdad importa— ¿lo estoy
 * viendo ya? La última se responde con el contador de teléfonos conectados: sin
 * él, la única forma de saber si funciona es levantarse a mirar.
 */
function PhoneMirrorCard({ settings, patch }: { settings: Settings; patch: PatchFn }) {
  const t = useT();
  const [status, setStatus] = useState<PhoneMirrorStatus | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void window.api.phone.getStatus().then(setStatus);
    return window.api.phone.onStatus(setStatus);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const on = settings.phoneMirrorEnabled;
  const running = status?.running ?? false;

  return (
    <>
      <div className="hero">
        <span className="hero__icon">
          <Icon name="phone" size={19} />
        </span>
        <div className="hero__text">
          <div className="hero__title">{t('ph.turnOn')}</div>
          <div className="hero__desc">
            {running
              ? settings.phoneMirrorLan
                ? t('ph.onLan')
                : t('ph.onLocal')
              : t('ph.offDesc')}
          </div>
        </div>
        <Switch on={on} onChange={(v) => void patch({ phoneMirrorEnabled: v })} />
      </div>

      <div className="hero">
        <span className="hero__icon">
          <Icon name="wifi" size={19} />
        </span>
        <div className="hero__text">
          <div className="hero__title">{t('ph.allowLan')}</div>
          <div className="hero__desc">
            {settings.phoneMirrorLan
              ? t('ph.lanOn')
              : t('ph.lanOff')}
          </div>
        </div>
        <Switch on={settings.phoneMirrorLan} onChange={(v) => void patch({ phoneMirrorLan: v })} />
      </div>

      {/* El aviso va donde se toma la decisión, no en el pie: encender la LAN es
          el momento en que el alcance cambia. */}
      {on && settings.phoneMirrorLan && (
        <div className="warn">
          <Tx k="ph.lanWarn" />
        </div>
      )}

      {!on && (
        <section className="card">
          <p className="card__hint" style={{ marginBottom: 0 }}>
            {t('ph.offHint')}
          </p>
        </section>
      )}

      {on && status?.error && (
        <div className="warn">No se pudo abrir el servidor: {status.error}</div>
      )}

      {/* La comprobación va sobre `status` y no sobre el `running` de arriba
          para que TypeScript sepa que aquí dentro hay estado. */}
      {on && status?.running && (
        <section className="card">
          <h2 className="card__title">{t('ph.scan')}</h2>
          <p className="card__hint">
            Abre la cámara del móvil y apunta. Si prefieres, escribe el enlace a mano — es el mismo.
          </p>

          <div className="pair">
            <QrCode modules={status.qr} />
            <div className="pair__side">
              <code className="pair__url">{status.url}</code>
              <div className="field">
                <button
                  className="btn"
                  onClick={() => {
                    void window.api.clipboard.write(status.url).then(() => setCopied(true));
                  }}
                >
                  {copied ? t('ph.copied') : t('ph.copyLink')}
                </button>
              </div>
              {/*
                La confirmación que no se puede deducir de nada más. Un QR
                bonito y un teléfono que no conecta se ven exactamente igual
                desde aquí hasta que este número se mueve.
              */}
              <div className={status.clients > 0 ? 'pair__live' : 'pair__idle'}>
                {status.clients === 0
                  ? t('ph.noClients')
                  : t('ph.clients', { count: status.clients })}
              </div>
            </div>
          </div>

          {!settings.phoneMirrorLan && (
            <div className="warn">
              <Tx k="ph.loopbackWarn" />
            </div>
          )}

          {/*
            Con VPN, Docker o VirtualBox la máquina tiene varias IPv4 y la
            heurística puede elegir la que no lleva a ninguna parte. El síntoma
            es horrible —el navegador del móvil se queda cargando sin decir
            nada— así que las demás se enseñan en vez de esconderse.
          */}
          {status.alternates.length > 0 && (
            <>
              <div className="ctxbar" style={{ marginTop: 18 }}>
                <span className="ctxbar__label">{t('ph.altsTitle')}</span>
              </div>
              <p className="card__hint" style={{ marginBottom: 6 }}>
                {t('ph.altsHint')}
              </p>
              <ul className="pair__alts">
                {status.alternates.map((url) => (
                  <li key={url}>
                    <code>{url}</code>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <section className="card">
        <h2 className="card__title">{t('ph.sentTitle')}</h2>
        <p className="card__hint" style={{ marginBottom: 0 }}>
          <Tx k="ph.sentHint" />
        </p>
      </section>
    </>
  );
}

// ──────────────────────────────── MQTT ────────────────────────────────

/**
 * Publicar las respuestas en un broker.
 *
 * La tarjeta responde a tres preguntas en este orden: ¿está conectado?, ¿a qué
 * tema me suscribo?, y —la que de verdad importa— ¿le ha llegado algo a mi
 * cacharro? La última se contesta con el contador de publicadas y con un botón
 * de prueba: un montaje roto y uno bueno se ven idénticos desde aquí hasta que
 * llega el primer mensaje, y enterarse con la primera respuesta real es
 * enterarse en el peor momento.
 */
function MqttCard({
  settings,
  presence,
  patch,
  saveSecret,
  clearSecret,
}: {
  settings: Settings;
  presence: SecretsPresence;
  patch: PatchFn;
  saveSecret: (key: SecretKey, value: string) => Promise<void>;
  clearSecret: (key: SecretKey) => Promise<void>;
}) {
  const t = useT();
  const [status, setStatus] = useState<MqttStatus | null>(null);
  const [tested, setTested] = useState<{ ok: boolean; error?: string } | null>(null);

  useEffect(() => {
    void window.api.mqtt.getStatus().then(setStatus);
    return window.api.mqtt.onStatus(setStatus);
  }, []);

  const topics = mqttTopics(settings.mqttTopic);
  const on = settings.mqttEnabled;

  return (
    <>
      <div className="hero">
        <span className="hero__icon">
          <Icon name="broadcast" size={19} />
        </span>
        <div className="hero__text">
          <div className="hero__title">{t('mq.publish')}</div>
          <div className="hero__desc">{t('mq.publishDesc')}</div>
        </div>
        <Switch on={on} onChange={(v) => void patch({ mqttEnabled: v })} />
      </div>

      {on && <MqttStatusLine status={status} />}

      <section className="card">
        <h2 className="card__title">{t('mq.brokerTitle')}</h2>
        <p className="card__hint">
          <Tx k="mq.brokerHint" /> {t('mq.brokerHint2')}
        </p>

        <Row icon="cloud" label={t('mq.address')} desc={t('mq.addressDesc')}>
          <input
            type="text"
            className="modelpick__id"
            style={{ width: 260 }}
            value={settings.mqttUrl}
            placeholder="mqtt://192.168.1.100:1883"
            onChange={(e) => void patch({ mqttUrl: e.target.value })}
          />
        </Row>

        <Row icon="file" label={t('mq.topic')} desc={t('mq.topicDesc')}>
          <input
            type="text"
            className="modelpick__id"
            style={{ width: 260 }}
            value={settings.mqttTopic}
            placeholder="tayori/answer"
            onChange={(e) => void patch({ mqttTopic: e.target.value })}
          />
        </Row>

        <Row
          icon="key"
          label={t('mq.user')}
          desc={t('mq.userDesc')}
        >
          <input
            type="text"
            style={{ width: 180, flex: 'none' }}
            value={settings.mqttUsername}
            onChange={(e) => void patch({ mqttUsername: e.target.value })}
          />
        </Row>

        <SecretField
          label="mqtt.password"
          hint="mqtt.passwordHint"
          placeholder="mqtt.passwordPlaceholder"
          present={presence.mqtt}
          onSave={(v) => saveSecret('mqtt', v)}
          onClear={() => clearSecret('mqtt')}
        />
      </section>

      {on && (
        <section className="card">
          <h2 className="card__title">{t('mq.subscribeTitle')}</h2>
          <p className="card__hint">{t('mq.twoTopics')}</p>

          <ul className="pair__alts">
            <li>
              <code>{topics.json}</code> — {t('mq.jsonTopic')}
            </li>
            <li>
              <code>{topics.text}</code> — {t('mq.textTopic')}
            </li>
          </ul>

          <p className="card__hint" style={{ marginTop: 14 }}>
            <Tx k="mq.qos" />
          </p>

          <div className="field">
            <button
              className="btn"
              disabled={status?.state !== 'connected'}
              onClick={() => {
                void window.api.mqtt.test().then(setTested);
              }}
            >
              {t('mq.testPublish')}
            </button>
            {tested && (
              <span className={tested.ok ? 'badge badge--ok' : 'badge badge--missing'}>
                {tested.ok ? t('mq.published') : (tested.error ?? t('keys.failed'))}
              </span>
            )}
          </div>
        </section>
      )}

      <div className="warn">
        <Tx k="mq.outWarn" /> {t('mq.yourDevice')}
      </div>
    </>
  );
}

/** Estado de la conexión, con el contador que es la única confirmación real. */
function MqttStatusLine({ status }: { status: MqttStatus | null }) {
  // El hook va ANTES del `return null`: React exige que el número de hooks no
  // cambie entre renders, y salir antes de llamarlo rompe esa regla.
  const t = useT();
  if (!status) return null;

  const label =
    status.state === 'connected'
      ? t('mq.connected')
      : status.state === 'connecting'
        ? t('mq.connecting')
        : status.state === 'error'
          ? t('mq.noConnection')
          : t('mq.off');

  return (
    <>
      <div className="hero">
        <span className="hero__icon">
          <span className={`listen__dot mqttdot mqttdot--${status.state}`} />
        </span>
        <div className="hero__text">
          <div className="hero__title">{label}</div>
          <div className="hero__desc">
            {status.published > 0
              ? t('mq.publishedCount', { count: status.published })
              : t('mq.nothingPublished')}
          </div>
        </div>
      </div>
      {status.error && <div className="warn">{status.error}</div>}
    </>
  );
}

// ─────────────────────────────────── Skills ───────────────────────────────────

/**
 * Las skills que hay en disco, y cuál está puesta.
 *
 * Se listan también las **rotas**, con su motivo. Es la diferencia entre "no
 * has creado ninguna" y "la tuya tiene un fallo": esconder la segunda deja a
 * alguien mirando una carpeta que sí existe sin ninguna pista de por qué la app
 * no la ve, y ése es exactamente el fallo mudo que este proyecto persigue.
 *
 * No hay editor. Un SKILL.md se escribe con el editor de cada uno, se versiona
 * y se comparte; meter un textarea aquí sería reinventar peor algo que ya
 * funciona, y además convertiría la carpeta en un formato de esta app en lugar
 * de en el formato que ya es.
 */
function SkillsCard({ settings, patch }: { settings: Settings; patch: PatchFn }) {
  const t = useT();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [folder, setFolder] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.api.skills.list().then(setSkills);
    void window.api.skills.folder().then(setFolder);
  }, []);

  const refresh = async (): Promise<void> => {
    setBusy(true);
    try {
      setSkills(await window.api.skills.reload());
    } finally {
      setBusy(false);
    }
  };

  const active = skills.find((skill) => skill.id === settings.activeSkillId && !skill.error);

  return (
    <>
      <section className="card">
        <div className="skillhead">
          <div>
            <h2 className="card__title">{t('sk.folderTitle')}</h2>
            <p className="card__hint">
              <Tx k="sk.folderHint" />
            </p>
          </div>
          <button className="btn" disabled={busy} onClick={() => void refresh()}>
            <Icon name="refresh" size={15} />
            {busy ? t('sk.reloading') : t('sk.reload')}
          </button>
        </div>

        <div className="skillfolder">
          <span className="skillfolder__icon">
            <Icon name="folder" size={18} />
          </span>
          <div className="skillfolder__text">
            <div className="skillfolder__title">{t('sk.addHere')}</div>
            <code className="skillfolder__path">{folder || '…'}</code>
          </div>
          <button className="btn" onClick={() => void window.api.skills.openFolder()}>
            {t('sk.openFolder')}
          </button>
        </div>

        <div className="warn">
          <Tx k="sk.promptWarn" />
        </div>
      </section>

      <section className="card">
        <h2 className="card__title">{t('sk.activeTitle')}</h2>
        <p className="card__hint">
          <Tx k="sk.activeHint" />
        </p>

        <Row
          icon="sparkles"
          label={t('sk.instruction')}
          desc={active ? t('sk.activeDesc') : t('sk.noneDesc')}
        >
          <select
            value={active ? active.id : ''}
            onChange={(e) => void patch({ activeSkillId: e.target.value })}
          >
            <option value="">{t('sk.none')}</option>
            {skills
              .filter((skill) => !skill.error)
              .map((skill) => (
                <option key={skill.id} value={skill.id}>
                  {skill.name}
                </option>
              ))}
          </select>
        </Row>

        {skills.length === 0 && (
          <p className="card__hint">
            <Tx k="sk.empty" />
          </p>
        )}

        <ul className="skills">
          {skills.map((skill) => (
            <li
              key={skill.id}
              className={`skill${skill.id === settings.activeSkillId && !skill.error ? ' skill--on' : ''}`}
            >
              <span className="skill__icon">
                <Icon name="sparkles" size={16} />
              </span>
              <div className="skill__body">
                <div className="skill__head">
                  <span className="skill__name">{skill.name}</span>
                  {/* El id va al lado del nombre porque es lo que se teclea tras
                      la barra, y no tiene por qué parecerse al título. */}
                  <code className="skill__id">{skill.id}</code>
                  {skill.builtIn && <span className="skill__tag">{t('sk.builtIn')}</span>}
                </div>
                {skill.error ? (
                  <p className="skill__error">{skill.error}</p>
                ) : (
                  <p className="skill__desc">
                    {skill.description || t('sk.noDescription')}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

// ─────────────────────────────── Acerca de ───────────────────────────────

/**
 * Qué es esto, qué versión y qué hace con tus datos.
 *
 * La versión importa más de lo que parece: media hora se fue en investigar un
 * fallo que ya estaba arreglado, porque nadie sabía qué build estaba corriendo
 * en la máquina donde se vio. Un número a la vista lo habría dicho en dos
 * segundos, y por eso está aquí y no escondido en el log.
 *
 * El resumen de privacidad se repite —está también en el README y en cada
 * sección que abre una salida— y la repetición es deliberada: es lo que alguien
 * necesita saber antes de dejar esto escuchando una entrevista, y no se puede
 * depender de que haya leído el README.
 */
function AboutCard() {
  const t = useT();
  const [info, setInfo] = useState<{ version: string; author: string } | null>(null);

  useEffect(() => {
    void window.api.app.getInfo().then(setInfo);
  }, []);

  return (
    <>
      <section className="card">
        <h2 className="card__title">Tayori</h2>
        <p className="card__hint">
          Un asistente que escucha una reunión o una entrevista, transcribe quién dice qué y te
          sugiere respuestas en un panel flotante que{' '}
          <strong>no aparece cuando compartes pantalla</strong>. También resuelve el código o el
          test que tengas delante, leyéndolo de una captura.
        </p>

        <Row icon="check" label={t('about.version')}>
          <code className="aboutval">{info?.version ?? '…'}</code>
        </Row>
        <Row icon="check" label={t('about.author')}>
          <code className="aboutval">{info?.author ?? '@cflarios'}</code>
        </Row>
        <Row icon="check" label={t('about.license')} desc={t('about.licenseDesc')}>
          <code className="aboutval">MIT</code>
        </Row>
      </section>

      <section className="card">
        <h2 className="card__title">{t('about.dataTitle')}</h2>
        <p className="card__hint">
          Es lo que conviene tener claro antes de dejarlo escuchando algo importante.
        </p>

        <div className="about">
          <p>
            <Tx k="about.audio" />
          </p>
          <p>
            <Tx k="about.text" />
          </p>
          <p>
            <Tx k="about.noServer" />
          </p>
          <p>
            <Tx k="about.offline" />
          </p>
        </div>

        <div className="warn">
          {t('about.legal')}
        </div>
      </section>
    </>
  );
}

// ──────────────────────────── Modelos · claves ────────────────────────────

/**
 * Ollama, en la tarjeta de las claves aunque no tenga ninguna.
 *
 * Fue una decisión con dudas y ésta es la razón de resolverla así: la tarjeta
 * no va de claves, va de **«¿está esto listo para responder?»**. Ollama entra
 * en esa pregunta igual que los demás; lo único que cambia es que su respuesta
 * no depende de una credencial sino de que el servidor esté vivo. Dejarlo fuera
 * obligaría a buscar esa comprobación en otro sitio sólo porque es local.
 *
 * Por eso no tiene campo de texto: no hay nada que pegar. Tiene la etiqueta que
 * dice que no le hace falta, y el mismo botón que los demás.
 */
function OllamaCheck() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [tested, setTested] = useState<{ ok: boolean; error?: string } | null>(null);

  const test = async (): Promise<void> => {
    setBusy(true);
    setTested(null);
    try {
      setTested(await window.api.llm.testConnection('ollama'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="row__label">{t('keys.ollama')}</span>
        <span className="badge badge--ok">{t('keys.ollamaBadge')}</span>
      </div>
      <div className="row__desc">{t('keys.ollamaHint')}</div>
      <div className="field">
        <button className="btn" disabled={busy} onClick={() => void test()}>
          {busy ? t('keys.testing') : t('keys.test')}
        </button>
        {tested && (
          <span className={tested.ok ? 'badge badge--ok' : 'badge badge--missing'}>
            {tested.ok ? t('keys.ok') : (tested.error ?? t('keys.failed'))}
          </span>
        )}
      </div>
    </div>
  );
}

function ApiKeysCard({
  presence,
  saveSecret,
  clearSecret,
}: {
  presence: SecretsPresence;
  saveSecret: (key: SecretKey, value: string) => Promise<void>;
  clearSecret: (key: SecretKey) => Promise<void>;
}) {
  const t = useT();
  return (
    <section className="card">
      <h2 className="card__title">{t('keys.title')}</h2>
      <p className="card__hint">{t('keys.hint')}</p>

      <SecretField
        label="keys.anthropic"
        hint="keys.anthropicHint"
        present={presence.anthropic}
        onSave={(v) => saveSecret('anthropic', v)}
        onClear={() => clearSecret('anthropic')}
        onTest={() => window.api.llm.testConnection('claude')}
      />
      <SecretField
        label="keys.google"
        hint="keys.googleHint"
        present={presence.google}
        onSave={(v) => saveSecret('google', v)}
        onClear={() => clearSecret('google')}
        onTest={() => window.api.llm.testConnection('gemini')}
      />
      <SecretField
        label="keys.openai"
        hint="keys.openaiHint"
        present={presence.openai}
        onSave={(v) => saveSecret('openai', v)}
        onClear={() => clearSecret('openai')}
        onTest={() => window.api.llm.testConnection('openai')}
      />
      <SecretField
        label="keys.deepseek"
        hint="keys.deepseekHint"
        present={presence.deepseek}
        onSave={(v) => saveSecret('deepseek', v)}
        onClear={() => clearSecret('deepseek')}
        onTest={() => window.api.llm.testConnection('deepseek')}
      />
      <OllamaCheck />
    </section>
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
  const t = useT();
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
      <h2 className="card__title">{t('screen.title')}</h2>
      <p className="card__hint">
        <Tx k="screen.hint" />
      </p>

      <Row icon="cpu" label={t('model.provider')} desc={t('screen.providerDesc')}>
        <select
          value={provider}
          onChange={(e) =>
            void patch({
              screenProviderId: e.target.value as Settings['screenProviderId'],
              // Cambiar de proveedor invalida el modelo elegido: los ids no se
              // parecen en nada entre un proveedor y el siguiente.
              screenModel: '',
            })
          }
        >
          <option value="same">{t('screen.same')}</option>
          <option value="claude">{t('screen.claude')}</option>
          <option value="gemini">{t('screen.gemini')}</option>
          <option value="openai">{t('screen.openai')}</option>
          {/* DeepSeek no sale aquí: ninguno de sus modelos lee imágenes, y esta
              tarjeta existe para elegir el que SÍ tiene que leer la pantalla.
              Ofrecerlo sería ofrecer la opción que garantiza que los dos botones
              fallen. Se puede escribir a mano si algún día sacan uno con visión. */}
          <option value="ollama">{t('screen.ollama')}</option>
        </select>
      </Row>

      {provider !== 'same' && (
        <Row
          icon="monitor"
          label={t('model.model')}
          desc={
            models.length === 0
              ? t('screen.noModels')
              : provider === 'ollama'
                ? t('screen.visionOnly')
                : t('screen.visionOnlyCloud')
          }
        >
          <ModelPicker
            providerId={provider}
            models={models.map((m) => ({
              ...m,
              // La visión decide si este modelo sirve para lo único que hace
              // esta tarjeta, así que va en la etiqueta y no en una nota aparte.
              label: `${m.label}${m.supportsVision ? t('screen.seesImages') : t('screen.noVision')}`,
            }))}
            value={target.model}
            onChange={(screenModel) => void patch({ screenModel })}
          />
        </Row>
      )}

      {blind && (
        <div className="warn">
          <Tx k="screen.blind" vars={{ model: target.model }} />
        </div>
      )}

      {provider === 'same' && settings.llmProviderId === 'ollama' && (
        <div className="warn">
          <Tx k="screen.allOllama" />
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
  const t = useT();
  const [specs, setSpecs] = useState<SystemSpecs | null>(null);
  const [copied, setCopied] = useState('');
  const [guide, setGuide] = useState<{ ok: boolean; error?: string } | null>(null);
  /** Lo que Ollama dice tener descargado. Vacío si no está corriendo. */
  const [installed, setInstalled] = useState<string[]>([]);

  useEffect(() => {
    void window.api.system.getSpecs().then(setSpecs);
    void window.api.ollama
      .getStatus()
      .then((status) => setInstalled(status.models.map((m) => m.id)))
      .catch(() => setInstalled([]));
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

  /**
   * Si el modelo recomendado ya está descargado.
   *
   * Se compara tolerando la etiqueta implícita: Ollama lista `llama3.2:latest`
   * para lo que uno descargó como `llama3.2`, así que una comparación exacta
   * diría que falta algo que está ahí — y mandaría a repetir una descarga de
   * varios gigas.
   */
  const has = (model: string): boolean => {
    const base = model.includes(':') ? model : `${model}:latest`;
    return installed.some((id) => id === model || id === base);
  };

  /** El botón de copiar el `pull`, o la confirmación de que ya no hace falta. */
  const action = (model: string): React.ReactNode =>
    has(model) ? (
      <span className="badge badge--ok">ya instalado</span>
    ) : (
      <button className="btn btn--small" onClick={() => pull(model)}>
        {copied === model ? '¡copiado!' : `ollama pull ${model}`}
      </button>
    );

  return (
    <section className="card" id="local-models">
      <h2 className="card__title">{t('local.title')}</h2>
      <p className="card__hint">{t('local.hint')}</p>

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

      <Row icon="waveform" label="Para conversar" desc={advice.chat.note}>
        {action(advice.chat.model)}
      </Row>

      <Row icon="monitor" label="Para leer la pantalla" desc={advice.vision.note}>
        {action(advice.vision.model)}
      </Row>

      <div className="warn">{advice.caveat}</div>

      {/*
        La tarjeta responde "¿qué me pongo?" en dos líneas, que es lo que hace
        falta con la ventana delante. La guía responde a la de al lado —"¿y por
        qué, y qué más hay, y cuánto cuesta?"—, que necesita tablas y en esta
        columna sería un muro. Va a un documento y no a otra ventana de la app:
        cada ventana de Electron hay que registrarla en la protección de captura.
      */}
      <Row
        icon="book"
        label={t('local.guide')}
        desc={t('local.guideDesc')}
      >
        <button
          className="btn"
          onClick={() => {
            void window.api.guide.open().then(setGuide);
          }}
        >
          {t('local.openGuide')}
        </button>
      </Row>

      {guide && !guide.ok && (
        <div className="warn">
          {t('local.guideFailed')} {guide.error ?? t('overlay.unknownError')}
        </div>
      )}

      <p className="card__hint" style={{ marginTop: 12, marginBottom: 0 }}>
        La VRAM de la tarjeta gráfica —el dato que de verdad decide si un modelo va rápido— no se
        puede leer de forma fiable desde aquí, así que <strong>no se estima</strong>: estas
        recomendaciones se basan en la RAM. Si el modelo no cabe en la GPU, Ollama lo reparte con la
        CPU y va mucho más lento, aunque quepa en memoria. Los nombres pueden cambiar con el tiempo;
        la lista viva está en <code>ollama.com/library</code>.
      </p>
    </section>
  );
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
  const t = useT();
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
      label={t(HOTKEY_LABEL[action])}
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
function HotkeysCard({
  settings,
  patch,
  failed,
}: {
  settings: Settings;
  patch: PatchFn;
  /* La lista la mantiene el shell: la barra lateral marca esta sección en rojo
     aunque no esté abierta, y para eso el aviso no puede vivir aquí dentro. */
  failed: string[];
}) {
  const t = useT();
  const duplicated = duplicateAccelerators(settings.hotkeys);
  const actions = Object.keys(HOTKEY_LABEL) as (keyof HotkeyMap)[];

  return (
    <section className="card">
      {failed.length > 0 && (
        <div className="warn">
          {failed.length === 1 ? (
            <>
              Windows rechazó este atajo: <strong>{formatAccelerator(failed[0] ?? '')}</strong>.
              Otra aplicación lo tiene tomado, así que <strong>no hará nada</strong> hasta que
              elijas otro.
            </>
          ) : (
            <>
              Windows rechazó estos atajos:{' '}
              <strong>{failed.map(formatAccelerator).join(', ')}</strong>. Otra aplicación los tiene
              tomados, así que <strong>no harán nada</strong> hasta que elijas otros.
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
          <div className="row__label">{t('hk.reset')}</div>
          <div className="row__desc">{t('hk.resetDesc')}</div>
        </div>
        <button className="btn" onClick={() => void patch({ hotkeys: DEFAULT_HOTKEYS })}>
          {t('hk.resetButton')}
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
  const t = useT();
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
      <p className="card__hint">
        El registro del proceso principal se guarda en{' '}
        <code>{location || 'tu carpeta de datos'}</code>.
      </p>

      <Row
        icon="activity"
        label={t('diag.testStt')}
        desc={t('diag.testSttDesc')}
      >
        <button className="btn" disabled={testing} onClick={() => void runTest()}>
          {testing ? t('keys.testing') : t('keys.test')}
        </button>
      </Row>

      {result && (
        <div className={result.ok ? 'diag diag--ok' : 'warn'}>
          <strong>{result.ok ? t('diag.works') : t('diag.failed')}</strong> {result.detail}
        </div>
      )}

      <div className="field" style={{ marginTop: 12 }}>
        <button className="btn" onClick={refresh}>
          Actualizar registro
        </button>
        <button className="btn" disabled={!log} onClick={() => void copy()}>
          {copied ? t('diag.copied') : t('diag.copy')}
        </button>
      </div>

      <pre className="logview">{log || t('diag.emptyLog')}</pre>
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
  const t = useT();
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
      <Row
        icon="history"
        label={t('hist.save')}
        desc={
          settings.historyEnabled
            ? t('hist.on', { where: location || t('hist.yourFolder') })
            : t('hist.off')
        }
      >
        <Switch on={settings.historyEnabled} onChange={(v) => void patch({ historyEnabled: v })} />
      </Row>

      {items.length === 0 && (
        <p className="card__hint" style={{ marginBottom: 0 }}>
          {settings.historyEnabled ? t('hist.emptyOn') : t('hist.emptyOff')}
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
                {t('hist.meta', {
                  date: dateFormat.format(item.startedAt),
                  turns: item.turnCount,
                  segments: item.segmentCount,
                })}
              </span>
            </button>
            <button className="btn btn--danger" onClick={() => void remove(item.id)}>
              {t('hist.delete')}
            </button>
          </div>

          {openId === item.id && detail?.id === item.id && (
            <div className="conv__body">
              {detail.turns.map((turn) => (
                <div key={turn.id} className="turn">
                  <div className="turn__q">{turn.question || t('hist.noQuestion')}</div>
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
                  <div className="conv__subtitle">{t('hist.transcript')}</div>
                  <div className="conv__transcript">
                    {detail.segments.map((seg) => (
                      <div key={seg.id} className="conv__line">
                        <span className={`transcript-who transcript-who--${seg.speaker}`}>
                          {seg.speaker === 'me' ? t('overlay.me') : t('overlay.them')}
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
              ? t('hist.showLast', { count: VISIBLE })
              : t('hist.showAll', { count: items.length })}
          </button>
        </div>
      )}

      {items.length > 0 && (
        <div className="field">
          {confirmingClear ? (
            <>
              <span className="row__desc" style={{ flex: 1 }}>
                {t('hist.clearConfirm', { count: items.length })}
              </span>
              <button className="btn btn--danger" onClick={() => void clearAll()}>
                {t('hist.clearYes')}
              </button>
              <button className="btn" onClick={() => setConfirmingClear(false)}>
                {t('hist.cancel')}
              </button>
            </>
          ) : (
            <button className="btn btn--danger" onClick={() => setConfirmingClear(true)}>
              {t('hist.clearAll')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────── Modelo ───────────────────────────────

type PatchFn = (p: Partial<Settings>) => Promise<void>;

/** Valor centinela del desplegable para "voy a escribirlo yo". */
const CUSTOM_MODEL = '__custom__';

/**
 * Elegir modelo: del catálogo, o escribiéndolo.
 *
 * El catálogo de los proveedores de nube está escrito en el código, así que
 * envejece:
 * cada modelo nuevo del proveedor tarda en llegar aquí lo que tarde una versión
 * de la app, y mientras tanto no hay forma de usarlo aunque tu cuenta tenga
 * acceso. La lista sigue siendo lo primero que se ve —es lo que quiere el 90% y
 * evita teclear un id de memoria— pero deja de ser una frontera.
 *
 * **Con Ollama no se ofrece**, y no es una omisión: esa lista no es un catálogo
 * nuestro, es lo que el servidor local dice tener descargado. Escribir ahí el
 * nombre de un modelo que no está instalado no lo instala; sólo produce un
 * error más tarde y más lejos.
 */
function ModelPicker({
  providerId,
  models,
  value,
  onChange,
}: {
  providerId: LLMProviderId | 'same';
  models: ModelInfo[];
  value: string;
  onChange: (model: string) => void;
}) {
  const t = useT();
  /** El usuario pidió escribirlo; se recuerda aunque borre el campo. */
  const [manual, setManual] = useState(false);

  const allowCustom = providerId !== 'ollama';
  const known = models.some((m) => m.id === value);

  /*
   * Se escribe a mano si lo pidió, o si lo guardado no está en el catálogo —
   * que es justo el caso de quien ya tecleó uno y vuelve al dashboard. La
   * comprobación exige que la lista haya llegado: mientras carga está vacía y
   * TODO parecería escrito a mano, así que el campo aparecería y desaparecería
   * solo en cada apertura.
   */
  const typing = allowCustom && (manual || (Boolean(value) && models.length > 0 && !known));

  return (
    <div className="modelpick">
      <select
        value={typing ? CUSTOM_MODEL : known ? value : ''}
        disabled={models.length === 0 && !allowCustom}
        onChange={(e) => {
          if (e.target.value === CUSTOM_MODEL) {
            setManual(true);
            return;
          }
          setManual(false);
          onChange(e.target.value);
        }}
      >
        {/* Un select controlado necesita SIEMPRE una option con su valor, o el
            navegador pinta la primera como elegida sin disparar onChange y la
            UI miente. Ya costó un rato una vez. */}
        {!typing && !known && (
          <option value="">{models.length === 0 ? t('model.none') : t('model.pick')}</option>
        )}
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
        {allowCustom && <option value={CUSTOM_MODEL}>{t('model.other')}</option>}
      </select>

      {typing && (
        <input
          type="text"
          className="modelpick__id"
          placeholder={t('model.idPlaceholder')}
          value={value}
          autoFocus
          // Se normaliza en cada tecla: un id pegado desde la documentación
          // trae espacios que producen un 404 imposible de ver a simple vista.
          onChange={(e) => onChange(normalizeModelId(e.target.value))}
        />
      )}
    </div>
  );
}

function ModelCard({ settings, patch }: { settings: Settings; patch: PatchFn }) {
  const t = useT();
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

        /*
         * Si NO hay modelo guardado, hay que persistir uno. Un <select>
         * controlado cuyo `value` no existe entre sus <option> pinta la primera
         * opción como elegida pero no dispara `onChange`: la UI decía
         * "llama3.2:3b" mientras los settings seguían con "", y cada respuesta
         * fallaba con "no hay ningún modelo seleccionado".
         *
         * La condición es "está vacío", NO "no está en la lista", y la
         * diferencia importa desde que se pueden escribir modelos a mano: con
         * la comprobación anterior, un id tecleado —o uno del catálogo que un
         * día se retire— se sustituía solo por el primero de la lista al
         * reabrir el dashboard. Cambiar el modelo de alguien a su espalda es
         * malo con uno local y peor con uno de pago.
         */
        const stored = await window.api.settings.get();
        const currentModel = stored.llmModels[provider];
        const first = models[0];
        if (!first || currentModel) return;
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
      <h2 className="card__title">{t('model.title')}</h2>
      <p className="card__hint">{t('model.hint')}</p>

      <Row icon="cpu" label={t('model.provider')}>
        <select
          value={settings.llmProviderId}
          onChange={(e) => void patch({ llmProviderId: e.target.value as LLMProviderId })}
        >
          <option value="claude">Claude (Anthropic)</option>
          <option value="gemini">Gemini (Google)</option>
          <option value="openai">ChatGPT (OpenAI)</option>
          <option value="deepseek">DeepSeek</option>
          <option value="ollama">Ollama (local)</option>
        </select>
      </Row>

      <Row
        icon="sliders"
        label={t('model.model')}
        desc={
          // El diagnóstico detallado lo da el panel de estado de abajo; aquí
          // solo se apunta hacia él para no decir lo mismo dos veces.
          provider === 'ollama' && models.length === 0
            ? t('model.noneAvailable')
            : provider !== 'ollama'
              ? t('model.catalogHint')
              : undefined
        }
      >
        <ModelPicker
          providerId={provider}
          models={models}
          value={selectedModel}
          onChange={(model) =>
            void patch({ llmModels: { ...settings.llmModels, [provider]: model } })
          }
        />
      </Row>

      <div className="field">
        <button className="btn" disabled={busy} onClick={() => void runTest()}>
          {busy ? t('keys.testing') : t('model.test')}
        </button>
        {test && (
          <span className={test.ok ? 'badge badge--ok' : 'badge badge--missing'}>
            {test.ok ? t('keys.ok') : (test.error ?? t('keys.failed'))}
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
          icon="file"
          label={t('model.ollamaContext')}
          desc={t('model.ollamaContextDesc')}
        >
          <select
            value={settings.ollamaContextTokens}
            onChange={(e) => void patch({ ollamaContextTokens: Number(e.target.value) })}
          >
            <option value={2048}>{t('model.ctxDefault')}</option>
            <option value={4096}>4096</option>
            <option value={8192}>{t('model.ctxRecommended')}</option>
            <option value={16384}>{t('model.ctxLongCv')}</option>
            <option value={32768}>{t('model.ctxHeavy')}</option>
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
          {status.error} Instálalo desde <strong>ollama.com</strong> y déjalo corriendo; el servidor
          arranca solo tras la instalación.
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

function TranscriptionCard({
  settings,
  patch,
  go,
}: {
  settings: Settings;
  patch: PatchFn;
  go: (id: SectionId) => void;
}) {
  const t = useT();
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
      if (!result.ok) setError(result.error ?? t('stt.downloadFailed'));
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
      <Row
        icon="waveform"
        label={t('stt.engine')}
        desc={
          <>
            {t('stt.engineDesc')}{' '}
            <Jump to="audio" go={go}>
              {t('stt.goAudio')}
            </Jump>
          </>
        }
      >
        <select
          value={settings.sttProviderId}
          onChange={(e) =>
            void patch({ sttProviderId: e.target.value as Settings['sttProviderId'] })
          }
        >
          <option value="openai-live">{t('stt.openaiLive')}</option>
          <option value="openai-transcribe">{t('stt.openaiTranscribe')}</option>
          <option value="gemini-live">{t('stt.geminiLive')}</option>
          <option value="gemini-audio">{t('stt.geminiAudio')}</option>
          <option value="whisper-local">{t('stt.whisperLocal')}</option>
        </select>
      </Row>

      {(settings.sttProviderId === 'openai-live' ||
        settings.sttProviderId === 'openai-transcribe') && (
        <p className="card__hint">
          {settings.sttProviderId === 'openai-live' ? (
            <Tx k="stt.openaiLiveHint" />
          ) : (
            <Tx k="stt.openaiTranscribeHint" />
          )}{' '}
          {t('stt.openaiKeyNote')}
        </p>
      )}

      {settings.sttProviderId === 'gemini-audio' && (
        <div className="diag diag--ok">
          <Tx k="stt.geminiAudioNote" />
        </div>
      )}

      <Row
        icon="globe"
        label={t('stt.language')}
        desc={t('stt.languageDesc')}
      >
        <select
          value={settings.language}
          onChange={(e) => void patch({ language: e.target.value })}
        >
          <option value="auto">{t('stt.auto')}</option>
          <option value="es">{t('stt.langEs')}</option>
          <option value="en">{t('stt.langEn')}</option>
          <option value="pt">{t('stt.langPt')}</option>
          <option value="fr">{t('stt.langFr')}</option>
          <option value="de">{t('stt.langDe')}</option>
        </select>
      </Row>

      {/*
        El aviso es fuerte porque el fallo es silencioso y muy desconcertante:
        pasó de verdad con el idioma en inglés y alguien hablando español.
        Whisper devolvía "Are y'all gonna eat?" y el modelo respondía a eso.
      */}
      {settings.language !== 'auto' && (
        <div className="warn">
          <Tx
            k="stt.forcedWarn"
            vars={{ lang: LANGUAGE_LABEL[settings.language] ?? settings.language }}
          />
        </div>
      )}

      {settings.sttProviderId === 'whisper-local' && (
        <>
          <Row
            icon="cpu"
            label={t('stt.whisperModel')}
            desc={
              settings.language === 'en' || settings.language === 'auto'
                ? t('stt.whisperModelDesc')
                : t('stt.whisperModelDescNonEn')
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
            icon="download"
            label={ready ? t('stt.whisperReady') : t('stt.whisperMissing')}
            desc={
              ready
                ? t('stt.whisperReadyDesc')
                : t('stt.whisperMissingDesc', {
                    what: [
                      !status.binaryInstalled ? t('stt.whisperBinary') : '',
                      !status.modelInstalled ? t('stt.whisperModelPart') : '',
                    ]
                      .filter(Boolean)
                      .join(t('stt.and')),
                  })
            }
          >
            {!ready && (
              <button className="btn" disabled={installing} onClick={() => void install()}>
                {installing ? t('stt.downloading') : t('stt.download')}
              </button>
            )}
            {ready && <span className="badge badge--ok">{t('stt.installed')}</span>}
          </Row>

          {installing && (
            <div className="progress">
              <div className="progress__label">
                {progress?.target === 'binary' ? t('stt.progressBinary') : t('stt.progressModel')}
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
const AUDIO_SOURCE_HINT: Record<Settings['audioSources'], UIKey> = {
  both: 'aud.hintBoth',
  system: 'aud.hintSystem',
  mic: 'aud.hintMic',
};

/**
 * El equilibrio correcto depende de para qué uses la app, así que los textos
 * describen el caso de uso y no el algoritmo: nadie elige "recall" a ciegas.
 */
const SENSITIVITY_HINT: Record<Settings['autoTriggerSensitivity'], UIKey> = {
  strict: 'beh.sensStrictHint',
  balanced: 'beh.sensBalancedHint',
  all: 'beh.sensAllHint',
};

/** Nombres de los hablantes en los avisos, para no repetirlos en cada texto. */
const SPEAKER_LABEL: Record<'me' | 'them' | 'any', UIKey> = {
  them: 'beh.speakerThemShort',
  me: 'beh.speakerMeShort',
  any: 'beh.speakerAnyShort',
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

function BehaviourCard({
  settings,
  patch,
  go,
}: {
  settings: Settings;
  patch: PatchFn;
  go: (id: SectionId) => void;
}) {
  const t = useT();
  return (
    <section className="card">
      <Row
        icon="bolt"
        label={t('beh.auto')}
        desc={t('beh.autoDesc')}
      >
        <select
          value={settings.autoTriggerMode}
          onChange={(e) =>
            void patch({ autoTriggerMode: e.target.value as Settings['autoTriggerMode'] })
          }
        >
          <option value="off">{t('beh.autoOff')}</option>
          <option value="heuristic">{t('beh.autoHeuristic')}</option>
          <option value="heuristic+classifier">{t('beh.autoClassifier')}</option>
        </select>
      </Row>

      {settings.autoTriggerMode === 'heuristic+classifier' && (
        <div className="warn">
          <Tx k="beh.classifierWarn" />
          <br />
          <Tx k="beh.classifierCost" />
        </div>
      )}

      {settings.autoTriggerMode !== 'off' && (
        <>
          <Row
            icon="mic"
            label={t('beh.speaker')}
            desc={t('beh.speakerDesc')}
          >
            <select
              value={settings.autoTriggerSpeaker}
              onChange={(e) =>
                void patch({
                  autoTriggerSpeaker: e.target.value as Settings['autoTriggerSpeaker'],
                })
              }
            >
              <option value="them">{t('beh.speakerThem')}</option>
              <option value="me">{t('beh.speakerMe')}</option>
              <option value="any">{t('beh.speakerAny')}</option>
            </select>
          </Row>

          <Row
            icon="waveform"
            label={t('beh.sensitivity')}
            desc={t(SENSITIVITY_HINT[settings.autoTriggerSensitivity])}
          >
            <select
              value={settings.autoTriggerSensitivity}
              onChange={(e) =>
                void patch({
                  autoTriggerSensitivity: e.target.value as Settings['autoTriggerSensitivity'],
                })
              }
            >
              <option value="strict">{t('beh.sensStrict')}</option>
              <option value="balanced">{t('beh.sensBalanced')}</option>
              <option value="all">{t('beh.sensAll')}</option>
            </select>
          </Row>

          {/* La combinación imposible no da ningún síntoma: el audio llega, se
              transcribe, y el disparo descarta todo en silencio. Por eso se
              avisa aquí y no solo en el log del proceso principal. */}
          {autoTriggerIsInert(settings) && (
            <div className="warn">
              <Tx
                k="beh.inertWarn"
                vars={{
                  wanted: t(SPEAKER_LABEL[settings.autoTriggerSpeaker]),
                  heard: speakersFor(settings.audioSources)
                    .map((speaker) => t(SPEAKER_LABEL[speaker]))
                    .join(t('stt.and')),
                }}
              />
              <div className="field">
                <Jump to="audio" go={go}>
                  {t('beh.changeSources')}
                </Jump>
              </div>
            </div>
          )}
        </>
      )}

      <Row
        icon="clock"
        label={t('beh.window')}
        desc={t('beh.windowDesc')}
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

      <Row
        icon="file"
        label={t('beh.profile')}
        desc={t('beh.profileDesc')}
      >
        <select
          value={settings.promptProfileId}
          onChange={(e) =>
            void patch({ promptProfileId: e.target.value as Settings['promptProfileId'] })
          }
        >
          <option value="interview">{t('beh.profInterview')}</option>
          <option value="meeting">{t('beh.profMeeting')}</option>
          <option value="lecture">{t('beh.profLecture')}</option>
          <option value="support">{t('beh.profSupport')}</option>
          <option value="coding">{t('beh.profCoding')}</option>
          <option value="quiz">{t('beh.profQuiz')}</option>
          <option value="custom">{t('beh.profCustom')}</option>
        </select>
      </Row>

      {/*
        Se enseña siempre, no sólo con el perfil "Código" puesto: el camino
        normal al modo código es Ctrl+Alt+C, que resuelve la pantalla SIN tocar
        el perfil. Esconder este ajuste detrás del perfil lo dejaría invisible
        justo para quien más lo va a usar.
      */}
      <Row
        icon="monitor"
        label={t('beh.codeLang')}
        desc={t('beh.codeLangDesc')}
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
          placeholder={t('beh.customPlaceholder')}
          value={settings.customPrompt}
          onChange={(e) => void patch({ customPrompt: e.target.value })}
          style={{ marginTop: 10 }}
        />
      )}
    </section>
  );
}

// ──────────────────────────── Context packs ────────────────────────────

const PROFILE_LABEL: Record<Settings['promptProfileId'], UIKey> = {
  interview: 'beh.profInterview',
  meeting: 'beh.profMeeting',
  lecture: 'beh.profLecture',
  support: 'beh.profSupport',
  coding: 'overlay.profileCoding',
  quiz: 'overlay.profileQuiz',
  custom: 'beh.profCustom',
};

/** Qué pedirle al usuario en cada hueco, y por qué le conviene rellenarlo. */
const SLOT_HELP: Record<ContextKind, { placeholder: UIKey; hint: UIKey }> = {
  cv: { placeholder: 'ctx.cvPlaceholder', hint: 'ctx.cvHint' },
  job: { placeholder: 'ctx.jobPlaceholder', hint: 'ctx.jobHint' },
  qa: { placeholder: 'ctx.qaPlaceholder', hint: 'ctx.qaHint' },
  vocabulary: { placeholder: 'ctx.vocabularyPlaceholder', hint: 'ctx.vocabularyHint' },
  notes: { placeholder: 'ctx.notesPlaceholder', hint: 'ctx.notesHint' },
};

/**
 * El nombre de cada tipo, **para la interfaz**.
 *
 * `CONTEXT_KIND_LABEL` de `shared/types.ts` se queda como está y en español: lo
 * usa `prompt.ts` para rotular los bloques que se le mandan al modelo, y los
 * prompts no se traducen. Son dos usos del mismo concepto con destinatarios
 * distintos —una persona y un modelo— y mezclarlos metería una clave sin
 * traducir dentro del system prompt.
 */
const CONTEXT_KIND_KEY: Record<ContextKind, UIKey> = {
  cv: 'ctx.kindCv',
  job: 'ctx.kindJob',
  qa: 'ctx.kindQa',
  vocabulary: 'ctx.kindVocabulary',
  notes: 'ctx.kindNotes',
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
  const t = useT();
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
        name: t(CONTEXT_KIND_KEY[kind]),
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
        name: t('ctx.newName'),
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
    <section className="card">
      <div className="ctxbar ctxbar--first">
        <span className="ctxbar__label">{t('ctx.preparingFor')}</span>
        <strong className="ctxbar__profile">{t(PROFILE_LABEL[profile])}</strong>
        <span className="ctxbar__spacer" />
        <span className="ctxbar__active">
          {activeNow.length
            ? t('ctx.inUse', {
                count: activeNow.length,
                names: activeNow.map((pack) => pack.name).join(', '),
              })
            : t('ctx.nothingActive')}
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
        <span className="ctxbar__label">{t('ctx.others')}</span>
        <span className="ctxbar__spacer" />
        <span className="ctxbar__active">{t('ctx.othersNote')}</span>
      </div>

      {others.length === 0 && (
        <p className="card__hint" style={{ marginBottom: 0 }}>
          {t('ctx.noOthers')}
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
              {(Object.keys(CONTEXT_KIND_KEY) as ContextKind[]).map((k) => (
                <option key={k} value={k}>
                  {t(CONTEXT_KIND_KEY[k])}
                </option>
              ))}
            </select>
            <Switch on={pack.enabled} onChange={(v) => update(pack.id, { enabled: v })} />
            <button className="btn btn--danger" onClick={() => remove(pack.id)}>
              {t('ctx.remove')}
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
                {t(PROFILE_LABEL[p])}
              </label>
            ))}
          </div>
          <textarea
            placeholder={t('ctx.pasteHere')}
            value={pack.content}
            onChange={(e) => update(pack.id, { content: e.target.value })}
          />
        </div>
      ))}

      <div className="field">
        <button className="btn" onClick={addOwn}>
          {t('ctx.addOwn')}
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
  const t = useT();
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
        <strong className="slot__title">{t(CONTEXT_KIND_KEY[kind])}</strong>
        {pack && <Switch on={pack.enabled} onChange={onToggle} />}
        <button className="btn" onClick={() => fileRef.current?.click()}>
          {t('ctx.import')}
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
        placeholder={t(help.placeholder)}
        value={pack?.content ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

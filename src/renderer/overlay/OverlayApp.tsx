import { useEffect, useRef, useState } from 'react';
import { useChromeMouse, useOverlayDrag } from './useChromeMouse';
import type {
  Answer,
  AudioLevels,
  CaptureStatus,
  ImageAttachment,
  OverlaySize,
  Settings,
  TranscriptSegment,
} from '@shared/types';

/** Cuántas líneas de transcript mostramos; el overlay debe ocupar poco espacio. */
const VISIBLE_LINES = 6;

const STATUS_LABEL: Record<CaptureStatus['state'], string> = {
  idle: 'En pausa',
  starting: 'Iniciando…',
  listening: 'Escuchando',
  error: 'Error',
};

/** Engranaje y X, dibujados en línea para no depender de una fuente de iconos. */
function GearIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 10.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Zm0-1.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
      />
      <path
        fill="currentColor"
        d="M6.94 1.5a.75.75 0 0 0-.74.63l-.19 1.15a4.9 4.9 0 0 0-.83.48l-1.09-.42a.75.75 0 0 0-.92.33l-1.06 1.84a.75.75 0 0 0 .18.95l.9.73a4.98 4.98 0 0 0 0 .96l-.9.73a.75.75 0 0 0-.18.95l1.06 1.84c.19.32.57.46.92.33l1.09-.42c.26.19.54.35.83.48l.19 1.15c.06.36.38.63.74.63h2.12c.36 0 .68-.27.74-.63l.19-1.15c.29-.13.57-.29.83-.48l1.09.42c.35.13.73-.01.92-.33l1.06-1.84a.75.75 0 0 0-.18-.95l-.9-.73a4.98 4.98 0 0 0 0-.96l.9-.73a.75.75 0 0 0 .18-.95L13.8 3.67a.75.75 0 0 0-.92-.33l-1.09.42a4.9 4.9 0 0 0-.83-.48l-.19-1.15a.75.75 0 0 0-.74-.63H6.94Z"
        opacity=".55"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        d="M4 4l8 8M12 4l-8 8"
      />
    </svg>
  );
}

/** Hoja en blanco: empezar una conversación nueva. */
function NewChatIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        d="M13.5 8.2v3.1a1.4 1.4 0 0 1-1.4 1.4H6l-3 2.2v-2.2a1.4 1.4 0 0 1-1.4-1.4v-6A1.4 1.4 0 0 1 3 3.7h4.6"
      />
      <path
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        d="M12 1.8v4.4M9.8 4h4.4"
      />
    </svg>
  );
}

function StatusBar({
  status,
  levels,
  stealth,
  language,
  onDragStart,
  onNewConversation,
}: {
  status: CaptureStatus;
  levels: AudioLevels;
  stealth: boolean;
  language: string;
  onDragStart: (event: React.MouseEvent) => void;
  onNewConversation: () => void;
}) {
  const dotClass =
    status.state === 'listening'
      ? 'statusbar__dot statusbar__dot--listening'
      : status.state === 'error'
        ? 'statusbar__dot statusbar__dot--error'
        : 'statusbar__dot';

  return (
    // `data-interactive` es lo que hace que la ventana deje de ignorar el ratón
    // mientras el cursor está aquí; sin él, con los clics atravesables activos
    // no se podría ni arrastrar ni pulsar los botones.
    <div className="statusbar" data-interactive onMouseDown={onDragStart}>
      <span className={dotClass} />
      <span className="statusbar__label">{STATUS_LABEL[status.state]}</span>
      {/* Aviso explícito cuando el overlay SÍ es visible en una captura:
          es el estado peligroso, así que no puede pasar desapercibido. */}
      {!stealth && <span className="statusbar__label">· visible</span>}
      {/*
        Un idioma forzado que no coincide con lo que se habla no produce ningún
        error: el reconocedor devuelve texto inventado en ese idioma. Al no estar
        a la vista en ningún sitio, era imposible sospecharlo. `auto` no se
        muestra porque no puede equivocarse.
      */}
      {language !== 'auto' && (
        <span className="statusbar__lang" title={`Transcribiendo como "${language}"`}>
          {language.toUpperCase()}
        </span>
      )}
      <span className="statusbar__spacer" />

      <div className="levels">
        <div className="level">
          <span>Yo</span>
          <div className="level__bar">
            <div className="level__fill" style={{ width: `${levels.me * 100}%` }} />
          </div>
        </div>
        <div className="level">
          <span>Ellos</span>
          <div className="level__bar">
            <div
              className="level__fill level__fill--them"
              style={{ width: `${levels.them * 100}%` }}
            />
          </div>
        </div>
      </div>

      <button
        type="button"
        className="iconbtn"
        title="Nueva conversación (limpia la transcripción y el contexto)"
        aria-label="Nueva conversación"
        onClick={onNewConversation}
      >
        <NewChatIcon />
      </button>
      <button
        type="button"
        className="iconbtn"
        title="Configuración"
        aria-label="Abrir configuración"
        onClick={() => void window.api.window.openDashboard()}
      >
        <GearIcon />
      </button>
      <button
        type="button"
        className="iconbtn iconbtn--close"
        title="Cerrar Interview Helper (Ctrl+Shift+H solo lo oculta)"
        aria-label="Cerrar"
        onClick={() => void window.api.window.quit()}
      >
        <CloseIcon />
      </button>
    </div>
  );
}

/**
 * Minutos:segundos desde que empezó la conversación, no la hora del reloj.
 * Al repasar lo que importa es "hace cuánto se dijo esto", y una hora absoluta
 * obliga a restar mentalmente.
 */
function elapsed(startedAt: number, at: number): string {
  const total = Math.max(0, Math.round((at - startedAt) / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function TranscriptPane({ segments }: { segments: TranscriptSegment[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [segments]);

  // El primer segmento es a la vez la condición de "hay algo" y el origen de
  // tiempos, así que se resuelve de una vez: un `?? Date.now()` de respaldo
  // sería una llamada impura en render (y la regla `purity` de eslint la caza).
  const first = segments[0];
  if (!first) {
    return <p className="empty">Esperando audio…</p>;
  }

  return (
    <div className="transcript">
      {segments.slice(-VISIBLE_LINES).map((seg) => (
        <div className="transcript__line" key={seg.id}>
          <span className="transcript__time">{elapsed(first.startedAt, seg.startedAt)}</span>
          <span className={`transcript__who transcript__who--${seg.speaker}`}>
            {seg.speaker === 'me' ? 'Yo' : 'Ellos'}
          </span>
          <span className={`transcript__text${seg.isFinal ? '' : ' transcript__text--partial'}`}>
            {seg.text}
          </span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

/**
 * Perfiles de respuesta como chips.
 *
 * `promptProfileId` ya existía, pero sólo se podía cambiar desde el dashboard,
 * que hay que abrir con el engranaje y roba el foco. Cambiar de registro a mitad
 * de una llamada es justo el momento en el que no puedes hacer ninguna de las dos.
 * `custom` no está aquí: se edita con un textarea y ése sí necesita el dashboard.
 */
const PROFILE_CHIPS = [
  ['interview', 'Entrevista'],
  ['meeting', 'Reunión'],
  ['lecture', 'Clase'],
  ['support', 'Soporte'],
] as const;

function ProfileChips({
  active,
  onChange,
}: {
  active: Settings['promptProfileId'];
  onChange: (id: Settings['promptProfileId']) => void;
}) {
  return (
    <div className="chips" data-interactive>
      {PROFILE_CHIPS.map(([id, label]) => (
        <button
          key={id}
          type="button"
          className={`chip${active === id ? ' chip--active' : ''}`}
          aria-pressed={active === id}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
      {active === 'custom' && <span className="chip chip--active">Personalizado</span>}
    </div>
  );
}

/**
 * Acciones rápidas sobre la última respuesta.
 *
 * Son prompts enlatados que van por `askWithText`, la misma vía que la pestaña
 * de escritura: no hay un camino nuevo hacia el LLM que mantener. Cada una es
 * algo que si no tendrías que teclear entero mientras alguien te mira.
 */
const QUICK_ACTIONS = [
  ['Sigue', 'Amplía tu última respuesta con un ejemplo concreto y breve.'],
  ['Más corto', 'Reformula tu última respuesta en dos viñetas, más directa.'],
  ['Seguimiento', 'Dame 3 preguntas de seguimiento que YO pueda hacer ahora.'],
  ['Resumen', 'Resume la conversación hasta ahora en 4 viñetas.'],
] as const;

function QuickActions({ onAsk }: { onAsk: (prompt: string) => void }) {
  return (
    <div className="quick" data-interactive>
      {QUICK_ACTIONS.map(([label, prompt]) => (
        <button key={label} type="button" className="quick__btn" onClick={() => onAsk(prompt)}>
          {label}
        </button>
      ))}
    </div>
  );
}

const SIZES: OverlaySize[] = ['S', 'M', 'L', 'XL'];

function SizePicker({
  active,
  onChange,
}: {
  active: OverlaySize;
  onChange: (size: OverlaySize) => void;
}) {
  return (
    <div className="sizes" data-interactive>
      {SIZES.map((size) => (
        <button
          key={size}
          type="button"
          className={`sizes__btn${active === size ? ' sizes__btn--active' : ''}`}
          aria-pressed={active === size}
          title={`Tamaño ${size}`}
          onClick={() => onChange(size)}
        >
          {size}
        </button>
      ))}
    </div>
  );
}

/**
 * Estado de primer arranque. El dashboard ya no se abre solo, así que sin esto
 * un usuario nuevo se quedaría mirando un overlay que no hace nada y sin pista
 * de dónde configurar las claves.
 */
function SetupPrompt() {
  return (
    <div className="setup" data-interactive>
      <p className="setup__text">
        Falta configurar un proveedor de IA. Ábrelo con el engranaje de arriba.
      </p>
      <button
        type="button"
        className="setup__btn"
        onClick={() => void window.api.window.openDashboard()}
      >
        Abrir configuración
      </button>
    </div>
  );
}

/** Las dos formas de darle una pregunta al asistente. */
type InputTab = 'listen' | 'write';

function Tabs({ tab, onChange }: { tab: InputTab; onChange: (t: InputTab) => void }) {
  return (
    // `data-interactive`: sin esto las pestañas serían inclicables con los
    // clics atravesables activos, que es el modo recomendado durante una llamada.
    <div className="tabs" data-interactive>
      {(
        [
          ['listen', 'Escucha'],
          ['write', 'Escritura'],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          className={`tab${tab === id ? ' tab--active' : ''}`}
          aria-pressed={tab === id}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Pestaña de escritura: preguntar sin depender del audio.
 *
 * Requiere que el overlay sea enfocable, lo que sólo pasa mientras esta pestaña
 * está abierta — de ahí el efecto de `setInteractive` en `OverlayApp`. Es la
 * única situación en la que la app toma el foco, y el aviso del pie lo dice
 * porque es justo el comportamiento que el resto del programa evita.
 */
function ComposePane({ onSend }: { onSend: (text: string) => void }) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // La ventana ya es enfocable cuando esto se monta; enfocar aquí evita que el
  // usuario tenga que dar un clic extra para empezar a escribir.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const send = (): void => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    onSend(text);
  };

  return (
    <div className="compose" data-interactive>
      <textarea
        ref={inputRef}
        className="compose__input"
        placeholder="Escribe tu pregunta y pulsa Enter…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // Enter envía; Shift+Enter salta línea. No se usa Ctrl+Enter porque
          // es un hotkey GLOBAL: lo intercepta el main y nunca llegaría aquí.
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <div className="compose__foot">
        <span className="compose__hint">Enter envía · Shift+Enter salta línea</span>
        <button
          type="button"
          className="compose__btn"
          disabled={!draft.trim()}
          onClick={send}
        >
          Enviar
        </button>
      </div>
      <p className="compose__warn">
        Mientras esta pestaña esté abierta el overlay toma el foco del teclado. Vuelve a «Escucha»
        antes de compartir pantalla.
      </p>
    </div>
  );
}

function AnswerPane({ answer }: { answer: Answer | null }) {
  if (!answer) {
    return <p className="empty">Ctrl+Enter para pedir una respuesta.</p>;
  }
  if (answer.status === 'thinking') {
    return <p className="empty">Pensando…</p>;
  }
  if (answer.status === 'error') {
    return <div className="answer answer--error">{answer.error ?? 'Error desconocido'}</div>;
  }
  return <div className="answer">{answer.text}</div>;
}

export function OverlayApp() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<CaptureStatus>({
    state: 'idle',
    micActive: false,
    loopbackActive: false,
  });
  const [levels, setLevels] = useState<AudioLevels>({ me: 0, them: 0 });
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [shot, setShot] = useState<ImageAttachment | null>(null);
  const [configured, setConfigured] = useState(true);
  const [tab, setTab] = useState<InputTab>('listen');
  const [sttError, setSttError] = useState<string | null>(null);

  useChromeMouse();
  const onDragStart = useOverlayDrag();

  /**
   * El overlay sólo es enfocable mientras se escribe.
   *
   * La limpieza del efecto no es opcional: si la ventana se quedara enfocable
   * acabaría robando el foco de la videollamada, que es exactamente lo que la
   * app existe para evitar (CONTEXT §4). Por eso se revierte al cambiar de
   * pestaña y también al desmontar.
   */
  useEffect(() => {
    if (tab !== 'write') return;
    void window.api.window.setInteractive(true);
    return () => {
      void window.api.window.setInteractive(false);
    };
  }, [tab]);

  useEffect(() => {
    const { api } = window;

    void api.settings.get().then(setSettings);
    void api.capture.getStatus().then(setStatus);
    // Ollama no necesita clave, pero SÍ un modelo elegido: sin él cada consulta
    // falla con "no hay ningún modelo seleccionado", y antes ese caso pasaba por
    // configurado y no mostraba ningún aviso. Claude y Gemini exigen su clave.
    void Promise.all([api.settings.get(), api.secrets.getPresence()]).then(
      ([current, presence]) => {
        setConfigured(
          (current.llmProviderId === 'ollama' && Boolean(current.llmModels.ollama)) ||
            (current.llmProviderId === 'claude' && presence.anthropic) ||
            (current.llmProviderId === 'gemini' && presence.google)
        );
      }
    );

    const unsubs = [
      api.settings.onChange(setSettings),
      api.capture.onStatus(setStatus),
      api.capture.onLevels(setLevels),
      api.screenshot.onCaptured(setShot),
      api.ask.onAnswer((next) => {
        setAnswer(next);
        // La captura se consume con la respuesta: dejar el thumbnail visible
        // haría creer que sigue adjunta a la siguiente pregunta.
        if (next.status === 'streaming' || next.status === 'done') setShot(null);
      }),
      api.transcript.onSegment((seg) => {
        // Un segmento parcial se reemplaza in situ; uno nuevo se añade.
        // Sin esto, el transcript se llenaría de versiones intermedias.
        setSegments((prev) => {
          const idx = prev.findIndex((s) => s.id === seg.id);
          if (idx === -1) return [...prev.slice(-80), seg];
          const next = [...prev];
          next[idx] = seg;
          return next;
        });
      }),
      // El main ya limpió su buffer; el overlay tiene su propia copia en estado
      // de React y se quedaría enseñando la conversación anterior.
      api.history.onReset(() => {
        setSegments([]);
        setAnswer(null);
        setShot(null);
      }),
      // Un motor que falla carril a carril se veía exactamente igual que una
      // sala en silencio: el overlay decía "Escuchando" y no llegaba nada.
      api.transcript.onError(setSttError),
    ];

    return () => unsubs.forEach((off) => off());
  }, []);

  return (
    <div className="panel" style={{ opacity: settings?.overlayOpacity ?? 1 }}>
      <StatusBar
        status={status}
        levels={levels}
        stealth={settings?.stealthEnabled ?? true}
        language={settings?.language ?? 'auto'}
        onDragStart={onDragStart}
        onNewConversation={() => void window.api.history.newConversation()}
      />

      {!configured && <SetupPrompt />}

      {sttError && (
        <div className="sttError" data-interactive>
          <span className="sttError__text">Transcripción: {sttError}</span>
          <button
            type="button"
            className="sttError__close"
            aria-label="Descartar"
            onClick={() => setSttError(null)}
          >
            <CloseIcon />
          </button>
        </div>
      )}

      {settings && (
        <ProfileChips
          active={settings.promptProfileId}
          onChange={(promptProfileId) => void window.api.settings.update({ promptProfileId })}
        />
      )}

      <div className="section">
        <Tabs tab={tab} onChange={setTab} />
        {tab === 'listen' ? (
          <TranscriptPane segments={segments} />
        ) : (
          <ComposePane onSend={(text) => void window.api.ask.withText(text)} />
        )}
      </div>

      {shot && (
        <div className="shot">
          <img className="shot__img" src={`data:${shot.mime};base64,${shot.base64}`} alt="" />
          <span className="shot__label">Captura adjunta</span>
        </div>
      )}

      <div className="section" style={{ flex: 1 }}>
        <span className="section__title">Sugerencia</span>
        <AnswerPane answer={answer} />
      </div>

      {/* Sólo tienen sentido cuando hay una respuesta sobre la que actuar:
          "Sigue" o "Más corto" sin nada previo pedirían al modelo que ampliara
          el vacío. */}
      {answer && (answer.status === 'done' || answer.status === 'streaming') && (
        <QuickActions onAsk={(prompt) => void window.api.ask.withText(prompt)} />
      )}

      <div className="hints">
        <span>
          <kbd>Ctrl</kbd>+<kbd>Enter</kbd> preguntar
        </span>
        <span>
          <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>H</kbd> ocultar
        </span>
        <span className="hints__spacer" />
        <SizePicker
          active={settings?.overlaySize ?? 'M'}
          onChange={(overlaySize) => void window.api.settings.update({ overlaySize })}
        />
      </div>
    </div>
  );
}

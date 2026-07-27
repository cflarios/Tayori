import { useEffect, useRef, useState } from 'react';
import { useChromeMouse, useOverlayDrag } from './useChromeMouse';
import type {
  Answer,
  AudioLevels,
  CaptureStatus,
  ImageAttachment,
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

function StatusBar({
  status,
  levels,
  stealth,
  onDragStart,
}: {
  status: CaptureStatus;
  levels: AudioLevels;
  stealth: boolean;
  onDragStart: (event: React.MouseEvent) => void;
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

function TranscriptPane({ segments }: { segments: TranscriptSegment[] }) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [segments]);

  if (segments.length === 0) {
    return <p className="empty">Esperando audio…</p>;
  }

  return (
    <div className="transcript">
      {segments.slice(-VISIBLE_LINES).map((seg) => (
        <div className="transcript__line" key={seg.id}>
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
    ];

    return () => unsubs.forEach((off) => off());
  }, []);

  return (
    <div className="panel" style={{ opacity: settings?.overlayOpacity ?? 1 }}>
      <StatusBar
        status={status}
        levels={levels}
        stealth={settings?.stealthEnabled ?? true}
        onDragStart={onDragStart}
      />

      {!configured && <SetupPrompt />}

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

      <div className="hints">
        <span>
          <kbd>Ctrl</kbd>+<kbd>Enter</kbd> preguntar
        </span>
        <span>
          <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> captura
        </span>
        <span>
          <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>H</kbd> ocultar
        </span>
      </div>
    </div>
  );
}

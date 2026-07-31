import { useEffect, useRef, useState } from 'react';
import { useChromeMouse, useOverlayDrag } from './useChromeMouse';
import { parseAnswerBlocks, type AnswerBlock } from './answer-format';
import { clampFontScale } from '@shared/types';
import type {
  Answer,
  AudioLevels,
  AudioSourceMode,
  CaptureStatus,
  ImageAttachment,
  OverlaySize,
  Settings,
  TranscriptSegment,
} from '@shared/types';

/** Cuántas líneas de transcript mostramos; el overlay debe ocupar poco espacio. */
const VISIBLE_LINES = 6;

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

/** Los clásicos corchetes angulares: resolver lo que hay en pantalla. */
function CodeIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        d="M6 11 3 8l3-3m4 0 3 3-3 3"
      />
    </svg>
  );
}

/** Flechas hacia dentro y hacia fuera: plegar y desplegar el panel. */
function CompactIcon({ compact }: { compact: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        d={
          compact
            ? // Desplegar: flechas separándose.
              'M6.5 9.5 3 13m0 0h2.8M3 13v-2.8M9.5 6.5 13 3m0 0h-2.8M13 3v2.8'
            : // Plegar: flechas juntándose.
              'M3 13l3.5-3.5m0 0H3.7m2.8 0v2.8M13 3L9.5 6.5m0 0h2.8m-2.8 0V3.7'
        }
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

/**
 * El interruptor de escucha, en el overlay.
 *
 * Antes sólo existía en el dashboard y en `Ctrl+Shift+M`. Eso obligaba a abrir
 * la configuración —que roba el foco, que es justo lo que la app evita— para lo
 * más frecuente que se hace con ella. El estado y el mando son el mismo control
 * a propósito: el punto verde ya decía si escuchaba, pero no se podía pulsar, y
 * dos elementos distintos para "qué pasa" y "cámbialo" cuestan sitio en una
 * barra que ya va llena.
 */
function ListenButton({ status }: { status: CaptureStatus }) {
  const [busy, setBusy] = useState(false);
  const listening = status.state === 'listening';
  const starting = status.state === 'starting' || busy;

  const toggle = (): void => {
    setBusy(true);
    const done = listening ? window.api.capture.stop() : window.api.capture.start();
    void done.finally(() => setBusy(false));
  };

  // El estado de error es accionable: se pulsa y se reintenta. Dejarlo como una
  // etiqueta muerta obligaría a ir al dashboard para volver a arrancar.
  const label = starting
    ? 'Iniciando…'
    : status.state === 'error'
      ? 'Reintentar'
      : listening
        ? 'Escuchando'
        : 'Escuchar';

  const state = starting ? 'starting' : status.state;

  return (
    <button
      type="button"
      className={`listen listen--${state}`}
      disabled={starting}
      title={
        status.state === 'error'
          ? (status.error ?? 'Error de captura')
          : 'Empezar o parar de escuchar (Ctrl+Shift+M)'
      }
      onClick={toggle}
    >
      <span className="listen__dot" />
      {label}
    </button>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 1.8a1.9 1.9 0 0 0-1.9 1.9v4a1.9 1.9 0 0 0 3.8 0v-4A1.9 1.9 0 0 0 8 1.8Z"
      />
      <path
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        fill="none"
        d="M3.8 7.2a4.2 4.2 0 0 0 8.4 0M8 11.5v2.2"
      />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
      <path fill="currentColor" d="M7.4 2.6 4.3 5.1H2.2v5.8h2.1l3.1 2.5V2.6Z" />
      <path
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
        d="M10.3 5.9a3 3 0 0 1 0 4.2M12.4 3.8a6 6 0 0 1 0 8.4"
      />
    </svg>
  );
}

/** Qué hablantes implica cada modo, y a qué modo lleva encender o apagar uno. */
const SOURCE_STATE: Record<AudioSourceMode, { me: boolean; them: boolean }> = {
  both: { me: true, them: true },
  mic: { me: true, them: false },
  system: { me: false, them: true },
};

function modeFor(me: boolean, them: boolean): AudioSourceMode | null {
  if (me && them) return 'both';
  if (me) return 'mic';
  if (them) return 'system';
  // Ninguna fuente activa no es un modo: para eso está el botón de escucha.
  return null;
}

/**
 * Las dos fuentes, como interruptores con su medidor dentro.
 *
 * Sustituyen a los medidores de sólo lectura de antes, y responden a dos
 * preguntas que estaban en sitios distintos —y una de ellas, en el dashboard—:
 * *qué se supone que escucha* (el chip encendido o apagado) y *qué está
 * entrando de verdad* (la barra moviéndose, y el aviso ámbar si el stream no
 * llegó a abrirse).
 *
 * Esa distinción no es cosmética: un micrófono configurado pero que el sistema
 * no concedió da exactamente la misma pantalla que una sala en silencio.
 */
function SourceToggles({
  mode,
  levels,
  status,
  onChange,
  onBlocked,
}: {
  mode: AudioSourceMode;
  levels: AudioLevels;
  status: CaptureStatus;
  onChange: (next: AudioSourceMode) => void;
  onBlocked: () => void;
}) {
  const wanted = SOURCE_STATE[mode];
  const listening = status.state === 'listening';

  const sources = [
    {
      key: 'me' as const,
      icon: <MicIcon />,
      label: 'Yo',
      on: wanted.me,
      live: status.micActive,
      level: levels.me,
      hint: 'Tu micrófono',
    },
    {
      key: 'them' as const,
      icon: <SpeakerIcon />,
      label: 'Ellos',
      on: wanted.them,
      live: status.loopbackActive,
      level: levels.them,
      hint: 'La salida del sistema: la voz del interlocutor',
    },
  ];

  return (
    <div className="sources">
      {sources.map((source) => {
        // Se avisa en lugar de dejar el clic sin efecto: un botón que no hace
        // nada es indistinguible de uno roto.
        const next = modeFor(
          source.key === 'me' ? !wanted.me : wanted.me,
          source.key === 'them' ? !wanted.them : wanted.them
        );
        const mute = source.on && listening && !source.live;

        return (
          <button
            key={source.key}
            type="button"
            className={`source${source.on ? ' source--on' : ''}${mute ? ' source--mute' : ''}`}
            aria-pressed={source.on}
            title={
              mute
                ? `${source.hint}: configurado pero NO se abrió. Revisa el dispositivo o los permisos.`
                : `${source.hint}. Pulsa para ${source.on ? 'dejar de escucharla' : 'escucharla'}.`
            }
            onClick={() => (next ? onChange(next) : onBlocked())}
          >
            {source.icon}
            <span className="source__label">{source.label}</span>
            <span className="source__bar">
              <span
                className={`source__fill source__fill--${source.key}`}
                style={{ width: source.on && listening ? `${Math.min(source.level * 140, 100)}%` : 0 }}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}

function StatusBar({
  status,
  levels,
  settings,
  onDragStart,
  onNewConversation,
  onSolveScreen,
  onSourceBlocked,
  onToggleCompact,
}: {
  status: CaptureStatus;
  levels: AudioLevels;
  settings: Settings | null;
  onDragStart: (event: React.MouseEvent) => void;
  onNewConversation: () => void;
  onSolveScreen: () => void;
  onSourceBlocked: () => void;
  onToggleCompact: () => void;
}) {
  const language = settings?.language ?? 'auto';
  const compact = settings?.overlayCompact ?? false;

  return (
    // `data-interactive` es lo que hace que la ventana deje de ignorar el ratón
    // mientras el cursor está aquí; sin él, con los clics atravesables activos
    // no se podría ni arrastrar ni pulsar los botones.
    <div className="statusbar" data-interactive onMouseDown={onDragStart}>
      <ListenButton status={status} />

      <SourceToggles
        mode={settings?.audioSources ?? 'both'}
        levels={levels}
        status={status}
        onChange={(audioSources) => void window.api.settings.update({ audioSources })}
        onBlocked={onSourceBlocked}
      />

      <span className="statusbar__spacer" />

      {/* Aviso explícito cuando el overlay SÍ es visible en una captura:
          es el estado peligroso, así que no puede pasar desapercibido. */}
      {settings && !settings.stealthEnabled && (
        <span className="statusbar__flag" title="El overlay SÍ aparece al compartir pantalla">
          VISIBLE
        </span>
      )}
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

      {/*
        Los cuatro botones van agrupados y no sueltos en la barra: con el
        interruptor de escucha y las dos fuentes delante, a tamaño S el
        contenido no cabe (medido: 407 px en 354 disponibles) y lo primero que
        se salía del recorte era la X. Agrupados, la barra los baja enteros a
        una segunda línea en vez de cortarlos.
      */}
      <div className="statusbar__actions">
        {/* Va en la barra y no entre las acciones rápidas porque tiene que estar
            disponible SIEMPRE: el caso normal es un ejercicio en pantalla sin
            ninguna llamada abierta, así que no hay respuesta previa bajo la que
            colgarlo ni audio que esperar. */}
        <button
          type="button"
          className="iconbtn"
          title="Resolver el problema de código que hay en pantalla (Ctrl+Alt+C)"
          aria-label="Resolver el código de la pantalla"
          onClick={onSolveScreen}
        >
          <CodeIcon />
        </button>
        <button
          type="button"
          className="iconbtn"
          title={
            compact
              ? 'Desplegar: vuelve la transcripción y los perfiles'
              : 'Modo compacto: deja sólo la respuesta'
          }
          aria-label={compact ? 'Desplegar el panel' : 'Modo compacto'}
          aria-pressed={compact}
          onClick={onToggleCompact}
        >
          <CompactIcon compact={compact} />
        </button>
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
  ['coding', 'Código'],
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
/** Etiqueta del botón y prompt enlatado que envía. */
type QuickAction = readonly [label: string, prompt: string];

const QUICK_ACTIONS: readonly QuickAction[] = [
  ['Sigue', 'Amplía tu última respuesta con un ejemplo concreto y breve.'],
  ['Más corto', 'Reformula tu última respuesta en dos viñetas, más directa.'],
  ['Seguimiento', 'Dame 3 preguntas de seguimiento que YO pueda hacer ahora.'],
  ['Resumen', 'Resume la conversación hasta ahora en 4 viñetas.'],
] as const;

/**
 * Las mismas acciones, pero para código.
 *
 * "Más corto" o "Seguimiento" no significan nada frente a una solución; lo que
 * se pide a continuación es siempre lo mismo: explicarla en voz alta —que es
 * justo lo que te van a pedir después de escribirla—, optimizarla, o probarla.
 */
const CODE_ACTIONS: readonly QuickAction[] = [
  [
    'Explícalo',
    'Explica tu última solución en 4 viñetas, como si se lo contara en voz alta a un entrevistador.',
  ],
  ['Optimiza', '¿Se puede mejorar la complejidad de tu última solución? Si sí, dame el código.'],
  ['Casos límite', 'Dame los casos límite que romperían tu última solución y cómo los cubre.'],
  ['Tests', 'Escribe tests para tu última solución, en el mismo lenguaje.'],
] as const;

function QuickActions({
  onAsk,
  coding,
}: {
  onAsk: (prompt: string) => void;
  coding: boolean;
}) {
  return (
    <div className="quick" data-interactive>
      {(coding ? CODE_ACTIONS : QUICK_ACTIONS).map(([label, prompt]) => (
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

/**
 * Explica un descarte del detector en lenguaje llano.
 *
 * El motivo interno ("muletilla o comprobación de audio") es preciso pero no
 * dice qué hacer. Estos textos sí, y el de la comprobación de audio es
 * afirmativo a propósito: alguien que pregunta "¿me escuchas?" quiere saber si
 * la cadena funciona, y la respuesta honesta es que sí — sólo que eso no
 * dispara una sugerencia.
 */
function explainSkip(reason: string): string {
  if (reason.includes('muletilla')) {
    return 'Te escucho, pero un saludo o una prueba de sonido no dispara respuesta. Prueba con una pregunta real.';
  }
  if (reason.includes('corto')) {
    return 'Demasiado corto para tomarlo por una pregunta.';
  }
  if (reason.includes('estricto')) {
    return 'No parecía una pregunta. En modo estricto sólo cuentan las señales claras; súbelo a «Equilibrado» o «Todo» en el dashboard.';
  }
  return 'No parecía una pregunta. Si quieres que responda a todo, pon la sensibilidad en «Todo».';
}

/**
 * Un bloque de código con su botón de copiar.
 *
 * Copiar es la acción principal aquí: nadie transcribe a mano una solución
 * desde un overlay mientras le miran. `data-interactive` no es opcional — sin
 * él el botón sería inclicable con los clics atravesables activos, que es el
 * modo recomendado durante una llamada.
 */
function CodeBlock({ block }: { block: AnswerBlock }) {
  const [copied, setCopied] = useState<'no' | 'sí' | 'falló'>('no');

  // El aviso se apaga solo; sin la limpieza, un bloque que desaparece a mitad
  // de temporizador dejaría un setState sobre un componente ya desmontado.
  useEffect(() => {
    if (copied === 'no') return;
    const timer = setTimeout(() => setCopied('no'), 1_200);
    return () => clearTimeout(timer);
  }, [copied]);

  /*
   * Por el main, no por `navigator.clipboard`.
   *
   * La API del navegador exige que el documento tenga el foco y el overlay es
   * `focusable: false` a propósito, así que rechazaba siempre con "Document is
   * not focused" — y el rechazo se perdía sin `catch`, con lo que el botón
   * simplemente no hacía nada. El handler de permisos, que sólo concede
   * `clipboard-read`, la habría bloqueado igual.
   */
  const copy = (): void => {
    window.api.clipboard
      .write(block.content)
      .then(() => setCopied('sí'))
      .catch(() => setCopied('falló'));
  };

  return (
    <div className="code" data-interactive>
      <div className="code__head">
        <span className="code__lang">{block.lang || 'código'}</span>
        {/* Mientras la valla siga abierta el código está a medias: ofrecer
            copiarlo daría una función sin cerrar sin avisar de nada. */}
        {block.open ? (
          <span className="code__writing">escribiendo…</span>
        ) : (
          <button type="button" className="code__copy" onClick={copy}>
            {copied === 'sí' ? 'Copiado' : copied === 'falló' ? 'No se pudo' : 'Copiar'}
          </button>
        )}
      </div>
      <pre className="code__body">
        <code>{block.content}</code>
      </pre>
    </div>
  );
}

/** El cuerpo de una respuesta: texto plano, salvo lo que venga entre vallas. */
function AnswerBody({ text }: { text: string }) {
  const blocks = parseAnswerBlocks(text);

  // Sin código, exactamente lo de antes: un único div con `pre-wrap`. Es el
  // camino del 90% de las respuestas y no debe pagar nada por esta función.
  if (blocks.every((block) => block.type === 'text')) {
    return <div className="answer">{text}</div>;
  }

  return (
    <div className="answer">
      {blocks.map((block, index) =>
        block.type === 'code' ? (
          <CodeBlock key={index} block={block} />
        ) : (
          <div className="answer__text" key={index}>
            {block.content}
          </div>
        )
      )}
    </div>
  );
}

function AnswerPane({
  answer,
  skip,
  listening,
}: {
  answer: Answer | null;
  skip: { text: string; reason: string } | null;
  listening: boolean;
}) {
  if (!answer) {
    // El descarte sólo se enseña mientras no haya respuesta: si ya hay una en
    // pantalla, taparla con un aviso sobre una frase suelta sería peor.
    if (skip) {
      return (
        <div className="skip">
          <span className="skip__what">«{skip.text}»</span>
          <span className="skip__why">{explainSkip(skip.reason)}</span>
        </div>
      );
    }
    // El estado vacío dice lo que se puede hacer AHORA. Antes decía siempre
    // "Ctrl+Enter para pedir una respuesta", que con la escucha parada no sirve
    // de nada: no hay transcripción de la que sacar una pregunta.
    return (
      <p className="empty">
        {listening
          ? 'Ctrl+Enter para pedir una respuesta · Ctrl+Alt+C para resolver la pantalla.'
          : 'Pulsa «Escuchar» para que siga la conversación, o Ctrl+Alt+C para resolver lo que tengas en pantalla.'}
      </p>
    );
  }
  if (answer.status === 'thinking') {
    // El modo código tarda más y por una razón distinta —la imagen se sube y se
    // lee entera antes del primer token—, así que decirlo evita que parezca que
    // se ha colgado justo cuando más prisa hay.
    return (
      <p className="empty">
        {answer.trigger === 'code' ? 'Leyendo la pantalla…' : 'Pensando…'}
      </p>
    );
  }
  if (answer.status === 'error') {
    return <div className="answer answer--error">{answer.error ?? 'Error desconocido'}</div>;
  }
  return <AnswerBody text={answer.text} />;
}

/**
 * Navegación por las respuestas de esta conversación.
 *
 * Hasta ahora una respuesta la borraba la siguiente y sólo se recuperaba
 * abriendo el historial del dashboard — con lo que eso implica: engranaje,
 * ventana nueva y foco robado. Es la última cosa frecuente que obligaba a salir
 * del overlay.
 */
function AnswerNav({
  total,
  index,
  onGo,
}: {
  total: number;
  index: number;
  onGo: (next: number) => void;
}) {
  if (total < 2) return null;

  return (
    <div className="nav" data-interactive>
      <button
        type="button"
        className="nav__btn"
        disabled={index === 0}
        title="Respuesta anterior"
        aria-label="Respuesta anterior"
        onClick={() => onGo(index - 1)}
      >
        ‹
      </button>
      <span className="nav__count">
        {index + 1}/{total}
      </span>
      <button
        type="button"
        className="nav__btn"
        disabled={index === total - 1}
        title="Respuesta siguiente"
        aria-label="Respuesta siguiente"
        onClick={() => onGo(index + 1)}
      >
        ›
      </button>
    </div>
  );
}

/** Cuántas respuestas se guardan para poder volver atrás. */
const ANSWER_MEMORY = 20;

export function OverlayApp() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<CaptureStatus>({
    state: 'idle',
    micActive: false,
    loopbackActive: false,
  });
  const [levels, setLevels] = useState<AudioLevels>({ me: 0, them: 0 });
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  /**
   * Las respuestas de la conversación, de la más antigua a la más reciente, y
   * cuál se está mirando. `null` en `viewing` significa "la última", que es lo
   * que hace que una respuesta en streaming se siga sola sin saltar de sitio
   * cuando el usuario está leyendo una anterior.
   */
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [viewing, setViewing] = useState<number | null>(null);
  const [shot, setShot] = useState<ImageAttachment | null>(null);
  const [configured, setConfigured] = useState(true);
  const [tab, setTab] = useState<InputTab>('listen');
  const [sttError, setSttError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [skip, setSkip] = useState<{ text: string; reason: string } | null>(null);

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
      // Un descarte deja de importar en cuanto llega una respuesta de verdad.
      api.transcript.onAutoSkip(setSkip),
      api.ask.onAnswer((next) => {
        // `answer` se emite en CADA actualización del streaming, así que la
        // misma respuesta llega decenas de veces: se sustituye por id en lugar
        // de acumularse. Una abortada se queda en la lista sólo si llegó a
        // escribir algo; si no, sería un hueco vacío por el que navegar.
        setAnswers((prev) => {
          const idx = prev.findIndex((a) => a.id === next.id);
          if (idx !== -1) {
            const copy = [...prev];
            copy[idx] = next;
            return copy;
          }
          return [...prev, next].slice(-ANSWER_MEMORY);
        });
        setSkip(null);
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
        setAnswers([]);
        setViewing(null);
        setShot(null);
      }),
      // Un motor que falla carril a carril se veía exactamente igual que una
      // sala en silencio: el overlay decía "Escuchando" y no llegaba nada.
      api.transcript.onError(setSttError),
      api.notices.on(setNotice),
    ];

    return () => unsubs.forEach((off) => off());
  }, []);

  const compact = settings?.overlayCompact ?? false;

  // Qué respuesta se enseña: la que se esté mirando, o la última. Seguir a la
  // última por defecto es lo que mantiene el comportamiento de siempre — una
  // respuesta nueva sustituye a la anterior — sin perder las de antes.
  const index = viewing ?? answers.length - 1;
  const answer = answers[index] ?? null;

  return (
    <div
      className="panel"
      style={{
        opacity: settings?.overlayOpacity ?? 1,
        // Sólo escala el CONTENIDO: la barra y los chips se quedan como están,
        // o con la letra grande los controles se comerían el panel entero.
        ['--font-scale' as string]: clampFontScale(settings?.overlayFontScale ?? 1),
      }}
    >
      <StatusBar
        status={status}
        levels={levels}
        settings={settings}
        onDragStart={onDragStart}
        onNewConversation={() => void window.api.history.newConversation()}
        onSolveScreen={() => void window.api.ask.solveOnScreen()}
        onSourceBlocked={() =>
          setNotice(
            'Tiene que quedar al menos una fuente de audio. Para no escuchar nada, usa el botón «Escuchando».'
          )
        }
        onToggleCompact={() =>
          void window.api.settings.update({ overlayCompact: !compact })
        }
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

      {notice && (
        <div className="sttError" data-interactive>
          <span className="sttError__text">{notice}</span>
          <button
            type="button"
            className="sttError__close"
            aria-label="Descartar"
            onClick={() => setNotice(null)}
          >
            <CloseIcon />
          </button>
        </div>
      )}

      {/*
        Lo que el modo compacto pliega: perfiles, transcripción y pie de atajos.
        Es todo lo que sirve para PREPARAR o COMPROBAR; lo que se deja es lo que
        sirve para leer. La barra se queda entera porque desde ella se despliega
        otra vez —esconder el botón que devuelve lo escondido sería una trampa—,
        y porque parar la escucha tiene que estar siempre a mano.
      */}
      {!compact && settings && (
        <ProfileChips
          active={settings.promptProfileId}
          onChange={(promptProfileId) => void window.api.settings.update({ promptProfileId })}
        />
      )}

      {!compact && (
        <div className="section">
          <Tabs tab={tab} onChange={setTab} />
          {tab === 'listen' ? (
            <TranscriptPane segments={segments} />
          ) : (
            <ComposePane onSend={(text) => void window.api.ask.withText(text)} />
          )}
        </div>
      )}

      {shot && (
        <div className="shot">
          <img className="shot__img" src={`data:${shot.mime};base64,${shot.base64}`} alt="" />
          <span className="shot__label">Captura adjunta</span>
        </div>
      )}

      <div className="section" style={{ flex: 1 }}>
        <div className="section__head">
          <span className="section__title">Sugerencia</span>
          <AnswerNav
            total={answers.length}
            index={index}
            // Volver a la última desengancha la navegación: a partir de ahí las
            // respuestas nuevas vuelven a seguirse solas.
            onGo={(next) => setViewing(next === answers.length - 1 ? null : next)}
          />
          {/*
            Con qué se está respondiendo. Vale un renglón y ahorra el viaje al
            dashboard: al leer una respuesta floja, lo primero que se quiere
            saber es con qué modelo salió, y con tres proveedores configurables
            es fácil creer que estás en uno y estar en otro.
          */}
          {settings && (
            <span className="section__meta" title={`Respondiendo con ${settings.llmProviderId}`}>
              {settings.llmModels[settings.llmProviderId] || settings.llmProviderId}
            </span>
          )}
          {/* Parar una generación ya existía en el IPC pero no tenía botón: sólo
              se cancelaba preguntando otra cosa, que es una forma cara de decir
              "para". */}
          {answer && (answer.status === 'thinking' || answer.status === 'streaming') && (
            <button
              type="button"
              className="section__stop"
              data-interactive
              onClick={() => void window.api.ask.abort()}
            >
              Parar
            </button>
          )}
        </div>
        <AnswerPane answer={answer} skip={skip} listening={status.state === 'listening'} />
      </div>

      {/*
        Sólo tienen sentido cuando hay una respuesta sobre la que actuar:
        "Sigue" o "Más corto" sin nada previo pedirían al modelo que ampliara el
        vacío.

        Y desaparecen mientras se navega hacia atrás, aunque haya respuesta en
        pantalla: estos prompts dicen "tu última respuesta", y la última para el
        modelo es la suya, no la que se esté mirando. Ofrecerlos ahí prometería
        actuar sobre lo que se lee y actuaría sobre otra cosa.
      */}
      {viewing === null && answer && (answer.status === 'done' || answer.status === 'streaming') && (
        <QuickActions
          onAsk={(prompt) => void window.api.ask.withText(prompt)}
          // Manda lo que se acaba de responder, no el perfil configurado: tras
          // un Ctrl+Alt+C con el perfil en "Entrevista", lo que hay en pantalla
          // es una solución y lo que se quiere pedir es sobre ella.
          coding={answer.trigger === 'code' || settings?.promptProfileId === 'coding'}
        />
      )}

      {!compact && (
        <div className="hints">
          <span>
            <kbd>Ctrl</kbd>+<kbd>Enter</kbd> preguntar
          </span>
          <span>
            <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd> resolver pantalla
          </span>
          <span className="hints__spacer" />
          <SizePicker
            active={settings?.overlaySize ?? 'M'}
            onChange={(overlaySize) => void window.api.settings.update({ overlaySize })}
          />
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { useChromeMouse, useOverlayDrag } from './useChromeMouse';
import { parseAnswerBlocks, parseInline, type AnswerBlock } from '@shared/answer-format';
import { toLines } from './teleprompter';
import { clampFontScale, providerIsReady } from '@shared/types';
import { LangProvider, useT } from '@renderer/i18n';
import { DEFAULT_UI_LANG, translate, type UIKey } from '@shared/i18n';
import { matchSkills, skillName } from '@shared/skills';
import type {
  Answer,
  AudioLevels,
  AudioSourceMode,
  CaptureStatus,
  ImageAttachment,
  OverlaySize,
  ScreenTask,
  Settings,
  Skill,
  TranscriptSegment,
} from '@shared/types';
import type { ScrollCaptureState } from '@shared/ipc';

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
      <path stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" d="M4 4l8 8M12 4l-8 8" />
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

/**
 * Lista con marcas de verificación: responder el test de la pantalla.
 *
 * Antes era una interrogación en un círculo, y ese icono se leía como "ayuda",
 * no como "responde el cuestionario". Una lista con checks dice justo lo que
 * hace el botón.
 */
function QuizIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        d="M2.4 4.6l1.3 1.3 2.2-2.5M2.4 10.9l1.3 1.3 2.2-2.5M8.6 4.6h5M8.6 10.9h5"
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
  const t = useT();
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
    ? t('overlay.starting')
    : status.state === 'error'
      ? t('overlay.retry')
      : listening
        ? t('overlay.listening')
        : t('overlay.listen');

  const state = starting ? 'starting' : status.state;

  return (
    <button
      type="button"
      className={`listen listen--${state}`}
      disabled={starting}
      title={
        status.state === 'error'
          ? (status.error ?? t('overlay.captureError'))
          : t('overlay.listenTitle')
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

/**
 * Qué se escucha: uno de tres, no dos interruptores.
 *
 * Antes eran dos botones independientes, y pulsar "Ellos" con las dos fuentes
 * activas **apagaba** esa fuente. Nadie lo lee así: se lee como "escucha a
 * ellos". El resultado era el peor posible — el usuario pulsaba para oír al
 * interlocutor y conseguía justo lo contrario, quedarse sólo con su micrófono,
 * y encima en silencio, porque el disparo automático espera a "ellos" y sin ese
 * carril no salta nunca.
 *
 * `AudioSourceMode` siempre fue un enum de tres valores; pintarlo como dos
 * interruptores era la fuente de la ambigüedad. Con tres segmentos, pulsar
 * "Ellos" sólo puede significar una cosa.
 *
 * Lo que sí se conserva es la doble lectura que tenían los chips: qué se
 * *supone* que se escucha (el segmento activo) y qué está entrando *de verdad*
 * (la barra, y el ámbar cuando la fuente estaba pedida pero no llegó a abrirse
 * — que da exactamente la misma pantalla que una sala en silencio).
 */
const SOURCE_MODES: { mode: AudioSourceMode; label: UIKey; hint: UIKey }[] = [
  { mode: 'mic', label: 'overlay.sourceMe', hint: 'overlay.sourceMeHint' },
  { mode: 'system', label: 'overlay.sourceThem', hint: 'overlay.sourceThemHint' },
  { mode: 'both', label: 'overlay.sourceBoth', hint: 'overlay.sourceBothHint' },
];

function SourcePicker({
  mode,
  levels,
  status,
  onChange,
}: {
  mode: AudioSourceMode;
  levels: AudioLevels;
  status: CaptureStatus;
  onChange: (next: AudioSourceMode) => void;
}) {
  const t = useT();
  const listening = status.state === 'listening';

  /** Pedida pero sin abrirse: el estado que de otro modo no se ve en ninguna parte. */
  const mute =
    listening &&
    ((mode !== 'system' && !status.micActive) || (mode !== 'mic' && !status.loopbackActive));

  return (
    <div className="sources" role="group" aria-label={t('overlay.sources')}>
      {SOURCE_MODES.map((source) => {
        const active = source.mode === mode;
        const level =
          source.mode === 'mic' ? levels.me : source.mode === 'system' ? levels.them : 0;

        return (
          <button
            key={source.mode}
            type="button"
            className={`source${active ? ' source--on' : ''}${active && mute ? ' source--mute' : ''}`}
            aria-pressed={active}
            title={
              active && mute ? `${t(source.hint)}${t('overlay.sourceMuteSuffix')}` : t(source.hint)
            }
            onClick={() => onChange(source.mode)}
          >
            {source.mode === 'mic' ? (
              <MicIcon />
            ) : source.mode === 'system' ? (
              <SpeakerIcon />
            ) : null}
            {/*
              El rótulo de "Ambos" no se esconde nunca: es el único segmento
              sin icono, y sin texto sería un botón vacío. Los otros dos se
              quedan en icono cuando falta ancho — un micrófono y un altavoz se
              distinguen sin leerlos.
            */}
            <span
              className={`source__label${source.mode === 'both' ? ' source__label--keep' : ''}`}
            >
              {t(source.label)}
            </span>
            {/* El medidor sólo en las fuentes concretas: en "Ambos" habría que
                enseñar dos y la barra dejaría de decir cuál se mueve. */}
            {source.mode !== 'both' && (
              <span className="source__bar">
                <span
                  className={`source__fill source__fill--${source.mode === 'mic' ? 'me' : 'them'}`}
                  style={{
                    width:
                      listening && (active || mode === 'both')
                        ? `${Math.min(level * 140, 100)}%`
                        : 0,
                  }}
                />
              </span>
            )}
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
  onToggleCompact,
}: {
  status: CaptureStatus;
  levels: AudioLevels;
  settings: Settings | null;
  onDragStart: (event: React.MouseEvent) => void;
  onNewConversation: () => void;
  onSolveScreen: (task: ScreenTask) => void;
  onToggleCompact: () => void;
}) {
  const t = useT();
  const language = settings?.language ?? 'auto';
  const compact = settings?.overlayCompact ?? false;

  return (
    // `data-interactive` es lo que hace que la ventana deje de ignorar el ratón
    // mientras el cursor está aquí; sin él, con los clics atravesables activos
    // no se podría ni arrastrar ni pulsar los botones.
    <div className="statusbar" data-interactive onMouseDown={onDragStart}>
      <ListenButton status={status} />

      <SourcePicker
        mode={settings?.audioSources ?? 'both'}
        levels={levels}
        status={status}
        onChange={(audioSources) => void window.api.settings.update({ audioSources })}
      />

      {/*
        El estado va PEGADO a la escucha, no junto a los botones.

        Antes vivía a la derecha, entre el espaciador y los iconos, y eso lo
        colocaba visualmente en el grupo de las acciones: dos etiquetas que no se
        pueden pulsar en mitad de una fila de cosas que sí. Aquí forman un solo
        bloque de "qué está pasando" con el punto de escucha y las fuentes.
      */}
      {/* Aviso explícito cuando el overlay SÍ es visible en una captura:
          es el estado peligroso, así que no puede pasar desapercibido. */}
      {settings && !settings.stealthEnabled && (
        <span className="statusbar__flag" title={t('overlay.visible')}>
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

      <span className="statusbar__spacer" />

      {/*
        Sólo lo que se usa CON ALGUIEN DELANTE, y con su nombre escrito.

        Aquí había seis iconos sin etiqueta y del mismo tamaño; cuatro de ellos
        —plegar, empezar de cero, ajustes y cerrar— son de antes o después de la
        llamada y se han ido al menú `⋯`. El hueco que dejan es exactamente lo
        que hacía falta para poder escribir qué hace cada uno de los dos que
        quedan: eran los que más se usan y los que menos se entendían.

        Siguen agrupados: a tamaño S el contenido no cabe (medido: 407 px en 354
        disponibles) y lo primero que se recortaba era el último botón. En bloque
        la barra los baja enteros a una segunda línea en vez de cortarlos.
      */}
      <div className="statusbar__actions">
        {/* Va en la barra y no entre las acciones rápidas porque tiene que estar
            disponible SIEMPRE: el caso normal es un ejercicio en pantalla sin
            ninguna llamada abierta, así que no hay respuesta previa bajo la que
            colgarlo ni audio que esperar. */}
        <button
          type="button"
          className="actionbtn"
          title={t('overlay.solveCode')}
          onClick={() => onSolveScreen('code')}
        >
          <CodeIcon />
          <span className="actionbtn__label">{t('overlay.codeAction')}</span>
        </button>
        {/* Hermano del anterior: mismo camino, prompt distinto. Un test no se
            responde como un algoritmo, y mezclarlos en un solo botón obligaría
            al modelo a adivinar cuál de las dos cosas está mirando. */}
        <button
          type="button"
          className="actionbtn"
          title={t('overlay.solveQuiz')}
          onClick={() => onSolveScreen('quiz')}
        >
          <QuizIcon />
          <span className="actionbtn__label">{t('overlay.quizAction')}</span>
        </button>

        <MoreMenu
          compact={compact}
          onToggleCompact={onToggleCompact}
          onNewConversation={onNewConversation}
        />
      </div>
    </div>
  );
}

/** Tres puntos: lo que no se usa en mitad de una llamada. */
function MoreIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <circle cx="3.6" cy="8" r="1.25" fill="currentColor" />
      <circle cx="8" cy="8" r="1.25" fill="currentColor" />
      <circle cx="12.4" cy="8" r="1.25" fill="currentColor" />
    </svg>
  );
}

/**
 * Lo que no se usa durante una llamada, fuera de la barra.
 *
 * ## Por qué existe
 *
 * La barra tenía seis iconos con el mismo peso visual, y sólo dos —resolver
 * código y resolver un test— se usan con alguien delante. Los otros cuatro son
 * de antes o de después: plegar, empezar de cero, abrir los ajustes (que roban
 * el foco, así que a mitad de llamada no se tocan) y cerrar la app. Competían
 * por el mismo sitio que los dos que importan, y a tamaño S no cabían: el
 * contenido medía 407 px en 354 disponibles y lo primero que se recortaba era
 * la X.
 *
 * Sacándolos de aquí, los dos que quedan pueden llevar **etiqueta de texto**,
 * que es lo que hacía falta para que se entendieran sin adivinar.
 *
 * ## Los cierres, que es la parte con trampa
 *
 * El overlay es `focusable: false`, así que **no hay evento de blur** que sirva
 * para cerrar: un menú abierto se quedaría abierto para siempre tapando la
 * respuesta. Se cierra por tres caminos:
 *
 * - Al **pulsar fuera** del menú, dentro de la ventana.
 * - Al **sacar el ratón de la ventana entera**, que es volver a la llamada.
 * - Con **Escape**, o al **elegir** cualquier cosa.
 *
 * Lo que NO se usa es cerrar al salir el ratón del menú, y ése fue un bug de
 * verdad: entre el botón y el menú hay unos píxeles de separación visual, así
 * que bajar el cursor hacia las opciones **salía** de `.more` un instante y el
 * menú se cerraba justo cuando ibas a elegir. Un menú que depende de que el
 * ratón no cruce nunca un hueco es un menú roto; la separación se mantiene
 * porque se ve mejor, y el hueco se cubre con un puente en el CSS.
 *
 * Y con `data-interactive`, sin el cual los clics atravesables lo harían
 * inclicable justo en el modo recomendado durante una llamada.
 */
function MoreMenu({
  compact,
  onToggleCompact,
  onNewConversation,
}: {
  compact: boolean;
  onToggleCompact: () => void;
  onNewConversation: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    // Pulsar fuera. En captura, para enterarse aunque el destino pare el evento.
    const onDown = (event: PointerEvent): void => {
      if (!(event.target as Element | null)?.closest('.more')) setOpen(false);
    };
    // Salir de la ventana es volver a la llamada: el menú no se queda tapando
    // la respuesta. Sirve además de red por si el clic de fuera no llega, que
    // con los clics atravesables es exactamente lo que pasa.
    const onLeaveWindow = (): void => setOpen(false);

    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    document.addEventListener('mouseleave', onLeaveWindow);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('mouseleave', onLeaveWindow);
    };
  }, [open]);

  /** Cada entrada cierra el menú, haga lo que haga después. */
  const pick = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div className="more" data-interactive>
      <button
        type="button"
        className={`iconbtn${open ? ' iconbtn--on' : ''}`}
        title={t('overlay.more')}
        aria-label={t('overlay.more')}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreIcon />
      </button>

      {open && (
        <div className="more__menu" role="menu">
          <button
            type="button"
            className="more__item"
            role="menuitem"
            onClick={pick(onToggleCompact)}
          >
            <CompactIcon compact={compact} />
            {compact ? t('overlay.expandShort') : t('overlay.compactShort')}
          </button>
          <button
            type="button"
            className="more__item"
            role="menuitem"
            onClick={pick(() => void window.api.window.openDashboard())}
          >
            <GearIcon />
            {t('overlay.settingsShort')}
          </button>

          {/*
            Las dos que no se deshacen, separadas y al final. Nueva conversación
            borra la transcripción y la memoria; la X cierra la app. Estaban a un
            píxel de «plegar», que no cuesta nada.
          */}
          <div className="more__sep" />
          <button
            type="button"
            className="more__item"
            role="menuitem"
            onClick={pick(onNewConversation)}
          >
            <NewChatIcon />
            {t('overlay.newChatShort')}
          </button>
          <button
            type="button"
            className="more__item more__item--danger"
            role="menuitem"
            onClick={pick(() => void window.api.window.quit())}
          >
            <CloseIcon />
            {t('overlay.quitShort')}
          </button>
        </div>
      )}
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
  const t = useT();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [segments]);

  // El primer segmento es a la vez la condición de "hay algo" y el origen de
  // tiempos, así que se resuelve de una vez: un `?? Date.now()` de respaldo
  // sería una llamada impura en render (y la regla `purity` de eslint la caza).
  const first = segments[0];
  if (!first) {
    return <p className="empty">{t('overlay.waitingAudio')}</p>;
  }

  return (
    <div className="transcript">
      {segments.slice(-VISIBLE_LINES).map((seg) => (
        <div className="transcript__line" key={seg.id}>
          <span className="transcript__time">{elapsed(first.startedAt, seg.startedAt)}</span>
          <span className={`transcript__who transcript__who--${seg.speaker}`}>
            {seg.speaker === 'me' ? t('overlay.me') : t('overlay.them')}
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
/**
 * Iconos de los perfiles.
 *
 * Reconocer una forma es más rápido que leer una palabra, y aquí se mira de
 * reojo con alguien delante: el icono es el que hace el trabajo y la etiqueta el
 * que desempata. Se dibujan en línea, como los demás del overlay, para no
 * depender de ninguna fuente de iconos.
 */
function ProfileIcon({ id }: { id: Settings['promptProfileId'] }) {
  const paths: Partial<Record<Settings['promptProfileId'], string>> = {
    // Una persona: la entrevista es uno frente a uno.
    interview:
      'M8 8.2a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8Zm-4.3 5.4c0-2.2 1.9-3.5 4.3-3.5s4.3 1.3 4.3 3.5',
    // Dos personas: la reunión es de varios.
    meeting:
      'M6 7.6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm5 .4a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4ZM2.4 13c0-1.9 1.6-3 3.6-3s3.6 1.1 3.6 3m.7-2.8c1.6.1 2.9 1 2.9 2.8',
    // Birrete: una clase o una charla.
    lecture: 'M8 3 1.8 6.1 8 9.2l6.2-3.1L8 3Zm-3.6 4.6v3c0 1 1.6 1.8 3.6 1.8s3.6-.8 3.6-1.8v-3',
    // Auriculares con micro: soporte.
    support:
      'M3.2 10.4V8a4.8 4.8 0 0 1 9.6 0v2.4M2 9.6h1.6v3.2H2Zm10.4 0H14v3.2h-1.6Zm0 3.2c0 .9-1 1.4-2.2 1.4',
    // Globo: idiomas, el intérprete.
    interpreter:
      'M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8ZM1.8 8h12.4M8 1.8c1.7 1.7 2.6 3.9 2.6 6.2s-.9 4.5-2.6 6.2M8 1.8C6.3 3.5 5.4 5.7 5.4 8s.9 4.5 2.6 6.2',
  };
  const d = paths[id];
  if (!d) return null;

  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        d={d}
      />
    </svg>
  );
}

const PROFILE_CHIPS = [
  ['interview', 'overlay.profileInterview'],
  ['meeting', 'overlay.profileMeeting'],
  ['lecture', 'overlay.profileLecture'],
  ['support', 'overlay.profileSupport'],
  ['coding', 'overlay.profileCoding'],
  // También como chip, no sólo como botón de pantalla: sirve para un examen
  // oral o una certificación que alguien lee en voz alta, y sus reglas ya
  // contemplan la pregunta abierta.
  ['quiz', 'overlay.profileQuiz'],
  // Traduce en vez de responder; los idiomas se fijan en el dashboard.
  ['interpreter', 'beh.profInterpreter'],
] as const satisfies readonly (readonly [Settings['promptProfileId'], UIKey])[];

function ProfileChips({
  active,
  onChange,
}: {
  active: Settings['promptProfileId'];
  onChange: (id: Settings['promptProfileId']) => void;
}) {
  const t = useT();
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
          {/* Código y test reutilizan los de la barra: es la MISMA acción vista
              desde otro sitio, y darles dos dibujos distintos haría dudar de si
              son lo mismo. */}
          {id === 'coding' ? <CodeIcon /> : id === 'quiz' ? <QuizIcon /> : <ProfileIcon id={id} />}
          {t(label)}
        </button>
      ))}
      {active === 'custom' && (
        <span className="chip chip--active">{t('overlay.profileCustom')}</span>
      )}
    </div>
  );
}

/*
 * Aquí hubo un desplegable de skills, y se quitó.
 *
 * Pasaba el criterio de "¿lo necesitarías a mitad de una llamada?" pero fallaba
 * el otro, que en este panel pesa más: **cada control que sube al overlay le
 * quita sitio a lo que se ha venido a leer**. La skill activa se elige una vez
 * y se olvida —no es como el perfil, que se alterna— así que su sitio es el
 * dashboard, y para el caso puntual está `/skill` en la pestaña de escritura,
 * que no ocupa ni un píxel hasta que se teclea la barra.
 */

/**
 * Acciones rápidas sobre la última respuesta.
 *
 * Son prompts enlatados que van por `askWithText`, la misma vía que la pestaña
 * de escritura: no hay un camino nuevo hacia el LLM que mantener. Cada una es
 * algo que si no tendrías que teclear entero mientras alguien te mira.
 */
/** Etiqueta del botón y prompt enlatado que envía. */
type QuickAction = readonly [label: UIKey, prompt: UIKey];

const QUICK_ACTIONS: readonly QuickAction[] = [
  ['overlay.qaMore', 'overlay.qaMorePrompt'],
  ['overlay.qaShorter', 'overlay.qaShorterPrompt'],
  ['overlay.qaFollowUp', 'overlay.qaFollowUpPrompt'],
  ['overlay.qaSummary', 'overlay.qaSummaryPrompt'],
] as const;

/**
 * Las mismas acciones, pero para código.
 *
 * "Más corto" o "Seguimiento" no significan nada frente a una solución; lo que
 * se pide a continuación es siempre lo mismo: explicarla en voz alta —que es
 * justo lo que te van a pedir después de escribirla—, optimizarla, o probarla.
 */
const CODE_ACTIONS: readonly QuickAction[] = [
  ['overlay.qaExplain', 'overlay.qaExplainPrompt'],
  ['overlay.qaOptimise', 'overlay.qaOptimisePrompt'],
  ['overlay.qaEdge', 'overlay.qaEdgePrompt'],
  ['overlay.qaTests', 'overlay.qaTestsPrompt'],
] as const;

/**
 * Las de test, y son la contrapartida de que la respuesta ya no explique nada.
 *
 * El modo test devuelve una línea por pregunta y punto, porque es lo que hace
 * falta con el examen delante. El porqué no desaparece: se pide aquí, cuando ya
 * has contestado y quieres entender —o comprobar— lo que marcaste.
 */
const QUIZ_ACTIONS: readonly QuickAction[] = [
  ['overlay.qaWhy', 'overlay.qaWhyPrompt'],
  ['overlay.qaDistractors', 'overlay.qaDistractorsPrompt'],
  ['overlay.qaDoubts', 'overlay.qaDoubtsPrompt'],
  ['overlay.qaReview', 'overlay.qaReviewPrompt'],
];

function QuickActions({
  onAsk,
  kind,
}: {
  onAsk: (prompt: string) => void;
  kind: 'chat' | 'code' | 'quiz';
}) {
  const t = useT();
  const actions = kind === 'code' ? CODE_ACTIONS : kind === 'quiz' ? QUIZ_ACTIONS : QUICK_ACTIONS;

  return (
    <div className="quick" data-interactive>
      {actions.map(([label, prompt]) => (
        <button key={label} type="button" className="quick__btn" onClick={() => onAsk(prompt)}>
          {t(label)}
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
  const t = useT();
  return (
    <div className="sizes" data-interactive>
      {SIZES.map((size) => (
        <button
          key={size}
          type="button"
          className={`sizes__btn${active === size ? ' sizes__btn--active' : ''}`}
          aria-pressed={active === size}
          title={t('overlay.size', { size })}
          onClick={() => onChange(size)}
        >
          {size}
        </button>
      ))}
    </div>
  );
}

/** El micrófono del estado central. Grande y de un solo trazo, sin relleno. */
function MicGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <rect
        x="9"
        y="2.5"
        width="6"
        height="11"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.7"
        fill="none"
      />
      <path
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        fill="none"
        d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"
      />
    </svg>
  );
}

/** Llave inglesa: falta configurar un proveedor. */
function SetupGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        d="M14.7 6.3a4 4 0 0 0 5.2 5.2l-8 8a2.3 2.3 0 0 1-3.3-3.3l8-8Z"
      />
      <circle cx="6.5" cy="17.5" r="1" fill="currentColor" />
    </svg>
  );
}

/**
 * El estado del panel cuando todavía no hay nada que leer.
 *
 * Sustituye a los dos vacíos que había antes —"Esperando audio…" en la
 * transcripción y "Ctrl+Enter para pedir una respuesta" en la sugerencia—, que
 * eran dos textos pequeños en cursiva compitiendo por decir lo mismo: que no
 * pasa nada todavía. Ahora lo dice una sola cosa, en el centro y en grande.
 *
 * El micrófono **es** el botón principal, no un adorno encima de él. Fundirlos
 * quita un elemento de la pantalla y elimina la ambigüedad de "¿pulso el icono
 * o el botón?": sólo hay una cosa que pulsar, y es la única con relleno de color
 * en todo el overlay.
 */
function IdleHero({
  status,
  configured,
  onWrite,
}: {
  status: CaptureStatus;
  configured: boolean;
  onWrite: () => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);

  const listening = status.state === 'listening';
  const starting = status.state === 'starting' || busy;
  const state = !configured
    ? 'setup'
    : starting
      ? 'starting'
      : status.state === 'error'
        ? 'error'
        : listening
          ? 'listening'
          : 'idle';

  const copy = {
    // Sin proveedor no hay nada que escuchar: el sitio del estado lo ocupa lo
    // único que se puede hacer, en lugar de un aviso aparte encima del panel.
    setup: {
      title: t('overlay.setupTitle'),
      sub: t('overlay.setupSub'),
      action: t('overlay.setupAction'),
    },
    idle: {
      title: t('overlay.idleTitle'),
      sub: t('overlay.idleSub'),
      action: t('overlay.listen'),
    },
    starting: {
      title: t('overlay.connectingTitle'),
      sub: t('overlay.connectingSub'),
      action: t('overlay.connectingAction'),
    },
    listening: {
      title: t('overlay.listeningTitle'),
      sub: t('overlay.listeningSub'),
      action: t('overlay.listeningAction'),
    },
    error: {
      title: t('overlay.errorTitle'),
      sub: status.error ?? t('overlay.errorSub'),
      action: t('overlay.retry'),
    },
  }[state];

  const press = (): void => {
    if (state === 'setup') {
      void window.api.window.openDashboard();
      return;
    }
    setBusy(true);
    const done = listening ? window.api.capture.stop() : window.api.capture.start();
    void done.finally(() => setBusy(false));
  };

  return (
    <div className="hero" data-interactive>
      <button
        type="button"
        className={`hero__mic hero__mic--${state}`}
        disabled={starting}
        aria-label={copy.action}
        title={copy.action}
        onClick={press}
      >
        {/*
          El anillo es un elemento aparte y no un `box-shadow` animado: así puede
          escalar y desvanecerse sin mover ni un píxel del botón, que es lo que
          diferencia un latido tranquilo de un elemento que da saltos.
        */}
        <span className="hero__ring" aria-hidden="true" />
        {state === 'setup' ? <SetupGlyph /> : <MicGlyph />}
      </button>

      <h1 className="hero__title">{copy.title}</h1>
      <p className="hero__sub">{copy.sub}</p>

      {/*
        La segunda vía, en voz baja. Se puede usar la app entera sin micrófono
        —escribiendo, o resolviendo lo que hay en pantalla— y sin esto no habría
        forma de saberlo desde aquí. Va en texto plano y no en botones para que
        no compita con el círculo.
      */}
      {state !== 'setup' && (
        <div className="hero__alt">
          <button type="button" className="hero__link" onClick={onWrite}>
            {t('overlay.writeQuestion')}
          </button>
          <span className="hero__sep">·</span>
          <span>
            <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd> {t('overlay.footScreen')}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Estado de primer arranque. El dashboard ya no se abre solo, así que sin esto
 * un usuario nuevo se quedaría mirando un overlay que no hace nada y sin pista
 * de dónde configurar las claves.
 *
 * Sigue existiendo para cuando YA hay contenido en pantalla: ahí el estado
 * central no se muestra, y el aviso tiene que caber en una línea.
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
  const t = useT();
  return (
    // `data-interactive`: sin esto las pestañas serían inclicables con los
    // clics atravesables activos, que es el modo recomendado durante una llamada.
    <div className="tabs" data-interactive>
      {(
        [
          ['listen', t('overlay.tabListen')],
          ['write', t('overlay.tabWrite')],
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
function ComposePane({ skills, onSend }: { skills: Skill[]; onSend: (text: string) => void }) {
  const t = useT();
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // La ventana ya es enfocable cuando esto se monta; enfocar aquí evita que el
  // usuario tenga que dar un clic extra para empezar a escribir.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /*
   * `null` mientras no se esté invocando nada; una lista —aunque esté vacía—
   * en cuanto el texto empieza por `/` o `$`. La diferencia es lo que permite
   * decir "no hay ninguna que se llame así" en lugar de no decir nada, que es
   * indistinguible de que el autocompletado esté roto.
   */
  const matches = matchSkills(draft, skills);

  const complete = (id: string): void => {
    setDraft(`/${id} `);
    inputRef.current?.focus();
  };

  const send = (): void => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    onSend(text);
  };

  return (
    <div className="compose" data-interactive>
      {matches && (
        <div className="skillmenu">
          {matches.length === 0 ? (
            <span className="skillmenu__empty">{t('overlay.noSkill')}</span>
          ) : (
            matches.map((skill) => (
              <button
                key={skill.id}
                type="button"
                className="skillmenu__item"
                onClick={() => complete(skill.id)}
              >
                <code className="skillmenu__id">/{skill.id}</code>
                <span className="skillmenu__name">{skillName(t, skill)}</span>
              </button>
            ))
          )}
        </div>
      )}

      <textarea
        ref={inputRef}
        className="compose__input"
        placeholder={t('overlay.composePlaceholder')}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // Enter envía; Shift+Enter salta línea. No se usa Ctrl+Enter porque
          // es un hotkey GLOBAL: lo intercepta el main y nunca llegaría aquí.
          if (e.key !== 'Enter' || e.shiftKey) return;
          e.preventDefault();

          /*
           * Con el menú abierto, Enter **completa** en lugar de enviar. Es lo
           * que hace cualquier chat, y aquí además evita el caso tonto: enviar
           * "/hum" a medias no invoca nada —el prefijo sólo cuenta si casa con
           * una skill de verdad— así que el modelo recibiría esa palabra suelta
           * como si fuera la pregunta. El segundo Enter ya envía.
           */
          const first = matches?.[0];
          if (first) {
            complete(first.id);
            return;
          }
          send();
        }}
      />
      <div className="compose__foot">
        <span className="compose__hint">{t('overlay.composeHint')}</span>
        <button type="button" className="compose__btn" disabled={!draft.trim()} onClick={send}>
          {t('overlay.send')}
        </button>
      </div>
      <p className="compose__warn">{t('overlay.composeWarn')}</p>
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
function explainSkip(reason: string): UIKey {
  if (reason.includes('muletilla')) {
    return 'overlay.skipFiller';
  }
  if (reason.includes('corto')) {
    return 'overlay.skipShort';
  }
  if (reason.includes('estricto')) {
    return 'overlay.skipStrict';
  }
  return 'overlay.skipNone';
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
  const t = useT();
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
        <span className="code__lang">{block.lang || t('overlay.code')}</span>
        {/* Mientras la valla siga abierta el código está a medias: ofrecer
            copiarlo daría una función sin cerrar sin avisar de nada. */}
        {block.open ? (
          <span className="code__writing">{t('overlay.writing')}</span>
        ) : (
          <button type="button" className="code__copy" onClick={copy}>
            {copied === 'sí'
              ? t('overlay.copied')
              : copied === 'falló'
                ? t('overlay.copyFailed')
                : t('overlay.copy')}
          </button>
        )}
      </div>
      <pre className="code__body">
        <code>{block.content}</code>
      </pre>
    </div>
  );
}

/**
 * Texto de una respuesta, con la negrita y el código en línea interpretados.
 *
 * Los modelos marcan en negrita hagas lo que hagas —Claude subrayaba así la
 * opción correcta de cada test— y sin esto el panel enseñaba los asteriscos.
 */
function InlineText({ text }: { text: string }) {
  const spans = parseInline(text);

  return (
    <div className="answer__text">
      {spans.map((span, index) =>
        span.type === 'bold' ? (
          <strong key={index}>{span.text}</strong>
        ) : span.type === 'code' ? (
          <code className="answer__code" key={index}>
            {span.text}
          </code>
        ) : (
          <span key={index}>{span.text}</span>
        )
      )}
    </div>
  );
}

/**
 * Modo teleprompter: la respuesta, una frase por línea.
 *
 * ## Por qué se ve así
 *
 * Lo que delata que alguien lee **no es el tamaño de la letra**, es el
 * movimiento horizontal de los ojos: barrer una línea larga y volver al
 * principio de la siguiente se ve desde el otro lado de una videollamada. De ahí
 * las tres decisiones que definen esta vista, y ninguna es estética:
 *
 * - **Columna estrecha**, para que los ojos apenas se muevan. Poner la respuesta
 *   "en grande" empeora esto, porque una línea grande es más ancha.
 * - **La línea activa siempre en el mismo sitio**, con las vecinas atenuadas.
 *   No hay que buscar por dónde ibas: está donde estaba.
 * - **Se avanza a mano**, con un atajo global. En una conversación no sabes a
 *   qué ritmo vas a hablar; un desplazamiento automático se va justo cuando te
 *   interrumpen, y perseguirlo es mirar la pantalla.
 *
 * Se enseña la anterior y la siguiente, no sólo la actual: ver lo que viene es
 * lo que permite encadenar sin la pausa de leer.
 */
function Teleprompter({ text }: { text: string }) {
  const t = useT();
  const lines = toLines(text);
  const [at, setAt] = useState(0);

  const move = useCallback(
    (step: number) => {
      setAt((current) => Math.min(Math.max(current + step, 0), Math.max(lines.length - 1, 0)));
    },
    [lines.length]
  );

  // El atajo es global porque el overlay no tiene el foco: la tecla la recoge el
  // proceso principal y la reenvía por IPC.
  useEffect(() => window.api.teleprompter.onMove(move), [move]);

  if (lines.length === 0) return null;

  return (
    <div
      className="prompter"
      data-interactive
      role="button"
      tabIndex={-1}
      title={t('overlay.prompterHint')}
      onClick={() => move(1)}
      onContextMenu={(event) => {
        // Clic derecho para retroceder: es el gesto más corto que existe para
        // corregir un avance de más, y no hay menú contextual que estorbar.
        event.preventDefault();
        move(-1);
      }}
    >
      <div className="prompter__line prompter__line--past">{lines[at - 1] ?? ''}</div>
      <div className="prompter__line prompter__line--now">{lines[at]}</div>
      <div className="prompter__line prompter__line--next">{lines[at + 1] ?? ''}</div>
      <div className="prompter__rail">
        {lines.map((_, index) => (
          <span
            key={index}
            className={`prompter__tick${index === at ? ' prompter__tick--now' : ''}${
              index < at ? ' prompter__tick--done' : ''
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Copia el texto completo de la respuesta al portapapeles.
 *
 * Como el copiar de un bloque de código, pasa por el main (`clipboard.write`):
 * `navigator.clipboard` exige foco y el overlay es `focusable: false`, así que
 * fallaría siempre. Da un «Copiado» breve como confirmación.
 */
function CopyAnswerButton({ text }: { text: string }) {
  const t = useT();
  const [copied, setCopied] = useState<'no' | 'sí' | 'falló'>('no');

  useEffect(() => {
    if (copied === 'no') return;
    const timer = setTimeout(() => setCopied('no'), 1_200);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = (): void => {
    window.api.clipboard
      .write(text)
      .then(() => setCopied('sí'))
      .catch(() => setCopied('falló'));
  };

  return (
    <button
      type="button"
      className="section__copy"
      data-interactive
      title={t('overlay.copyAnswer')}
      onClick={copy}
    >
      {copied === 'sí'
        ? t('overlay.copied')
        : copied === 'falló'
          ? t('overlay.copyFailed')
          : t('overlay.copy')}
    </button>
  );
}

/** El cuerpo de una respuesta: texto, salvo lo que venga entre vallas. */
function AnswerBody({ text }: { text: string }) {
  const blocks = parseAnswerBlocks(text);

  return (
    <div className="answer">
      {blocks.map((block, index) =>
        block.type === 'code' ? (
          <CodeBlock key={index} block={block} />
        ) : (
          <InlineText key={index} text={block.content} />
        )
      )}
    </div>
  );
}

function AnswerPane({
  answer,
  skip,
  listening,
  teleprompter,
}: {
  answer: Answer | null;
  skip: { text: string; reason: string } | null;
  listening: boolean;
  teleprompter: boolean;
}) {
  const t = useT();
  if (!answer) {
    // El descarte sólo se enseña mientras no haya respuesta: si ya hay una en
    // pantalla, taparla con un aviso sobre una frase suelta sería peor.
    if (skip) {
      return (
        <div className="skip">
          <span className="skip__what">«{skip.text}»</span>
          <span className="skip__why">{t(explainSkip(skip.reason))}</span>
        </div>
      );
    }
    // El estado vacío dice lo que se puede hacer AHORA. Antes decía siempre
    // "Ctrl+Enter para pedir una respuesta", que con la escucha parada no sirve
    // de nada: no hay transcripción de la que sacar una pregunta.
    return (
      <p className="empty">{listening ? t('overlay.emptyIdle') : t('overlay.emptyStopped')}</p>
    );
  }
  if (answer.status === 'thinking') {
    // El modo código tarda más y por una razón distinta —la imagen se sube y se
    // lee entera antes del primer token—, así que decirlo evita que parezca que
    // se ha colgado justo cuando más prisa hay.
    return (
      <p className="empty">
        {answer.trigger === 'code' ? t('overlay.readingScreen') : t('overlay.thinking')}
      </p>
    );
  }
  if (answer.status === 'error') {
    return <div className="answer answer--error">{answer.error ?? t('overlay.unknownError')}</div>;
  }
  /*
   * El teleprompter sólo entra con la respuesta TERMINADA.
   *
   * Durante el streaming las líneas se recalculan con cada token y la que estás
   * leyendo se mueve debajo de los ojos, que es lo contrario de lo que este modo
   * viene a resolver. Mientras llega se ve la respuesta normal.
   */
  /*
   * `key` con el id de la respuesta, y no un efecto que ponga el índice a cero.
   *
   * Una respuesta nueva tiene que empezar por su primera línea; si no, arrancas
   * por donde te quedaste en la anterior y lo primero que haces al leer es
   * darte cuenta de que estás en el sitio equivocado. Remontar lo consigue sin
   * `setState` dentro de un efecto, que es lo que este proyecto ya evita.
   */
  if (teleprompter && answer.status === 'done') {
    return <Teleprompter key={answer.id} text={answer.text} />;
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
  const t = useT();
  if (total < 2) return null;

  return (
    <div className="nav" data-interactive>
      <button
        type="button"
        className="nav__btn"
        disabled={index === 0}
        title={t('overlay.prevAnswer')}
        aria-label={t('overlay.prevAnswer')}
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
        title={t('overlay.nextAnswer')}
        aria-label={t('overlay.nextAnswer')}
        onClick={() => onGo(index + 1)}
      >
        ›
      </button>
    </div>
  );
}

/**
 * La memoria del asistente, con su botón para vaciarla.
 *
 * Cada turno recordado se reenvía **entero** en la siguiente consulta, y eso no
 * se veía en ninguna parte. Importa sobre todo con un modelo local: Ollama
 * aplica su propia ventana de contexto y descarta lo que no cabe **sin dar
 * ningún error**, así que el síntoma de haberla llenado es que el modelo empieza
 * a olvidar cosas recientes, que es justo lo que no hace sospechar del contexto.
 *
 * Es distinto de "nueva conversación", que además vacía la transcripción y
 * cierra la conversación en disco. Aquí se conserva todo eso.
 */
/**
 * Estado de la captura por trozos, junto a "Sugerencia".
 *
 * Aparece sólo cuando hay algo que enseñar: trozos en la pila o el bucle
 * automático grabando. Los dos botones —Resolver y ✕— hacen lo mismo que los
 * atajos, para quien no los recuerda. `data-interactive` es imprescindible: sin
 * él, con los clics atravesables activos, el ratón pasaría de largo.
 */
function ScrollChip({ state }: { state: ScrollCaptureState }) {
  const t = useT();
  if (!state.capturing && state.frames === 0) return null;

  return (
    <span className="scrollchip" data-interactive>
      <span className={`scrollchip__label${state.capturing ? ' scrollchip__label--rec' : ''}`}>
        {state.capturing
          ? t('scroll.capturing', { count: state.frames })
          : t('scroll.pieces', { count: state.frames })}
      </span>
      {state.frames > 0 && (
        <>
          <button
            type="button"
            className="scrollchip__btn"
            onClick={() => void window.api.scrollCapture.solve()}
          >
            {t('scroll.solve')}
          </button>
          <button
            type="button"
            className="scrollchip__x"
            aria-label={t('scroll.clear')}
            title={t('scroll.clear')}
            onClick={() => void window.api.scrollCapture.clear()}
          >
            ✕
          </button>
        </>
      )}
    </span>
  );
}

function MemoryChip({ turns, max }: { turns: number; max: number }) {
  const t = useT();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(false), 1_400);
    return () => clearTimeout(timer);
  }, [done]);

  // Sin memoria no hay nada que enseñar ni que olvidar: el chip sólo aparece
  // cuando el asistente ya recuerda algo. La excepción es el instante posterior
  // a vaciarla — si no, al pulsar el chip se desvanece sin decir nada y el
  // "olvidado" no llega a verse nunca.
  if (turns === 0 && !done) return null;

  return (
    <button
      type="button"
      className={`memory${turns >= max ? ' memory--full' : ''}`}
      data-interactive
      title={t('overlay.memoryTitle', { turns, max })}
      onClick={() => {
        // Se marca ANTES de llamar, y no en el `.then`. Vaciar la memoria deja
        // el contador a cero, y con cero el chip no se pinta: para cuando
        // llegara la respuesta, este componente ya estaría desmontado y el
        // aviso no se vería nunca. Ambos cambios de estado caen en el mismo
        // render, así que el chip sobrevive para decir que lo hizo.
        setDone(true);
        void window.api.ask.forgetContext().catch(() => setDone(false));
      }}
    >
      {done ? t('overlay.forgotten') : t('overlay.memory', { turns, max })}
    </button>
  );
}

/**
 * Qué acciones rápidas tocan según lo que hay en pantalla.
 *
 * Manda la respuesta que se está mirando y no el perfil configurado: un
 * Ctrl+Alt+Q con el perfil en "Entrevista" deja delante una lista de respuestas
 * de test, y lo que se querrá pedir es sobre ellas.
 */
function quickActionKind(answer: Answer, settings: Settings | null): 'chat' | 'code' | 'quiz' {
  if (answer.trigger === 'code' || settings?.promptProfileId === 'coding') return 'code';
  if (answer.trigger === 'quiz' || settings?.promptProfileId === 'quiz') return 'quiz';
  return 'chat';
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
  const [memory, setMemory] = useState({ turns: 0, max: 8 });
  const [scroll, setScroll] = useState<ScrollCaptureState>({
    frames: 0,
    capturing: false,
    mode: 'manual',
  });
  const [skip, setSkip] = useState<{ text: string; reason: string } | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);

  useChromeMouse();
  const onDragStart = useOverlayDrag();

  /*
   * Este componente **provee** el idioma, así que no puede consumirlo con
   * `useT()`: un contexto no se lee en el mismo componente que lo pone. Para
   * sus propias cadenas traduce directamente contra los settings, que es de
   * donde salía el valor de todas formas.
   */
  const t = (key: UIKey, vars?: Record<string, string | number>): string =>
    translate(settings?.uiLanguage ?? DEFAULT_UI_LANG, key, vars);

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

  /*
   * La lista de skills se refresca al abrir la pestaña de escritura, además de
   * al arrancar.
   *
   * No hay evento de "cambió la carpeta" y no se ha puesto uno: eso obligaría a
   * vigilar un directorio del usuario para siempre por un cambio que ocurre
   * dos veces al mes. Releer al entrar cubre el caso real —crear una skill y
   * usarla sin reiniciar— y cuesta una lectura de disco en el momento en el que
   * el usuario acaba de decidir escribir, no en mitad de una respuesta.
   */
  useEffect(() => {
    if (tab === 'write') void window.api.skills.list().then(setSkills);
  }, [tab]);

  useEffect(() => {
    const { api } = window;

    void api.settings.get().then(setSettings);
    void api.capture.getStatus().then(setStatus);
    void api.memory.get().then(setMemory);
    void api.skills.list().then(setSkills);

    /*
     * "¿Está configurada la IA?" se vuelve a preguntar en CADA cambio, no sólo
     * al arrancar.
     *
     * El fallo que arregla se ve en pantalla y no en ningún log: bastaba con
     * probar otro proveedor un momento —uno sin clave— para que el panel se
     * quedara con «Falta configurar la IA» **para siempre**, aunque se volviera
     * al de antes. El aviso se calculaba una vez al montar y nada lo revisaba.
     *
     * Y se recalcula por los dos lados, porque el veredicto depende de dos
     * cosas que cambian por separado: el proveedor elegido (settings) y si su
     * clave sirve (secrets). Escuchar sólo una dejaba la mitad de los casos
     * mintiendo — pegar la clave que falta y que el aviso siguiera ahí es el
     * más frustrante de los dos.
     */
    const recheck = (current?: Settings): void => {
      void Promise.all([
        current ? Promise.resolve(current) : api.settings.get(),
        api.secrets.getPresence(),
      ]).then(([settingsNow, presence]) => setConfigured(providerIsReady(settingsNow, presence)));
    };
    recheck();

    const unsubs = [
      api.settings.onChange((next) => {
        setSettings(next);
        recheck(next);
      }),
      // Sin argumento a propósito: lo que llega por ahí es la presencia, no los
      // settings, y `recheck` los pediría de nuevo igualmente.
      api.secrets.onChange(() => recheck()),
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
      api.memory.onChange(setMemory),
      api.scrollCapture.onChange(setScroll),
    ];

    return () => unsubs.forEach((off) => off());
  }, []);

  const compact = settings?.overlayCompact ?? false;

  // Qué respuesta se enseña: la que se esté mirando, o la última. Seguir a la
  // última por defecto es lo que mantiene el comportamiento de siempre — una
  // respuesta nueva sustituye a la anterior — sin perder las de antes.
  const index = viewing ?? answers.length - 1;
  const answer = answers[index] ?? null;

  /*
   * El estado central manda mientras no haya nada que leer.
   *
   * "Nada que leer" es literal: ni transcripción ni respuestas. En cuanto llega
   * lo primero, el panel vuelve a su reparto normal y el contenido ocupa el
   * sitio — el vacío es un estado, no una pantalla aparte. La pestaña de
   * escritura lo desactiva porque ahí el usuario ya eligió qué hacer.
   */
  const hero = tab === 'listen' && segments.length === 0 && answers.length === 0;

  return (
    <LangProvider lang={settings?.uiLanguage}>
      <div
        className="panel"
        style={{
          opacity: settings?.overlayOpacity ?? 1,
          // Sólo escala el CONTENIDO: la barra y los chips se quedan como están,
          // o con la letra grande los controles se comerían el panel entero.
          ['--font-scale' as string]: clampFontScale(settings?.overlayFontScale ?? 1),
        }}
      >
        {/* Marco discontinuo rojo cuando el sigilo está apagado: el overlay SÍ
            sale en la captura ahora mismo, y el borde lo grita en el propio borde
            de la ventana, no sólo con el «VISIBLE» de la barra. */}
        {settings && !settings.stealthEnabled && (
          <div className="detectable-frame" aria-hidden="true" />
        )}
        <StatusBar
          status={status}
          levels={levels}
          settings={settings}
          onDragStart={onDragStart}
          onNewConversation={() => void window.api.history.newConversation()}
          onSolveScreen={(task) => void window.api.ask.solveOnScreen(task)}
          onToggleCompact={() => void window.api.settings.update({ overlayCompact: !compact })}
        />

        {/* Con el estado central visible, el aviso de configuración vive dentro
          de él: dos sitios diciendo lo mismo es exactamente el ruido que este
          rediseño quita. */}
        {!configured && !hero && <SetupPrompt />}

        {sttError && (
          <div className="sttError" data-interactive>
            <span className="sttError__text">
              {t('overlay.transcription')}: {sttError}
            </span>
            <button
              type="button"
              className="sttError__close"
              aria-label={t('overlay.dismiss')}
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
              aria-label={t('overlay.dismiss')}
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

        {/*
        Con el estado central no se pintan las pestañas: en ese momento hay una
        sola cosa que hacer, y una fila de pestañas encima de un panel vacío es
        justo lo que hace que un vacío parezca sin terminar en lugar de
        deliberado. La otra vía —escribir— la ofrece el propio estado central.
      */}
        {hero ? (
          <IdleHero status={status} configured={configured} onWrite={() => setTab('write')} />
        ) : (
          !compact && (
            <div className="section">
              <Tabs tab={tab} onChange={setTab} />
              {tab === 'listen' ? (
                <TranscriptPane segments={segments} />
              ) : (
                <ComposePane
                  skills={skills}
                  onSend={(text) => void window.api.ask.withText(text)}
                />
              )}
            </div>
          )
        )}

        {shot && (
          <div className="shot">
            <img className="shot__img" src={`data:${shot.mime};base64,${shot.base64}`} alt="" />
            <span className="shot__label">{t('overlay.attached')}</span>
          </div>
        )}

        {/* La sección de respuesta desaparece con el estado central: su cabecera
          y su texto de "todavía nada" eran el segundo vacío que competía. */}
        {!hero && (
          <div className="section" style={{ flex: 1 }}>
            <div className="section__head">
              <span className="section__title">{t('overlay.suggestion')}</span>
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
                <span
                  className="section__meta"
                  title={
                    // Con modelo propio para la pantalla, saber cuál respondió deja
                    // de ser evidente: la etiqueta sigue a la respuesta que hay
                    // delante, no a los ajustes.
                    answer
                      ? t('overlay.generatedBy', {
                          provider: answer.providerId,
                          model: answer.model,
                        })
                      : t('overlay.answeringWith', { model: settings.llmProviderId })
                  }
                >
                  {answer?.model ||
                    settings.llmModels[settings.llmProviderId] ||
                    settings.llmProviderId}
                </span>
              )}
              <MemoryChip turns={memory.turns} max={memory.max} />
              <ScrollChip state={scroll} />
              {/* Copiar la respuesta entera. Aparece cuando ya está terminada (con
                  la generación en curso está el botón «Parar»), para cualquier tipo
                  de respuesta, no solo código. */}
              {answer && answer.status === 'done' && answer.text.trim() && (
                <CopyAnswerButton text={answer.text} />
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
              {/* Extiende una solución de código que se cortó. Sólo en la última
                  respuesta (el motor continúa la que tiene en vuelo) y sólo en
                  código, que es donde el tope aprieta. */}
              {answer &&
                answer.status === 'done' &&
                answer.trigger === 'code' &&
                viewing === null && (
                  <button
                    type="button"
                    className="section__continue"
                    data-interactive
                    title={t('overlay.continueHint')}
                    onClick={() => void window.api.ask.continue()}
                  >
                    {t('overlay.continue')}
                  </button>
                )}
            </div>
            <AnswerPane
              answer={answer}
              skip={skip}
              listening={status.state === 'listening'}
              teleprompter={settings?.teleprompterEnabled ?? false}
            />
          </div>
        )}

        {/*
        Sólo tienen sentido cuando hay una respuesta sobre la que actuar:
        "Sigue" o "Más corto" sin nada previo pedirían al modelo que ampliara el
        vacío.

        Y desaparecen mientras se navega hacia atrás, aunque haya respuesta en
        pantalla: estos prompts dicen "tu última respuesta", y la última para el
        modelo es la suya, no la que se esté mirando. Ofrecerlos ahí prometería
        actuar sobre lo que se lee y actuaría sobre otra cosa.
      */}
        {viewing === null &&
          answer &&
          (answer.status === 'done' || answer.status === 'streaming') && (
            <QuickActions
              onAsk={(prompt) => void window.api.ask.withText(prompt)}
              // Manda lo que se acaba de responder, no el perfil configurado: tras
              // un Ctrl+Alt+C con el perfil en "Entrevista", lo que hay en pantalla
              // es una solución y lo que se quiere pedir es sobre ella.
              kind={quickActionKind(answer, settings)}
            />
          )}

        {!compact && (
          <div className="hints">
            {/* Con el estado central los atajos ya están dichos ahí arriba, y
              repetirlos abajo es la clase de relleno que hace que un panel
              parezca un formulario. Queda sólo el tamaño. */}
            {!hero && (
              <>
                <span>
                  <kbd>Ctrl</kbd>+<kbd>Enter</kbd> {t('overlay.footAsk')}
                </span>
                <span>
                  <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd> {t('overlay.footScreen')}
                </span>
              </>
            )}
            <span className="hints__spacer" />
            <SizePicker
              active={settings?.overlaySize ?? 'M'}
              onChange={(overlaySize) => void window.api.settings.update({ overlaySize })}
            />
          </div>
        )}
      </div>
    </LangProvider>
  );
}

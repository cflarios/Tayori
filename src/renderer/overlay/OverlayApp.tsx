import { useEffect, useRef, useState } from 'react';
import type {
  Answer,
  AudioLevels,
  CaptureStatus,
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

function StatusBar({
  status,
  levels,
  stealth,
}: {
  status: CaptureStatus;
  levels: AudioLevels;
  stealth: boolean;
}) {
  const dotClass =
    status.state === 'listening'
      ? 'statusbar__dot statusbar__dot--listening'
      : status.state === 'error'
        ? 'statusbar__dot statusbar__dot--error'
        : 'statusbar__dot';

  return (
    <div className="statusbar">
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

  useEffect(() => {
    const { api } = window;

    void api.settings.get().then(setSettings);
    void api.capture.getStatus().then(setStatus);

    const unsubs = [
      api.settings.onChange(setSettings),
      api.capture.onStatus(setStatus),
      api.capture.onLevels(setLevels),
      api.ask.onAnswer(setAnswer),
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
      <StatusBar status={status} levels={levels} stealth={settings?.stealthEnabled ?? true} />

      <div className="section">
        <span className="section__title">Transcripción</span>
        <TranscriptPane segments={segments} />
      </div>

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

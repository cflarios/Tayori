/**
 * Iconos del dashboard, dibujados a mano.
 *
 * No hay librería de iconos y no debería haberla: la CSP del dashboard es
 * `default-src 'self'` (ver index.html), así que nada puede venir de un CDN, y
 * meter un paquete de 200 KB en una ventana que se abre desde el engranaje para
 * cambiar dos ajustes no sale a cuenta. Son SVG de trazo, heredan `currentColor`
 * y el tamaño se pasa por prop, así que un icono en la barra lateral y el mismo
 * dentro de una fila son el mismo componente con distinto contexto.
 */

const PATHS = {
  /* ── Secciones ── */
  sliders: (
    <>
      <line x1="4" y1="7" x2="20" y2="7" />
      <circle cx="9" cy="7" r="2.2" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <circle cx="15" cy="12" r="2.2" />
      <line x1="4" y1="17" x2="20" y2="17" />
      <circle cx="8" cy="17" r="2.2" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="21" />
      <line x1="9" y1="21" x2="15" y2="21" />
    </>
  ),
  cpu: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" />
      <line x1="9" y1="1.5" x2="9" y2="4" />
      <line x1="15" y1="1.5" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="22.5" />
      <line x1="15" y1="20" x2="15" y2="22.5" />
      <line x1="1.5" y1="9" x2="4" y2="9" />
      <line x1="1.5" y1="15" x2="4" y2="15" />
      <line x1="20" y1="9" x2="22.5" y2="9" />
      <line x1="20" y1="15" x2="22.5" y2="15" />
    </>
  ),
  waveform: (
    <>
      <line x1="3" y1="10" x2="3" y2="14" />
      <line x1="7" y1="6" x2="7" y2="18" />
      <line x1="11" y1="9" x2="11" y2="15" />
      <line x1="15" y1="4" x2="15" y2="20" />
      <line x1="19" y1="8" x2="19" y2="16" />
    </>
  ),
  bolt: <path d="M13 2.5 5.5 13.5H11L10 21.5 18.5 10H13z" />,
  file: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="13" y2="17" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.2 2" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
      <line x1="6" y1="10" x2="6" y2="10" />
      <line x1="9.5" y1="10" x2="9.5" y2="10" />
      <line x1="13" y1="10" x2="13" y2="10" />
      <line x1="16.5" y1="10" x2="16.5" y2="10" />
      <line x1="8" y1="14" x2="16" y2="14" />
    </>
  ),
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  cloud: <path d="M7 18.5a4.2 4.2 0 0 1 .5-8.37 5.6 5.6 0 0 1 10.7 1.55A3.7 3.7 0 0 1 17.8 18.5z" />,
  broadcast: (
    <>
      <circle cx="12" cy="12" r="2.4" />
      <path d="M8.1 15.9a5.5 5.5 0 0 1 0-7.8" />
      <path d="M15.9 8.1a5.5 5.5 0 0 1 0 7.8" />
      <path d="M5.3 18.7a9.5 9.5 0 0 1 0-13.4" />
      <path d="M18.7 5.3a9.5 9.5 0 0 1 0 13.4" />
    </>
  ),
  laptop: (
    <>
      <rect x="4" y="5" width="16" height="11" rx="2" />
      <path d="M2 19.5h20" />
    </>
  ),
  phone: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <line x1="10.5" y1="18.5" x2="13.5" y2="18.5" />
    </>
  ),
  wifi: (
    <>
      <path d="M2.5 8.5a15 15 0 0 1 19 0" />
      <path d="M5.8 12.2a10 10 0 0 1 12.4 0" />
      <path d="M9 15.8a5 5 0 0 1 6 0" />
      <line x1="12" y1="19.5" x2="12" y2="19.5" />
    </>
  ),

  /* ── Filas y tarjetas ── */
  eyeOff: (
    <>
      <line x1="3" y1="3" x2="21" y2="21" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.8 5A9.8 9.8 0 0 1 12 4.8c5 0 9 4.4 9 6.4 0 .8-.7 2-1.9 3.2" />
      <path d="M6.2 6.4C4 7.8 3 9.7 3 11.2c0 2 4 6.4 9 6.4.9 0 1.9-.2 2.8-.5" />
    </>
  ),
  pointer: <path d="M5.5 3.5 19 10.2l-6.2 1.6-1.6 6.2z" />,
  contrast: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none" />
    </>
  ),
  type: (
    <>
      <path d="M5 7V5.5h14V7" />
      <line x1="12" y1="5.5" x2="12" y2="18.5" />
      <line x1="9" y1="18.5" x2="15" y2="18.5" />
    </>
  ),
  collapse: (
    <>
      <path d="M8 5.5 12 9.5 16 5.5" />
      <path d="M8 18.5 12 14.5 16 18.5" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="12" r="4" />
      <line x1="12" y1="12" x2="21" y2="12" />
      <line x1="17.5" y1="12" x2="17.5" y2="15.5" />
      <line x1="20.5" y1="12" x2="20.5" y2="14.5" />
    </>
  ),
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12.5" rx="2.5" />
      <line x1="12" y1="16.5" x2="12" y2="20" />
      <line x1="8.5" y1="20" x2="15.5" y2="20" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18" />
    </>
  ),
  speaker: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" />
      <path d="M15.5 9.5a4 4 0 0 1 0 5" />
      <path d="M18 7a7.5 7.5 0 0 1 0 10" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v10" />
      <path d="M8 10.5 12 14.5l4-4" />
      <path d="M5 19h14" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.5A2 2 0 0 1 6 3.5h13v14H6a2 2 0 0 0-2 2z" />
      <line x1="8" y1="8" x2="15" y2="8" />
    </>
  ),
  power: (
    <>
      <path d="M12 3.5v8" />
      <path d="M7.2 6.6a7.5 7.5 0 1 0 9.6 0" />
    </>
  ),
  check: <path d="M5 12.5 9.5 17 19 6.5" />,
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </>
  ),
  arrow: (
    <>
      <line x1="4.5" y1="12" x2="18" y2="12" />
      <path d="m13 7 5 5-5 5" />
    </>
  ),
  history: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.5 4.5V9H8" />
      <path d="M12 8v4.3l3 1.8" />
    </>
  ),
} satisfies Record<string, React.ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 17 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

import { useEffect, useId, useState } from 'react';

/**
 * La mascota de Tayori: un fantasmita con auriculares.
 *
 * Encaja por dos motivos: **escucha** tu llamada (auriculares) y **desaparece**
 * cuando compartes pantalla (fantasma). Es el mismo SVG que la web (tayori-web,
 * `components/Mascot.tsx`); se copió aquí en vez de compartir un paquete porque
 * son dos proyectos distintos y es un único archivo autocontenido.
 *
 * Los ids de los gradientes se derivan de `useId` para que dos mascotas en la
 * misma página (barra lateral + «Acerca de») no colisionen sus `url(#...)`.
 *
 * `autoBlink` parpadea de vez en cuando: un guiño de vida para el logo, apagado
 * por defecto porque en tamaños pequeños no se aprecia y no vale el timer.
 */
export function Mascot({
  className = '',
  size,
  autoBlink = false,
}: {
  className?: string;
  /** Lado en px; si se omite, hereda el tamaño del contenedor (CSS). */
  size?: number;
  autoBlink?: boolean;
}) {
  const rawId = useId().replace(/:/g, '');
  const body = `body-${rawId}`;
  const gear = `gear-${rawId}`;
  const glow = `glow-${rawId}`;

  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (!autoBlink) return;
    // Un parpadeo corto (~140 ms) cada 4–7 s, a intervalo irregular para que no
    // se sienta mecánico.
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (): void => {
      timer = setTimeout(
        () => {
          setBlink(true);
          timer = setTimeout(() => {
            setBlink(false);
            schedule();
          }, 140);
        },
        4000 + Math.random() * 3000
      );
    };
    schedule();
    return () => clearTimeout(timer);
  }, [autoBlink]);

  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      {...(size ? { width: size, height: size } : {})}
      role="img"
      aria-label="Tayori"
    >
      <defs>
        <linearGradient id={body} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#f4f1ff" />
          <stop offset="0.6" stopColor="#dcd6ff" />
          <stop offset="1" stopColor="#c3e9f6" />
        </linearGradient>
        <linearGradient id={gear} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="0.5" stopColor="#818cf8" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
        <radialGradient id={glow} cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stopColor="#8b5cf6" stopOpacity="0.45" />
          <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="24" cy="24" r="22" fill={`url(#${glow})`} />

      <path
        d="M10 39 L10 21 C10 13.3 16.3 7 24 7 C31.7 7 38 13.3 38 21 L38 39
           Q34.5 43.5 31 39 Q27.5 43.5 24 39 Q20.5 43.5 17 39 Q13.5 43.5 10 39 Z"
        fill={`url(#${body})`}
        stroke={`url(#${gear})`}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />

      <path
        d="M8.5 21 A15.5 15.5 0 0 1 39.5 21"
        fill="none"
        stroke={`url(#${gear})`}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <rect x="5.4" y="18.5" width="5.6" height="9" rx="2.8" fill={`url(#${gear})`} />
      <rect x="37" y="18.5" width="5.6" height="9" rx="2.8" fill={`url(#${gear})`} />

      <ellipse cx="14.5" cy="27" rx="2.1" ry="1.25" fill="#f9a8d4" opacity="0.75" />
      <ellipse cx="33.5" cy="27" rx="2.1" ry="1.25" fill="#f9a8d4" opacity="0.75" />

      {blink ? (
        <>
          <path
            d="M14.6 22.5 q3 2 6 0"
            fill="none"
            stroke="#2a2340"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M27.4 22.5 q3 2 6 0"
            fill="none"
            stroke="#2a2340"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <ellipse cx="17.6" cy="22.2" rx="2.7" ry="3.6" fill="#2a2340" />
          <ellipse cx="30.4" cy="22.2" rx="2.7" ry="3.6" fill="#2a2340" />
          <circle cx="16.6" cy="20.6" r="1.1" fill="#fff" />
          <circle cx="18.5" cy="23.4" r="0.6" fill="#fff" />
          <circle cx="29.4" cy="20.6" r="1.1" fill="#fff" />
          <circle cx="31.3" cy="23.4" r="0.6" fill="#fff" />
        </>
      )}

      <path
        d="M22.2 26.6 Q24 28.4 25.8 26.6"
        fill="none"
        stroke="#2a2340"
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      <path
        d="M40 9 l0.9 2.1 2.1 0.9 -2.1 0.9 -0.9 2.1 -0.9 -2.1 -2.1 -0.9 2.1 -0.9 Z"
        fill="#67e8f9"
        opacity="0.9"
      />
    </svg>
  );
}

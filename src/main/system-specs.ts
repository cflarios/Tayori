import { app } from 'electron';
import { cpus, totalmem } from 'node:os';
import type { SystemSpecs } from '@shared/types';

/**
 * Qué máquina es ésta, para poder recomendar un modelo local con criterio.
 *
 * Existe porque la pregunta "¿qué modelo de Ollama me va a ir bien?" no tiene
 * respuesta genérica: el mismo modelo es instantáneo en una máquina con GPU y
 * tarda un minuto por respuesta en un portátil de oficina, y descubrirlo cuesta
 * una descarga de varios gigas.
 *
 * Se mide lo que se puede medir de verdad y **no se estima lo demás**. En
 * concreto, la VRAM: es el número que de verdad decide si un modelo cabe en la
 * GPU, y no hay forma fiable de leerla desde Electron sin invocar herramientas
 * externas del sistema. Inventar una cifra aquí sería peor que no darla, porque
 * la recomendación se apoyaría en un dato falso.
 */
/**
 * Cache de sesión de las specs.
 *
 * El hardware no cambia mientras la app está abierta, y `getGPUInfo('complete')`
 * es **caro**: recopila la info completa de la GPU (cientos de ms). El dashboard
 * lo pide en cada visita a las secciones de Modelos y Transcripción —que se
 * remontan al cambiar de pestaña—, así que sin cachear ese coste se pagaba una y
 * otra vez, y era justo lo que hacía que esas dos pestañas cargaran más lentas
 * que las demás. Se memoiza la promesa: el coste se paga una sola vez por sesión.
 */
let cachedSpecs: Promise<SystemSpecs> | null = null;

export function getSystemSpecs(): Promise<SystemSpecs> {
  cachedSpecs ??= computeSystemSpecs();
  return cachedSpecs;
}

async function computeSystemSpecs(): Promise<SystemSpecs> {
  const cores = cpus();

  let gpu: string | undefined;
  try {
    // `basic` devuelve identificadores numéricos; el nombre legible de la GPU
    // sale del renderer de ANGLE, que es lo único que da un nombre comercial
    // sin depender de utilidades externas.
    const info = (await app.getGPUInfo('complete')) as {
      auxAttributes?: { glRenderer?: string };
    };
    gpu = cleanRenderer(info.auxAttributes?.glRenderer);
  } catch {
    // Un fallo aquí no es motivo para no dar el resto: la recomendación se
    // apoya sobre todo en la RAM.
    gpu = undefined;
  }

  return {
    totalMemoryGB: Math.round(totalmem() / 1024 ** 3),
    cpuModel: cores[0]?.model.trim() ?? 'desconocida',
    cpuCores: cores.length,
    ...(gpu ? { gpu } : {}),
  };
}

/**
 * "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)"
 * → "NVIDIA GeForce RTX 3060".
 *
 * Se exporta para poder fijarlo con un test: lo que sale de aquí se enseña tal
 * cual en la tarjeta de "qué modelo local le pega a tu equipo" y en la guía, y
 * el formato de esta cadena lo decide el driver, no nosotros.
 */
export function cleanRenderer(renderer: string | undefined): string | undefined {
  if (!renderer) return undefined;

  const inside = /^ANGLE \((.*)\)$/.exec(renderer.trim());
  if (!inside?.[1]) return renderer.trim();

  // El contenido viene como "vendor, dispositivo, backend"; el del medio es el
  // nombre comercial, y arrastra detrás la versión de shaders.
  const parts = inside[1].split(',').map((part) => part.trim());
  const device = parts[1] ?? parts[0] ?? '';
  return (
    device
      .replace(/\s*Direct3D\d+.*$/i, '')
      .replace(/\s*vs_\d.*$/i, '')
      /*
       * El id PCI del dispositivo, que algunos drivers meten detrás del nombre:
       * "NVIDIA GeForce RTX 5070 Ti (0x00002C05)". No aporta nada a la única
       * pregunta que esto responde —¿qué modelo local le pega a esta máquina?—
       * y ensucia una línea que se lee de un vistazo. Va al final del encadenado
       * a propósito: con "Direct3D11" detrás, el paréntesis no cierra el string,
       * así que quitarlo antes exigiría un patrón más frágil.
       */
      .replace(/\s*\(0x[0-9a-f]+\)/gi, '')
      .trim() || undefined
  );
}

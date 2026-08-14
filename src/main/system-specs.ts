import { app } from 'electron';
import { cpus, totalmem } from 'node:os';
import type { SystemSpecs } from '@shared/types';

/**
 * Which machine this is, to be able to recommend a local model with judgment.
 *
 * It exists because the question "which Ollama model will run well for me?" has
 * no generic answer: the same model is instant on a machine with a GPU and takes
 * a minute per answer on an office laptop, and finding that out costs a
 * multi-gig download.
 *
 * What can really be measured is measured and **the rest is not estimated**.
 * Specifically, VRAM: it's the number that really decides whether a model fits
 * in the GPU, and there's no reliable way to read it from Electron without
 * invoking external system tools. Inventing a figure here would be worse than
 * not giving one, because the recommendation would rest on a false datum.
 */
/**
 * Session cache of the specs.
 *
 * The hardware doesn't change while the app is open, and `getGPUInfo('complete')`
 * is **expensive**: it gathers the GPU's full info (hundreds of ms). The
 * dashboard asks for it on every visit to the Models and Transcription sections
 * —which remount on tab change—, so without caching that cost was paid over and
 * over, and it was exactly what made those two tabs load slower than the others.
 * The promise is memoized: the cost is paid once per session.
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
    // `basic` returns numeric identifiers; the GPU's legible name comes from
    // ANGLE's renderer, which is the only thing that gives a commercial name
    // without depending on external utilities.
    const info = (await app.getGPUInfo('complete')) as {
      auxAttributes?: { glRenderer?: string };
    };
    gpu = cleanRenderer(info.auxAttributes?.glRenderer);
  } catch {
    // A failure here is no reason not to give the rest: the recommendation rests
    // mostly on the RAM.
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
 * It's exported so it can be pinned with a test: what comes out of here is shown
 * as-is in the "which local model fits your machine" card and in the guide, and
 * the format of this string is decided by the driver, not us.
 */
export function cleanRenderer(renderer: string | undefined): string | undefined {
  if (!renderer) return undefined;

  const inside = /^ANGLE \((.*)\)$/.exec(renderer.trim());
  if (!inside?.[1]) return renderer.trim();

  // The content comes as "vendor, device, backend"; the middle one is the
  // commercial name, and it drags the shader version behind it.
  const parts = inside[1].split(',').map((part) => part.trim());
  const device = parts[1] ?? parts[0] ?? '';
  return (
    device
      .replace(/\s*Direct3D\d+.*$/i, '')
      .replace(/\s*vs_\d.*$/i, '')
      /*
       * The device's PCI id, which some drivers put after the name:
       * "NVIDIA GeForce RTX 5070 Ti (0x00002C05)". It adds nothing to the only
       * question this answers —which local model fits this machine?— and clutters
       * a line read at a glance. It goes at the end of the chain on purpose: with
       * "Direct3D11" behind it, the parenthesis doesn't close the string, so
       * removing it earlier would require a more fragile pattern.
       */
      .replace(/\s*\(0x[0-9a-f]+\)/gi, '')
      .trim() || undefined
  );
}

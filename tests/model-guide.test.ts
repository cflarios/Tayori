import { describe, expect, it } from 'vitest';
import { renderModelGuide } from '../src/shared/model-guide';
import type { SystemSpecs } from '../src/shared/types';

const specs = (patch: Partial<SystemSpecs> = {}): SystemSpecs => ({
  totalMemoryGB: 16,
  cpuModel: 'AMD Ryzen 7 5800X',
  cpuCores: 16,
  gpu: 'NVIDIA GeForce RTX 3060',
  ...patch,
});

describe('renderModelGuide', () => {
  it('produce un documento HTML completo y autocontenido', () => {
    const html = renderModelGuide(specs());

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
    // Se abre desde file://, así que no puede depender de la red para nada.
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:\/\/[^\s"']+["']/);
  });

  it('incluye los datos de la máquina', () => {
    const html = renderModelGuide(specs());

    expect(html).toContain('16 GB');
    expect(html).toContain('AMD Ryzen 7 5800X');
    expect(html).toContain('NVIDIA GeForce RTX 3060');
  });

  it('dice que no hay GPU cuando no se pudo identificar', () => {
    const html = renderModelGuide(specs({ gpu: undefined }));
    expect(html).toContain('no identificada');
  });

  it('escapa lo que viene del sistema', () => {
    // El nombre de la CPU y de la GPU los da el sistema operativo: se inyectan
    // en el HTML y no son datos que este código controle.
    const html = renderModelGuide(specs({ cpuModel: '<script>alert(1)</script>' }));

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('recomienda para el tramo de memoria concreto de la máquina', () => {
    const poco = renderModelGuide(specs({ totalMemoryGB: 6 }));
    const mucho = renderModelGuide(specs({ totalMemoryGB: 64 }));

    expect(poco).toContain('6 GB');
    expect(mucho).toContain('64 GB');
    expect(poco).not.toBe(mucho);
  });

  it('cubre las tres cosas que se vinieron a mirar', () => {
    const html = renderModelGuide(specs());

    // Locales por cómputo, multimodales, y nube barata.
    expect(html).toContain('qwen2.5vl:7b');
    expect(html).toContain('multimodales');
    expect(html).toContain('claude-haiku-4-5');
    expect(html).toContain('gemini-2.5-flash');
  });

  it('separa el modelo de conversar del de pantalla', () => {
    const html = renderModelGuide(specs());
    expect(html).toContain('Ctrl+Alt+C');
    expect(html).toContain('Ctrl+Alt+Q');
    expect(html).toContain('Modelo para la pantalla');
  });

  it('reconoce por escrito lo que no sabe', () => {
    // La honestidad sobre la VRAM es parte del contenido, no un adorno: la
    // recomendación se apoya en la RAM justamente porque la VRAM no se mide.
    const html = renderModelGuide(specs());
    expect(html).toContain('VRAM');
    expect(html).toContain('no hay forma fiable de leerlo');
  });

  it('fecha el documento, porque los precios caducan', () => {
    const html = renderModelGuide(specs(), new Date('2026-07-31T12:00:00Z'));
    expect(html).toContain('2026');
  });
});

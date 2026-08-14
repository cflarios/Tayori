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
  it('produces a complete, self-contained HTML document', () => {
    const html = renderModelGuide(specs());

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
    // It opens from file://, so it can't depend on the network for anything.
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:\/\/[^\s"']+["']/);
  });

  it("includes the machine's data", () => {
    const html = renderModelGuide(specs());

    expect(html).toContain('16 GB');
    expect(html).toContain('AMD Ryzen 7 5800X');
    expect(html).toContain('NVIDIA GeForce RTX 3060');
  });

  it("says there's no GPU when it couldn't be identified", () => {
    expect(renderModelGuide(specs({ gpu: undefined }))).toContain('not identified');
    expect(renderModelGuide(specs({ gpu: undefined }), 'es')).toContain('no identificada');
  });

  it('escapes what comes from the system', () => {
    // The CPU and GPU names are given by the operating system: they're injected
    // into the HTML and aren't data this code controls.
    const html = renderModelGuide(specs({ cpuModel: '<script>alert(1)</script>' }));

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it("recommends for the machine's specific memory tier", () => {
    const poco = renderModelGuide(specs({ totalMemoryGB: 6 }));
    const mucho = renderModelGuide(specs({ totalMemoryGB: 64 }));

    expect(poco).toContain('6 GB');
    expect(mucho).toContain('64 GB');
    expect(poco).not.toBe(mucho);
  });

  it('covers the three things it set out to show', () => {
    const html = renderModelGuide(specs());

    // Local by compute, multimodal, and cheap cloud.
    expect(html).toContain('qwen2.5vl:7b');
    expect(html).toContain('multimodal');
    expect(html).toContain('claude-haiku-4-5');
    expect(html).toContain('gemini-3.6-flash');
  });

  it('separates the conversing model from the screen one', () => {
    const html = renderModelGuide(specs());
    expect(html).toContain('Ctrl+Alt+C');
    expect(html).toContain('Ctrl+Alt+Q');
    expect(html).toContain('Screen model');
  });

  it("acknowledges in writing what it doesn't know", () => {
    // The honesty about VRAM is part of the content, not an adornment: the
    // recommendation leans on RAM precisely because VRAM isn't measured.
    const html = renderModelGuide(specs());
    expect(html).toContain('VRAM');
    expect(html).toContain('no reliable way to read it');
  });

  it('dates the document, because prices expire', () => {
    const html = renderModelGuide(specs(), 'en', new Date('2026-07-31T12:00:00Z'));
    expect(html).toContain('2026');
  });

  it('comes out entirely in the requested language', () => {
    // The document is read by a person: half a guide in English inside a Spanish
    // app is exactly the failure this work came to fix.
    const en = renderModelGuide(specs(), 'en');
    const es = renderModelGuide(specs(), 'es');

    expect(en).toContain('lang="en"');
    expect(es).toContain('lang="es"');
    expect(en).toContain('Which model to use');
    expect(es).toContain('Qué modelo usar');
    // The model ids are proper names and aren't translated.
    expect(es).toContain('qwen2.5vl:7b');
  });
});

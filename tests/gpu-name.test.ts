import { describe, expect, it, vi } from 'vitest';

/**
 * The GPU name, which the driver writes and we read.
 *
 * `app.getGPUInfo` only gives numeric identifiers; the commercial name has to be
 * extracted from ANGLE's renderer string, whose format we don't control and
 * changes between drivers. Whatever comes out of here is shown as-is in the
 * "which local model suits your machine" card, so it's worth pinning it.
 */

// The module imports Electron's `app` on load; here only the pure cleanup
// function is tested, so it's enough that the import doesn't blow up.
vi.mock('electron', () => ({ app: { getGPUInfo: () => Promise.resolve({}) } }));

const { cleanRenderer } = await import('../src/main/system-specs');

describe('cleanRenderer', () => {
  it("extracts the commercial name from ANGLE's string", () => {
    expect(
      cleanRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)')
    ).toBe('NVIDIA GeForce RTX 3060');
  });

  it('removes the PCI id some drivers put after the name', () => {
    /*
     * The real case: "NVIDIA GeForce RTX 5070 Ti (0x00002C05)". The identifier
     * doesn't answer that card's only question —which local model suits this
     * machine— and dirties a line read at a glance.
     */
    expect(
      cleanRenderer(
        'ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti (0x00002C05) Direct3D11 vs_5_0 ps_5_0, D3D11)'
      )
    ).toBe('NVIDIA GeForce RTX 5070 Ti');
  });

  it("doesn't take out a parenthesis that is part of the name", () => {
    // Only what looks like a hexadecimal id is removed, not any parenthesis.
    expect(cleanRenderer('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0, D3D11)')).toBe(
      'Intel(R) UHD Graphics 620'
    );
  });

  it("returns the string as-is if it isn't ANGLE's", () => {
    // On other platforms or backends the renderer doesn't carry that wrapper, and
    // an ugly name is better than none.
    expect(cleanRenderer('AMD Radeon RX 7800 XT')).toBe('AMD Radeon RX 7800 XT');
  });

  it('with no renderer it invents nothing', () => {
    expect(cleanRenderer(undefined)).toBeUndefined();
  });
});

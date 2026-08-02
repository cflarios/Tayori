import { describe, expect, it, vi } from 'vitest';

/**
 * El nombre de la GPU, que lo escribe el driver y lo leemos nosotros.
 *
 * `app.getGPUInfo` sólo da identificadores numéricos; el nombre comercial hay
 * que sacarlo de la cadena del renderer de ANGLE, cuyo formato no controlamos y
 * cambia entre drivers. Lo que salga de aquí se enseña tal cual en la tarjeta de
 * "qué modelo local le pega a tu equipo", así que conviene fijarlo.
 */

// El módulo importa `app` de Electron al cargarse; aquí sólo se prueba la
// función pura de limpieza, así que basta con que el import no reviente.
vi.mock('electron', () => ({ app: { getGPUInfo: () => Promise.resolve({}) } }));

const { cleanRenderer } = await import('../src/main/system-specs');

describe('cleanRenderer', () => {
  it('saca el nombre comercial de la cadena de ANGLE', () => {
    expect(
      cleanRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)')
    ).toBe('NVIDIA GeForce RTX 3060');
  });

  it('quita el id PCI que algunos drivers meten detrás del nombre', () => {
    /*
     * El caso real: "NVIDIA GeForce RTX 5070 Ti (0x00002C05)". El identificador
     * no responde a la única pregunta de esa tarjeta —qué modelo local le pega
     * a esta máquina— y ensucia una línea que se lee de un vistazo.
     */
    expect(
      cleanRenderer(
        'ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti (0x00002C05) Direct3D11 vs_5_0 ps_5_0, D3D11)'
      )
    ).toBe('NVIDIA GeForce RTX 5070 Ti');
  });

  it('no se lleva por delante un paréntesis que sí forma parte del nombre', () => {
    // Sólo se quita lo que tiene pinta de id hexadecimal, no cualquier paréntesis.
    expect(cleanRenderer('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0, D3D11)')).toBe(
      'Intel(R) UHD Graphics 620'
    );
  });

  it('devuelve la cadena tal cual si no es de ANGLE', () => {
    // En otras plataformas o backends el renderer no lleva ese envoltorio, y un
    // nombre feo es mejor que ninguno.
    expect(cleanRenderer('AMD Radeon RX 7800 XT')).toBe('AMD Radeon RX 7800 XT');
  });

  it('sin renderer no se inventa nada', () => {
    expect(cleanRenderer(undefined)).toBeUndefined();
  });
});

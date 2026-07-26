import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@main': resolve(__dirname, 'src/main'),
    },
  },
  test: {
    // Los tests cubren lógica pura del proceso main (buffers, detectores,
    // factories). Nada que necesite un DOM ni el runtime de Electron.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});

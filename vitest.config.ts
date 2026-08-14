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
    // The tests cover pure logic of the main process (buffers, detectors,
    // factories). Nothing that needs a DOM or the Electron runtime.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});

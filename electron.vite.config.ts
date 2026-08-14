import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const src = (...p: string[]) => resolve(__dirname, 'src', ...p);

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': src('shared'),
        '@main': src('main'),
      },
    },
    build: {
      rollupOptions: {
        input: { index: src('main/index.ts') },
      },
    },
  },

  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': src('shared') },
    },
    build: {
      rollupOptions: {
        input: { index: src('preload/index.ts') },
      },
    },
  },

  // Three HTML entries: overlay (always visible), dashboard (settings)
  // and audio-worker (hidden window that does the audio capture).
  renderer: {
    root: src('renderer'),
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': src('shared'),
        '@renderer': src('renderer'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          overlay: src('renderer/overlay/index.html'),
          dashboard: src('renderer/dashboard/index.html'),
          'audio-worker': src('renderer/audio-worker/index.html'),
        },
      },
    },
  },
});

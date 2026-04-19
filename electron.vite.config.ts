// Path aliases are mirrored in tsconfig.node.json and tsconfig.web.json —
// update all three together. See STACK_VERSIONS.md.
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const alias = {
  '@main': resolve(import.meta.dirname, 'src/main'),
  '@preload': resolve(import.meta.dirname, 'src/preload'),
  '@renderer': resolve(import.meta.dirname, 'src/renderer/src'),
  '@shared': resolve(import.meta.dirname, 'src/shared'),
};

export default defineConfig({
  main: {
    resolve: { alias },
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    resolve: { alias },
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: { alias },
    plugins: [react()],
    root: resolve(import.meta.dirname, 'src/renderer'),
    define: {
      // Build-time flag: true only when ATRIUM_E2E=1 is set (E2E builds).
      // Tree-shaken to false in all production and normal dev builds.
      __ATRIUM_E2E__: JSON.stringify(process.env['ATRIUM_E2E'] === '1'),
    },
  },
});

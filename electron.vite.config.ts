// Path aliases are mirrored in tsconfig.node.json and tsconfig.web.json —
// update all three together. See STACK_VERSIONS.md.
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const alias = {
  '@main': resolve(import.meta.dirname, 'src/main'),
  '@preload': resolve(import.meta.dirname, 'src/preload'),
  '@renderer': resolve(import.meta.dirname, 'src/renderer/src'),
  '@shared': resolve(import.meta.dirname, 'src/shared'),
};

export default defineConfig({
  main: { resolve: { alias } },
  preload: { resolve: { alias } },
  renderer: {
    resolve: { alias },
    plugins: [react()],
    root: resolve(import.meta.dirname, 'src/renderer'),
  },
});

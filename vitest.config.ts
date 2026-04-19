import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// Path aliases — mirror of electron.vite.config.ts and tsconfig.node.json.
// Vitest runs outside electron-vite so aliases must be repeated here.
const alias = {
  '@main': resolve(import.meta.dirname, 'src/main'),
  '@preload': resolve(import.meta.dirname, 'src/preload'),
  '@renderer': resolve(import.meta.dirname, 'src/renderer/src'),
  '@shared': resolve(import.meta.dirname, 'src/shared'),
};

export default defineConfig({
  resolve: { alias },
  // __ATRIUM_E2E__ is a Vite build-time constant. Define it here so unit tests
  // resolve the identifier (always false in the unit-test environment).
  define: { __ATRIUM_E2E__: 'false' },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'main',
          include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts', 'src/preload/**/*.{test,type-test}.ts'],
          environment: 'node',
        },
      },
      // Renderer project is a slot — jsdom is NOT installed at Stage 01. Vitest skips an empty
      // project gracefully; if this breaks in practice, remove the renderer project until Stage 02.
      {
        extends: true,
        test: {
          name: 'renderer',
          include: ['src/renderer/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['./vitest.renderer.setup.ts'],
        },
      },
    ],
  },
});

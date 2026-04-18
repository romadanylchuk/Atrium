import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'main',
          include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts'],
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
        },
      },
    ],
  },
});

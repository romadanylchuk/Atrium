// ESM flat config, auto-loaded by ESLint 9.
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'node_modules/**', '.ai-arch/**', '.ai-work/**', '.claude/**', 'e2e/**', 'scripts/**'] },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true, // Auto-discovers tsconfig per file — avoids `eslint.config.js` not-in-project errors.
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'src/shared/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    // Config files (JS/TS) are not covered by any tsconfig include — turn off type-aware rules there.
    files: ['*.config.{js,ts}'],
    ...tseslint.configs.disableTypeChecked,
  },
  prettierConfig, // MUST be last — disables conflicting formatting rules.
);

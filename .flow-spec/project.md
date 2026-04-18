# Project Metadata

language: TypeScript 5.9
static_typing: yes
  # TS strict + noUncheckedIndexedAccess enforced across all three projects (main, preload, renderer).
  # isolatedModules is on (electron-vite) — const enum is banned.

build_command: npm run build
  # electron-vite build — produces out/main, out/preload, out/renderer.
type_check_command: npm run typecheck
  # tsc -b — runs all three project references (tsconfig.node.json + tsconfig.web.json + root).
lint_command: npm run lint
  # eslint . — flat config with typescript-eslint type-checked rules.
test_command: npm run test
  # vitest run — two-project layout: main (node env, src/main/** + src/shared/**) and renderer (jsdom, src/renderer/**).
  # jsdom is NOT installed in Stage 02 — renderer project slot exists but has no .test.tsx files yet.

notes:
  # Runtime: Electron 41.2.1 (exact pin). Single BrowserWindow. contextIsolation: true, nodeIntegration: false. Never change these.
  # Process model: main owns all data, parsing, terminal lifecycle, and file watching. Renderer is pure display. No renderer-side FS access.
  # IPC patterns: invoke (request-response, returns Result<T, E>) and send (streaming/push). No thrown strings cross the bridge.
  # Result type: { ok: true, data: T } | { ok: false, error: { code: E, message: string } }. Defined in @shared.
  # Path aliases: @main, @preload, @renderer, @shared — mirrored across electron.vite.config.ts, tsconfig.node.json, tsconfig.web.json. Add to all three together.
  # Parser policy: .ai-arch/ is read-only. String splitting on `## ` headings, no AST parser. Parser must not throw on malformed input — return Result or structured partial.
  # Architecture source of truth: .ai-arch/ideas/*.md. Feature briefs in .ai-arch/feature-briefs/ reference them. Read the relevant node file before implementing any system.
  # Stage model: 6 stages in .ai-arch/todo-list.md. Each stage: /flow:plan → /flow:implement → /flow:check.
  # Workflow artifacts: .flow-spec/ is for the current feature cycle; archived per-feature docs land in docs/flow/<slug>/ via /flow:compact.

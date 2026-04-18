# Feature Brief: Project Scaffolding
_Stage: 01_
_Created: 2026-04-16 via /architector:finalize_
_Arch nodes covered: cross-platform-shell_

## Goal
Create the Atrium Electron project from scratch with the decided stack: Electron + TypeScript + React + Vite + Vitest + ESLint. Set up the main process / renderer process structure, configure the build toolchain, and verify the app launches with a blank window. This stage produces the skeleton that all subsequent stages build on.

## Context
- Stack decided: Electron with TypeScript end-to-end, React for UI, Vite as dev server + bundler, Vitest for testing, ESLint for linting
- Single BrowserWindow app — no multi-window architecture
- `contextIsolation: true`, `nodeIntegration: false` — Electron security best practices from day one
- Terminal-as-modal pattern means xterm.js will render in the same BrowserWindow as the canvas (later stages)

## What Needs to Be Built
- Electron main process entry point (TypeScript)
- Renderer process with React + Vite
- Preload script skeleton (contextBridge setup — channels added in Stage 02)
- Vite config for renderer bundling
- Vitest config
- ESLint config with TypeScript + React rules
- `package.json` with all core dependencies: electron, react, react-dom, vite, vitest, typescript, eslint
- Dev workflow: `npm run dev` launches Electron with Vite HMR for renderer
- App launches, shows an empty window — proof the skeleton works

## Dependencies
- Requires: nothing (first stage)
- Enables: Stage 02 (IPC & Data Layer), and transitively all subsequent stages

## Key Decisions Already Made
- **Electron over Tauri** — proven ecosystem, JS/TS all the way down, no Rust learning curve
- **Vite over webpack** — faster dev server, native ESM, simpler config
- **Vitest over Jest** — faster, better ESM support, native Vite integration
- **Single BrowserWindow** — terminal modal is an overlay div, not a separate window

## Open Technical Questions
- Exact Electron version to target (latest stable at implementation time)
- Vite plugin for Electron main process bundling (`vite-plugin-electron` or similar — needs evaluation)
- Dev workflow specifics: how Vite HMR integrates with Electron reload

## Out of Scope for This Stage
- IPC channels (Stage 02)
- Any UI beyond a blank window
- node-pty, @parcel/watcher, xterm.js installation (Stage 02-03)
- electron-builder config (Stage 06)

## Notes for /interview
This stage may benefit from /interview to evaluate Vite-Electron integration options (`vite-plugin-electron`, `electron-vite`, or manual setup). The choice affects dev workflow ergonomics for all subsequent stages.

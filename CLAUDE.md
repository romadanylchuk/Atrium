# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Atrium is a cross-platform Electron desktop app for visual AI-assisted project architecture. Think "Obsidian for architectural decisions with Claude Code under the hood." It reads `.ai-arch/` files (created by the `architector` Claude Code plugin) and renders them as an interactive node graph on a canvas. Users interact with nodes to trigger Claude Code CLI skills via embedded terminals.

## Status

Pre-implementation. Architecture is fully designed in `.ai-arch/` with 12 decided nodes and 6 staged feature briefs. No source code exists yet.

## Stack (decided)

- **Runtime:** Electron (single BrowserWindow, `contextIsolation: true`, `nodeIntegration: false`)
- **Language:** TypeScript end-to-end
- **Renderer:** React + Vite (HMR in dev)
- **Testing:** Vitest (unit/integration), Playwright (E2E, 3 surgical scenarios only)
- **Linting:** ESLint with TS + React rules
- **Packaging:** electron-builder (NSIS / DMG-universal / AppImage+deb)

## Architecture

**Process model:** Main process owns all data, parsing, terminal lifecycle, and file watching. Renderer is pure display. Communication via two IPC patterns: `invoke` (request-response with `Result<T,E>`) and `send` (streaming/push).

**Key systems:**

- **Data layer** — read-only `.ai-arch/` parser using string splitting on `## ` headings. Outputs typed `ProjectState`. No writes to `.ai-arch/` ever.
- **CLI engine** — 5-state terminal lifecycle (`idle → spawning → active → exited → idle`). Spawns `claude` via node-pty with `string[]` args (no shell). Single terminal at a time.
- **Skill orchestration** — pure `composeCommand()` function returning `string[]`. Uses `--append-system-prompt-file` for SKILL.md injection.
- **File-state sync** — `@parcel/watcher` on `.ai-arch/` with 300ms debounce, full re-read, push `ProjectState` via IPC.
- **Canvas UI** — React Flow + dagre auto-layout. Node shape/color encodes maturity. Connection line style encodes relationship type.
- **State management** — Zustand single store with 3 slices (domain, UI, terminal). React Flow owns layout positions.

**Terminal-as-modal:** xterm.js renders in an overlay div inside the main BrowserWindow (not a separate window). node-pty lives in main process, data transferred as ArrayBuffer via IPC.

## Implementation Stages

See `.ai-arch/todo-list.md` for the full dependency chain. Stages must be completed in order:

1. Project Scaffolding (Electron + Vite skeleton)
2. IPC & Data Layer (preload API, `.ai-arch/` parser, `ProjectState`)
3. Terminal Pipeline (node-pty lifecycle, skill commands, @parcel/watcher)
4. State & Canvas (Zustand store, React Flow graph)
5. Interaction & Project UX (node tooltips, toolbar, project launcher, terminal modal)
6. Build & Distribution (electron-builder, CI matrix)

Each stage: `/deep-plan` → `/implement` → `/final-check`

## Architecture Source of Truth

All design decisions live in `.ai-arch/ideas/*.md` — feature briefs reference them but the node files are authoritative. Read the relevant node file before implementing any system.

## Workflow Skills

The `.claude/skills/` directory contains workflow skills for structured development: `/interview`, `/deep-plan`, `/implement`, `/review`, `/final-check`, `/compact-work`, `/document-work-result`, `/update-kb-document`.

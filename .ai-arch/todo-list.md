# Implementation Todo List — Atrium
_Generated: 2026-04-16_
_Source: .ai-arch/feature-briefs/_

## Stages

| # | Stage | Brief | Depends On | Status |
|---|-------|-------|------------|--------|
| 01 | Project Scaffolding | [01-project-scaffolding.md](feature-briefs/01-project-scaffolding.md) | — | not started |
| 02 | IPC & Data Layer | [02-ipc-data-layer.md](feature-briefs/02-ipc-data-layer.md) | 01 | not started |
| 03 | Terminal Pipeline | [03-terminal-pipeline.md](feature-briefs/03-terminal-pipeline.md) | 02 | not started |
| 04 | State & Canvas | [04-state-and-canvas.md](feature-briefs/04-state-and-canvas.md) | 02, 03 | not started |
| 05 | Interaction & Project UX | [05-interaction-and-project-ux.md](feature-briefs/05-interaction-and-project-ux.md) | 03, 04 | not started |
| 06 | Build & Distribution | [06-build-and-distribution.md](feature-briefs/06-build-and-distribution.md) | 05 | not started |

## Cross-cutting: Testing Strategy
Testing is not a separate stage. The testing-strategy node defines the testing plan applied across all stages:
- **Unit tests** written alongside the code in each stage (Vitest)
- **Integration tests** for IPC, file watcher, terminal lifecycle (Stages 02-03)
- **E2E tests** (3 scenarios) added in Stage 05 when the app is feature-complete (Playwright + Electron)
- Mocking boundaries, diff hook test cases (8), and terminal state transition tests defined in the testing-strategy decision

## How to Use This List
Each stage maps to one run of the implementation workflow:
1. Open the feature brief for the stage
2. Run `/interview` (if open technical questions exist) or `/deep-plan` directly
3. Complete the full workflow: /deep-plan → /implement → /final-check
4. Mark the stage as done in this file
5. Move to the next stage

## Notes
- **Stage 01 may benefit from /interview** to evaluate Vite-Electron integration options before /deep-plan
- **Stages 02-06 can go directly to /deep-plan** — decisions are fully specified
- **Stage 04 depends on both 02 and 03** — both must be complete before starting state + canvas
- **Stage 05 depends on both 03 and 04** — terminal pipeline and canvas must both exist for interaction layer
- **All architecture decisions are documented in .ai-arch/ideas/*.md** — feature briefs reference them but the node files are the source of truth

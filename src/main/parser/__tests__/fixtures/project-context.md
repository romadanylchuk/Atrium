# Project Context: Atrium

## What It Is
A cross-platform IDE for developing project architecture. Visually similar to Obsidian — a canvas with idea nodes — but powered by Claude Code CLI under the hood. The app reads and visualizes `.ai-arch/` files created by the `architector` Claude Code plugin, and lets users interact with the graph conversationally through the agent.

## Who The User Is
Developer building this as a product. Target audience: developers and architects who want AI-assisted architectural decision-making with visual feedback.

## Core Metaphor
"Obsidian for architectural decisions with AI under the hood." You don't just look at the graph — you talk to it.

## Key Constraints
- Cross-platform: Windows, Mac, Linux
- Claude Code CLI is the engine — invoked via embedded xterm.js + node-pty terminals as modals; app passes `string[]` arg arrays directly to node-pty (no shell); `.ai-arch/` file watching is the only feedback channel
- The `.ai-arch/` data format is already defined by the `architector` plugin (JSON index, MD node files, connections)
- The hard part is canvas UI + real-time file sync, not the Claude integration
- The architector plugin provides 6 skills: `init`, `explore`, `decide`, `map`, `finalize`, `status`

## Explicitly Out of Scope (for now)
- Not a general-purpose IDE or code editor
- Not a replacement for Claude Code CLI itself — it wraps it
- Not building new AI capabilities — leveraging existing Claude Code skills

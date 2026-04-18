# Idea: Multi-Node Context
_Created: 2026-04-15_
_Slug: multi-node-context_

## Description
Right-click nodes to select/deselect them with visual highlight on canvas. Selection panel replaces the project panel on the right side while nodes are selected, showing selected node names and a "Clear" button. Top toolbar skills are context-aware — they automatically use selected nodes as arguments when present, work globally when not. No duplicate skill buttons on the selection panel.

## Priority
core

## Maturity
explored

## Notes
- **Right-click to select/deselect** individual nodes — visual highlight on canvas
- **Click empty canvas** to clear all selection
- **Right-click selected node again** to deselect it individually
- **Selection panel** replaces project panel on right side while nodes are selected
  - Shows selected node names + "Clear" button
  - No skill buttons — top toolbar handles everything
  - Project panel returns when selection is cleared
- **Top toolbar is context-aware** — if nodes are selected, Explore/Decide/Map use them as args; if not, work globally
- Terminal-as-modal applies — same pattern as single-node, just with multiple node args in the command
- Only one terminal at a time

## Connections
- node-interaction: top toolbar skills become context-aware based on selection state
- skill-orchestration: composes command with multiple node slugs when selection is active
- cli-engine: spawns terminal with multi-node command
- canvas-ui: right-click selection with visual highlight, selection panel replaces project panel
- project-launcher: project panel temporarily hidden during multi-select

## History
- 2026-04-15 /architector:init — multi-select nodes to trigger skills with combined context; e.g. select nodes then "explore" or "map"
- 2026-04-16 /architector:explore (cross-platform-shell) — context composition simplified by terminal pattern; slugs as CLI args, no prompt stitching
- 2026-04-16 /architector:explore (cli-engine) — refined: right-click to select, selection panel with Map button, replaces ctrl+click and control panel approach
- 2026-04-16 /architector:explore — selection panel replaces project panel, shows names + Clear button only; top toolbar is context-aware and picks up selected nodes; no skill buttons on selection panel

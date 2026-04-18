# Idea: Canvas UI
_Created: 2026-04-15_
_Slug: canvas-ui_

## Description
React Flow-based node graph canvas — the main visual surface of Atrium. Each node represents an architectural idea with shape and color encoding maturity. Connection lines styled per relationship type. Dagre auto-layout on first open, then user-owned positions persisted to Electron userData. Terminal modal renders as an overlay div in the same DOM tree.

## Decision
_Decided: 2026-04-16_

### What Was Decided

1. **Canvas library: React Flow** — purpose-built node graph library for React. Handles zoom, pan, drag, edge rendering, node selection out of the box. Custom node components for maturity-based appearance.

2. **Node visual encoding — name only, shape+color per maturity:**
   | Maturity | Shape | Color |
   |----------|-------|-------|
   | raw-idea | circle | gray |
   | explored | rounded rect | blue |
   | decided | rect | green |
   | ready | badge | gold |

3. **Connection visual encoding — style+color per relationship type:**
   | Type | Style | Color | Meaning |
   |------|-------|-------|---------|
   | depends-on | solid | red | hard dependency |
   | informs | dashed | blue | soft influence |
   | extends | dotted | purple | builds upon |
   | feeds | solid | green | data flow |
   | uses | dashed | gray | utility |

4. **Auto-layout engine: dagre** — standard React Flow pairing for DAG layout. Runs on first open (no saved positions) and when new nodes appear (via diff hook). User rearranges freely after; positions saved to `layout.json` in Electron userData.

5. **Layout ownership:** React Flow owns all visual state (positions, edges, viewport, drag). Zustand feeds domain data (nodes, connections from `ProjectState`), diff hook reconciles. Layout persisted to `layout.json` on change — read on project open, written on position/viewport change.

6. **DOM structure:** Canvas is the base layer. Terminal modal renders as an overlay div on top (decided in cross-platform-shell). Tooltip, toolbar, and side panels are React components in the same tree. No separate windows.

### Alternatives Considered
| Option | Why not chosen |
|--------|---------------|
| ELK layout engine | More powerful (constraint-based), but heavier dependency and slower; dagre is sufficient for <50 node DAGs |
| D3-force / force-directed layout | Better for undirected graphs; Atrium's architecture is a DAG with clear layers — dagre's hierarchical layout matches the structure |
| Cytoscape.js | General-purpose graph library, not React-native; React Flow integrates directly with React component model |
| Custom canvas (HTML Canvas / WebGL) | Massive effort for zoom/pan/drag/selection; React Flow provides all of this for free |
| Vis.js / Sigma.js | Not React-native; would require wrapper layer and fight the component model |
| Node cards with details (description, notes) | Too much visual noise on canvas; name-only keeps the graph readable, details available via tooltip |

### Rationale
React Flow is the de facto standard for node graph UIs in React. It handles the hardest parts (zoom, pan, drag, edge routing, selection) and exposes a clean API for custom node/edge rendering. Dagre pairs naturally with React Flow for hierarchical DAG layout, which matches Atrium's layered architecture. The maturity-as-shape+color encoding gives instant visual status without reading text. Name-only nodes keep the canvas clean — details surface through tooltips (owned by node-interaction).

### Implications
- **node-interaction** — tooltip and toolbar are React components rendered alongside the canvas; click/right-click handlers registered on React Flow nodes
- **state-management** — diff hook bridges `ProjectState` updates to React Flow's node/edge arrays; new nodes get dagre-computed positions
- **project-launcher** — right-side panel shares horizontal space with the canvas; panel width is fixed, canvas flexes
- **file-state-sync** — live canvas updates happen automatically: fs change → parse → IPC → store → diff hook → React Flow re-renders

## Priority
core

## Maturity
decided

## Notes
- React Flow handles the heavy lifting — identified as the hardest part of the project, but the library absorbs most complexity
- Click node → tooltip (node-interaction); right-click → select/deselect (node-interaction); both are React Flow event handlers on custom node components

## Connections
- data-layer: reads parsed node/connection data to render the graph
- file-state-sync: live canvas updates when .ai-arch/ files change
- node-interaction: click node → tooltip with skills; right-click select → selection panel
- project-launcher: right-side panel for project switching
- state-management: reads node/connection data and layout from the store

## History
- 2026-04-15 /architector:init — core visual surface; maturity colors/shapes, dependency lines, zoom/pan/selection; identified as the main engineering challenge
- 2026-04-16 /architector:explore — React Flow for rendering; maturity encoded as shape+color (gray circle → gold badge); connection lines with style+color per type; auto-layout first then user-owned positions; name-only nodes
- 2026-04-16 /architector:decide — locked in React Flow + dagre; pinned node/connection visual encoding tables; layout ownership split (React Flow owns visual, Zustand feeds domain); overlay div DOM structure confirmed

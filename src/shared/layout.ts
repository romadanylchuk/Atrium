/**
 * Layout types shared between main and renderer.
 *
 * These types are the canonical definition — src/main/storage/layout.ts
 * imports from here and no longer re-declares them.
 *
 * No Electron, Node, or React imports — safe for @shared.
 */

export type NodePosition = { x: number; y: number };

export type Viewport = { x: number; y: number; zoom: number };

export type LayoutFileV1 = {
  schemaVersion: 1;
  /** Absolute path to the project root — used for orphan detection. */
  projectPath: string;
  /** Map from node slug to canvas position. */
  nodePositions: Record<string, NodePosition>;
  /** Optional saved viewport (pan + zoom). */
  viewport?: Viewport;
};

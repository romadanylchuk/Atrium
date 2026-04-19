/**
 * Domain types — mirror of the .ai-arch/ fixture shape.
 *
 * No Electron, Node, or React imports — safe for @shared.
 */

// ---------------------------------------------------------------------------
// Primitives / branded types
// ---------------------------------------------------------------------------

/**
 * Opaque string brand for terminal identifiers.
 * The brand has zero runtime cost — it is erased at compile time.
 */
export type TerminalId = string & { readonly __brand: 'TerminalId' };

// ---------------------------------------------------------------------------
// Known string unions (widened to `string` at the parser boundary)
// ---------------------------------------------------------------------------

export type NodePriority = 'blocking' | 'core' | 'enhancement' | 'deferred';

export type NodeMaturity = 'raw-idea' | 'explored' | 'decided' | 'ready';

export type ConnectionType = 'depends-on' | 'informs' | 'extends' | 'feeds' | 'uses';

// ---------------------------------------------------------------------------
// Structured warnings (partial-failure surface from the parser)
// ---------------------------------------------------------------------------

export type ParseWarningCode =
  | 'MALFORMED_NODE_MD'
  | 'MISSING_IDEA_FILE'
  | 'UNKNOWN_INDEX_FIELD'
  | 'EMPTY_PROJECT_CONTEXT';

export type ParseWarning = {
  readonly code: ParseWarningCode;
  readonly file?: string;
  readonly message: string;
};

// ---------------------------------------------------------------------------
// Core domain shapes
// ---------------------------------------------------------------------------

export type NodeData = {
  readonly slug: string;
  readonly name: string;
  /** Raw value from index.json — may be a known NodePriority or an unknown future value. */
  readonly priority: NodePriority | (string & Record<never, never>);
  /** Raw value from index.json — may be a known NodeMaturity or an unknown future value. */
  readonly maturity: NodeMaturity | (string & Record<never, never>);
  /** Relative path to the idea file, e.g. "ideas/canvas-ui.md". */
  readonly file: string;
  /** Short summary from index.json. */
  readonly summary: string;
  /** First paragraph of the idea MD body (stripped of metadata lines). */
  readonly description: string;
  /** Full raw markdown content of the idea file (absent if the file was missing). */
  readonly markdownContent?: string;
  /** Heading → body map from `## ` splitter on the idea file. */
  readonly sections: Record<string, string>;
};

export type Connection = {
  readonly from: string;
  readonly to: string;
  /** Raw value — may be a known ConnectionType or an unknown future value. */
  readonly type: ConnectionType | (string & Record<never, never>);
  readonly note?: string;
};

export type Session = {
  readonly date: string;
  readonly skill?: string;
  readonly node?: string;
  readonly summary: string;
};

/**
 * Parsed project-context.md.
 * Uses a loose Record keyed by heading text so new sections added by the
 * architector plugin are preserved without a schema change.
 */
export type ProjectContext = {
  /** First paragraph of the file before the first `## ` heading. */
  readonly description: string;
  /** Heading text → section body map. */
  readonly sections: Record<string, string>;
};

export type ProjectState = {
  readonly rootPath: string;
  readonly projectName: string;
  readonly projectHash: string;
  readonly created?: string;
  readonly lastUpdated?: string;
  readonly context: ProjectContext;
  readonly nodes: NodeData[];
  readonly connections: Connection[];
  readonly sessions: Session[];
  readonly warnings: ParseWarning[];
};

export type RecentProject = {
  readonly path: string;
  readonly name: string;
  /** ISO 8601 UTC timestamp. */
  readonly lastOpened: string;
};

export type HealthInfo = {
  readonly claudePath: string;
  readonly version: string;
};

/**
 * parseIndex.ts — validates and parses `.ai-arch/index.json` content.
 *
 * Rules:
 * - Corrupt JSON → `Result.err(ProjectErrorCode.PARSE_FAILED, …)`.
 * - Missing required arrays (`nodes`, `connections`, `sessions`) → default `[]` + warning.
 * - Unknown top-level fields → `UNKNOWN_INDEX_FIELD` warning (non-fatal).
 * - Unknown enum values (priority, maturity, connection.type) → passed through as raw string.
 * - Zero Electron or fs imports.
 */

import { type Result, ok, err } from '@shared/result';
import { ProjectErrorCode } from '@shared/errors';
import type { Connection, Session, ParseWarning } from '@shared/domain';

// ---------------------------------------------------------------------------
// Internal parsed types (before assembly into NodeData)
// ---------------------------------------------------------------------------

export type IndexNode = {
  readonly slug: string;
  readonly name: string;
  readonly priority: string;
  readonly maturity: string;
  readonly file: string;
  readonly summary: string;
};

export type ParsedIndex = {
  readonly project: string;
  readonly created?: string;
  readonly last_updated?: string;
  readonly nodes: IndexNode[];
  readonly connections: Connection[];
  readonly sessions: Session[];
  readonly warnings: ParseWarning[];
};

// ---------------------------------------------------------------------------
// Known top-level keys — any other key produces a warning
// ---------------------------------------------------------------------------

const KNOWN_TOP_LEVEL_KEYS = new Set([
  'project',
  'created',
  'last_updated',
  'nodes',
  'connections',
  'sessions',
]);

// ---------------------------------------------------------------------------
// Hand-rolled validator helpers
// ---------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function getString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === 'string' ? v : '';
}

function getOptionalString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === 'string' ? v : undefined;
}

function parseNode(raw: unknown, index: number, warnings: ParseWarning[]): IndexNode {
  if (!isObject(raw)) {
    warnings.push({ code: 'MALFORMED_NODE_MD', message: `nodes[${index}] is not an object` });
    return { slug: '', name: '', priority: '', maturity: '', file: '', summary: '' };
  }
  return {
    slug: getString(raw, 'slug'),
    name: getString(raw, 'name'),
    priority: getString(raw, 'priority'),
    maturity: getString(raw, 'maturity'),
    file: getString(raw, 'file'),
    summary: getString(raw, 'summary'),
  };
}

function parseConnection(raw: unknown, index: number, warnings: ParseWarning[]): Connection {
  if (!isObject(raw)) {
    warnings.push({ code: 'MALFORMED_NODE_MD', message: `connections[${index}] is not an object` });
    return { from: '', to: '', type: '' };
  }
  const conn: Connection = {
    from: getString(raw, 'from'),
    to: getString(raw, 'to'),
    type: getString(raw, 'type'),
  };
  const note = getOptionalString(raw, 'note');
  if (note !== undefined) {
    return { ...conn, note };
  }
  return conn;
}

function parseSession(raw: unknown, index: number, warnings: ParseWarning[]): Session {
  if (!isObject(raw)) {
    warnings.push({ code: 'MALFORMED_NODE_MD', message: `sessions[${index}] is not an object` });
    return { date: '', summary: '' };
  }
  const session: Session = {
    date: getString(raw, 'date'),
    summary: getString(raw, 'summary'),
  };
  const skill = getOptionalString(raw, 'skill');
  const node = getOptionalString(raw, 'node');
  return {
    ...session,
    ...(skill !== undefined ? { skill } : {}),
    ...(node !== undefined ? { node } : {}),
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Parse and validate the content of `.ai-arch/index.json`.
 *
 * Returns `Result.err(PARSE_FAILED)` only on JSON syntax errors.
 * All structural issues are recoverable warnings.
 */
export function parseIndex(jsonString: string): Result<ParsedIndex, typeof ProjectErrorCode.PARSE_FAILED> {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonString) as unknown;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(ProjectErrorCode.PARSE_FAILED, `Failed to parse index.json: ${msg}`);
  }

  if (!isObject(raw)) {
    return err(ProjectErrorCode.PARSE_FAILED, 'index.json root must be a JSON object');
  }

  const warnings: ParseWarning[] = [];

  // --- Warn on unknown top-level fields ---
  for (const key of Object.keys(raw)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      warnings.push({
        code: 'UNKNOWN_INDEX_FIELD',
        message: `Unknown top-level field in index.json: "${key}"`,
      });
    }
  }

  // --- project (required) ---
  const project = getString(raw, 'project');

  // --- optional string fields ---
  const created = getOptionalString(raw, 'created');
  const last_updated = getOptionalString(raw, 'last_updated');

  // --- nodes (required array) ---
  let nodes: IndexNode[];
  if (!Array.isArray(raw['nodes'])) {
    warnings.push({ code: 'MALFORMED_NODE_MD', message: 'index.json missing "nodes" array; defaulting to []' });
    nodes = [];
  } else {
    nodes = (raw['nodes'] as unknown[]).map((n, i) => parseNode(n, i, warnings));
  }

  // --- connections (required array) ---
  let connections: Connection[];
  if (!Array.isArray(raw['connections'])) {
    warnings.push({ code: 'MALFORMED_NODE_MD', message: 'index.json missing "connections" array; defaulting to []' });
    connections = [];
  } else {
    connections = (raw['connections'] as unknown[]).map((c, i) => parseConnection(c, i, warnings));
  }

  // --- sessions (required array) ---
  let sessions: Session[];
  if (!Array.isArray(raw['sessions'])) {
    warnings.push({ code: 'MALFORMED_NODE_MD', message: 'index.json missing "sessions" array; defaulting to []' });
    sessions = [];
  } else {
    sessions = (raw['sessions'] as unknown[]).map((s, i) => parseSession(s, i, warnings));
  }

  return ok({
    project,
    created,
    last_updated,
    nodes,
    connections,
    sessions,
    warnings,
  });
}

/**
 * Canonical .ai-arch/ vocabulary — source of truth for connection types.
 * Source: architector plugin (`/architector:map`) output, validated against live projects.
 *
 * Main-process code and the renderer import from here; this module has
 * no Electron, Node, or React imports.
 */

export type ConnectionType =
  | 'dependency'
  | 'shared-concern'
  | 'coupled-decision'
  | 'non-dependency'
  | 'non-contribution'
  | 'open-question';

export const CONNECTION_TYPES: readonly ConnectionType[] = [
  'dependency',
  'shared-concern',
  'coupled-decision',
  'non-dependency',
  'non-contribution',
  'open-question',
] as const;

/** Canonical legend/display order: positive-solid → negative-dotted → uncertain-dashed. Unknown bucket appended by consumers. */
export const CONNECTION_TYPE_ORDER: readonly ConnectionType[] = CONNECTION_TYPES;

export function isKnownConnectionType(s: string): s is ConnectionType {
  return (CONNECTION_TYPES as readonly string[]).includes(s);
}

/** One-line educational description per connection type. Used in Legend row tooltips. */
export const CONNECTION_TYPE_DESCRIPTIONS: Record<ConnectionType, string> = {
  dependency:         'A depends on B; B must exist or be decided for A to proceed',
  'shared-concern':   'A and B both touch the same area or design concern',
  'coupled-decision': 'A and B must be decided together; choices constrain each other',
  'non-dependency':   'Explicitly not a dependency; noted to prevent assumption',
  'non-contribution': 'A does not contribute to B; explicit exclusion',
  'open-question':    'Unresolved relationship between A and B; needs discussion',
};

export const UNKNOWN_CONNECTION_DESCRIPTION = 'Not recognized by current Atrium version';

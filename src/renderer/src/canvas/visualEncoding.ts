import type { NodeMaturity } from '@shared/domain';
import type { ConnectionType } from '@shared/schema/aiArch';

export type MaturityStyle = {
  fill: string;
  stroke: string;
  strokeDasharray?: string;
  borderRadius: string;
  nameColor: string;
  subtitleColor: string;
};

export type ConnectionStyle = {
  stroke: 'solid' | 'dashed' | 'dotted';
  color: string;
  width: number;
  strokeDasharray: string;
};

export const MATURITY_STYLE: Record<NodeMaturity, MaturityStyle> = {
  'raw-idea': { fill: '#2a1f3d', stroke: '#a78bc9', borderRadius: '50% / 50%', nameColor: '#d4c4e6', subtitleColor: '#a78bc9' },
  explored:   { fill: '#1e3a5f', stroke: '#5b8fd4', borderRadius: '6px',       nameColor: '#bfdbfe', subtitleColor: '#7a9dc9' },
  decided:    { fill: '#3d2f14', stroke: '#c29a4e', borderRadius: '3px',       nameColor: '#f5d896', subtitleColor: '#c19a5c' },
  ready:      { fill: '#14301f', stroke: '#4ade80', borderRadius: '6px',       nameColor: '#bbf7d0', subtitleColor: '#86efac' },
};

export const CONNECTION_STYLE: Record<ConnectionType, ConnectionStyle> = {
  dependency:         { stroke: 'solid',  color: '#5b8fd4', width: 1.5, strokeDasharray: 'none' },
  'shared-concern':   { stroke: 'solid',  color: '#c29a4e', width: 1.5, strokeDasharray: 'none' },
  'coupled-decision': { stroke: 'solid',  color: '#a78bc9', width: 1.5, strokeDasharray: 'none' },
  'non-dependency':   { stroke: 'dotted', color: '#6a7d9e', width: 1.5, strokeDasharray: '2 4'  },
  'non-contribution': { stroke: 'dotted', color: '#6a6a72', width: 1.5, strokeDasharray: '2 4'  },
  'open-question':    { stroke: 'dashed', color: '#d4824a', width: 1.5, strokeDasharray: '5 3'  },
};

export const UNKNOWN_MATURITY_STYLE: MaturityStyle = {
  fill: '#1f2937', stroke: '#4a5568', strokeDasharray: '4 3', borderRadius: '3px',
  nameColor: '#a0aec0', subtitleColor: '#6a6a72',
};

export const UNKNOWN_CONNECTION_STYLE: ConnectionStyle = {
  stroke: 'dashed', color: '#6a6a72', width: 1.5, strokeDasharray: '4 3',
};

export function resolveMaturityStyle(raw: string): { known: boolean; style: MaturityStyle } {
  if (raw in MATURITY_STYLE) {
    return { known: true, style: MATURITY_STYLE[raw as NodeMaturity] };
  }
  return { known: false, style: UNKNOWN_MATURITY_STYLE };
}

export function resolveConnectionStyle(raw: string): { known: boolean; style: ConnectionStyle } {
  if (raw in CONNECTION_STYLE) {
    return { known: true, style: CONNECTION_STYLE[raw as ConnectionType] };
  }
  return { known: false, style: UNKNOWN_CONNECTION_STYLE };
}

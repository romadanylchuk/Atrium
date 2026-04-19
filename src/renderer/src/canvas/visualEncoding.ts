import type { NodeMaturity, ConnectionType } from '@shared/domain';

export type MaturityStyle = {
  shape: 'circle' | 'roundedRect' | 'rect' | 'badge';
  color: string;
};

export type ConnectionStyle = {
  stroke: 'solid' | 'dashed' | 'dotted';
  color: string;
  width?: number;
};

export const MATURITY_STYLE: Record<NodeMaturity, MaturityStyle> = {
  'raw-idea': { shape: 'circle', color: '#94a3b8' },
  explored: { shape: 'roundedRect', color: '#60a5fa' },
  decided: { shape: 'rect', color: '#34d399' },
  ready: { shape: 'badge', color: '#a78bfa' },
};

export const CONNECTION_STYLE: Record<ConnectionType, ConnectionStyle> = {
  'depends-on': { stroke: 'solid', color: '#ef4444', width: 2 },
  informs: { stroke: 'dashed', color: '#60a5fa', width: 2 },
  extends: { stroke: 'solid', color: '#34d399', width: 2 },
  feeds: { stroke: 'dotted', color: '#f59e0b', width: 2 },
  uses: { stroke: 'solid', color: '#94a3b8', width: 2 },
};

export const UNKNOWN_MATURITY_STYLE: MaturityStyle = {
  shape: 'roundedRect',
  color: '#b45309',
};

export const UNKNOWN_CONNECTION_STYLE: ConnectionStyle = {
  stroke: 'dashed',
  color: '#92400e',
  width: 3,
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

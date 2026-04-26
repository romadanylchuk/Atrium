import { useAtriumStore } from '../store/atriumStore';
import { resolveConnectionStyle, resolveMaturityStyle } from './visualEncoding';
import type { NodeMaturity } from '@shared/domain';
import {
  CONNECTION_TYPE_ORDER,
  CONNECTION_TYPE_DESCRIPTIONS,
  UNKNOWN_CONNECTION_DESCRIPTION,
  isKnownConnectionType,
} from '@shared/schema/aiArch';

const MATURITY_ORDER: NodeMaturity[] = ['raw-idea', 'explored', 'decided', 'ready'];

export function Legend() {
  const project = useAtriumStore((s) => s.project);

  if (!project || (project.nodes.length === 0 && project.connections.length === 0)) {
    return null;
  }

  // Canonical order: known types in CONNECTION_TYPE_ORDER, unknown bucket appended
  const rawConnTypes = [...new Set(project.connections.map((c) => c.type))];
  const knownConnTypes = CONNECTION_TYPE_ORDER.filter((t) => rawConnTypes.includes(t));
  const unknownConnTypes = rawConnTypes.filter((t) => !isKnownConnectionType(t));
  const connTypes = [...knownConnTypes, ...unknownConnTypes];

  // Dedupe maturities in canonical order, unknowns appended at end
  const rawMaturities = [...new Set(project.nodes.map((n) => n.maturity))];
  const knownMaturities = MATURITY_ORDER.filter((m) => rawMaturities.includes(m));
  const unknownMaturities = rawMaturities.filter((m) => !MATURITY_ORDER.includes(m as NodeMaturity));
  const maturities = [...knownMaturities, ...unknownMaturities];

  const sectionHeaderStyle: React.CSSProperties = {
    color: '#6a6a72',
    textTransform: 'uppercase',
    fontSize: '9px',
    letterSpacing: '0.04em',
    marginBottom: '2px',
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  };

  const labelStyle: React.CSSProperties = {
    color: '#a0aec0',
    fontSize: '10px',
  };

  return (
    <div
      data-testid="canvas-legend"
      style={{
        position: 'absolute',
        bottom: '8px',
        left: '8px',
        background: 'rgba(20,20,25,0.92)',
        border: '0.5px solid #2a2a32',
        borderRadius: '6px',
        padding: '8px 10px',
        fontSize: '10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        zIndex: 5,
      }}
    >
      {/* Connection types section */}
      {connTypes.length > 0 && (
        <div>
          <div style={sectionHeaderStyle}>Connections</div>
          {connTypes.map((type) => {
            const { style } = resolveConnectionStyle(type);
            const dasharray = style.strokeDasharray === 'none' ? undefined : style.strokeDasharray;
            const description = isKnownConnectionType(type)
              ? CONNECTION_TYPE_DESCRIPTIONS[type]
              : UNKNOWN_CONNECTION_DESCRIPTION;
            return (
              <div key={type} style={rowStyle} title={description}>
                <svg width="16" height="2" viewBox="0 0 16 2">
                  <line
                    x1="0" y1="1" x2="16" y2="1"
                    stroke={style.color}
                    strokeWidth={1.5}
                    strokeDasharray={dasharray}
                  />
                </svg>
                <span style={labelStyle}>{type}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Maturity section */}
      {maturities.length > 0 && (
        <div>
          <div style={sectionHeaderStyle}>Maturity</div>
          {maturities.map((maturity) => {
            const { style } = resolveMaturityStyle(maturity);
            const isEllipse = style.borderRadius === '50% / 50%';
            return (
              <div key={maturity} style={rowStyle}>
                <svg width="12" height="8" viewBox="0 0 12 8">
                  <rect
                    x="0" y="0" width="12" height="8"
                    fill={style.fill}
                    stroke={style.stroke}
                    strokeWidth="1"
                    rx={isEllipse ? '4' : style.borderRadius.replace('px', '')}
                    strokeDasharray={style.strokeDasharray}
                  />
                </svg>
                <span style={labelStyle}>{maturity}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import React from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { resolveMaturityStyle } from './visualEncoding';
import { useAtriumStore } from '../store/atriumStore';

export type AtriumNodeData = {
  slug: string;
  name: string;
  maturity: string;
};

export function AtriumNode({ data }: NodeProps<AtriumNodeData>) {
  const { known, style } = resolveMaturityStyle(data.maturity);
  const setTooltipTarget = useAtriumStore((s) => s.setTooltipTarget);
  const toggleSelectedNode = useAtriumStore((s) => s.toggleSelectedNode);

  const containerStyle: React.CSSProperties = {
    width: '96px',
    height: '36px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2px',
    background: style.fill,
    border: style.strokeDasharray ? `1px dashed ${style.stroke}` : `1px solid ${style.stroke}`,
    borderRadius: style.borderRadius,
  };

  function handleClick() {
    setTooltipTarget(data.slug);
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    toggleSelectedNode(data.slug);
    setTooltipTarget(null);
  }

  return (
    <div style={containerStyle} onClick={handleClick} onContextMenu={handleContextMenu}>
      <Handle type="target" position={Position.Top} />
      <div
        style={{
          fontSize: '11px',
          fontWeight: 500,
          color: style.nameColor,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '92px',
        }}
      >
        {data.name}
      </div>
      <div style={{ fontSize: '9px', color: style.subtitleColor }}>
        {known ? (
          data.maturity
        ) : (
          <span
            data-unknown-maturity={data.maturity}
            style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '3px', padding: '1px 4px' }}
          >
            {data.maturity}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

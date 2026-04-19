import React from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { resolveMaturityStyle } from './visualEncoding';
import { useAtriumStore } from '../store/atriumStore';

export type AtriumNodeData = {
  slug: string;
  name: string;
  maturity: string;
};

const SHAPE_STYLES: Record<string, React.CSSProperties> = {
  circle: { borderRadius: '50%' },
  roundedRect: { borderRadius: '8px' },
  rect: { borderRadius: '0px' },
  badge: { borderRadius: '16px' },
};

export function AtriumNode({ data }: NodeProps<AtriumNodeData>) {
  const { known, style } = resolveMaturityStyle(data.maturity);
  const setTooltipTarget = useAtriumStore((s) => s.setTooltipTarget);
  const toggleSelectedNode = useAtriumStore((s) => s.toggleSelectedNode);

  const containerStyle: React.CSSProperties = {
    background: style.color,
    padding: '8px 12px',
    minWidth: '120px',
    textAlign: 'center',
    border: known ? '2px solid transparent' : '2px dashed #92400e',
    ...SHAPE_STYLES[style.shape],
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
      <div style={{ fontWeight: 600, fontSize: '13px' }}>{data.name}</div>
      {!known && (
        <div
          data-unknown-maturity={data.maturity}
          style={{
            fontSize: '10px',
            marginTop: '2px',
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '4px',
            padding: '1px 4px',
          }}
        >
          {data.maturity}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

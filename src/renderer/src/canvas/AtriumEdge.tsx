import { useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from 'reactflow';
import { resolveConnectionStyle } from './visualEncoding';

export type AtriumEdgeData = {
  type: string;
};

export function AtriumEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<AtriumEdgeData>) {
  const rawType = data?.type ?? '';
  const { known, style } = resolveConnectionStyle(rawType);
  const [hovered, setHovered] = useState(false);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const strokeDasharray = style.strokeDasharray === 'none' ? undefined : style.strokeDasharray;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: style.color,
          strokeWidth: style.width,
          strokeDasharray,
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <span
            {...(known ? { 'data-known-type': rawType } : { 'data-unknown-type': rawType })}
            style={{
              display: hovered ? 'block' : 'none',
              background: 'rgba(20,20,25,0.92)',
              border: '0.5px solid #2a2a32',
              borderRadius: '4px',
              padding: '2px 6px',
              fontSize: '10px',
              color: '#e6e6e6',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          >
            {known ? `type: ${rawType}` : `type: ${rawType} (unknown)`}
          </span>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

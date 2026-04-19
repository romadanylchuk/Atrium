import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from 'reactflow';
import { resolveConnectionStyle } from './visualEncoding';

export type AtriumEdgeData = {
  type: string;
};

const STROKE_DASH: Record<string, string> = {
  solid: 'none',
  dashed: '6,3',
  dotted: '2,3',
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

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const strokeDasharray = STROKE_DASH[style.stroke] ?? 'none';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: style.color,
          strokeWidth: style.width ?? 2,
          strokeDasharray,
        }}
      />
      {!known && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: '10px',
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <span data-unknown-type={rawType}>{rawType}</span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

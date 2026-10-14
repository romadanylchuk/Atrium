export type TooltipPlacement = {
  side: 'right' | 'left';
  vAlign: 'top' | 'bottom';
};

export type TooltipPlacementInput = {
  nodeScreenX: number;
  nodeScreenY: number;
  viewportWidth: number;
  viewportHeight: number;
};

export function computeTooltipPlacement({
  nodeScreenX,
  nodeScreenY,
  viewportWidth,
  viewportHeight,
}: TooltipPlacementInput): TooltipPlacement {
  const side: TooltipPlacement['side'] = nodeScreenX > viewportWidth * 0.7 ? 'left' : 'right';
  const vAlign: TooltipPlacement['vAlign'] = nodeScreenY > viewportHeight * 0.7 ? 'top' : 'bottom';
  return { side, vAlign };
}

/** Gap kept between the tooltip and the window edges. */
export const TOOLTIP_EDGE_MARGIN = 8;

export type TooltipTopInput = {
  nodeScreenY: number;
  vAlign: TooltipPlacement['vAlign'];
  /** Rendered tooltip height (already capped at the visible height). */
  height: number;
  viewportHeight: number;
};

/**
 * Vertical position for a tooltip of the given height: anchored at the node as usual, but
 * shifted up (growing towards the top) when it would run past the bottom edge, and never
 * above the top edge.
 */
export function computeTooltipTop({ nodeScreenY, vAlign, height, viewportHeight }: TooltipTopInput): number {
  const preferred = vAlign === 'bottom' ? nodeScreenY : nodeScreenY - height;
  const maxTop = viewportHeight - TOOLTIP_EDGE_MARGIN - height;
  return Math.max(TOOLTIP_EDGE_MARGIN, Math.min(preferred, maxTop));
}

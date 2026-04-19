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

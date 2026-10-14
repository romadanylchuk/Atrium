import { describe, it, expect } from 'vitest';
import { computeTooltipPlacement, computeTooltipTop, TOOLTIP_EDGE_MARGIN } from '../tooltipPlacement';

const vw = 1000;
const vh = 800;

describe('computeTooltipPlacement', () => {
  it('top-left corner → right + bottom', () => {
    expect(computeTooltipPlacement({ nodeScreenX: 100, nodeScreenY: 100, viewportWidth: vw, viewportHeight: vh }))
      .toEqual({ side: 'right', vAlign: 'bottom' });
  });

  it('top-right corner → left + bottom', () => {
    expect(computeTooltipPlacement({ nodeScreenX: 800, nodeScreenY: 100, viewportWidth: vw, viewportHeight: vh }))
      .toEqual({ side: 'left', vAlign: 'bottom' });
  });

  it('bottom-right corner → left + top', () => {
    expect(computeTooltipPlacement({ nodeScreenX: 800, nodeScreenY: 700, viewportWidth: vw, viewportHeight: vh }))
      .toEqual({ side: 'left', vAlign: 'top' });
  });

  it('bottom-left corner → right + top', () => {
    expect(computeTooltipPlacement({ nodeScreenX: 100, nodeScreenY: 700, viewportWidth: vw, viewportHeight: vh }))
      .toEqual({ side: 'right', vAlign: 'top' });
  });

  it('dead center → right + bottom', () => {
    expect(computeTooltipPlacement({ nodeScreenX: 500, nodeScreenY: 400, viewportWidth: vw, viewportHeight: vh }))
      .toEqual({ side: 'right', vAlign: 'bottom' });
  });

  it('exactly at 70% horizontal threshold → left', () => {
    // 70% of 1000 = 700; x = 700 → NOT > 700, so right
    expect(computeTooltipPlacement({ nodeScreenX: 700, nodeScreenY: 100, viewportWidth: vw, viewportHeight: vh }))
      .toEqual({ side: 'right', vAlign: 'bottom' });
    // x = 701 → left
    expect(computeTooltipPlacement({ nodeScreenX: 701, nodeScreenY: 100, viewportWidth: vw, viewportHeight: vh }))
      .toEqual({ side: 'left', vAlign: 'bottom' });
  });

  it('exactly at 70% vertical threshold → top', () => {
    // 70% of 800 = 560; y = 560 → NOT > 560, so bottom
    expect(computeTooltipPlacement({ nodeScreenX: 100, nodeScreenY: 560, viewportWidth: vw, viewportHeight: vh }))
      .toEqual({ side: 'right', vAlign: 'bottom' });
    // y = 561 → top
    expect(computeTooltipPlacement({ nodeScreenX: 100, nodeScreenY: 561, viewportWidth: vw, viewportHeight: vh }))
      .toEqual({ side: 'right', vAlign: 'top' });
  });
});

describe('computeTooltipTop', () => {
  it('a small tooltip stays anchored at the node', () => {
    expect(computeTooltipTop({ nodeScreenY: 200, vAlign: 'bottom', height: 180, viewportHeight: vh })).toBe(200);
    expect(computeTooltipTop({ nodeScreenY: 700, vAlign: 'top', height: 180, viewportHeight: vh })).toBe(520);
  });

  it('a tall tooltip grows upward instead of running off the bottom', () => {
    expect(computeTooltipTop({ nodeScreenY: 400, vAlign: 'bottom', height: 600, viewportHeight: vh }))
      .toBe(vh - TOOLTIP_EDGE_MARGIN - 600);
  });

  it('never goes above the top edge', () => {
    expect(computeTooltipTop({ nodeScreenY: 300, vAlign: 'top', height: 500, viewportHeight: vh }))
      .toBe(TOOLTIP_EDGE_MARGIN);
    const full = vh - 2 * TOOLTIP_EDGE_MARGIN;
    expect(computeTooltipTop({ nodeScreenY: 600, vAlign: 'bottom', height: full, viewportHeight: vh }))
      .toBe(TOOLTIP_EDGE_MARGIN);
  });
});

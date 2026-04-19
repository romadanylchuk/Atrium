import { describe, it, expect } from 'vitest';
import { computeTooltipPlacement } from '../tooltipPlacement';

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

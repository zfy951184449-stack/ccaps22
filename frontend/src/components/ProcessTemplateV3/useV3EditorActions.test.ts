import { buildDraggedOperationTimingUpdate } from './dragTiming';

describe('buildDraggedOperationTimingUpdate', () => {
  it('keeps negative template days in operationDay instead of day offsets', () => {
    expect(buildDraggedOperationTimingUpdate(-12 * 24 + 9, -12 * 24 + 14, 0)).toEqual({
      operationDay: -12,
      recommendedTime: 9,
      recommendedDayOffset: 0,
      windowStartTime: 7,
      windowStartDayOffset: 0,
      windowEndTime: 14,
      windowEndDayOffset: 0,
    });
  });

  it('uses small window offsets only when the padding crosses midnight', () => {
    expect(buildDraggedOperationTimingUpdate(-12 * 24 + 1, -12 * 24 + 6, 0)).toEqual({
      operationDay: -12,
      recommendedTime: 1,
      recommendedDayOffset: 0,
      windowStartTime: 23,
      windowStartDayOffset: -1,
      windowEndTime: 6,
      windowEndDayOffset: 0,
    });
  });
});

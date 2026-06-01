import { buildCreateTimingContext, parseStageIdFromGroupId, toLocalHourValue } from './createOperationContext';
import type { TemplateStageSummary } from '../ProcessTemplateV2/types';

const stage = (id: number, startDay: number): TemplateStageSummary => ({
  id,
  template_id: 10,
  stage_code: `S${id}`,
  stage_name: `Stage ${id}`,
  stage_order: id,
  start_day: startDay,
});

describe('parseStageIdFromGroupId', () => {
  it('extracts stage ids from operation and resource gantt group ids', () => {
    expect(parseStageIdFromGroupId('stage_42')).toBe(42);
    expect(parseStageIdFromGroupId('res-stage-stage_42')).toBe(42);
    expect(parseStageIdFromGroupId('stage_42__equip-8__lane-1')).toBe(42);
  });

  it('does not treat template or equipment ids as stage ids', () => {
    expect(parseStageIdFromGroupId('1001')).toBeNull();
    expect(parseStageIdFromGroupId('equip-8')).toBeNull();
    expect(parseStageIdFromGroupId(null)).toBeNull();
  });
});

describe('buildCreateTimingContext', () => {
  it('derives operation timing from absolute gantt hour and stage start day', () => {
    expect(buildCreateTimingContext(stage(1, 3), 3 * 24 + 9.5)).toEqual({
      operationDay: 0,
      recommendedTime: 9.5,
      recommendedDayOffset: 0,
    });

    expect(buildCreateTimingContext(stage(1, 3), 5 * 24 + 1)).toEqual({
      operationDay: 2,
      recommendedTime: 1,
      recommendedDayOffset: 0,
    });
  });

  it('keeps pre-stage clicks as negative day offsets instead of silently moving time', () => {
    expect(buildCreateTimingContext(stage(1, 3), 2 * 24 + 23)).toEqual({
      operationDay: 0,
      recommendedTime: 23,
      recommendedDayOffset: -1,
    });
  });
});

describe('toLocalHourValue', () => {
  it('normalizes negative and overflowing absolute hours to clock hours', () => {
    expect(toLocalHourValue(-1)).toBe(23);
    expect(toLocalHourValue(25.25)).toBe(1.25);
  });
});

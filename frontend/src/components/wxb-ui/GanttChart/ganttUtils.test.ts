import { buildGanttTimeScale } from './ganttUtils';
import type { GanttTask } from './types';

const task = (id: string, start: number, end: number): GanttTask => ({
  id,
  label: id,
  start,
  end,
  type: 'operation',
});

describe('buildGanttTimeScale', () => {
  it('collapses night intervals that have no operation tasks', () => {
    const scale = buildGanttTimeScale(9, 45, 10, {
      collapseEmptyNightShifts: true,
      tasks: [task('day-task', 10, 12)],
    });

    expect(scale.collapsedIntervals).toEqual([{ start: 21, end: 33, kind: 'night' }]);
    expect(scale.totalWidth).toBe(240);
    expect(scale.hourToX(21)).toBe(120);
    expect(scale.hourToX(33)).toBe(120);
    expect(scale.hourToX(45)).toBe(240);
    expect(scale.pixelDeltaToHourDelta(20, 20)).toBe(14);
  });

  it('keeps night intervals visible when an operation intersects them', () => {
    const scale = buildGanttTimeScale(9, 45, 10, {
      collapseEmptyNightShifts: true,
      tasks: [task('night-task', 22, 23)],
    });

    expect(scale.collapsedIntervals).toEqual([]);
    expect(scale.totalWidth).toBe(360);
    expect(scale.widthBetween(21, 33)).toBe(120);
  });
});

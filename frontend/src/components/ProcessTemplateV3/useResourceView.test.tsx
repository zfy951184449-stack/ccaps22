import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { useResourceView, type UseResourceViewResult } from './useResourceView';
import type { GanttTask } from '../wxb-ui/GanttChart/types';
import type { GanttNode } from '../ProcessTemplateGantt/types';
import { processTemplateV2Api } from '../../services';

jest.mock('../../services', () => ({
  processTemplateV2Api: {
    listBindingsByTemplate: jest.fn().mockResolvedValue([]),
  },
}));

const ganttNodes: GanttNode[] = [
  {
    id: 'stage_1',
    title: 'PS-001',
    type: 'stage',
    stage_code: 'PS-001',
  },
];

const tasks: GanttTask[] = [
  {
    id: 'operation_101',
    label: 'TF-STAGE',
    start: 0,
    end: 24,
    type: 'operation',
    data: { stageId: 1 },
  },
];

// ---------------------------------------------------------------------------
// Shared binding fixture for overlap tests (all three tasks → equipment node 1)
// ---------------------------------------------------------------------------
const BINDING_FIXTURE = [
  {
    template_schedule_id: 201,
    resource_node_id: 1,
    binding_mode: 'DEDICATED',
    binding_role: 'PRIMARY',
    node_name: '反应釜-01',
    node_class: 'Equipment',
    equipment_system_type: null,
    equipment_class: null,
  },
  {
    template_schedule_id: 202,
    resource_node_id: 1,
    binding_mode: 'DEDICATED',
    binding_role: 'PRIMARY',
    node_name: '反应釜-01',
    node_class: 'Equipment',
    equipment_system_type: null,
    equipment_class: null,
  },
  {
    template_schedule_id: 203,
    resource_node_id: 1,
    binding_mode: 'DEDICATED',
    binding_role: 'PRIMARY',
    node_name: '反应釜-01',
    node_class: 'Equipment',
    equipment_system_type: null,
    equipment_class: null,
  },
];

// Three tasks: A(0-30) overlaps B(20-50), C(60-80) is independent
const overlapTasks: GanttTask[] = [
  { id: 'operation_201', label: 'A', start: 0,  end: 30, type: 'operation', data: { stageId: 1 } },
  { id: 'operation_202', label: 'B', start: 20, end: 50, type: 'operation', data: { stageId: 1 } },
  { id: 'operation_203', label: 'C', start: 60, end: 80, type: 'operation', data: { stageId: 1 } },
];

// Bind an arbitrary set of schedule IDs to the same equipment node (id 1) so
// the tasks land in one equipment group where overlap detection runs.
const bindingsFor = (scheduleIds: number[]) =>
  scheduleIds.map(id => ({
    template_schedule_id: id,
    resource_node_id: 1,
    binding_mode: 'DEDICATED',
    binding_role: 'PRIMARY',
    node_name: '反应釜-01',
    node_class: 'Equipment',
    equipment_system_type: null,
    equipment_class: null,
  }));

describe('useResourceView', () => {
  let container: HTMLDivElement;
  let root: Root;
  let observed: UseResourceViewResult | undefined;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    observed = undefined;
    (processTemplateV2Api.listBindingsByTemplate as jest.Mock).mockResolvedValue([]);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
    jest.clearAllMocks();
  });

  function Harness({ mode }: { mode: 'stage-equipment' | 'equipment' }) {
    observed = useResourceView(7, ganttNodes, tasks, [], mode);
    return null;
  }

  it('places a single stage-equipment lane under the equipment summary row', async () => {
    await act(async () => {
      root.render(<Harness mode="stage-equipment" />);
      await Promise.resolve();
    });

    const laneId = 'stage_1__res-stage-stage_1-unbound__lane-1';
    expect(observed?.resourceGroups).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'res-stage-stage_1', showSummaryBar: true }),
      expect.objectContaining({ id: 'stage_1__res-stage-stage_1-unbound', showSummaryBar: true }),
      expect.objectContaining({ id: laneId, showSummaryBar: false, isSubRow: true }),
    ]));
    expect(observed?.resourceTasks[0]).toEqual(expect.objectContaining({
      groupId: laneId,
      renderOnGroupRow: true,
    }));
  });

  it('places a single equipment lane under the equipment summary row', async () => {
    await act(async () => {
      root.render(<Harness mode="equipment" />);
      await Promise.resolve();
    });

    const laneId = 'res-unbound__lane-1';
    expect(observed?.resourceGroups).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'res-unbound', showSummaryBar: true }),
      expect.objectContaining({ id: laneId, showSummaryBar: false, isSubRow: true }),
    ]));
    expect(observed?.resourceTasks[0]).toEqual(expect.objectContaining({
      groupId: laneId,
      renderOnGroupRow: true,
    }));
  });

  it('marks overlapping tasks (A-B) as OVERLAP and leaves independent task (C) unmarked', async () => {
    (processTemplateV2Api.listBindingsByTemplate as jest.Mock).mockResolvedValue(BINDING_FIXTURE);

    function OverlapHarness() {
      observed = useResourceView(7, ganttNodes, overlapTasks, [], 'equipment');
      return null;
    }

    await act(async () => {
      root.render(<OverlapHarness />);
      await Promise.resolve();
    });

    const taskById = (id: string) =>
      observed?.resourceTasks.find(t => t.id === id);

    // A and B overlap (0-30 vs 20-50): both must be marked OVERLAP
    expect(taskById('operation_201')?.conflictType).toBe('OVERLAP');
    expect(taskById('operation_202')?.conflictType).toBe('OVERLAP');

    // C (60-80) does not overlap anyone: conflictType must be absent
    expect(taskById('operation_203')?.conflictType).toBeUndefined();

    // All three tasks should appear in the output (none dropped)
    expect(observed?.resourceTasks).toHaveLength(3);

    // Overlapping tasks must be split into at least 2 lanes
    const laneIds = new Set(
      observed?.resourceTasks
        .filter(t => t.id === 'operation_201' || t.id === 'operation_202')
        .map(t => t.groupId),
    );
    expect(laneIds.size).toBeGreaterThanOrEqual(2);
  });

  // ---------------------------------------------------------------------------
  // Overlap-detection edge cases (guard the O(n log n) sweep-line against the
  // strict-inequality semantics of the original double loop).
  // ---------------------------------------------------------------------------

  // Render the hook in equipment mode against a custom task list + bindings and
  // return the conflictType-by-id lookup.
  async function renderOverlap(taskList: GanttTask[], scheduleIds: number[]) {
    (processTemplateV2Api.listBindingsByTemplate as jest.Mock).mockResolvedValue(
      bindingsFor(scheduleIds),
    );
    function H() {
      observed = useResourceView(7, ganttNodes, taskList, [], 'equipment');
      return null;
    }
    await act(async () => {
      root.render(<H />);
      await Promise.resolve();
    });
    return (id: string) => observed?.resourceTasks.find(t => t.id === id)?.conflictType;
  }

  it('does NOT mark adjacent tasks (a.end === b.start) as overlapping', async () => {
    // A(0-24) ends exactly where B(24-48) starts → touching, not overlapping.
    const conflictOf = await renderOverlap(
      [
        { id: 'operation_301', label: 'A', start: 0,  end: 24, type: 'operation', data: { stageId: 1 } },
        { id: 'operation_302', label: 'B', start: 24, end: 48, type: 'operation', data: { stageId: 1 } },
      ],
      [301, 302],
    );
    expect(conflictOf('operation_301')).toBeUndefined();
    expect(conflictOf('operation_302')).toBeUndefined();
  });

  it('does NOT mark a zero-length task sharing a start with a sibling (p.start === task.start, task.end === task.start)', async () => {
    // Z is zero-length at hour 10; P starts at the same hour but has duration.
    // Strict semantics: P.start < Z.end is false (10 < 10), so they do not overlap.
    const conflictOf = await renderOverlap(
      [
        { id: 'operation_401', label: 'Z', start: 10, end: 10, type: 'operation', data: { stageId: 1 } },
        { id: 'operation_402', label: 'P', start: 10, end: 34, type: 'operation', data: { stageId: 1 } },
      ],
      [401, 402],
    );
    expect(conflictOf('operation_401')).toBeUndefined();
    expect(conflictOf('operation_402')).toBeUndefined();
  });

  it('DOES mark a zero-length task strictly inside another (p.start < task < p.end)', async () => {
    // Z at hour 12 falls inside P(0-24) → conflict for both.
    const conflictOf = await renderOverlap(
      [
        { id: 'operation_411', label: 'P', start: 0,  end: 24, type: 'operation', data: { stageId: 1 } },
        { id: 'operation_412', label: 'Z', start: 12, end: 12, type: 'operation', data: { stageId: 1 } },
      ],
      [411, 412],
    );
    expect(conflictOf('operation_411')).toBe('OVERLAP');
    expect(conflictOf('operation_412')).toBe('OVERLAP');
  });

  it('marks every task in a same-start cluster as overlapping', async () => {
    // Three tasks all starting at hour 5 with positive durations → mutual overlap.
    const conflictOf = await renderOverlap(
      [
        { id: 'operation_501', label: 'A', start: 5, end: 20, type: 'operation', data: { stageId: 1 } },
        { id: 'operation_502', label: 'B', start: 5, end: 15, type: 'operation', data: { stageId: 1 } },
        { id: 'operation_503', label: 'C', start: 5, end: 30, type: 'operation', data: { stageId: 1 } },
      ],
      [501, 502, 503],
    );
    expect(conflictOf('operation_501')).toBe('OVERLAP');
    expect(conflictOf('operation_502')).toBe('OVERLAP');
    expect(conflictOf('operation_503')).toBe('OVERLAP');
  });
});

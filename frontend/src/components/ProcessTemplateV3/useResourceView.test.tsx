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
});

import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { buildDraggedOperationTimingUpdate } from './dragTiming';
import { useV3EditorActions, type UseV3EditorActionsReturn } from './useV3EditorActions';
import { processTemplateV2Api } from '../../services';
import type { GanttNode } from '../ProcessTemplateGantt/types';

// axios ships ESM and is not transformed by CRA's jest config; the hook only
// touches it in handleAutoSchedule, which these tests do not exercise.
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn() }, post: jest.fn() }));

jest.mock('../../services', () => ({
  processTemplateV2Api: {
    getResourceEditor: jest.fn().mockResolvedValue({ constraints: [], shareGroups: [] }),
    updateStageOperation: jest.fn().mockResolvedValue(undefined),
    deleteStageOperation: jest.fn().mockResolvedValue(undefined),
  },
}));

// The hook reports errors through wxbToast (re-exported from the wxb-ui barrel).
// Mock the barrel directly rather than antd: importing the real barrel would
// eagerly evaluate every wxb-ui module (e.g. RangePicker destructures
// AntdDatePicker.RangePicker at module load), which throws once antd is mocked.
const mockToastError = jest.fn();
const mockToastSuccess = jest.fn();
jest.mock('../wxb-ui', () => ({
  wxbToast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
    warning: jest.fn(),
    info: jest.fn(),
    loading: jest.fn(),
  },
}));

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

// Two operations under one stage that starts on Day 0.
//   op 101: operation_day 0, recommended_time 9, standard_time 5  → absolute 9..14
//   op 202: operation_day 1, recommended_time 8, standard_time 4  → absolute 32..36
const ganttNodes: GanttNode[] = [
  {
    id: 'stage_1',
    title: 'PS-001',
    type: 'stage',
    stage_code: 'PS-001',
    start_day: 0,
    children: [
      {
        id: 'operation_101',
        title: 'OP-A',
        type: 'operation',
        parent_id: 'stage_1',
        start_day: 0,
        standard_time: 5,
        data: {
          id: 101,
          stage_id: 1,
          operation_id: 11,
          operation_code: 'A',
          operation_name: 'OP-A',
          operation_day: 0,
          recommended_time: 9,
          recommended_day_offset: 0,
          window_start_time: 7,
          window_end_time: 18,
          operation_order: 1,
          standard_time: 5,
        },
      },
      {
        id: 'operation_202',
        title: 'OP-B',
        type: 'operation',
        parent_id: 'stage_1',
        start_day: 1,
        standard_time: 4,
        data: {
          id: 202,
          stage_id: 1,
          operation_id: 22,
          operation_code: 'B',
          operation_name: 'OP-B',
          operation_day: 1,
          recommended_time: 8,
          recommended_day_offset: 0,
          window_start_time: 7,
          window_end_time: 18,
          operation_order: 2,
          standard_time: 4,
        },
      },
    ],
  },
];

describe('useV3EditorActions batch handlers', () => {
  let container: HTMLDivElement;
  let root: Root;
  let observed: UseV3EditorActionsReturn | undefined;
  let refreshData: jest.Mock;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    observed = undefined;
    refreshData = jest.fn().mockResolvedValue(undefined);
    (processTemplateV2Api.getResourceEditor as jest.Mock).mockResolvedValue({ constraints: [], shareGroups: [] });
    (processTemplateV2Api.updateStageOperation as jest.Mock).mockReset().mockResolvedValue(undefined);
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
    jest.clearAllMocks();
  });

  function Harness() {
    observed = useV3EditorActions({ templateId: 7, ganttNodes, refreshData });
    return null;
  }

  async function mount() {
    await act(async () => {
      root.render(React.createElement(Harness));
      await Promise.resolve();
    });
  }

  it('handleGroupDragEnd shifts every affected task by delta, persists concurrently and refreshes once', async () => {
    await mount();

    let result: boolean | undefined;
    await act(async () => {
      result = await observed!.handleGroupDragEnd('stage_1', 24, ['operation_101', 'operation_202']);
    });

    expect(result).toBe(true);
    const updateMock = processTemplateV2Api.updateStageOperation as jest.Mock;
    expect(updateMock).toHaveBeenCalledTimes(2);

    // op 101: 9..14 shifted +24h → operationDay 1 (stage starts Day 0), recommendedTime 9
    expect(updateMock).toHaveBeenCalledWith(
      101,
      expect.objectContaining({ operationDay: 1, recommendedTime: 9 }),
    );
    // op 202: 32..36 shifted +24h → operationDay 2, recommendedTime 8
    expect(updateMock).toHaveBeenCalledWith(
      202,
      expect.objectContaining({ operationDay: 2, recommendedTime: 8 }),
    );

    // Single refresh for the whole batch, no error toast.
    expect(refreshData).toHaveBeenCalledTimes(1);
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('handleGroupDragEnd still refreshes once and reports failures on partial failure', async () => {
    await mount();

    const updateMock = processTemplateV2Api.updateStageOperation as jest.Mock;
    updateMock.mockImplementation((scheduleId: number) =>
      scheduleId === 202 ? Promise.reject(new Error('boom')) : Promise.resolve(undefined),
    );

    let result: boolean | undefined;
    await act(async () => {
      result = await observed!.handleGroupDragEnd('stage_1', 24, ['operation_101', 'operation_202']);
    });

    expect(result).toBe(false);
    expect(updateMock).toHaveBeenCalledTimes(2); // both attempted (concurrent, not short-circuited)
    expect(refreshData).toHaveBeenCalledTimes(1); // refresh even on partial failure
    expect(mockToastError).toHaveBeenCalledTimes(1);
    // wxbToast.error receives the message string directly as its first argument.
    expect(String(mockToastError.mock.calls[0][0])).toContain('2 条中 1 条');
  });

  it('handleTasksDragEnd persists each provided update and refreshes once', async () => {
    await mount();

    let result: boolean | undefined;
    await act(async () => {
      result = await observed!.handleTasksDragEnd([
        { taskId: 'operation_101', newStart: 33, newEnd: 38 }, // Day 1 09:00
        { taskId: 'operation_202', newStart: 9, newEnd: 13 },  // Day 0 09:00
      ]);
    });

    expect(result).toBe(true);
    const updateMock = processTemplateV2Api.updateStageOperation as jest.Mock;
    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(updateMock).toHaveBeenCalledWith(101, expect.objectContaining({ operationDay: 1, recommendedTime: 9 }));
    expect(updateMock).toHaveBeenCalledWith(202, expect.objectContaining({ operationDay: 0, recommendedTime: 9 }));
    expect(refreshData).toHaveBeenCalledTimes(1);
  });
});

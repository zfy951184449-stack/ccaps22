import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import RosterExceptionRepair from './RosterExceptionRepair';
import { employeeApi } from '../../services/api';
import { rosterExceptionApi } from '../../services/rosterExceptionApi';

jest.mock('../../services/api', () => ({
  employeeApi: {
    getAll: jest.fn(),
  },
}));

jest.mock('../../services/rosterExceptionApi', () => ({
  rosterExceptionApi: {
    previewEmployeeUnavailable: jest.fn(),
    applySelectedProposal: jest.fn(),
  },
}));

jest.mock('../../components/wxb-ui', () => {
  const React = require('react');
  const dayjs = require('dayjs');
  const actual = jest.requireActual('../../components/wxb-ui');

  const WxbRangePicker = ({
    label,
    placeholder = ['开始时间', '结束时间'],
    value,
    onChange,
    className = '',
  }: any) => {
    const [start, setStart] = React.useState(value?.[0]?.format?.('YYYY-MM-DD HH:mm') ?? '');
    const [end, setEnd] = React.useState(value?.[1]?.format?.('YYYY-MM-DD HH:mm') ?? '');

    React.useEffect(() => {
      setStart(value?.[0]?.format?.('YYYY-MM-DD HH:mm') ?? '');
      setEnd(value?.[1]?.format?.('YYYY-MM-DD HH:mm') ?? '');
    }, [value]);

    const emit = (nextStart: string, nextEnd: string) => {
      onChange?.(nextStart && nextEnd ? [dayjs(nextStart), dayjs(nextEnd)] : null);
    };

    return React.createElement(
      'div',
      { className: 'wxb-field' },
      label ? React.createElement('label', { className: 'wxb-label' }, label) : null,
      React.createElement(
        'div',
        { className: `wxb-rangepicker ${className}` },
        React.createElement('input', {
          placeholder: placeholder[0],
          value: start,
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
            setStart(event.target.value);
            emit(event.target.value, end);
          },
        }),
        React.createElement('input', {
          placeholder: placeholder[1],
          value: end,
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
            setEnd(event.target.value);
            emit(start, event.target.value);
          },
        }),
      ),
    );
  };

  return {
    ...actual,
    WxbRangePicker,
  };
});

const mockEmployeeApi = employeeApi as jest.Mocked<typeof employeeApi>;
const mockRosterExceptionApi = rosterExceptionApi as jest.Mocked<typeof rosterExceptionApi>;

const previewResponse = {
  exceptionId: 'preview-1',
  previewOnly: true as const,
  employee: {
    employeeId: 123,
    employeeCode: 'E123',
    employeeName: '张三',
    departmentId: 1,
    departmentName: 'USP',
  },
  employees: [{
    employeeId: 123,
    employeeCode: 'E123',
    employeeName: '张三',
    departmentId: 1,
    departmentName: 'USP',
  }],
  windowStart: '2026-06-12T08:00:00+08:00',
  windowEnd: '2026-06-12T20:00:00+08:00',
  repairMode: 'MINIMAL_CHANGE' as const,
  protectLockedAssignments: true,
  allowOvertimeSuggestions: false,
  impactedShiftPlans: [],
  impactedAssignments: [{
    assignmentId: 9001,
    batchOperationPlanId: 7001,
    batchCode: 'B-001',
    operationName: '培养观察',
    plannedStart: '2026-06-12T09:00:00.000Z',
    plannedEnd: '2026-06-12T11:00:00.000Z',
    role: 'OPERATOR',
    positionNumber: 1,
    isLocked: false,
    employeeId: 123,
    employeeCode: 'E123',
    employeeName: '张三',
    departmentId: 1,
    departmentName: 'USP',
    shiftPlanId: 8001,
  }],
  vacancies: [{
    vacancyId: 'vacancy-9001-1',
    batchOperationPlanId: 7001,
    batchCode: 'B-001',
    operationName: '培养观察',
    plannedStart: '2026-06-12T09:00:00.000Z',
    plannedEnd: '2026-06-12T11:00:00.000Z',
    role: 'OPERATOR',
    positionNumber: 1,
    requiredQualificationIds: [77],
    requiredQualificationNames: ['USP操作'],
  }],
  replacementCandidates: [{
    vacancyId: 'vacancy-9001-1',
    employeeId: 456,
    employeeCode: 'E456',
    employeeName: '李四',
    departmentId: 1,
    departmentName: 'USP',
    sameDepartment: true,
    qualificationMatch: true,
    qualificationLevelSummary: 'USP操作: 4/3',
    sameShift: true,
    hasTimeConflict: false,
    hasUnavailabilityConflict: false,
    currentAssignmentCountInWindow: 0,
    score: 80,
    recommendationLevel: 'RECOMMENDED' as const,
    warnings: [],
  }],
  uncoveredVacancies: [],
  solverRepairProposal: {
    proposalId: 'repair-1',
    previewOnly: true as const,
    status: 'READY' as const,
    repairMode: 'MINIMAL_CHANGE' as const,
    coverageRate: 100,
    originalAssignmentStillValidCount: 0,
    changedAssignmentCount: 1,
    uncoveredVacancyCount: 0,
    overtimeRiskCount: 0,
    timeConflictCount: 0,
    solverRequestId: 'roster-repair-1',
    solverStatus: 'OPTIMAL',
    solverInvocation: {
      called: true,
      endpoint: 'http://localhost:5005/api/v4/solve',
      mode: 'solver_v4_preview_adapter' as const,
    },
    localRepairStrategy: 'Local assignment-only repair',
    assignmentChanges: [{
      changeId: 'change-9001-456',
      assignmentId: 9001,
      batchOperationPlanId: 7001,
      batchCode: 'B-001',
      operationName: '培养观察',
      plannedStart: '2026-06-12T09:00:00.000Z',
      plannedEnd: '2026-06-12T11:00:00.000Z',
      role: 'OPERATOR',
      positionNumber: 1,
      originalEmployeeId: 123,
      originalEmployeeCode: 'E123',
      originalEmployeeName: '张三',
      originalDepartmentId: 1,
      originalDepartmentName: 'USP',
      proposedEmployeeId: 456,
      proposedEmployeeCode: 'E456',
      proposedEmployeeName: '李四',
      proposedDepartmentId: 1,
      proposedDepartmentName: 'USP',
      sameDepartment: true,
      requiredQualificationNames: ['USP操作'],
      proposedEmployeeHasQualification: true,
      proposedEmployeeOnShift: true,
      proposedShiftPlanId: 8002,
      proposedShiftCode: 'DAY',
      hasTimeConflict: false,
      hasOvertimeRisk: false,
      changeReason: 'solver_v4 minimal-change local repair under temporary unavailable constraint',
      canApply: true,
    }],
    uncoveredVacancies: [],
    supervisorAttentionItems: [],
    capabilityGaps: [],
    applyAllowed: true,
  },
  summary: {
    impactedAssignmentCount: 1,
    impactedShiftPlanCount: 0,
    vacancyCount: 1,
    coveredByCandidateCount: 1,
    uncoveredCount: 0,
    solverChangedAssignmentCount: 1,
    solverUncoveredCount: 0,
    overtimeRiskCount: 0,
    timeConflictCount: 0,
    requiresSolverRerun: false,
    requiresSupervisorAction: false,
  },
  warnings: ['SKILL_REQUIREMENT_MISSING'],
};

const impactResponse = {
  ...previewResponse,
  exceptionId: 'impact-1',
  solverRepairProposal: {
    ...previewResponse.solverRepairProposal,
    proposalId: 'impact-1',
    status: 'IMPACT_ONLY' as const,
    coverageRate: 0,
    originalAssignmentStillValidCount: 0,
    changedAssignmentCount: 0,
    uncoveredVacancyCount: 0,
    overtimeRiskCount: 0,
    timeConflictCount: 0,
    solverRequestId: null,
    solverStatus: null,
    solverInvocation: {
      ...previewResponse.solverRepairProposal.solverInvocation,
      called: false,
    },
    localRepairStrategy: 'Impact analysis only',
    assignmentChanges: [],
    uncoveredVacancies: [],
    supervisorAttentionItems: ['已完成影响分析。请主管确认影响范围后再生成 solver_v4 修复方案。'],
    capabilityGaps: [],
    applyAllowed: false,
    applyDisabledReason: '先生成 Solver 修复方案',
  },
  summary: {
    ...previewResponse.summary,
    solverChangedAssignmentCount: 0,
    solverUncoveredCount: 0,
    overtimeRiskCount: 0,
    timeConflictCount: 0,
  },
};

const impactWithShiftPlansResponse = {
  ...impactResponse,
  impactedShiftPlans: [
    {
      shiftPlanId: 8001,
      employeeId: 123,
      planDate: '2026-06-12',
      shiftCode: 'DAY',
      shiftStart: '2026-06-12T08:00:00.000Z',
      shiftEnd: '2026-06-12T17:00:00.000Z',
      planState: 'PLANNED',
      isLocked: false,
    },
    {
      shiftPlanId: 8002,
      employeeId: 123,
      planDate: '2026-06-13',
      shiftCode: 'NIGHT',
      shiftStart: '2026-06-13T20:00:00.000Z',
      shiftEnd: '2026-06-14T08:00:00.000Z',
      planState: 'PLANNED',
      isLocked: true,
    },
  ],
  summary: {
    ...impactResponse.summary,
    impactedShiftPlanCount: 2,
  },
};

const solverFailedResponse = {
  ...previewResponse,
  exceptionId: 'solver-failed-1',
  solverRepairProposal: {
    ...previewResponse.solverRepairProposal,
    proposalId: 'repair-failed-1',
    status: 'SOLVER_FAILED' as const,
    coverageRate: 0,
    changedAssignmentCount: 0,
    uncoveredVacancyCount: 1,
    solverStatus: 'FAILED',
    assignmentChanges: [],
    uncoveredVacancies: [{
      vacancyId: 'vacancy-9001-1',
      assignmentId: 9001,
      batchOperationPlanId: 7001,
      batchCode: 'B-001',
      operationName: '培养观察',
      plannedStart: '2026-06-12T09:00:00.000Z',
      plannedEnd: '2026-06-12T11:00:00.000Z',
      role: 'OPERATOR',
      positionNumber: 1,
      requiredQualificationNames: ['USP操作'],
      reason: 'SOLVER_V4_PREVIEW_FAILED',
    }],
    supervisorAttentionItems: [],
    capabilityGaps: [{
      code: 'SOLVER_V4_PREVIEW_FAILED',
      message: 'Solver V4 preview failed: 500 Internal Server Error',
    }],
    applyAllowed: false,
    applyDisabledReason: 'Solver preview failed.',
  },
  summary: {
    ...previewResponse.summary,
    solverChangedAssignmentCount: 0,
    solverUncoveredCount: 1,
  },
};

const waitForCondition = async (condition: () => boolean, timeoutMs = 3500) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (condition()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
  }
  throw new Error('waitForCondition timeout');
};

const setNativeInputValue = (input: HTMLInputElement, value: string) => {
  const valueSetter = Object.getOwnPropertyDescriptor(input, 'value')?.set;
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set;

  if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(input, value);
    return;
  }

  valueSetter?.call(input, value);
};

describe('RosterExceptionRepair', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    class ResizeObserverMock {
      observe = jest.fn();
      unobserve = jest.fn();
      disconnect = jest.fn();
    }
    (window as any).ResizeObserver = ResizeObserverMock;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockEmployeeApi.getAll.mockResolvedValue({
      data: [{
        id: 123,
        employee_code: 'E123',
        employee_name: '张三',
        employment_status: 'ACTIVE',
      }],
    } as any);
    mockRosterExceptionApi.previewEmployeeUnavailable.mockImplementation((request: any) =>
      Promise.resolve(request.previewMode === 'IMPACT_ONLY' ? impactResponse : previewResponse) as any,
    );
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  const renderPage = async () => {
    await act(async () => {
      root.render(<RosterExceptionRepair />);
    });

    await waitForCondition(() => document.body.textContent?.includes('异常排班快速修复') ?? false);
  };

  const getGenerateButton = () => Array.from(document.querySelectorAll('button')).find((item) =>
    item.textContent?.includes('生成修复方案'),
  ) as HTMLButtonElement | undefined;

  const getAnalyzeButton = () => Array.from(document.querySelectorAll('button')).find((item) =>
    item.textContent?.includes('查看影响'),
  ) as HTMLButtonElement | undefined;

  const fillWindowFields = async () => {
    const dateInputs = Array.from(document.querySelectorAll('.roster-exception-window-picker input')) as HTMLInputElement[];
    expect(dateInputs).toHaveLength(2);

    await act(async () => {
      setNativeInputValue(dateInputs[0], '2026-06-12 08:00');
      dateInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      dateInputs[0].dispatchEvent(new Event('change', { bubbles: true }));
      dateInputs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      dateInputs[0].dispatchEvent(new Event('blur', { bubbles: true }));
      setNativeInputValue(dateInputs[1], '2026-06-12 20:00');
      dateInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      dateInputs[1].dispatchEvent(new Event('change', { bubbles: true }));
      dateInputs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      dateInputs[1].dispatchEvent(new Event('blur', { bubbles: true }));
    });

    await waitForCondition(() => {
      const button = getAnalyzeButton();
      return Boolean(button && !button.disabled);
    });
  };

  const fillWindowAndAnalyze = async () => {
    await fillWindowFields();
    const button = getAnalyzeButton();
    expect(button).toBeTruthy();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    await waitForCondition(() => Boolean(document.body.textContent?.includes('培养观察')));
  };

  const fillWindowAndPreview = async () => {
    await fillWindowAndAnalyze();
    const button = getGenerateButton();
    expect(button).toBeTruthy();
    expect(button?.disabled).toBe(false);

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    await waitForCondition(() => Boolean(document.body.textContent?.includes('已调用 solver_v4')));
  };

  it('renders the page controls', async () => {
    await renderPage();

    expect(document.body.textContent).toContain('异常排班快速修复');
    expect(document.body.textContent).toContain('先查看影响');
    expect(document.body.textContent).toContain('Team 筛选');
    expect(document.body.textContent).toContain('同 Team 替换');
  });

  it('views impact analysis before generating a solver repair proposal', async () => {
    await renderPage();
    await fillWindowAndAnalyze();

    expect(mockRosterExceptionApi.previewEmployeeUnavailable).toHaveBeenCalledWith(
      expect.objectContaining({
        exceptionType: 'EMPLOYEE_UNAVAILABLE',
        employeeId: 123,
        employeeIds: [123],
        repairMode: 'MINIMAL_CHANGE',
        previewMode: 'IMPACT_ONLY',
        protectLockedAssignments: true,
        protectDepartmentBoundary: true,
        allowOvertimeSuggestions: false,
        previewOnly: true,
      }),
      expect.objectContaining({
        signal: expect.any(Object),
      }),
    );
    expect(document.body.textContent).toContain('影响已识别');
    expect(document.body.textContent).toContain('下一步');

    const generateButton = getGenerateButton();
    expect(generateButton).toBeTruthy();
    expect(generateButton?.disabled).toBe(false);
  });

  it('renders affected shift plans as a calendar', async () => {
    mockRosterExceptionApi.previewEmployeeUnavailable.mockResolvedValue(impactWithShiftPlansResponse as any);

    await renderPage();
    await fillWindowAndAnalyze();

    expect(document.body.textContent).toContain('受影响班次日历');
    expect(document.body.textContent).toContain('2026年06月');
    expect(document.body.textContent).toContain('2 班次');
    expect(document.body.textContent).toContain('DAY');
    expect(document.body.textContent).toContain('NIGHT');
    expect(document.body.textContent).toContain('锁定');
  });

  it('can generate solver repair proposal only after impact analysis', async () => {
    await renderPage();
    await fillWindowFields();
    expect(getGenerateButton()?.disabled).toBe(true);

    await fillWindowAndPreview();

    expect(mockRosterExceptionApi.previewEmployeeUnavailable).toHaveBeenLastCalledWith(
      expect.objectContaining({
        exceptionType: 'EMPLOYEE_UNAVAILABLE',
        employeeId: 123,
        employeeIds: [123],
        repairMode: 'MINIMAL_CHANGE',
        previewMode: 'SOLVER_REPAIR',
        protectLockedAssignments: true,
        protectDepartmentBoundary: true,
        allowOvertimeSuggestions: false,
        previewOnly: true,
      }),
      expect.objectContaining({
        signal: expect.any(Object),
      }),
    );
  });

  it('shows success feedback after solver repair proposal generation', async () => {
    await renderPage();
    await fillWindowAndPreview();

    expect(document.body.textContent).toContain('修复方案生成完成');
    expect(document.body.textContent).toContain('solver_v4 已返回 1 条可检查的人员替换，覆盖率 100%。');
  });

  it('shows failure feedback when solver repair returns a failed proposal status', async () => {
    mockRosterExceptionApi.previewEmployeeUnavailable.mockImplementation((request: any) =>
      Promise.resolve(request.previewMode === 'IMPACT_ONLY' ? impactResponse : solverFailedResponse) as any,
    );

    await renderPage();
    await fillWindowAndPreview();

    expect(document.body.textContent).toContain('修复方案生成失败');
    expect(document.body.textContent).toContain('solver_v4 返回失败，本次未生成可应用修复方案。');
    expect(document.body.textContent).toContain('Solver V4 preview failed: 500 Internal Server Error');
  });

  it('shows summary cards from preview result', async () => {
    await renderPage();
    await fillWindowAndPreview();

    expect(document.body.textContent).toContain('本方案共调整');
    expect(document.body.textContent).toContain('直接顶替');
    expect(document.body.textContent).toContain('无法覆盖');
  });

  it('merges impacted assignments and released demand into one detail row', async () => {
    await renderPage();
    await fillWindowAndAnalyze();

    const headerTexts = Array.from(document.querySelectorAll('th')).map((item) =>
      item.textContent?.trim(),
    );
    expect(headerTexts.filter((text) => text === '当前员工')).toHaveLength(1);
    expect(headerTexts.filter((text) => text === '释放岗位')).toHaveLength(1);
    expect(headerTexts.filter((text) => text === '影响状态')).toHaveLength(1);

    const mergedImpactRow = Array.from(document.querySelectorAll('tr')).find((row) => {
      const rowText = row.textContent ?? '';
      return rowText.includes('张三 (E123)')
        && rowText.includes('OPERATOR #1')
        && rowText.includes('USP操作')
        && rowText.includes('USP')
        && rowText.includes('待修复');
    });
    expect(mergedImpactRow).toBeTruthy();
  });

  it('shows vacancy rows', async () => {
    await renderPage();
    await fillWindowAndPreview();

    expect(document.body.textContent).toContain('B-001');
    expect(document.body.textContent).toContain('培养观察');
  });

  it('groups solver changes into 直接顶替/连带调整 and enables 整套应用', async () => {
    await renderPage();
    await fillWindowAndPreview();

    expect(document.body.textContent).toContain('Solver 修复方案');
    expect(document.body.textContent).toContain('已调用 solver_v4');
    // 分组评审区：两组段头都应渲染(连带重排为空时仍显示段头)
    expect(document.body.textContent).toContain('直接顶替');
    expect(document.body.textContent).toContain('连带调整');
    // 张三(123) 是不可用者 → 替补李四落入「直接顶替」组
    expect(document.body.textContent).toContain('李四');

    // 全有或全无：应用按钮为「整套应用」，不再依赖逐条勾选
    const applyButton = Array.from(document.querySelectorAll('button')).find((item) =>
      item.textContent?.includes('整套应用') && !item.disabled,
    ) as HTMLButtonElement | undefined;
    expect(applyButton).toBeTruthy();
  });

  it('shows visible progress while generating solver proposal', async () => {
    let resolvePreview: (value: typeof previewResponse) => void = () => undefined;
    mockRosterExceptionApi.previewEmployeeUnavailable.mockImplementation((request: any) => {
      if (request.previewMode === 'IMPACT_ONLY') return Promise.resolve(impactResponse) as any;
      return new Promise((resolve) => {
        resolvePreview = resolve;
      }) as any;
    });

    await renderPage();
    await fillWindowAndAnalyze();

    const button = getGenerateButton();
    expect(button).toBeTruthy();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain('正在生成 Solver 修复方案');
    expect(document.body.textContent).toContain('冻结未受影响 assignment');
    expect(document.body.textContent).toContain('调用 solver_v4');

    await act(async () => {
      resolvePreview(previewResponse);
      await Promise.resolve();
    });

    await waitForCondition(() => Boolean(document.body.textContent?.includes('培养观察')));
  });

  it('clears impact progress when the impact request times out', async () => {
    mockRosterExceptionApi.previewEmployeeUnavailable.mockRejectedValueOnce({
      code: 'ECONNABORTED',
      message: 'timeout of 15000ms exceeded',
    } as any);

    await renderPage();
    await fillWindowFields();

    const button = getAnalyzeButton();
    expect(button).toBeTruthy();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    await waitForCondition(() =>
      Boolean(document.body.textContent?.includes('查看影响超过 15 秒未返回')),
    );

    expect(document.body.textContent).not.toContain('正在查看影响范围');
    expect(getAnalyzeButton()?.disabled).toBe(false);
  });

  it('cancels stale impact requests when inputs change', async () => {
    let capturedSignal: AbortSignal | undefined;
    mockRosterExceptionApi.previewEmployeeUnavailable.mockImplementation((_request: any, options: any) => {
      capturedSignal = options?.signal;
      return new Promise(() => undefined) as any;
    });

    await renderPage();
    await fillWindowFields();

    const button = getAnalyzeButton();
    expect(button).toBeTruthy();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain('正在查看影响范围');

    const maxCoverageButton = Array.from(document.querySelectorAll('button')).find((item) =>
      item.textContent?.includes('最大覆盖'),
    ) as HTMLButtonElement | undefined;
    expect(maxCoverageButton).toBeTruthy();

    await act(async () => {
      maxCoverageButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(capturedSignal?.aborted).toBe(true);
    expect(document.body.textContent).not.toContain('正在查看影响范围');
    expect(document.body.textContent).not.toContain('操作失败');
  });

  it('shows warning panel', async () => {
    await renderPage();
    await fillWindowAndPreview();

    expect(document.body.textContent).toContain('SKILL_REQUIREMENT_MISSING');
    expect(document.body.textContent).toContain('岗位资质规则缺失');
  });
});

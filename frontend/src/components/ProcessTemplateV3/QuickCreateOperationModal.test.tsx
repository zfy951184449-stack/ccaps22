import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import QuickCreateOperationModal from './QuickCreateOperationModal';

jest.mock('../../services', () => ({
  processTemplateV2Api: {
    getNextOperationCode: jest.fn(),
    listOperationTypes: jest.fn(),
    listAvailableQualifications: jest.fn(),
    setOperationPositionQualifications: jest.fn(),
    createOperationLibraryItem: jest.fn(),
    createStageOperationFromCanvas: jest.fn(),
  },
}));

const { processTemplateV2Api: mockProcessTemplateV2Api } = jest.requireMock('../../services');

const stage = {
  id: 1,
  template_id: 100,
  stage_code: 'TF',
  stage_name: 'TF-stage',
  stage_order: 1,
  start_day: 0,
  description: null,
};

const operationLibrary = [
  {
    id: 10,
    operation_code: 'OP-010',
    operation_name: '接种准备',
    standard_time: 4,
    required_people: 2,
    description: null,
    operation_type_id: null,
    operation_type_code: null,
    operation_type_name: null,
    operation_type_color: null,
    team_id: 2,
    team_code: 'USP',
    team_name: 'USP团队',
  },
  {
    id: 11,
    operation_code: 'OP-011',
    operation_name: '培养',
    standard_time: 6,
    required_people: 3,
    description: null,
    operation_type_id: null,
    operation_type_code: null,
    operation_type_name: null,
    operation_type_color: null,
    team_id: 3,
    team_code: 'DSP',
    team_name: 'DSP团队',
  },
  {
    id: 12,
    operation_code: 'OP-012',
    operation_name: '历史未归属操作',
    standard_time: 2,
    required_people: 1,
    description: null,
    operation_type_id: null,
    operation_type_code: null,
    operation_type_name: null,
    operation_type_color: null,
    team_id: null,
    team_code: null,
    team_name: null,
  },
];

type ModalProps = React.ComponentProps<typeof QuickCreateOperationModal>;

const defaultProps: ModalProps = {
  open: true,
  templateId: 100,
  templateName: '测试模板',
  templateTeamId: 2,
  templateTeamName: 'USP团队',
  stages: [stage],
  operations: [],
  resourceNodes: [],
  operationLibrary,
  capabilities: {
    resourceRulesEnabled: true,
    constraintEditEnabled: true,
    shareGroupEnabled: true,
  },
  context: {
    source: 'canvas',
    stageId: 1,
    absoluteStartHour: 21,
    operationDay: 0,
    recommendedTime: 21,
    recommendedDayOffset: 0,
  },
  onCancel: jest.fn(),
  onCreated: jest.fn().mockResolvedValue(undefined),
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

const dispatchClick = async (target: HTMLElement | null) => {
  expect(target).toBeTruthy();
  await act(async () => {
    target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
};

const setInputValue = async (target: HTMLInputElement | HTMLTextAreaElement | null, value: string) => {
  expect(target).toBeTruthy();
  const descriptor = Object.getOwnPropertyDescriptor(
    target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    'value',
  );
  await act(async () => {
    descriptor?.set?.call(target, value);
    target?.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
  });
};

const findButtonByText = (text: string) =>
  Array.from(document.querySelectorAll('button')).find((node) => node.textContent?.trim() === text) as HTMLElement | undefined;

describe('QuickCreateOperationModal', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    mockProcessTemplateV2Api.getNextOperationCode.mockResolvedValue('OP-999');
    mockProcessTemplateV2Api.listOperationTypes.mockResolvedValue([]);
    mockProcessTemplateV2Api.listAvailableQualifications.mockResolvedValue([
      { id: 1, qualification_name: '基础上岗' },
      { id: 2, qualification_name: 'SUB反应器' },
    ]);
    mockProcessTemplateV2Api.setOperationPositionQualifications.mockResolvedValue(undefined);
    mockProcessTemplateV2Api.createOperationLibraryItem.mockResolvedValue({
      ...operationLibrary[0],
      id: 77,
      operation_name: '新建缓冲液配制',
    });
    mockProcessTemplateV2Api.createStageOperationFromCanvas.mockResolvedValue(9001);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  const renderModal = async (props: Partial<ModalProps> = {}) => {
    await act(async () => {
      root.render(<QuickCreateOperationModal {...defaultProps} {...props} />);
    });
    await waitForCondition(() => Boolean(document.body.textContent?.includes('选择操作')));
  };

  it('closes without writing when canceled', async () => {
    await renderModal();

    await dispatchClick(findButtonByText('取消') ?? null);

    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
    expect(mockProcessTemplateV2Api.createStageOperationFromCanvas).not.toHaveBeenCalled();
    expect(mockProcessTemplateV2Api.createOperationLibraryItem).not.toHaveBeenCalled();
  });

  it('defaults operation library filtering to the template team', async () => {
    await renderModal();

    expect(document.body.textContent).toContain('USP团队（当前模板）');
    expect(document.querySelector('[data-testid="quick-operation-item-10"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="quick-operation-item-11"]')).toBeNull();
    expect(document.querySelector('[data-testid="quick-operation-item-12"]')).toBeNull();
  });

  it('falls back to unassigned legacy operations when the template team has no library items', async () => {
    await renderModal({
      operationLibrary: [operationLibrary[1], operationLibrary[2]],
    });

    expect(document.body.textContent).toContain('USP团队（当前模板）');
    expect(document.querySelector('[data-testid="quick-operation-item-12"]')).toBeTruthy();
    expect(document.body.textContent).toContain('未归属团队');
    expect(document.querySelector('[data-testid="quick-operation-item-11"]')).toBeNull();
  });

  it('creates a scheduled operation from an existing library item', async () => {
    await renderModal();

    await dispatchClick(document.querySelector('[data-testid="quick-operation-item-10"]') as HTMLElement | null);
    await dispatchClick(findButtonByText('创建操作') ?? null);

    await waitForCondition(() => mockProcessTemplateV2Api.createStageOperationFromCanvas.mock.calls.length === 1);

    expect(mockProcessTemplateV2Api.createStageOperationFromCanvas).toHaveBeenCalledWith(100, {
      stageId: 1,
      operationId: 10,
      resourceNodeId: null,
      operationDay: 0,
      recommendedTime: 21,
      recommendedDayOffset: 0,
      windowStartTime: 19,
      windowStartDayOffset: 0,
      windowEndTime: 1,
      windowEndDayOffset: 1,
      absoluteStartHour: 21,
    });
    expect(defaultProps.onCreated).toHaveBeenCalledWith({
      scheduleId: 9001,
      stageId: 1,
      openAdvanced: false,
      initialAdvancedTab: undefined,
    });
  });

  it('creates operation master data before scheduling a new operation', async () => {
    await renderModal();

    await dispatchClick(findButtonByText('新建主数据') ?? null);
    await setInputValue(
      document.querySelector('input[placeholder="例如：缓冲液配制"]') as HTMLInputElement | null,
      '新建缓冲液配制',
    );
    await dispatchClick(findButtonByText('创建操作') ?? null);

    await waitForCondition(() => mockProcessTemplateV2Api.createOperationLibraryItem.mock.calls.length === 1);
    await waitForCondition(() => mockProcessTemplateV2Api.createStageOperationFromCanvas.mock.calls.length === 1);

    expect(mockProcessTemplateV2Api.createOperationLibraryItem).toHaveBeenCalledWith({
      operationName: '新建缓冲液配制',
      standardTime: 2,
      requiredPeople: 1,
      operationTypeId: null,
      description: undefined,
    });
    expect(mockProcessTemplateV2Api.setOperationPositionQualifications).not.toHaveBeenCalled();
    expect(mockProcessTemplateV2Api.createStageOperationFromCanvas.mock.calls[0][1].operationId).toBe(77);
  });

  it('shows qualification editing in the new master data tab', async () => {
    await renderModal();

    await dispatchClick(findButtonByText('新建主数据') ?? null);

    expect(document.body.textContent).toContain('资质要求');
    expect(document.body.textContent).toContain('添加资质');
    expect(document.body.textContent).not.toContain('创建后维护');
  });
});

import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import TemplateOperationCreateModal from './TemplateOperationCreateModal';

jest.mock('react-virtualized-auto-sizer', () => ({
  __esModule: true,
  default: ({ children }: { children: (size: { width: number; height: number }) => React.ReactNode }) =>
    children({ width: 760, height: 320 }),
}));

jest.mock('../../services', () => ({
  processTemplateV2Api: {
    getNextOperationCode: jest.fn(),
    listOperationTypes: jest.fn(),
    listResources: jest.fn(),
    createOperationLibraryItem: jest.fn(),
    createStageOperationFromCanvas: jest.fn(),
    updateTemplateStageOperationResources: jest.fn(),
    createConstraint: jest.fn(),
    assignOperationToShareGroup: jest.fn(),
    createTemplateShareGroup: jest.fn(),
  },
}));

const { processTemplateV2Api: mockProcessTemplateV2Api } = jest.requireMock('../../services');

const STORAGE_KEY = 'process-template-v2-create-operation:100';

const createSavedConfig = (recentOperationIds: number[]) => ({
  placementDraft: {
    stageId: 1,
    resourceNodeId: null,
  },
  timingDraft: {
    operationDay: 0,
    recommendedTime: 9,
    recommendedDayOffset: 0,
    durationHours: 4,
    windowMode: 'auto',
    windowStartTime: 7,
    windowStartDayOffset: 0,
    windowEndTime: 13,
    windowEndDayOffset: 0,
  },
  rulesDraft: {
    requirements: [],
  },
  shareGroupDraft: {
    assignGroupId: null,
    createNew: false,
  },
  sourceDraft: {
    mode: 'existing',
    operationTypeId: null,
  },
  recentOperationIds,
});

const stage = {
  id: 1,
  template_id: 100,
  stage_code: 'S1',
  stage_name: '阶段一',
  stage_order: 1,
  start_day: 0,
  description: null,
};

const operationLibrary = [
  {
    id: 1,
    operation_code: 'OP-001',
    operation_name: '接种',
    standard_time: 4,
    required_people: 2,
    description: null,
    operation_type_id: null,
    operation_type_code: null,
    operation_type_name: null,
    operation_type_color: null,
  },
  {
    id: 2,
    operation_code: 'OP-002',
    operation_name: '培养',
    standard_time: 6,
    required_people: 3,
    description: null,
    operation_type_id: null,
    operation_type_code: null,
    operation_type_name: null,
    operation_type_color: null,
  },
];

type ModalProps = React.ComponentProps<typeof TemplateOperationCreateModal>;

const defaultProps: ModalProps = {
  open: true,
  templateId: 100,
  templateName: '测试模板',
  templateTeamId: null,
  stages: [stage],
  operations: [],
  resourceNodes: [],
  operationLibrary,
  shareGroups: [],
  capabilities: {
    resourceRulesEnabled: false,
    constraintEditEnabled: true,
    shareGroupEnabled: false,
  },
  context: null,
  onCancel: jest.fn(),
  onCreated: jest.fn().mockResolvedValue(undefined),
};

const waitForCondition = async (condition: () => boolean, timeoutMs = 3500) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (condition()) {
      return;
    }
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

const dispatchKeyDown = async (
  target: HTMLElement | null,
  payload: { key: string; code?: string; ctrlKey?: boolean; metaKey?: boolean },
) => {
  expect(target).toBeTruthy();
  await act(async () => {
    target?.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: payload.key,
        code: payload.code ?? payload.key,
        ctrlKey: payload.ctrlKey,
        metaKey: payload.metaKey,
        bubbles: true,
      }),
    );
    await Promise.resolve();
  });
};

const clickSegmentedItem = async (label: string) => {
  const item = Array.from(document.querySelectorAll('.ant-segmented-item')).find((node) =>
    node.textContent?.includes(label),
  ) as HTMLElement | undefined;
  await dispatchClick(item ?? null);
};

describe('TemplateOperationCreateModal', () => {
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
    mockProcessTemplateV2Api.listResources.mockResolvedValue([]);
    mockProcessTemplateV2Api.createStageOperationFromCanvas.mockResolvedValue(9001);
    mockProcessTemplateV2Api.updateTemplateStageOperationResources.mockResolvedValue(undefined);
    mockProcessTemplateV2Api.createConstraint.mockResolvedValue(undefined);
    mockProcessTemplateV2Api.assignOperationToShareGroup.mockResolvedValue(undefined);
    mockProcessTemplateV2Api.createTemplateShareGroup.mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  const renderModal = async (props: Partial<ModalProps> = {}) => {
    await act(async () => {
      root.render(<TemplateOperationCreateModal {...defaultProps} {...props} />);
    });

    await waitForCondition(() => Boolean(document.body.textContent?.includes('工序来源')));
  };

  it('does not create operation when pressing Enter in search input', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(createSavedConfig([1])));
    await renderModal();

    const searchInput = document.querySelector(
      'input[placeholder="按工序编码或工序名称搜索"]',
    ) as HTMLInputElement | null;
    expect(searchInput).toBeTruthy();

    await dispatchKeyDown(searchInput, { key: 'Enter', code: 'Enter' });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockProcessTemplateV2Api.createStageOperationFromCanvas).not.toHaveBeenCalled();
  });

  it('creates operation with Ctrl+Enter shortcut', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(createSavedConfig([1])));
    await renderModal();

    const searchInput = document.querySelector(
      'input[placeholder="按工序编码或工序名称搜索"]',
    ) as HTMLInputElement | null;
    expect(searchInput).toBeTruthy();

    await dispatchKeyDown(searchInput, { key: 'Enter', code: 'Enter', ctrlKey: true });

    await waitForCondition(() => mockProcessTemplateV2Api.createStageOperationFromCanvas.mock.calls.length === 1);
  });

  it('shows hidden-selection hint and can switch filter to all', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(createSavedConfig([1])));
    await renderModal({
      operations: [
        {
          id: 101,
          stage_id: 1,
          operation_id: 2,
          operation_code: 'OP-002',
          operation_name: '培养',
          operation_day: 0,
          recommended_time: 9,
          operation_order: 1,
          stage_name: '阶段一',
          stage_order: 1,
          stage_start_day: 0,
          defaultResourceNodeId: null,
          defaultResourceNodeName: null,
          defaultResourceId: null,
          defaultResourceCode: null,
          bindingStatus: 'UNBOUND',
          bindingReason: null,
        } as any,
      ],
    });

    expect(document.body.textContent).toContain('隐藏了已选工艺');

    const switchButton = Array.from(document.querySelectorAll('button')).find((node) => node.textContent?.includes('切到全部'));
    expect(switchButton).toBeTruthy();
    await dispatchClick((switchButton as HTMLElement) ?? null);

    await waitForCondition(() => !document.body.textContent?.includes('隐藏了已选工艺'));
  });

  it('disables department filter when no resource node is selected', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(createSavedConfig([1])));
    await renderModal();

    const departmentItem = Array.from(document.querySelectorAll('.ant-segmented-item')).find((node) =>
      node.textContent?.includes('同部门域'),
    ) as HTMLElement | undefined;
    expect(departmentItem).toBeTruthy();
    expect(departmentItem?.className).toContain('ant-segmented-item-disabled');
  });

  it('updates recent filter immediately after save and continue', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(createSavedConfig([1])));
    await renderModal();

    const secondOperation = document.querySelector('[data-testid="operation-list-item-2"]') as HTMLElement | null;
    expect(secondOperation).toBeTruthy();
    await dispatchClick(secondOperation);
    await waitForCondition(() => Boolean(document.body.textContent?.includes('当前已选工艺')));
    await waitForCondition(() => Boolean(document.body.textContent?.includes('培养')));

    const keepOpenButton = Array.from(document.querySelectorAll('button')).find((node) =>
      node.textContent?.includes('保存并继续创建'),
    );
    expect(keepOpenButton).toBeTruthy();
    await dispatchClick((keepOpenButton as HTMLElement) ?? null);

    await waitForCondition(() => mockProcessTemplateV2Api.createStageOperationFromCanvas.mock.calls.length === 1);

    await clickSegmentedItem('最近使用');
    await waitForCondition(() => Boolean(document.querySelector('[data-testid="operation-list-item-2"]')));

    const persisted = window.localStorage.getItem(STORAGE_KEY);
    expect(persisted).toBeTruthy();
    const parsed = JSON.parse(persisted!);
    expect(parsed.recentOperationIds[0]).toBe(2);
  });
});

import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

jest.mock('../services/platformApi', () => ({
  platformApi: {
    getProjects: jest.fn(),
    getProjectById: jest.fn(),
    getProjectTimeline: jest.fn(),
    updateOperationPlan: jest.fn(),
    updateOperationResourceBinding: jest.fn(),
  },
  operationResourceRequirementsApi: {
    list: jest.fn(),
  },
  resourcesApi: {
    list: jest.fn(),
  },
}));

const {
  platformApi: mockPlatformApi,
  operationResourceRequirementsApi: mockOperationResourceRequirementsApi,
  resourcesApi: mockResourcesApi,
} = jest.requireMock('../services/platformApi');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ProjectPlanningCenterPage = require('./ProjectPlanningCenterPage').default;

describe('ProjectPlanningCenterPage', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    jest.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('loads project timeline and opens operation edit drawer on double click', async () => {
    mockPlatformApi.getProjects.mockResolvedValue([
      {
        id: 'legacy:P-001',
        projectCode: 'P-001',
        projectName: 'Project 1',
        plannedStartDate: '2026-03-01',
        plannedEndDate: '2026-03-10',
        batchCount: 1,
        activatedBatchCount: 1,
        teamCount: 1,
        departmentCodes: ['USP'],
        missingResourceRequirementCount: 1,
      },
    ]);
    mockResourcesApi.list.mockResolvedValue([
      {
        id: 1,
        resourceCode: 'EQ-001',
        resourceName: 'Bioreactor-1',
        resourceType: 'EQUIPMENT',
        departmentCode: 'USP',
        ownerOrgUnitId: null,
        status: 'ACTIVE',
        capacity: 1,
        location: null,
        cleanLevel: null,
        isShared: false,
        isSchedulable: true,
        metadata: null,
      },
    ]);
    mockPlatformApi.getProjectById.mockResolvedValue({
      project: {
        id: 'legacy:P-001',
        projectCode: 'P-001',
        projectName: 'Project 1',
        plannedStartDate: '2026-03-01',
        plannedEndDate: '2026-03-10',
        batchCount: 1,
        activatedBatchCount: 1,
        teamCount: 1,
        departmentCodes: ['USP'],
        missingResourceRequirementCount: 1,
      },
      batches: [
        {
          id: 11,
          batchCode: 'B-001',
          batchName: 'Batch 1',
          planStatus: 'ACTIVATED',
          plannedStartDate: '2026-03-01',
          plannedEndDate: '2026-03-10',
        },
      ],
      operationsSummary: {
        totalOperations: 1,
        missingResourceRequirementCount: 1,
      },
    });
    mockPlatformApi.getProjectTimeline.mockResolvedValue({
      project: {
        id: 'legacy:P-001',
        projectCode: 'P-001',
        projectName: 'Project 1',
        plannedStartDate: '2026-03-01',
        plannedEndDate: '2026-03-10',
      },
      lanes: [{ id: 'lane-1', label: 'B-001 / Stage A', groupLabel: 'B-001', domainCode: 'USP', laneType: 'OPERATION' }],
      items: [
        {
          id: 'operation-1',
          laneId: 'lane-1',
          itemType: 'OPERATION',
          title: 'Inoculation',
          subtitle: 'OP-001 · B-001',
          startDatetime: '2026-03-01 08:00:00',
          endDatetime: '2026-03-01 12:00:00',
          color: '#52c41a',
          status: 'ACTIVATED',
          metadata: { operationPlanId: 1, operationId: 101, notes: 'note' },
        },
      ],
      dependencies: [],
      conflicts: [],
      windowStart: '2026-03-01 00:00:00',
      windowEnd: '2026-03-02 00:00:00',
    });
    mockOperationResourceRequirementsApi.list.mockResolvedValue([
      {
        id: 1,
        operationId: 101,
        operationCode: 'OP-001',
        operationName: 'Inoculation',
        resourceType: 'EQUIPMENT',
        requiredCount: 1,
        isMandatory: true,
        requiresExclusiveUse: true,
        prepMinutes: 0,
        changeoverMinutes: 0,
        cleanupMinutes: 0,
        candidateResourceIds: [1],
        candidateResources: [{ id: 1, resourceCode: 'EQ-001', resourceName: 'Bioreactor-1', resourceType: 'EQUIPMENT' }],
      },
    ]);

    await act(async () => {
      root.render(
        <MemoryRouter>
          <ProjectPlanningCenterPage />
        </MemoryRouter>,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('P-001');

    const ganttTab = Array.from(container.querySelectorAll('[role="tab"]')).find((node) => node.textContent?.includes('项目甘特'));
    expect(ganttTab).toBeTruthy();
    await act(async () => {
      ganttTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Inoculation');

    const operationNode = container.querySelector('.platform-timeline-item');
    expect(operationNode).toBeTruthy();
    await act(async () => {
      operationNode?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain('平台内直接改排');
  });
});

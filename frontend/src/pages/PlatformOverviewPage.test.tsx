import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

jest.mock('../services/platformApi', () => ({
  platformApi: {
    getOverview: jest.fn(),
    getConflicts: jest.fn(),
    getConflictDetail: jest.fn(),
    getRunDetail: jest.fn(),
  },
}));

const { platformApi: mockPlatformApi } = jest.requireMock('../services/platformApi');

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PlatformOverviewPage = require('./PlatformOverviewPage').default;

describe('PlatformOverviewPage', () => {
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

  it('loads overview data and opens conflict detail drawer', async () => {
    mockPlatformApi.getOverview.mockResolvedValue({
      projectCount: 3,
      activeBatchCount: 5,
      resourceCount: 2,
      resourceConflictCount: 1,
      personnelConflictCount: 0,
      maintenanceBlockCount: 1,
      missingMasterDataCount: 2,
      ruleCoverageRate: 0.6,
      departments: [{ departmentCode: 'USP', resourceCount: 2 }],
      recentRuns: [],
      readiness: [
        {
          domainCode: 'USP',
          projectCount: 3,
          resourceCount: 2,
          resourceRequirementCoverage: 0.8,
          candidateBindingCoverage: 0.5,
          conflictCount: 2,
          maintenanceBlockCount: 1,
          readinessStatus: 'AT_RISK',
        },
      ],
      topResources: [],
      topProjects: [],
      warnings: [],
    });
    mockPlatformApi.getConflicts.mockResolvedValue([
      {
        id: 'missing-resource-1',
        conflictType: 'MISSING_MASTER_DATA',
        severity: 'HIGH',
        title: '操作缺少资源需求定义',
        departmentCode: 'USP',
        projectCode: 'P-001',
        resourceName: null,
        resourceId: null,
        employeeName: null,
        windowStart: '2026-03-01 08:00:00',
        windowEnd: '2026-03-01 12:00:00',
        details: 'detail',
      },
    ]);
    mockPlatformApi.getConflictDetail.mockResolvedValue({
      id: 'missing-resource-1',
      conflictType: 'MISSING_MASTER_DATA',
      severity: 'HIGH',
      title: '操作缺少资源需求定义',
      departmentCode: 'USP',
      projectCode: 'P-001',
      resourceName: null,
      resourceId: null,
      employeeName: null,
      windowStart: '2026-03-01 08:00:00',
      windowEnd: '2026-03-01 12:00:00',
      details: 'detail',
      relatedProjects: [{ projectCode: 'P-001' }],
      relatedBatches: [],
      relatedOperations: [],
      relatedResources: [],
      relatedMaintenanceWindows: [],
      recommendedRoutes: [],
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <PlatformOverviewPage />
        </MemoryRouter>,
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('项目数');
    expect(container.textContent).toContain('操作缺少资源需求定义');

    const conflictButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('操作缺少资源需求定义'),
    );
    expect(conflictButton).toBeTruthy();

    await act(async () => {
      conflictButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain('冲突详情');
    expect(document.body.textContent).toContain('P-001');
  });
});

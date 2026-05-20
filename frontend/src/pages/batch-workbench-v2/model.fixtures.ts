import type { WorkbenchBatch, WorkbenchTemplate, WorkbenchTemplateOperation } from './model';

export const TEST_FIXTURE_BATCHES: WorkbenchBatch[] = [
  {
    id: 1001,
    batchCode: 'DS-2026-0501',
    batchStatus: 'ACTIVATED',
    plannedStart: '2026-05-11T08:00:00+08:00',
    plannedEnd: '2026-05-16T18:00:00+08:00',
    templateSource: 'TEST_FIXTURE',
    upstreamTemplateId: 201,
    downstreamTemplateId: 301,
    scheduleStatus: '当前 assignment 部分覆盖',
    solveStatus: '待 preview',
  },
  {
    id: 1002,
    batchCode: 'DS-2026-0502',
    batchStatus: 'DRAFT',
    plannedStart: '2026-05-18T08:00:00+08:00',
    plannedEnd: '2026-05-23T18:00:00+08:00',
    templateSource: 'TEST_FIXTURE',
    upstreamTemplateId: 202,
    downstreamTemplateId: 302,
    scheduleStatus: '未生成',
    solveStatus: '未运行',
  },
];

export const TEST_FIXTURE_TEMPLATES: WorkbenchTemplate[] = [
  {
    id: 201,
    templateCode: 'USP-HARVEST-A',
    templateName: 'USP Harvest Template A',
    domain: 'USP',
    sourceLabel: 'TEST_FIXTURE',
    operations: [
      buildTemplateOperation(1, 'Seed Expansion', 'USP Seed', 1, 0, 12, 2, 2, ['USP-01', 'USP-02']),
      buildTemplateOperation(2, 'Production Bioreactor Feed', 'USP Production', 2, 24, 16, 3, 3, ['USP-03', 'USP-04', 'USP-05']),
      buildTemplateOperation(3, 'Harvest / Clarification End', 'USP Harvest', 3, 52, 8, 3, 2, ['USP-06', 'USP-07'], true),
    ],
  },
  {
    id: 202,
    templateCode: 'USP-HARVEST-B',
    templateName: 'USP Harvest Template B',
    domain: 'USP',
    sourceLabel: 'TEST_FIXTURE',
    operations: [
      buildTemplateOperation(11, 'Seed Train Review', 'USP Seed', 1, 0, 8, 2, 1, ['USP-08']),
      buildTemplateOperation(12, 'Clarification End', 'USP Harvest', 2, 30, 10, 3, 2, ['USP-09', 'USP-10']),
    ],
  },
  {
    id: 301,
    templateCode: 'DSP-CAPTURE-A',
    templateName: 'DSP Capture Template A',
    domain: 'DSP',
    sourceLabel: 'TEST_FIXTURE',
    operations: [
      buildTemplateOperation(101, 'Capture Start', 'DSP Capture', 10, 0, 10, 3, 2, ['DSP-01', 'DSP-02']),
      buildTemplateOperation(102, 'Viral Inactivation Hold', 'DSP VI', 11, 12, 6, 2, 1, ['DSP-03']),
      buildTemplateOperation(103, 'Polishing Chromatography', 'DSP Polishing', 12, 24, 12, 3, 2, ['DSP-04', 'DSP-05']),
      buildTemplateOperation(104, 'UF/DF Concentration', 'DSP UF/DF', 13, 40, 10, 3, 2, ['DSP-06', 'DSP-07']),
    ],
  },
  {
    id: 302,
    templateCode: 'DSP-CAPTURE-B',
    templateName: 'DSP Capture Template B',
    domain: 'DSP',
    sourceLabel: 'TEST_FIXTURE',
    operations: [
      buildTemplateOperation(111, 'Capture Start', 'DSP Capture', 10, 0, 8, 2, 1, ['DSP-08']),
      buildTemplateOperation(112, 'UF/DF Final', 'DSP UF/DF', 11, 18, 10, 3, 2, ['DSP-09', 'DSP-10']),
    ],
  },
];

function buildTemplateOperation(
  templateOperationId: number,
  operationName: string,
  stageName: string,
  stageOrder: number,
  offsetHours: number,
  durationHours: number,
  requiredPeople: number,
  assignedPeople: number,
  currentAssignments: string[],
  locked = false,
): WorkbenchTemplateOperation {
  return {
    templateOperationId,
    operationName,
    stageName,
    stageOrder,
    sequence: templateOperationId,
    offsetHours,
    durationHours,
    requiredPeople,
    assignedPeople,
    currentAssignments,
    locked,
  };
}

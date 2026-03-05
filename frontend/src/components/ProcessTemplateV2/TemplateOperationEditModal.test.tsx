import { validateOperationCoreDraft } from './OperationCoreForm';

describe('TemplateOperationEditModal validation', () => {
  it('blocks save when window start is after window end', () => {
    const result = validateOperationCoreDraft({
      draft: {
        stageId: 10,
        resourceNodeId: 100,
        operationDay: 0,
        recommendedTime: 9,
        recommendedDayOffset: 0,
        windowMode: 'manual',
        windowStartTime: 12,
        windowStartDayOffset: 0,
        windowEndTime: 10,
        windowEndDayOffset: 0,
      },
      stageStartDay: 0,
      requireStage: true,
      warnUnbound: true,
    });

    expect(result.errors).toContain('时间窗开始不能晚于时间窗结束');
  });

  it('treats unbound resource as warning in edit flow', () => {
    const result = validateOperationCoreDraft({
      draft: {
        stageId: 10,
        resourceNodeId: null,
        operationDay: 0,
        recommendedTime: 9,
        recommendedDayOffset: 0,
        windowMode: 'manual',
        windowStartTime: 8,
        windowStartDayOffset: 0,
        windowEndTime: 12,
        windowEndDayOffset: 0,
      },
      stageStartDay: 0,
      requireStage: true,
      warnUnbound: true,
    });

    expect(result.errors.length).toBe(0);
    expect(result.warnings).toContain('当前工序未绑定默认资源节点');
  });
});

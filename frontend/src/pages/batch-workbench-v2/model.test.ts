import dayjs from 'dayjs';
import {
  buildPreviewTimeline,
  composeTimeline,
  createExceptionDraft,
  findDefaultHandoffOperation,
} from './model';
import { TEST_FIXTURE_BATCHES, TEST_FIXTURE_TEMPLATES } from './model.fixtures';

describe('Batch Management Workbench V2 model', () => {
  it('combines upstream and downstream templates into one DS timeline without mutating templates', () => {
    const batch = TEST_FIXTURE_BATCHES[0];
    const upstreamTemplate = TEST_FIXTURE_TEMPLATES[0];
    const downstreamTemplate = TEST_FIXTURE_TEMPLATES[2];
    const sourceOperationId = findDefaultHandoffOperation(upstreamTemplate, 'USP');
    const targetOperationId = findDefaultHandoffOperation(downstreamTemplate, 'DSP');

    const result = composeTimeline(batch, upstreamTemplate, downstreamTemplate, {
      upstreamOperationId: sourceOperationId,
      downstreamOperationId: targetOperationId,
      rule: 'immediate_handoff',
      manualOffsetHours: 0,
      manualAnchor: null,
    });

    const source = result.operations.find((operation) => operation.id === sourceOperationId);
    const target = result.operations.find((operation) => operation.id === targetOperationId);

    expect(result.operations.some((operation) => operation.source === 'USP')).toBe(true);
    expect(result.operations.some((operation) => operation.source === 'DSP')).toBe(true);
    expect(source).toBeTruthy();
    expect(target).toBeTruthy();
    expect(dayjs(target?.originalStart).isSame(dayjs(source?.originalEnd))).toBe(true);
    expect(upstreamTemplate.operations[0].offsetHours).toBe(0);
  });

  it('moves downstream operations when a harvest exception affects remaining and following stages', () => {
    const batch = TEST_FIXTURE_BATCHES[0];
    const result = composeTimeline(batch, TEST_FIXTURE_TEMPLATES[0], TEST_FIXTURE_TEMPLATES[2], {
      upstreamOperationId: findDefaultHandoffOperation(TEST_FIXTURE_TEMPLATES[0], 'USP'),
      downstreamOperationId: findDefaultHandoffOperation(TEST_FIXTURE_TEMPLATES[2], 'DSP'),
      rule: 'immediate_handoff',
      manualOffsetHours: 0,
      manualAnchor: null,
    });
    const harvest = result.operations.find((operation) => operation.operationName.includes('Harvest'));

    expect(harvest).toBeTruthy();
    const draft = createExceptionDraft(batch, harvest!);
    const preview = buildPreviewTimeline(result.operations, draft, 'current_remaining_and_following');

    const movedDspOperation = preview.operations.find(
      (operation) => operation.source === 'DSP' && preview.movedOperationIds.includes(operation.id),
    );

    expect(preview.crossHandoff).toBe(true);
    expect(preview.affectedOperationIds.length).toBeGreaterThan(1);
    expect(movedDspOperation).toBeTruthy();
    expect(preview.maxMoveHours).toBeGreaterThan(0);
  });
});

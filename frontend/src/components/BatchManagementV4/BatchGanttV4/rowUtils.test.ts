/// <reference types="jest" />

import { GanttBatch, GanttOperation, GanttStage } from './types';
import { buildStageLaneLayout, calculateRowLayout } from './rowUtils';

const createOperation = (
    id: number,
    startDate: string,
    endDate: string,
    overrides: Partial<GanttOperation> = {}
): GanttOperation => ({
    id,
    stage_id: 1,
    name: `Op ${id}`,
    startDate,
    endDate,
    status: 'PLANNED',
    color: '#000',
    progress: 0,
    duration: 1,
    requiredPeople: 1,
    assignedPeople: 1,
    ...overrides,
});

const createStage = (operations: GanttOperation[]): GanttStage => ({
    id: 1,
    batch_id: 1,
    name: 'Stage 1',
    startDate: operations[0]?.startDate || '2026-01-01 00:00:00',
    endDate: operations[operations.length - 1]?.endDate || '2026-01-01 01:00:00',
    progress: 0,
    operations,
});

const createBatch = (stage: GanttStage): GanttBatch => ({
    id: 1,
    name: 'Batch 1',
    code: 'BATCH-1',
    startDate: stage.startDate,
    endDate: stage.endDate,
    status: 'ACTIVATED',
    color: '#000',
    stages: [stage],
});

describe('buildStageLaneLayout', () => {
    test('packs serial operations into one lane', () => {
        const stage = createStage([
            createOperation(1, '2026-01-01 08:00:00', '2026-01-01 10:00:00'),
            createOperation(2, '2026-01-01 10:00:00', '2026-01-01 12:00:00'),
            createOperation(3, '2026-01-01 12:00:00', '2026-01-01 14:00:00'),
        ]);

        const layout = buildStageLaneLayout(stage, 'batch-1-stage-1');

        expect(layout.laneCount).toBe(1);
        expect(layout.lanes[0].map(op => op.id)).toEqual([1, 2, 3]);
    });

    test('splits overlapping operations into multiple lanes', () => {
        const stage = createStage([
            createOperation(1, '2026-01-01 08:00:00', '2026-01-01 12:00:00'),
            createOperation(2, '2026-01-01 09:00:00', '2026-01-01 10:00:00'),
            createOperation(3, '2026-01-01 10:00:00', '2026-01-01 11:00:00'),
        ]);

        const layout = buildStageLaneLayout(stage, 'batch-1-stage-1');

        expect(layout.laneCount).toBe(2);
        expect(layout.lanes[0].map(op => op.id)).toEqual([1]);
        expect(layout.lanes[1].map(op => op.id)).toEqual([2, 3]);
    });

    test('uses minimum lanes for interleaved overlaps', () => {
        const stage = createStage([
            createOperation(1, '2026-01-01 08:00:00', '2026-01-01 11:00:00'),
            createOperation(2, '2026-01-01 08:30:00', '2026-01-01 09:30:00'),
            createOperation(3, '2026-01-01 09:30:00', '2026-01-01 10:30:00'),
            createOperation(4, '2026-01-01 11:00:00', '2026-01-01 12:00:00'),
        ]);

        const layout = buildStageLaneLayout(stage, 'batch-1-stage-1');

        expect(layout.laneCount).toBe(2);
        expect(layout.lanes[0].map(op => op.id)).toEqual([1, 4]);
        expect(layout.lanes[1].map(op => op.id)).toEqual([2, 3]);
    });

    test('ignores off-screen operations', () => {
        const stage = createStage([
            createOperation(1, '2026-01-01 08:00:00', '2026-01-01 09:00:00', { isOffScreen: true }),
            createOperation(2, '2026-01-01 09:00:00', '2026-01-01 10:00:00'),
        ]);

        const layout = buildStageLaneLayout(stage, 'batch-1-stage-1');

        expect(layout.laneCount).toBe(1);
        expect(layout.lanes[0].map(op => op.id)).toEqual([2]);
    });
});

describe('calculateRowLayout', () => {
    test('creates lane rows for dense mode', () => {
        const stage = createStage([
            createOperation(1, '2026-01-01 08:00:00', '2026-01-01 10:00:00'),
            createOperation(2, '2026-01-01 10:00:00', '2026-01-01 12:00:00'),
        ]);
        const batch = createBatch(stage);

        const result = calculateRowLayout(
            [batch],
            new Set([1]),
            new Set(['batch-1-stage-1']),
            'dense'
        );

        expect(result.totalRows).toBe(3);
        expect(result.rowMap.get('batch-1')).toBe(0);
        expect(result.rowMap.get('batch-1-stage-1')).toBe(1);
        expect(result.laneRowMap.get('batch-1-stage-1-lane-0')).toBe(2);
    });

    test('keeps one operation per row in standard mode', () => {
        const stage = createStage([
            createOperation(1, '2026-01-01 08:00:00', '2026-01-01 10:00:00'),
            createOperation(2, '2026-01-01 10:00:00', '2026-01-01 12:00:00'),
        ]);
        const batch = createBatch(stage);

        const result = calculateRowLayout(
            [batch],
            new Set([1]),
            new Set(['batch-1-stage-1']),
            'standard'
        );

        expect(result.totalRows).toBe(4);
        expect(result.rowMap.get('op-1')).toBe(2);
        expect(result.rowMap.get('op-2')).toBe(3);
        expect(result.laneRowMap.size).toBe(0);
    });

    test('does not create lane rows in compact mode', () => {
        const stage = createStage([
            createOperation(1, '2026-01-01 08:00:00', '2026-01-01 10:00:00'),
            createOperation(2, '2026-01-01 09:00:00', '2026-01-01 11:00:00'),
        ]);
        const batch = createBatch(stage);

        const result = calculateRowLayout(
            [batch],
            new Set([1]),
            new Set(['batch-1-stage-1']),
            'compact'
        );

        expect(result.totalRows).toBe(2);
        expect(result.laneRowMap.size).toBe(0);
        expect(result.rowMap.get('batch-1-stage-1')).toBe(1);
    });
});

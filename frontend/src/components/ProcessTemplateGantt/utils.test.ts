import { generateTimeBlocks } from './utils';
import type { GanttNode, ProcessStage, StageOperation } from './types';

describe('generateTimeBlocks', () => {
    it('anchors time windows to operation_day instead of the shifted recommended day', () => {
        const stage: ProcessStage = {
            id: 20,
            template_id: 7,
            stage_code: 'PS-001',
            stage_name: 'TF-stage',
            stage_order: 1,
            start_day: 0,
        };
        const operation: StageOperation = {
            id: 134,
            stage_id: 20,
            operation_id: 364,
            operation_code: 'OP-00108',
            operation_name: 'shake alarm test',
            operation_day: 0,
            recommended_time: 10,
            recommended_day_offset: -5,
            window_start_time: 8,
            window_start_day_offset: -5,
            window_end_time: 12,
            window_end_day_offset: -5,
            operation_order: 2,
            standard_time: 1,
            required_people: 2,
        };
        const nodes: GanttNode[] = [
            {
                id: '7',
                title: 'WBP2486/B',
                type: 'template',
                children: [
                    {
                        id: 'stage_20',
                        title: 'PS-001 - TF-stage',
                        type: 'stage',
                        stage_code: 'PS-001',
                        start_day: 0,
                        data: stage,
                        children: [
                            {
                                id: 'operation_134',
                                title: operation.operation_name,
                                type: 'operation',
                                parent_id: 'stage_20',
                                start_day: -5,
                                standard_time: 1,
                                data: operation,
                            },
                        ],
                    },
                ],
            },
        ];

        const blocks = generateTimeBlocks(nodes, [stage]);
        const operationBlock = blocks.find((block) => block.id === 'block_operation_134');
        const windowBlock = blocks.find((block) => block.id === 'window_operation_134');

        expect(operationBlock?.start_hour).toBe(-5 * 24 + 10);
        expect(windowBlock?.start_hour).toBe(-5 * 24 + 8);
        expect(windowBlock?.duration_hours).toBe(4);
    });
});

import dayjs from 'dayjs';
import {
    buildBatchGanttModel,
    buildBatchGanttRenderModel,
    hourOffsetToDate,
    toHourOffset,
} from './batchGanttAdapter';
import type { GanttBatch, GanttDependency, GanttShareGroup } from './types';

const batches: GanttBatch[] = [
    {
        id: 1,
        name: 'Batch A',
        code: 'BAT-A',
        startDate: '2026-01-01 08:00:00',
        endDate: '2026-01-02 12:00:00',
        status: 'DRAFT',
        color: '',
        stages: [
            {
                id: 10,
                batch_id: 1,
                name: 'USP',
                startDate: '2026-01-01 08:00:00',
                endDate: '2026-01-02 12:00:00',
                progress: 0,
                operations: [
                    {
                        id: 100,
                        stage_id: 10,
                        name: 'Seed',
                        startDate: '2026-01-01 08:00:00',
                        endDate: '2026-01-01 12:00:00',
                        status: 'PENDING',
                        color: '',
                        progress: 20,
                        duration: 4,
                        requiredPeople: 2,
                        assignedPeople: 1,
                        windowStartDate: '2026-01-01 07:00:00',
                        windowEndDate: '2026-01-01 13:00:00',
                        templateScheduleId: 1000,
                        resourceNodeId: 501,
                        resourceName: 'AKTA-01',
                        resourceNodeClass: 'EQUIPMENT_UNIT',
                        resourceSystemType: 'AKTA',
                        resourceEquipmentClass: 'Chromatography',
                    },
                    {
                        id: 101,
                        stage_id: 10,
                        name: 'Culture',
                        startDate: '2026-01-01 13:00:00',
                        endDate: '2026-01-02 12:00:00',
                        status: 'READY',
                        color: '',
                        progress: 0,
                        duration: 23,
                        requiredPeople: 3,
                        assignedPeople: 3,
                        templateScheduleId: 1001,
                        resourceNodeId: 501,
                        resourceName: 'AKTA-01',
                        resourceNodeClass: 'EQUIPMENT_UNIT',
                        resourceSystemType: 'AKTA',
                        resourceEquipmentClass: 'Chromatography',
                    },
                ],
            },
        ],
    },
];

describe('batchGanttAdapter', () => {
    it('maps batch hierarchy into WxbGanttChart groups, tasks, dependencies, and links', () => {
        const dependencies: GanttDependency[] = [
            { id: 1, from: 100, to: 101, type: 'FINISH_TO_START' },
            { id: 2, from: 999, to: 101, type: 'FINISH_TO_START' },
        ];
        const shareGroups: GanttShareGroup[] = [
            { id: 7, group_name: 'Shared Team', share_mode: 'SAME_TEAM', member_operation_ids: [100, 101] },
        ];

        const model = buildBatchGanttModel(
            batches,
            dependencies,
            shareGroups,
            dayjs('2026-01-01 00:00:00'),
        );

        expect(model.groups).toHaveLength(2);
        expect(model.tasks).toHaveLength(2);
        expect(model.dependencies).toHaveLength(1);
        expect(model.links).toEqual([
            expect.objectContaining({
                id: 'batch-share-7',
                taskIds: ['batch-operation-100', 'batch-operation-101'],
            }),
        ]);

        const firstTask = model.tasks[0];
        expect(firstTask.start).toBe(8);
        expect(firstTask.windowStart).toBe(7);
        expect(firstTask.data).toEqual(expect.objectContaining({ batchCode: 'BAT-A' }));
    });

    it('links share-group members that span two different batches into one cross-batch link', () => {
        // 跨批次共享组：成员 100 属于批次 1，成员 200 属于批次 2，仍应生成一条连线。
        const crossBatchBatches: GanttBatch[] = [
            ...batches,
            {
                id: 2,
                name: 'Batch B',
                code: 'BAT-B',
                startDate: '2026-01-03 08:00:00',
                endDate: '2026-01-03 18:00:00',
                status: 'DRAFT',
                color: '',
                stages: [
                    {
                        id: 20,
                        batch_id: 2,
                        name: 'DSP',
                        startDate: '2026-01-03 08:00:00',
                        endDate: '2026-01-03 18:00:00',
                        progress: 0,
                        operations: [
                            {
                                id: 200,
                                stage_id: 20,
                                name: 'Harvest',
                                startDate: '2026-01-03 08:00:00',
                                endDate: '2026-01-03 12:00:00',
                                status: 'PENDING',
                                color: '',
                                progress: 0,
                                duration: 4,
                                requiredPeople: 2,
                                assignedPeople: 0,
                                templateScheduleId: 2000,
                            },
                        ],
                    },
                ],
            },
        ];

        const shareGroups: GanttShareGroup[] = [
            { id: 9, group_name: '跨批次组', share_mode: 'SAME_TEAM', member_operation_ids: [100, 200] },
        ];

        const model = buildBatchGanttModel(
            crossBatchBatches,
            [],
            shareGroups,
            dayjs('2026-01-01 00:00:00'),
        );

        expect(model.links).toEqual([
            expect.objectContaining({
                id: 'batch-share-9',
                taskIds: ['batch-operation-100', 'batch-operation-200'],
                shareMode: 'SAME_TEAM',
            }),
        ]);
    });

    it('builds batch resource views and can hide time windows', () => {
        const model = buildBatchGanttModel(
            batches,
            [],
            [],
            dayjs('2026-01-01 00:00:00'),
        );

        const operationView = buildBatchGanttRenderModel(model, 'operation', false);
        expect(operationView.tasks[0].windowStart).toBeUndefined();
        expect(operationView.dependencies).toHaveLength(0);

        const stageEquipmentView = buildBatchGanttRenderModel(model, 'stage-equipment', true);
        const stageEquipmentResourceGroup = stageEquipmentView.groups.find((group) => group.label.includes('AKTA-01'));
        expect(stageEquipmentResourceGroup).toEqual(expect.objectContaining({ showSummaryBar: true }));
        expect(stageEquipmentView.groups).toEqual(expect.arrayContaining([
            expect.objectContaining({
                id: `${stageEquipmentResourceGroup?.id}__lane-1`,
                showSummaryBar: false,
                isSubRow: true,
            }),
        ]));
        expect(stageEquipmentView.tasks.every((task) => task.renderOnGroupRow)).toBe(true);
        expect(stageEquipmentView.tasks.every((task) => task.groupId === `${stageEquipmentResourceGroup?.id}__lane-1`)).toBe(true);

        const equipmentView = buildBatchGanttRenderModel(model, 'equipment', true);
        expect(equipmentView.groups[0].label).toContain('AKTA-01');
        expect(equipmentView.groups[0]).toEqual(expect.objectContaining({ showSummaryBar: true }));
        expect(equipmentView.groups).toEqual(expect.arrayContaining([
            expect.objectContaining({
                id: 'resource-equip-501__lane-1',
                showSummaryBar: false,
                isSubRow: true,
            }),
        ]));
        expect(equipmentView.tasks[0].label).toContain('BAT-A');
        expect(equipmentView.tasks.every((task) => task.groupId === 'resource-equip-501__lane-1')).toBe(true);
    });

    it('converts between date values and hour offsets', () => {
        const origin = dayjs('2026-01-01 00:00:00');
        expect(toHourOffset(origin, '2026-01-02 06:00:00')).toBe(30);
        expect(hourOffsetToDate(origin, 30).format('YYYY-MM-DD HH:mm:ss')).toBe('2026-01-02 06:00:00');
    });
});

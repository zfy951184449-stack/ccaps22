import type { Key } from 'react';

export type DepartmentFilterValue = 'all' | number;

interface DepartmentBatch {
    id: Key;
    team_id?: number;
    plan_status?: string;
}

export const filterBatchesByDepartment = <T extends DepartmentBatch>(
    batches: T[],
    department: DepartmentFilterValue,
): T[] => batches.filter(batch => department === 'all' || batch.team_id === department);

export const getDefaultSelectedBatchIds = <T extends DepartmentBatch>(
    batches: T[],
    department: DepartmentFilterValue,
): Key[] => filterBatchesByDepartment(batches, department)
    .filter(batch => batch.plan_status === 'ACTIVATED')
    .map(batch => batch.id);

export const getVisibleSelectedBatchIds = <T extends DepartmentBatch>(
    selectedRowKeys: Key[],
    visibleBatches: T[],
): Key[] => {
    const visibleIds = new Set<Key>(visibleBatches.map(batch => batch.id));
    return selectedRowKeys.filter(key => visibleIds.has(key));
};

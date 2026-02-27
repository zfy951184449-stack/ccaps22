import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import pool from '../config/database';
import type { OrganizationUnitType } from '../models/organization';

export interface CreateUnitDTO {
    parent_id?: number | null;
    unit_type: OrganizationUnitType;
    unit_code?: string;
    unit_name: string;
    default_shift_code?: string;
    sort_order?: number;
}

export interface UpdateUnitDTO {
    parent_id?: number | null;
    unit_type?: OrganizationUnitType;
    unit_code?: string;
    unit_name?: string;
    default_shift_code?: string;
    sort_order?: number;
    is_active?: boolean;
}

export async function createOrganizationUnit(data: CreateUnitDTO) {
    const {
        parent_id = null,
        unit_type,
        unit_code = null,
        unit_name,
        default_shift_code = null,
        sort_order = 0
    } = data;

    const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO organization_units 
      (parent_id, unit_type, unit_code, unit_name, default_shift_code, sort_order, is_active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [parent_id, unit_type, unit_code, unit_name, default_shift_code, sort_order]
    );

    return { id: result.insertId, ...data };
}

export async function updateOrganizationUnit(id: number, data: UpdateUnitDTO) {
    // 1. 致命漏洞修复: 环路检测 (Circular Reference Check)
    if (data.parent_id !== undefined && data.parent_id !== null) {
        if (data.parent_id === id) {
            throw new Error('Cannot set a unit as its own parent (Circular Reference).');
        }

        let currentParentId: number | null = data.parent_id;
        while (currentParentId !== null) {
            const result = await pool.execute<RowDataPacket[]>(
                'SELECT parent_id FROM organization_units WHERE id = ?',
                [currentParentId]
            );
            const refRows = result[0];
            if (refRows.length === 0) break;

            currentParentId = refRows[0].parent_id;
            if (currentParentId === id) {
                throw new Error('Circular reference detected: this unit is an ancestor of the target parent unit.');
            }
        }
    }

    const fields: string[] = [];
    const values: any[] = [];

    if (data.parent_id !== undefined) {
        fields.push('parent_id = ?');
        values.push(data.parent_id);
    }
    if (data.unit_type !== undefined) {
        fields.push('unit_type = ?');
        values.push(data.unit_type);
    }
    if (data.unit_code !== undefined) {
        fields.push('unit_code = ?');
        values.push(data.unit_code);
    }
    if (data.unit_name !== undefined) {
        fields.push('unit_name = ?');
        values.push(data.unit_name);
    }
    if (data.default_shift_code !== undefined) {
        fields.push('default_shift_code = ?');
        values.push(data.default_shift_code);
    }
    if (data.sort_order !== undefined) {
        fields.push('sort_order = ?');
        values.push(data.sort_order);
    }
    if (data.is_active !== undefined) {
        fields.push('is_active = ?');
        values.push(data.is_active);
    }

    if (fields.length === 0) return null;

    values.push(id);

    await pool.execute(
        `UPDATE organization_units SET ${fields.join(', ')} WHERE id = ?`,
        values
    );

    return { id, ...data };
}

export async function deleteOrganizationUnit(id: number) {
    // 1. Check for child units (active or inactive)
    const [children] = await pool.execute<RowDataPacket[]>(
        'SELECT id FROM organization_units WHERE parent_id = ? LIMIT 1',
        [id]
    );

    if (children.length > 0) {
        throw new Error('Cannot delete unit because it has child units (including inactive ones). Move or delete them first.');
    }

    // 2. Check for assigned employees (active or inactive)
    const [employees] = await pool.execute<RowDataPacket[]>(
        'SELECT id, employee_name FROM employees WHERE unit_id = ? LIMIT 1',
        [id]
    );

    if (employees.length > 0) {
        throw new Error(`Cannot delete unit because it has assigned employees (e.g. ${employees[0].employee_name}). Unassign them first.`);
    }

    // 3. Check for operation_types references
    const [opTypes] = await pool.execute<RowDataPacket[]>(
        'SELECT type_name FROM operation_types WHERE team_id = ? LIMIT 1',
        [id]
    );

    if (opTypes.length > 0) {
        throw new Error(`Cannot delete unit because it is associated with Operation Type: "${opTypes[0].type_name}".`);
    }

    // 4. Check for process_templates references
    const [templates] = await pool.execute<RowDataPacket[]>(
        'SELECT template_name FROM process_templates WHERE team_id = ? LIMIT 1',
        [id]
    );

    if (templates.length > 0) {
        throw new Error(`Cannot delete unit because it is used in Process Template: "${templates[0].template_name}".`);
    }

    // 5. Perform delete
    try {
        await pool.execute('DELETE FROM organization_units WHERE id = ?', [id]);
    } catch (err: any) {
        if (err.code === 'ER_ROW_IS_REFERENCED_2') {
            // Fallback for other potential constraints
            throw new Error('Cannot delete unit because it is referenced by other records (check constraints).');
        }
        throw err;
    }
}

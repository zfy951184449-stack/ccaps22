import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';

/**
 * 获取模板的所有共享组
 */
export const getTemplateShareGroups = async (req: Request, res: Response) => {
    try {
        const { templateId } = req.params;

        const [groups] = await pool.execute<RowDataPacket[]>(`
            SELECT 
                psg.id,
                psg.template_id,
                psg.group_code,
                psg.group_name,
                psg.share_mode,
                psg.created_at,
                COUNT(psgm.id) as member_count
            FROM personnel_share_groups psg
            LEFT JOIN personnel_share_group_members psgm ON psg.id = psgm.group_id
            WHERE psg.template_id = ?
            GROUP BY psg.id
            ORDER BY psg.created_at DESC
        `, [templateId]);

        // 获取每个共享组的成员
        for (const group of groups) {
            const [members] = await pool.execute<RowDataPacket[]>(`
                SELECT 
                    psgm.id,
                    psgm.schedule_id,
                    o.operation_name,
                    1 as required_people,
                    ps.stage_name
                FROM personnel_share_group_members psgm
                JOIN stage_operation_schedules sos ON psgm.schedule_id = sos.id
                JOIN operations o ON sos.operation_id = o.id
                JOIN process_stages ps ON sos.stage_id = ps.id
                WHERE psgm.group_id = ?
            `, [group.id]);
            group.members = members;
        }

        res.json(groups);
    } catch (error) {
        console.error('Error fetching share groups:', error);
        res.status(500).json({ error: 'Failed to fetch share groups' });
    }
};

/**
 * 获取单个共享组详情
 */
export const getShareGroup = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const [groups] = await pool.execute<RowDataPacket[]>(`
            SELECT * FROM personnel_share_groups WHERE id = ?
        `, [id]);

        if (groups.length === 0) {
            return res.status(404).json({ error: 'Share group not found' });
        }

        const group = groups[0];

        const [members] = await pool.execute<RowDataPacket[]>(`
            SELECT 
                psgm.id,
                psgm.schedule_id,
                o.operation_name,
                1 as required_people,
                ps.stage_name
            FROM personnel_share_group_members psgm
            JOIN stage_operation_schedules sos ON psgm.schedule_id = sos.id
            JOIN operations o ON sos.operation_id = o.id
            JOIN process_stages ps ON sos.stage_id = ps.id
            WHERE psgm.group_id = ?
        `, [id]);

        group.members = members;
        res.json(group);
    } catch (error) {
        console.error('Error fetching share group:', error);
        res.status(500).json({ error: 'Failed to fetch share group' });
    }
};

/**
 * 创建共享组
 */
export const createShareGroup = async (req: Request, res: Response) => {
    try {
        const { templateId } = req.params;
        const { group_name, share_mode, member_ids } = req.body;

        if (!group_name || !member_ids || member_ids.length < 2) {
            return res.status(400).json({
                error: 'group_name is required and at least 2 members must be selected'
            });
        }

        // 生成唯一的 group_code
        const groupCode = `SG_${Date.now()}`;

        // 创建共享组
        const [result] = await pool.execute<any>(`
            INSERT INTO personnel_share_groups (template_id, group_code, group_name, share_mode)
            VALUES (?, ?, ?, ?)
        `, [templateId, groupCode, group_name, share_mode || 'SAME_TEAM']);

        const groupId = result.insertId;

        // 添加成员
        for (const scheduleId of member_ids) {
            await pool.execute(`
                INSERT INTO personnel_share_group_members (group_id, schedule_id)
                VALUES (?, ?)
            `, [groupId, scheduleId]);
        }

        res.status(201).json({
            id: groupId,
            group_code: groupCode,
            message: 'Share group created successfully'
        });
    } catch (error) {
        console.error('Error creating share group:', error);
        res.status(500).json({ error: 'Failed to create share group' });
    }
};

/**
 * 更新共享组
 */
export const updateShareGroup = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { group_name, share_mode, member_ids } = req.body;

        const updates: string[] = [];
        const params: any[] = [];

        if (group_name !== undefined) {
            updates.push('group_name = ?');
            params.push(group_name);
        }
        if (share_mode !== undefined) {
            updates.push('share_mode = ?');
            params.push(share_mode);
        }

        if (updates.length > 0) {
            params.push(id);
            await pool.execute(`
                UPDATE personnel_share_groups SET ${updates.join(', ')} WHERE id = ?
            `, params);
        }

        // 更新成员列表
        if (member_ids && Array.isArray(member_ids)) {
            // 删除现有成员
            await pool.execute('DELETE FROM personnel_share_group_members WHERE group_id = ?', [id]);
            // 添加新成员
            for (const scheduleId of member_ids) {
                await pool.execute(`
                    INSERT INTO personnel_share_group_members (group_id, schedule_id)
                    VALUES (?, ?)
                `, [id, scheduleId]);
            }
        }

        res.json({ message: 'Share group updated successfully' });
    } catch (error) {
        console.error('Error updating share group:', error);
        res.status(500).json({ error: 'Failed to update share group' });
    }
};

/**
 * 删除共享组
 */
export const deleteShareGroup = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // 成员会因为 CASCADE 自动删除
        await pool.execute('DELETE FROM personnel_share_groups WHERE id = ?', [id]);

        res.json({ message: 'Share group deleted successfully' });
    } catch (error) {
        console.error('Error deleting share group:', error);
        res.status(500).json({ error: 'Failed to delete share group' });
    }
};

/**
 * 获取批次的所有共享组
 */
export const getBatchShareGroups = async (req: Request, res: Response) => {
    try {
        const { batchPlanId } = req.params;

        const [groups] = await pool.execute<RowDataPacket[]>(`
            SELECT 
                bsg.id,
                bsg.batch_plan_id,
                bsg.template_group_id,
                bsg.group_code,
                bsg.group_name,
                bsg.share_mode,
                bsg.created_at,
                COUNT(bsgm.id) as member_count
            FROM batch_share_groups bsg
            LEFT JOIN batch_share_group_members bsgm ON bsg.id = bsgm.group_id
            WHERE bsg.batch_plan_id = ?
            GROUP BY bsg.id
            ORDER BY bsg.created_at DESC
        `, [batchPlanId]);

        // 获取每个共享组的成员
        for (const group of groups) {
            const [members] = await pool.execute<RowDataPacket[]>(`
                SELECT 
                    bsgm.id,
                    bsgm.batch_operation_plan_id,
                    bop.operation_name,
                    bop.required_people
                FROM batch_share_group_members bsgm
                JOIN batch_operation_plans bop ON bsgm.batch_operation_plan_id = bop.id
                WHERE bsgm.group_id = ?
            `, [group.id]);
            group.members = members;
        }

        res.json(groups);
    } catch (error) {
        console.error('Error fetching batch share groups:', error);
        res.status(500).json({ error: 'Failed to fetch batch share groups' });
    }
};

/**
 * 获取用于甘特图显示的共享组连线
 */
export const getShareGroupsForGantt = async (req: Request, res: Response) => {
    try {
        const { templateId } = req.params;

        const [groups] = await pool.execute<RowDataPacket[]>(`
            SELECT 
                psg.id,
                psg.group_code,
                psg.group_name,
                psg.share_mode,
                GROUP_CONCAT(psgm.schedule_id) as member_schedule_ids
            FROM personnel_share_groups psg
            JOIN personnel_share_group_members psgm ON psg.id = psgm.group_id
            WHERE psg.template_id = ?
            GROUP BY psg.id
        `, [templateId]);

        // 转换为前端需要的格式
        const result = groups.map((g: any) => ({
            id: g.id,
            group_code: g.group_code,
            group_name: g.group_name,
            share_mode: g.share_mode,
            member_ids: g.member_schedule_ids ? g.member_schedule_ids.split(',').map(Number) : []
        }));

        res.json(result);
    } catch (error) {
        console.error('Error fetching share groups for gantt:', error);
        res.status(500).json({ error: 'Failed to fetch share groups for gantt' });
    }
};

/**
 * 获取用于批次甘特图显示的共享组连线 (支持多批次)
 */
export const getShareGroupsForBatchGantt = async (req: Request, res: Response) => {
    try {
        const batchIdsParam = req.query.batch_ids as string;
        if (!batchIdsParam) {
            return res.json([]);
        }

        const batchIds = batchIdsParam.split(',').map(Number).filter(id => !isNaN(id));
        if (batchIds.length === 0) {
            return res.json([]);
        }

        const placeholders = batchIds.map(() => '?').join(',');

        const [groups] = await pool.execute<RowDataPacket[]>(`
            SELECT 
                bsg.id,
                bsg.group_name,
                bsg.share_mode,
                GROUP_CONCAT(bsgm.batch_operation_plan_id) as member_operation_ids
            FROM batch_share_groups bsg
            JOIN batch_share_group_members bsgm ON bsg.id = bsgm.group_id
            WHERE bsg.batch_plan_id IN (${placeholders})
            GROUP BY bsg.id
            HAVING COUNT(bsgm.id) >= 2
        `, batchIds);

        // 转换为前端需要的格式
        const result = groups.map((g: any) => ({
            id: g.id,
            group_name: g.group_name,
            share_mode: g.share_mode,
            member_operation_ids: g.member_operation_ids ? g.member_operation_ids.split(',').map(Number) : []
        }));

        res.json(result);
    } catch (error) {
        console.error('Error fetching share groups for batch gantt:', error);
        res.status(500).json({ error: 'Failed to fetch share groups for batch gantt' });
    }
};
/**
 * 根据操作ID获取所属共享组
 */
export const getShareGroupsByOperationId = async (req: Request, res: Response) => {
    try {
        const { scheduleId } = req.params;

        // 1. 查找包含该操作的共享组
        const [groups] = await pool.execute<RowDataPacket[]>(`
            SELECT 
                psg.id,
                psg.template_id,
                psg.group_code,
                psg.group_name,
                psg.share_mode,
                psg.created_at
            FROM personnel_share_groups psg
            JOIN personnel_share_group_members psgm ON psg.id = psgm.group_id
            WHERE psgm.schedule_id = ?
        `, [scheduleId]);

        // 2. 获取每个共享组的所有成员
        for (const group of groups) {
            const [members] = await pool.execute<RowDataPacket[]>(`
                SELECT 
                    psgm.id,
                    psgm.schedule_id,
                    o.operation_name,
                    1 as required_people,
                    ps.stage_name
                FROM personnel_share_group_members psgm
                JOIN stage_operation_schedules sos ON psgm.schedule_id = sos.id
                JOIN operations o ON sos.operation_id = o.id
                JOIN process_stages ps ON sos.stage_id = ps.id
                WHERE psgm.group_id = ?
                ORDER BY sos.stage_id, sos.operation_order
            `, [group.id]);
            group.members = members;
        }

        res.json(groups);
    } catch (error) {
        console.error('Error fetching share groups by operation:', error);
        res.status(500).json({ error: 'Failed to fetch share groups by operation' });
    }
};

/**
 * 根据批次操作ID获取所属共享组 (批次级别)
 */
export const getShareGroupsByBatchOperationId = async (req: Request, res: Response) => {
    try {
        const { operationPlanId } = req.params;

        // 查找包含该批次操作的共享组
        const [groups] = await pool.execute<RowDataPacket[]>(`
            SELECT 
                bsg.id,
                bsg.batch_plan_id,
                bsg.group_code,
                bsg.group_name,
                bsg.share_mode,
                bsg.created_at
            FROM batch_share_groups bsg
            JOIN batch_share_group_members bsgm ON bsg.id = bsgm.group_id
            WHERE bsgm.batch_operation_plan_id = ?
        `, [operationPlanId]);

        // 获取每个共享组的所有成员
        for (const group of groups) {
            const [members] = await pool.execute<RowDataPacket[]>(`
                SELECT 
                    bsgm.id,
                    bsgm.batch_operation_plan_id as operation_plan_id,
                    o.operation_name,
                    o.operation_code,
                    1 as required_people,
                    ps.stage_name
                FROM batch_share_group_members bsgm
                JOIN batch_operation_plans bop ON bsgm.batch_operation_plan_id = bop.id
                JOIN operations o ON bop.operation_id = o.id
                LEFT JOIN stage_operation_schedules sos ON bop.template_schedule_id = sos.id
                LEFT JOIN process_stages ps ON sos.stage_id = ps.id
                WHERE bsgm.group_id = ?
                ORDER BY bop.planned_start_datetime, o.operation_name
            `, [group.id]);
            group.members = members;
        }

        res.json(groups);
    } catch (error) {
        console.error('Error fetching share groups by batch operation:', error);
        res.status(500).json({ error: 'Failed to fetch share groups by batch operation' });
    }
};

/**
 * 将操作加入共享组
 */
export const assignOperationToShareGroup = async (req: Request, res: Response) => {
    try {
        const { schedule_id, share_group_id } = req.body;

        if (!schedule_id || !share_group_id) {
            return res.status(400).json({ error: 'schedule_id and share_group_id are required' });
        }

        // 检查是否已在该共享组中
        const [existing] = await pool.execute<RowDataPacket[]>(`
            SELECT id FROM personnel_share_group_members 
            WHERE group_id = ? AND schedule_id = ?
        `, [share_group_id, schedule_id]);

        if (existing.length > 0) {
            return res.status(400).json({ error: '该操作已在共享组中' });
        }

        // 添加到共享组
        await pool.execute(`
            INSERT INTO personnel_share_group_members (group_id, schedule_id)
            VALUES (?, ?)
        `, [share_group_id, schedule_id]);

        res.status(201).json({ message: '已成功加入共享组' });
    } catch (error) {
        console.error('Error assigning operation to share group:', error);
        res.status(500).json({ error: 'Failed to assign operation to share group' });
    }
};

/**
 * 从共享组移除操作
 */
export const removeOperationFromShareGroup = async (req: Request, res: Response) => {
    try {
        const { scheduleId, groupId } = req.params;

        // 删除成员记录
        const [result] = await pool.execute<any>(`
            DELETE FROM personnel_share_group_members 
            WHERE group_id = ? AND schedule_id = ?
        `, [groupId, scheduleId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: '未找到该成员记录' });
        }

        res.json({ message: '已成功退出共享组' });
    } catch (error) {
        console.error('Error removing operation from share group:', error);
        res.status(500).json({ error: 'Failed to remove operation from share group' });
    }
};

/**
 * 将批次操作加入共享组 (批次级别)
 */
export const assignBatchOperationToShareGroup = async (req: Request, res: Response) => {
    try {
        const { groupId } = req.params;
        const { operation_plan_id } = req.body;

        if (!operation_plan_id) {
            return res.status(400).json({ error: 'operation_plan_id is required' });
        }

        // 检查是否已在该共享组中
        const [existing] = await pool.execute<RowDataPacket[]>(`
            SELECT id FROM batch_share_group_members 
            WHERE group_id = ? AND batch_operation_plan_id = ?
        `, [groupId, operation_plan_id]);

        if (existing.length > 0) {
            return res.status(400).json({ error: '该操作已在共享组中' });
        }

        // 添加到共享组
        await pool.execute(`
            INSERT INTO batch_share_group_members (group_id, batch_operation_plan_id)
            VALUES (?, ?)
        `, [groupId, operation_plan_id]);

        res.status(201).json({ message: '已成功加入共享组' });
    } catch (error) {
        console.error('Error assigning batch operation to share group:', error);
        res.status(500).json({ error: 'Failed to assign batch operation to share group' });
    }
};

/**
 * 从批次共享组移除操作 (批次级别)
 */
export const removeBatchOperationFromShareGroup = async (req: Request, res: Response) => {
    try {
        const { groupId, operationPlanId } = req.params;

        // 删除成员记录
        const [result] = await pool.execute<any>(`
            DELETE FROM batch_share_group_members 
            WHERE group_id = ? AND batch_operation_plan_id = ?
        `, [groupId, operationPlanId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: '未找到该成员记录' });
        }

        res.json({ message: '已成功退出共享组' });
    } catch (error) {
        console.error('Error removing batch operation from share group:', error);
        res.status(500).json({ error: 'Failed to remove batch operation from share group' });
    }
};

/**
 * 合并批次操作到共享组 (自动创建或合并)
 */
export const mergeBatchOperationsToShareGroup = async (req: Request, res: Response) => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const { target_operation_id, member_operation_ids, share_mode = 'SAME_TEAM' } = req.body;

        if (!target_operation_id || !member_operation_ids || !Array.isArray(member_operation_ids)) {
            return res.status(400).json({ error: 'target_operation_id and member_operation_ids array are required' });
        }

        // 1. Check if target op belongs to a group
        const [targetGroup] = await connection.execute<RowDataPacket[]>(`
            SELECT bsg.id, bsg.group_name
            FROM batch_share_groups bsg
            JOIN batch_share_group_members bsgm ON bsg.id = bsgm.group_id
            WHERE bsgm.batch_operation_plan_id = ?
        `, [target_operation_id]);

        let groupId: number;

        if (targetGroup.length > 0) {
            // Use existing group
            groupId = targetGroup[0].id;
        } else {
            // Create new group
            // Fetch batch_id from operation to link group
            const [opInfo] = await connection.execute<RowDataPacket[]>(`
                SELECT batch_plan_id FROM batch_operation_plans WHERE id = ?
            `, [target_operation_id]);

            if (opInfo.length === 0) {
                await connection.rollback();
                return res.status(404).json({ error: 'Target operation not found' });
            }

            const batchId = opInfo[0].batch_plan_id;
            const newGroupCode = `SG_${Date.now()}`;
            const newGroupName = `Group ${newGroupCode}`;

            const [createResult]: any = await connection.execute(`
                INSERT INTO batch_share_groups (batch_plan_id, group_code, group_name, share_mode)
                VALUES (?, ?, ?, ?)
            `, [batchId, newGroupCode, newGroupName, share_mode]);

            groupId = createResult.insertId;

            // Add target op to new group
            await connection.execute(`
                INSERT INTO batch_share_group_members (group_id, batch_operation_plan_id)
                VALUES (?, ?)
            `, [groupId, target_operation_id]);
        }

        // 2. Add members to group
        for (const memberId of member_operation_ids) {
            if (memberId === target_operation_id) continue;

            // Remove from any previous group first
            await connection.execute(`
                DELETE FROM batch_share_group_members WHERE batch_operation_plan_id = ?
            `, [memberId]);

            await connection.execute(`
                INSERT INTO batch_share_group_members (group_id, batch_operation_plan_id)
                VALUES (?, ?)
            `, [groupId, memberId]);
        }

        await connection.commit();
        res.json({ message: 'Operations merged into share group successfully', groupId });

    } catch (error) {
        await connection.rollback();
        console.error('Error merging batch operations to share group:', error);
        res.status(500).json({ error: 'Failed to merge operations' });
    } finally {
        connection.release();
    }
};

/**
 * 批量创建批次共享组 (支持跨批次)
 * 用于 BatchGanttV4 快捷创建共享组功能
 */
export const createBatchShareGroup = async (req: Request, res: Response) => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const { operation_ids, group_name, share_mode = 'SAME_TEAM' } = req.body;

        if (!operation_ids || !Array.isArray(operation_ids) || operation_ids.length < 2) {
            return res.status(400).json({
                error: 'operation_ids array is required and must contain at least 2 operations'
            });
        }

        // 获取第一个操作的 batch_plan_id 作为组的关联批次
        // 对于跨批次共享组，我们仍需要指定一个关联批次
        const [firstOpInfo] = await connection.execute<RowDataPacket[]>(`
            SELECT batch_plan_id FROM batch_operation_plans WHERE id = ?
        `, [operation_ids[0]]);

        if (firstOpInfo.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'First operation not found' });
        }

        const batchId = firstOpInfo[0].batch_plan_id;
        const groupCode = `SG_${Date.now()}`;
        const finalGroupName = group_name || `共享组-${Date.now()}`;

        // 创建共享组
        const [createResult]: any = await connection.execute(`
            INSERT INTO batch_share_groups (batch_plan_id, group_code, group_name, share_mode)
            VALUES (?, ?, ?, ?)
        `, [batchId, groupCode, finalGroupName, share_mode]);

        const groupId = createResult.insertId;

        // 添加所有成员
        for (const opId of operation_ids) {
            // 先从其他共享组中移除（一个操作只能属于一个共享组）
            await connection.execute(`
                DELETE FROM batch_share_group_members WHERE batch_operation_plan_id = ?
            `, [opId]);

            // 添加到新共享组
            await connection.execute(`
                INSERT INTO batch_share_group_members (group_id, batch_operation_plan_id)
                VALUES (?, ?)
            `, [groupId, opId]);
        }

        await connection.commit();

        res.status(201).json({
            id: groupId,
            group_code: groupCode,
            group_name: finalGroupName,
            message: 'Batch share group created successfully'
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error creating batch share group:', error);
        res.status(500).json({ error: 'Failed to create batch share group' });
    } finally {
        connection.release();
    }
};


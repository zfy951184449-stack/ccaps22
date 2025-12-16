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

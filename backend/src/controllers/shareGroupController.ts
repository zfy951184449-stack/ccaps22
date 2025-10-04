import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';

// 获取模板的所有共享组
export const getTemplateShareGroups = async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    
    const query = `
      SELECT 
        psg.id,
        psg.template_id,
        psg.group_code,
        psg.group_name,
        psg.description,
        psg.color,
        COUNT(DISTINCT osgr.schedule_id) AS operation_count,
        GROUP_CONCAT(DISTINCT op.operation_name ORDER BY osgr.priority) AS operations_list,
        MAX(op.required_people) AS max_required_people,
        SUM(op.required_people) AS total_if_independent
      FROM personnel_share_groups psg
      LEFT JOIN operation_share_group_relations osgr ON psg.id = osgr.share_group_id
      LEFT JOIN stage_operation_schedules sos ON osgr.schedule_id = sos.id
      LEFT JOIN operations op ON sos.operation_id = op.id
      WHERE psg.template_id = ?
      GROUP BY psg.id, psg.template_id, psg.group_code, 
               psg.group_name, psg.description, psg.color
      ORDER BY psg.group_code
    `;
    
    const [rows] = await pool.execute<RowDataPacket[]>(query, [templateId]);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching share groups:', error);
    res.status(500).json({ error: 'Failed to fetch share groups' });
  }
};

// 创建共享组
export const createShareGroup = async (req: Request, res: Response) => {
  try {
    const {
      template_id,
      group_code,
      group_name,
      description,
      color = '#1890ff'
    } = req.body;
    
    const insertQuery = `
      INSERT INTO personnel_share_groups (
        template_id, group_code, group_name, description, color
      ) VALUES (?, ?, ?, ?, ?)
    `;
    
    const [result]: any = await pool.execute(insertQuery, [
      template_id,
      group_code,
      group_name,
      description || null,
      color
    ]);
    
    res.status(201).json({ 
      id: result.insertId, 
      message: 'Share group created successfully' 
    });
  } catch (error: any) {
    console.error('Error creating share group:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Group code already exists for this template' });
    } else {
      res.status(500).json({ error: 'Failed to create share group' });
    }
  }
};

// 更新共享组
export const updateShareGroup = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      group_code,
      group_name,
      description,
      color
    } = req.body;
    
    const updateQuery = `
      UPDATE personnel_share_groups 
      SET group_code = ?, group_name = ?, description = ?, color = ?
      WHERE id = ?
    `;
    
    const [result]: any = await pool.execute(updateQuery, [
      group_code,
      group_name,
      description || null,
      color,
      id
    ]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Share group not found' });
    }
    
    res.json({ message: 'Share group updated successfully' });
  } catch (error) {
    console.error('Error updating share group:', error);
    res.status(500).json({ error: 'Failed to update share group' });
  }
};

// 删除共享组
export const deleteShareGroup = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const [result]: any = await pool.execute(
      'DELETE FROM personnel_share_groups WHERE id = ?',
      [id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Share group not found' });
    }
    
    res.json({ message: 'Share group deleted successfully' });
  } catch (error) {
    console.error('Error deleting share group:', error);
    res.status(500).json({ error: 'Failed to delete share group' });
  }
};

// 为操作分配共享组
export const assignOperationToGroup = async (req: Request, res: Response) => {
  try {
    const {
      schedule_id,
      share_group_id,
      priority = 1
    } = req.body;
    
    const insertQuery = `
      INSERT INTO operation_share_group_relations (
        schedule_id, share_group_id, priority
      ) VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE priority = VALUES(priority)
    `;
    
    await pool.execute(insertQuery, [
      schedule_id,
      share_group_id,
      priority
    ]);
    
    res.json({ message: 'Operation assigned to group successfully' });
  } catch (error) {
    console.error('Error assigning operation to group:', error);
    res.status(500).json({ error: 'Failed to assign operation to group' });
  }
};

// 从共享组移除操作
export const removeOperationFromGroup = async (req: Request, res: Response) => {
  try {
    const { scheduleId, groupId } = req.params;
    
    const [result]: any = await pool.execute(
      'DELETE FROM operation_share_group_relations WHERE schedule_id = ? AND share_group_id = ?',
      [scheduleId, groupId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Relation not found' });
    }
    
    res.json({ message: 'Operation removed from group successfully' });
  } catch (error) {
    console.error('Error removing operation from group:', error);
    res.status(500).json({ error: 'Failed to remove operation from group' });
  }
};

// 获取操作的共享组
export const getOperationShareGroups = async (req: Request, res: Response) => {
  try {
    const { scheduleId } = req.params;
    
    const query = `
      SELECT 
        psg.id,
        psg.group_code,
        psg.group_name,
        psg.description,
        psg.color,
        osgr.priority
      FROM operation_share_group_relations osgr
      JOIN personnel_share_groups psg ON osgr.share_group_id = psg.id
      WHERE osgr.schedule_id = ?
      ORDER BY osgr.priority
    `;
    
    const [rows] = await pool.execute<RowDataPacket[]>(query, [scheduleId]);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching operation share groups:', error);
    res.status(500).json({ error: 'Failed to fetch operation share groups' });
  }
};

// 计算模板的人员需求优化
export const calculatePersonnelOptimization = async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    
    // 获取独立人员需求（没有共享）
    const independentQuery = `
      SELECT 
        SUM(op.required_people) AS total_independent,
        MAX(op.required_people) AS peak_independent
      FROM stage_operation_schedules sos
      JOIN operations op ON sos.operation_id = op.id
      JOIN process_stages ps ON sos.stage_id = ps.id
      WHERE ps.template_id = ?
    `;
    
    // 获取共享后的人员需求
    const sharedQuery = `
      SELECT 
        psg.group_name,
        MAX(op.required_people) AS group_requirement,
        COUNT(DISTINCT osgr.schedule_id) AS operation_count
      FROM personnel_share_groups psg
      JOIN operation_share_group_relations osgr ON psg.id = osgr.share_group_id
      JOIN stage_operation_schedules sos ON osgr.schedule_id = sos.id
      JOIN operations op ON sos.operation_id = op.id
      WHERE psg.template_id = ?
      GROUP BY psg.id, psg.group_name
    `;
    
    const [independent] = await pool.execute<RowDataPacket[]>(independentQuery, [templateId]);
    const [shared] = await pool.execute<RowDataPacket[]>(sharedQuery, [templateId]);
    
    const totalShared = shared.reduce((sum, group) => sum + group.group_requirement, 0);
    const totalIndependent = independent[0].total_independent || 0;
    const savings = totalIndependent - totalShared;
    const savingsPercent = totalIndependent > 0 ? (savings / totalIndependent * 100).toFixed(1) : 0;
    
    res.json({
      total_independent: totalIndependent,
      total_with_sharing: totalShared,
      savings: savings,
      savings_percent: savingsPercent,
      share_groups: shared
    });
  } catch (error) {
    console.error('Error calculating personnel optimization:', error);
    res.status(500).json({ error: 'Failed to calculate optimization' });
  }
};
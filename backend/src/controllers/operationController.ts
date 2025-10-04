import { Request, Response } from 'express';
import pool from '../config/database';

// 生成下一个操作编码
const generateNextOperationCode = async (): Promise<string> => {
  const [rows] = await pool.execute(
    'SELECT operation_code FROM operations ORDER BY operation_code DESC LIMIT 1'
  ) as any;
  
  if (rows.length === 0) {
    return 'OP-00001';
  }
  
  const lastCode = rows[0].operation_code;
  const lastNumber = parseInt(lastCode.split('-')[1]);
  const nextNumber = lastNumber + 1;
  
  return `OP-${nextNumber.toString().padStart(5, '0')}`;
};

// 获取所有操作
export const getAllOperations = async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.execute(`
      SELECT 
        o.*,
        COUNT(DISTINCT oqr.qualification_id) as qualification_count
      FROM operations o
      LEFT JOIN operation_qualification_requirements oqr ON o.id = oqr.operation_id
      GROUP BY o.id
      ORDER BY o.operation_code
    `);
    
    res.json(rows);
  } catch (error) {
    console.error('Error fetching operations:', error);
    res.status(500).json({ error: 'Failed to fetch operations' });
  }
};

// 获取单个操作
export const getOperationById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      'SELECT * FROM operations WHERE id = ?',
      [id]
    ) as any;
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Operation not found' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching operation:', error);
    res.status(500).json({ error: 'Failed to fetch operation' });
  }
};

// 创建新操作
export const createOperation = async (req: Request, res: Response) => {
  try {
    const { operation_name, standard_time, required_people, description } = req.body;
    
    // 验证必填字段
    if (!operation_name || !standard_time) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // 生成操作编码
    const operation_code = await generateNextOperationCode();
    
    const [result] = await pool.execute(
      'INSERT INTO operations (operation_code, operation_name, standard_time, required_people, description) VALUES (?, ?, ?, ?, ?)',
      [operation_code, operation_name, standard_time, required_people || 1, description || null]
    ) as any;
    
    const newOperation = {
      id: result.insertId,
      operation_code,
      operation_name,
      standard_time,
      required_people: required_people || 1,
      description
    };
    
    res.status(201).json(newOperation);
  } catch (error) {
    console.error('Error creating operation:', error);
    res.status(500).json({ error: 'Failed to create operation' });
  }
};

// 更新操作
export const updateOperation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { operation_name, standard_time, required_people, description } = req.body;
    
    const [result] = await pool.execute(
      'UPDATE operations SET operation_name = ?, standard_time = ?, required_people = ?, description = ? WHERE id = ?',
      [operation_name, standard_time, required_people || 1, description || null, id]
    ) as any;
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Operation not found' });
    }
    
    res.json({ message: 'Operation updated successfully' });
  } catch (error) {
    console.error('Error updating operation:', error);
    res.status(500).json({ error: 'Failed to update operation' });
  }
};

// 删除操作
export const deleteOperation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // 检查是否有关联的资质要求
    const [requirements] = await pool.execute(
      'SELECT COUNT(*) as count FROM operation_qualification_requirements WHERE operation_id = ?',
      [id]
    ) as any;
    
    if (requirements[0].count > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete operation with existing qualification requirements' 
      });
    }
    
    // 检查是否在工艺阶段中使用
    const [schedules] = await pool.execute(
      'SELECT COUNT(*) as count FROM stage_operation_schedules WHERE operation_id = ?',
      [id]
    ) as any;
    
    if (schedules[0].count > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete operation that is used in process stages' 
      });
    }
    
    const [result] = await pool.execute(
      'DELETE FROM operations WHERE id = ?',
      [id]
    ) as any;
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Operation not found' });
    }
    
    res.json({ message: 'Operation deleted successfully' });
  } catch (error) {
    console.error('Error deleting operation:', error);
    res.status(500).json({ error: 'Failed to delete operation' });
  }
};

// 获取下一个操作编码预览
export const getNextOperationCode = async (req: Request, res: Response) => {
  try {
    const nextCode = await generateNextOperationCode();
    res.json({ nextCode });
  } catch (error) {
    console.error('Error getting next operation code:', error);
    res.status(500).json({ error: 'Failed to get next operation code' });
  }
};

// 获取操作统计信息
export const getOperationStatistics = async (req: Request, res: Response) => {
  try {
    const [stats] = await pool.execute(`
      SELECT 
        COUNT(*) as total_operations,
        AVG(standard_time) as avg_time,
        MIN(standard_time) as min_time,
        MAX(standard_time) as max_time,
        AVG(required_people) as avg_people
      FROM operations
    `) as any;
    
    const [peopleDistribution] = await pool.execute(`
      SELECT 
        required_people,
        COUNT(*) as count
      FROM operations
      GROUP BY required_people
      ORDER BY required_people
    `);
    
    res.json({
      summary: stats[0],
      peopleDistribution
    });
  } catch (error) {
    console.error('Error fetching operation statistics:', error);
    res.status(500).json({ error: 'Failed to fetch operation statistics' });
  }
};
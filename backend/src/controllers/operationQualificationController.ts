import { Request, Response } from 'express';
import pool from '../config/database';

// 获取操作的资质要求（按位置分组）
export const getOperationQualifications = async (req: Request, res: Response) => {
  try {
    const { operationId } = req.params;
    
    // 获取操作所需人数
    const [operationRows] = await pool.execute(
      'SELECT required_people FROM operations WHERE id = ?',
      [operationId]
    ) as any;
    
    if (operationRows.length === 0) {
      return res.status(404).json({ error: 'Operation not found' });
    }
    
    const requiredPeople = operationRows[0].required_people || 1;
    
    // 获取所有位置的资质要求
    const [requirements] = await pool.execute(`
      SELECT 
        oqr.*,
        q.qualification_name
      FROM operation_qualification_requirements oqr
      JOIN qualifications q ON oqr.qualification_id = q.id
      WHERE oqr.operation_id = ?
      ORDER BY oqr.position_number, oqr.is_mandatory DESC, q.qualification_name
    `, [operationId]);
    
    // 按位置分组
    const positionRequirements: any = {};
    for (let i = 1; i <= requiredPeople; i++) {
      positionRequirements[i] = [];
    }
    
    (requirements as any[]).forEach((req: any) => {
      if (positionRequirements[req.position_number]) {
        positionRequirements[req.position_number].push(req);
      }
    });
    
    res.json({
      requiredPeople,
      positionRequirements
    });
  } catch (error) {
    console.error('Error fetching operation qualifications:', error);
    res.status(500).json({ error: 'Failed to fetch operation qualifications' });
  }
};

// 设置某个位置的资质要求
export const setPositionQualifications = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();
  
  try {
    const { operationId, positionNumber } = req.params;
    const { qualifications } = req.body; // Array of qualification requirements for this position
    
    await connection.beginTransaction();
    
    // 删除该位置的现有资质要求
    await connection.execute(
      'DELETE FROM operation_qualification_requirements WHERE operation_id = ? AND position_number = ?',
      [operationId, positionNumber]
    );
    
    // 插入新的资质要求
    if (qualifications && qualifications.length > 0) {
      const values = qualifications.map((qual: any) => [
        operationId,
        positionNumber,
        qual.qualification_id,
        qual.min_level || 1,
        qual.is_mandatory !== undefined ? qual.is_mandatory : 1
      ]);
      
      const placeholders = values.map(() => '(?, ?, ?, ?, ?)').join(', ');
      const flatValues = values.flat();
      
      await connection.execute(
        `INSERT INTO operation_qualification_requirements 
         (operation_id, position_number, qualification_id, min_level, is_mandatory) 
         VALUES ${placeholders}`,
        flatValues
      );
    }
    
    await connection.commit();
    res.json({ message: 'Position qualifications updated successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error setting position qualifications:', error);
    res.status(500).json({ error: 'Failed to set position qualifications' });
  } finally {
    connection.release();
  }
};

// 添加单个资质要求到指定位置
export const addPositionQualification = async (req: Request, res: Response) => {
  try {
    const { operationId, positionNumber } = req.params;
    const { qualification_id, min_level, is_mandatory } = req.body;
    
    // 检查是否已存在相同资质
    const [existing] = await pool.execute(
      `SELECT * FROM operation_qualification_requirements 
       WHERE operation_id = ? AND position_number = ? AND qualification_id = ?`,
      [operationId, positionNumber, qualification_id]
    ) as any;
    
    if (existing.length > 0) {
      return res.status(400).json({ error: 'This qualification already exists for this position' });
    }
    
    const [result] = await pool.execute(
      `INSERT INTO operation_qualification_requirements 
       (operation_id, position_number, qualification_id, min_level, is_mandatory) 
       VALUES (?, ?, ?, ?, ?)`,
      [operationId, positionNumber, qualification_id, min_level || 1, is_mandatory !== undefined ? is_mandatory : 1]
    ) as any;
    
    res.status(201).json({ 
      id: result.insertId,
      message: 'Qualification requirement added successfully' 
    });
  } catch (error) {
    console.error('Error adding position qualification:', error);
    res.status(500).json({ error: 'Failed to add position qualification' });
  }
};

// 删除指定位置的资质要求
export const removePositionQualification = async (req: Request, res: Response) => {
  try {
    const { requirementId } = req.params;
    
    const [result] = await pool.execute(
      'DELETE FROM operation_qualification_requirements WHERE id = ?',
      [requirementId]
    ) as any;
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Qualification requirement not found' });
    }
    
    res.json({ message: 'Qualification requirement removed successfully' });
  } catch (error) {
    console.error('Error removing position qualification:', error);
    res.status(500).json({ error: 'Failed to remove position qualification' });
  }
};

// 复制位置的资质要求到另一个位置
export const copyPositionQualifications = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();
  
  try {
    const { operationId } = req.params;
    const { fromPosition, toPosition } = req.body;
    
    await connection.beginTransaction();
    
    // 删除目标位置的现有要求
    await connection.execute(
      'DELETE FROM operation_qualification_requirements WHERE operation_id = ? AND position_number = ?',
      [operationId, toPosition]
    );
    
    // 复制源位置的要求到目标位置
    await connection.execute(
      `INSERT INTO operation_qualification_requirements 
       (operation_id, position_number, qualification_id, min_level, is_mandatory)
       SELECT operation_id, ?, qualification_id, min_level, is_mandatory
       FROM operation_qualification_requirements
       WHERE operation_id = ? AND position_number = ?`,
      [toPosition, operationId, fromPosition]
    );
    
    await connection.commit();
    res.json({ message: 'Position qualifications copied successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error copying position qualifications:', error);
    res.status(500).json({ error: 'Failed to copy position qualifications' });
  } finally {
    connection.release();
  }
};

// 获取所有可用的资质列表
export const getAvailableQualifications = async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, qualification_name FROM qualifications ORDER BY qualification_name'
    );
    
    res.json(rows);
  } catch (error) {
    console.error('Error fetching available qualifications:', error);
    res.status(500).json({ error: 'Failed to fetch available qualifications' });
  }
};
import { Request, Response } from 'express';
import pool from '../config/database';

export const getQualificationMatrix = async (req: Request, res: Response) => {
  try {
    // 获取所有人员
    const [employees] = await pool.execute(`
      SELECT
        e.id,
        e.employee_code,
        e.employee_name,
        COALESCE(
          CASE
            WHEN u1.unit_type = 'DEPARTMENT' THEN u1.unit_name
            WHEN u1.unit_type = 'TEAM' AND u2.unit_type = 'DEPARTMENT' THEN u2.unit_name
            WHEN u1.unit_type IN ('GROUP', 'SHIFT') AND u3.unit_type = 'DEPARTMENT' THEN u3.unit_name
            ELSE NULL
          END,
          ''
        ) AS department,
        COALESCE(r.role_name, '') AS position
      FROM employees e
      LEFT JOIN organization_units u1 ON u1.id = e.unit_id
      LEFT JOIN organization_units u2 ON u2.id = u1.parent_id
      LEFT JOIN organization_units u3 ON u3.id = u2.parent_id
      LEFT JOIN employee_roles r ON r.id = e.primary_role_id
      ORDER BY e.employee_name
    `);

    // 获取所有资质
    const [qualifications] = await pool.execute(`
      SELECT id, qualification_name
      FROM qualifications
      ORDER BY qualification_name
    `);

    // 获取所有人员资质关系
    const [employeeQualifications] = await pool.execute(`
      SELECT 
        eq.id,
        eq.employee_id,
        eq.qualification_id,
        eq.qualification_level,
        e.employee_name,
        e.employee_code,
        q.qualification_name
      FROM employee_qualifications eq
      JOIN employees e ON eq.employee_id = e.id
      JOIN qualifications q ON eq.qualification_id = q.id
      ORDER BY e.employee_name, q.qualification_name
    `);

    res.json({
      employees,
      qualifications,
      matrix: employeeQualifications
    });
  } catch (error) {
    console.error('Error fetching qualification matrix:', error);
    res.status(500).json({ error: 'Failed to fetch qualification matrix' });
  }
};

export const getQualificationStatistics = async (req: Request, res: Response) => {
  try {
    // 获取总体统计信息
    const [totalStats] = await pool.execute(`
      SELECT 
        COUNT(DISTINCT e.id) as total_employees,
        COUNT(DISTINCT q.id) as total_qualifications,
        COUNT(eq.id) as total_assignments,
        AVG(eq.qualification_level) as avg_level
      FROM employees e
      CROSS JOIN qualifications q
      LEFT JOIN employee_qualifications eq ON e.id = eq.employee_id AND q.id = eq.qualification_id
    `);

    // 获取各等级分布
    const [levelDistribution] = await pool.execute(`
      SELECT 
        qualification_level,
        COUNT(*) as count
      FROM employee_qualifications
      GROUP BY qualification_level
      ORDER BY qualification_level
    `);

    // 获取资质覆盖率
    const [qualificationCoverage] = await pool.execute(`
      SELECT 
        q.id,
        q.qualification_name,
        COUNT(eq.id) as assigned_count,
        (SELECT COUNT(*) FROM employees) as total_employees,
        ROUND((COUNT(eq.id) * 100.0 / (SELECT COUNT(*) FROM employees)), 2) as coverage_percentage
      FROM qualifications q
      LEFT JOIN employee_qualifications eq ON q.id = eq.qualification_id
      GROUP BY q.id, q.qualification_name
      ORDER BY coverage_percentage DESC
    `);

    // 获取人员资质完整度
    const [employeeCompleteness] = await pool.execute(`
      SELECT 
        e.id,
        e.employee_name,
        e.employee_code,
        COUNT(eq.id) as assigned_qualifications,
        (SELECT COUNT(*) FROM qualifications) as total_qualifications,
        ROUND((COUNT(eq.id) * 100.0 / (SELECT COUNT(*) FROM qualifications)), 2) as completeness_percentage
      FROM employees e
      LEFT JOIN employee_qualifications eq ON e.id = eq.employee_id
      GROUP BY e.id, e.employee_name, e.employee_code
      ORDER BY completeness_percentage DESC
    `);

    res.json({
      totalStats: (totalStats as any[])[0],
      levelDistribution,
      qualificationCoverage,
      employeeCompleteness
    });
  } catch (error) {
    console.error('Error fetching qualification statistics:', error);
    res.status(500).json({ error: 'Failed to fetch qualification statistics' });
  }
};

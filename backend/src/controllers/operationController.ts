import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';

interface OperationQualificationRequirementRow extends RowDataPacket {
  operation_id: number;
  position_number: number;
  qualification_id: number;
  qualification_name: string;
  min_level: number;
  is_mandatory: number;
}

interface EmployeeQualificationRow extends RowDataPacket {
  employee_qualification_id: number | null;
  employee_id: number;
  employee_code: string;
  employee_name: string;
  department_name: string | null;
  team_name: string | null;
  unit_name: string | null;
  position_name: string | null;
  qualification_id: number | null;
  qualification_name: string | null;
  qualification_level: number | null;
}

interface EmployeeQualificationSummary {
  id: number | null;
  qualification_id: number;
  qualification_name: string;
  qualification_level: number;
}

interface QualifiedEmployee {
  employee_id: number;
  employee_code: string;
  employee_name: string;
  department_name: string | null;
  team_name: string | null;
  unit_name: string | null;
  position_name: string | null;
  qualifications: EmployeeQualificationSummary[];
}

const buildQualifiedEmployees = (rows: EmployeeQualificationRow[]): QualifiedEmployee[] => {
  const employees = new Map<number, QualifiedEmployee>();

  rows.forEach((row) => {
    const employeeId = Number(row.employee_id);
    if (!Number.isFinite(employeeId)) return;

    if (!employees.has(employeeId)) {
      employees.set(employeeId, {
        employee_id: employeeId,
        employee_code: row.employee_code,
        employee_name: row.employee_name,
        department_name: row.department_name ?? null,
        team_name: row.team_name ?? null,
        unit_name: row.unit_name ?? null,
        position_name: row.position_name ?? null,
        qualifications: [],
      });
    }

    const qualificationId = row.qualification_id === null ? null : Number(row.qualification_id);
    const qualificationLevel = row.qualification_level === null ? null : Number(row.qualification_level);
    const employeeQualificationId =
      row.employee_qualification_id === null || row.employee_qualification_id === undefined
        ? null
        : Number(row.employee_qualification_id);
    if (qualificationId && qualificationLevel && row.qualification_name) {
      employees.get(employeeId)!.qualifications.push({
        id: Number.isFinite(employeeQualificationId) ? employeeQualificationId : null,
        qualification_id: qualificationId,
        qualification_name: row.qualification_name,
        qualification_level: qualificationLevel,
      });
    }
  });

  return Array.from(employees.values());
};

const fetchActiveEmployeesWithQualifications = async (): Promise<QualifiedEmployee[]> => {
  const [rows] = await pool.execute<EmployeeQualificationRow[]>(
    `
      SELECT
        e.id AS employee_id,
        e.employee_code,
        e.employee_name,
        CASE
          WHEN u1.unit_type = 'DEPARTMENT' THEN u1.unit_name
          WHEN u1.unit_type = 'TEAM' AND u2.unit_type = 'DEPARTMENT' THEN u2.unit_name
          WHEN u1.unit_type IN ('GROUP', 'SHIFT') AND u3.unit_type = 'DEPARTMENT' THEN u3.unit_name
          ELSE NULL
        END AS department_name,
        CASE
          WHEN u1.unit_type = 'TEAM' THEN u1.unit_name
          WHEN u1.unit_type IN ('GROUP', 'SHIFT') AND u2.unit_type = 'TEAM' THEN u2.unit_name
          ELSE NULL
        END AS team_name,
        u1.unit_name AS unit_name,
        r.role_name AS position_name,
        eq.id AS employee_qualification_id,
        eq.qualification_id,
        q.qualification_name,
        eq.qualification_level
      FROM employees e
      LEFT JOIN organization_units u1 ON u1.id = e.unit_id
      LEFT JOIN organization_units u2 ON u2.id = u1.parent_id
      LEFT JOIN organization_units u3 ON u3.id = u2.parent_id
      LEFT JOIN employee_roles r ON r.id = e.primary_role_id
      LEFT JOIN employee_qualifications eq ON eq.employee_id = e.id
      LEFT JOIN qualifications q ON q.id = eq.qualification_id
      WHERE COALESCE(e.employment_status, 'ACTIVE') = 'ACTIVE'
      ORDER BY e.employee_code, e.employee_name, q.qualification_name
    `,
  );

  return buildQualifiedEmployees(rows);
};

const groupRequirementsByOperationAndPosition = (rows: OperationQualificationRequirementRow[]) => {
  const grouped = new Map<number, Map<number, OperationQualificationRequirementRow[]>>();

  rows.forEach((row) => {
    const operationId = Number(row.operation_id);
    const positionNumber = Number(row.position_number);
    if (!Number.isFinite(operationId) || !Number.isFinite(positionNumber)) return;

    if (!grouped.has(operationId)) {
      grouped.set(operationId, new Map());
    }
    const byPosition = grouped.get(operationId)!;
    if (!byPosition.has(positionNumber)) {
      byPosition.set(positionNumber, []);
    }
    byPosition.get(positionNumber)!.push(row);
  });

  return grouped;
};

const getMandatoryRequirements = (requirements: OperationQualificationRequirementRow[]) =>
  requirements.filter((requirement) => Number(requirement.is_mandatory) === 1);

const isEmployeeQualifiedForPosition = (
  employee: QualifiedEmployee,
  requirements: OperationQualificationRequirementRow[],
) => {
  const mandatoryRequirements = getMandatoryRequirements(requirements);
  if (mandatoryRequirements.length === 0) {
    return requirements.length > 0;
  }

  return mandatoryRequirements.every((requirement) => {
    const requiredLevel = Number(requirement.min_level || 1);
    return employee.qualifications.some((qualification) =>
      qualification.qualification_id === Number(requirement.qualification_id)
      && qualification.qualification_level >= requiredLevel
    );
  });
};

const getQualifiedEmployeesForPosition = (
  employees: QualifiedEmployee[],
  requirements: OperationQualificationRequirementRow[],
) => employees.filter((employee) => isEmployeeQualifiedForPosition(employee, requirements));

// 生成下一个操作编码
const generateNextOperationCode = async (): Promise<string> => {
  // 仅在规范的 OP-NNNNN 编码中取最大序号；忽略历史/脏的非规范编码
  // （如 SPI_*、TAT9_*、SUS-BAG-*，乃至 OP-00NaN）。
  // 旧实现用 `ORDER BY operation_code DESC LIMIT 1` 取到非数字编码后
  // `parseInt(code.split('-')[1])` 得到 NaN，生成出 "OP-00NaN"，写入时
  // 唯一键冲突直接 500（审计 OPCRUD-02）。
  const [rows] = await pool.execute(
    `SELECT MAX(CAST(SUBSTRING(operation_code, 4) AS UNSIGNED)) AS max_num
     FROM operations
     WHERE operation_code REGEXP '^OP-[0-9]+$'`
  ) as any;

  const maxNum = Number(rows[0]?.max_num ?? 0);
  return `OP-${(maxNum + 1).toString().padStart(5, '0')}`;
};

// 获取所有操作
export const getAllOperations = async (req: Request, res: Response) => {
  try {
    const { team_id } = req.query;
    const params: unknown[] = [];
    let whereClause = '';
    if (team_id) {
      whereClause = 'WHERE ot.team_id = ?';
      params.push(team_id);
    }

    const [rows] = await pool.execute(`
      SELECT 
        o.*,
        ot.type_code as operation_type_code,
        ot.type_name as operation_type_name,
        ot.color as operation_type_color,
        ot.team_id,
        ou.unit_code as team_code,
        ou.unit_name as team_name,
        COALESCE(oq.qualification_count, 0) as qualification_count
      FROM operations o
      LEFT JOIN operation_types ot ON (
        o.operation_type_id = ot.id
        OR (o.operation_type_id IS NULL AND o.operation_type COLLATE utf8mb4_unicode_ci = ot.type_code)
      )
      LEFT JOIN organization_units ou ON ot.team_id = ou.id
      LEFT JOIN (
        SELECT operation_id, COUNT(DISTINCT qualification_id) as qualification_count
        FROM operation_qualification_requirements
        GROUP BY operation_id
      ) oq ON o.id = oq.operation_id
      ${whereClause}
      ORDER BY ou.unit_code, o.operation_code
    `, params);

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
    const { operation_name, standard_time, required_people, description, operation_type_id } = req.body;

    // 验证必填字段
    if (!operation_name || !standard_time) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // 生成操作编码
    const operation_code = await generateNextOperationCode();

    const [result] = await pool.execute(
      'INSERT INTO operations (operation_code, operation_name, standard_time, required_people, description, operation_type_id) VALUES (?, ?, ?, ?, ?, ?)',
      [operation_code, operation_name, standard_time, required_people || 1, description || null, operation_type_id || null]
    ) as any;

    const newOperation = {
      id: result.insertId,
      operation_code,
      operation_name,
      standard_time,
      required_people: required_people || 1,
      description,
      operation_type_id: operation_type_id || null
    };

    res.status(201).json(newOperation);
  } catch (error) {
    console.error('Error creating operation:', error);
    res.status(500).json({ error: 'Failed to create operation' });
  }
};

// 更新操作
export const updateOperation = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;
    const { operation_name, standard_time, required_people, description, operation_type_id } = req.body;

    const nextRequiredPeople = required_people || 1;

    await connection.beginTransaction();

    const [result] = await connection.execute(
      'UPDATE operations SET operation_name = ?, standard_time = ?, required_people = ?, description = ?, operation_type_id = ? WHERE id = ?',
      [operation_name, standard_time, nextRequiredPeople, description || null, operation_type_id || null, id]
    ) as any;

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Operation not found' });
    }

    // 收口高位资质需求：所需人数缩减后，删除 position_number 超出新人数的孤儿资质行。
    // 读取侧(getOperationQualifications)与 V4 消费侧(DataAssemblerV4)都只遍历 1..required_people，
    // 残留的高位行会被静默忽略、长期堆积，且日后人数再调大会复用到旧资质。
    // 该 DELETE 幂等——人数未变/增大时无 position_number 越界行可删，命中 0 行。
    await connection.execute(
      'DELETE FROM operation_qualification_requirements WHERE operation_id = ? AND position_number > ?',
      [id, nextRequiredPeople]
    );

    await connection.commit();
    res.json({ message: 'Operation updated successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating operation:', error);
    res.status(500).json({ error: 'Failed to update operation' });
  } finally {
    connection.release();
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

// 获取各操作按位置的合格人数
export const getQualifiedPersonnelByOperation = async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.execute<OperationQualificationRequirementRow[]>(`
      SELECT 
        oqr.operation_id,
        oqr.position_number,
        oqr.qualification_id,
        q.qualification_name,
        oqr.min_level,
        oqr.is_mandatory
      FROM operation_qualification_requirements oqr
      JOIN qualifications q ON oqr.qualification_id = q.id
      ORDER BY oqr.operation_id, oqr.position_number, oqr.is_mandatory DESC, q.qualification_name
    `);

    const employees = await fetchActiveEmployeesWithQualifications();
    const groupedRequirements = groupRequirementsByOperationAndPosition(rows);

    // 转换为简化格式：operation_id -> [position1_count, position2_count, ...]
    const result: { [key: number]: number[] } = {};
    groupedRequirements.forEach((positions, opId) => {
      const positionCounts: number[] = [];
      const maxPosition = Math.max(...Array.from(positions.keys()));
      for (let i = 1; i <= maxPosition; i++) {
        const requirements = positions.get(i) || [];
        positionCounts.push(getQualifiedEmployeesForPosition(employees, requirements).length);
      }
      result[opId] = positionCounts;
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching qualified personnel:', error);
    res.status(500).json({ error: 'Failed to fetch qualified personnel' });
  }
};

// 获取单个操作按位置的合格人员明细
export const getQualifiedPersonnelDetailsByOperation = async (req: Request, res: Response) => {
  try {
    const operationId = Number(req.params.id);
    if (!Number.isFinite(operationId) || operationId <= 0) {
      return res.status(400).json({ error: 'Invalid operation id' });
    }

    const [operationRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, operation_code, operation_name, required_people
       FROM operations
       WHERE id = ?`,
      [operationId],
    );

    if (operationRows.length === 0) {
      return res.status(404).json({ error: 'Operation not found' });
    }

    const operation = operationRows[0];
    const requiredPeople = Number(operation.required_people || 1);

    const [requirementRows] = await pool.execute<OperationQualificationRequirementRow[]>(
      `
        SELECT
          oqr.operation_id,
          oqr.position_number,
          oqr.qualification_id,
          q.qualification_name,
          oqr.min_level,
          oqr.is_mandatory
        FROM operation_qualification_requirements oqr
        JOIN qualifications q ON q.id = oqr.qualification_id
        WHERE oqr.operation_id = ?
          AND oqr.position_number BETWEEN 1 AND ?
        ORDER BY oqr.position_number, oqr.is_mandatory DESC, q.qualification_name
      `,
      [operationId, requiredPeople],
    );

    const employees = await fetchActiveEmployeesWithQualifications();
    const requirementsByPosition =
      groupRequirementsByOperationAndPosition(requirementRows).get(operationId)
      || new Map<number, OperationQualificationRequirementRow[]>();

    const positions = Array.from({ length: requiredPeople }, (_, index) => {
      const positionNumber = index + 1;
      const requirements = requirementsByPosition.get(positionNumber) || [];
      const personnel = getQualifiedEmployeesForPosition(employees, requirements);

      return {
        position_number: positionNumber,
        qualified_count: personnel.length,
        requirements: requirements.map((requirement) => ({
          qualification_id: Number(requirement.qualification_id),
          qualification_name: requirement.qualification_name,
          min_level: Number(requirement.min_level || 1),
          is_mandatory: Number(requirement.is_mandatory) === 1,
        })),
        personnel,
      };
    });

    res.json({
      operation_id: Number(operation.id),
      operation_code: operation.operation_code,
      operation_name: operation.operation_name,
      required_people: requiredPeople,
      positions,
    });
  } catch (error) {
    console.error('Error fetching qualified personnel details:', error);
    res.status(500).json({ error: 'Failed to fetch qualified personnel details' });
  }
};

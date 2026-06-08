import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import pool from '../../config/database';
import type { Permission, Role, UserEmployeeLink } from '../../domain/governance/rbacTypes';
import { mapPermissionRow, mapRoleRow, mapUserEmployeeLinkRow } from '../../mappers/governance/RbacMapper';

export class RbacDirectoryService {
  static async getUserRoles(userId: number): Promise<Role[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT r.*
       FROM user_role_assignments ura
       JOIN roles r ON r.id = ura.role_id
       WHERE ura.user_id = ?
         AND ura.assignment_status = 'ACTIVE'
         AND (ura.effective_to IS NULL OR ura.effective_to > NOW())
         AND r.role_status = 'ACTIVE'
       ORDER BY r.role_scope, r.role_code`,
      [userId],
    );
    return rows.map(mapRoleRow);
  }

  static async getUserPermissions(userId: number): Promise<Permission[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT DISTINCT p.*
       FROM user_role_assignments ura
       JOIN role_permissions rp ON rp.role_id = ura.role_id AND rp.grant_status = 'ACTIVE'
       JOIN permissions p ON p.id = rp.permission_id
       JOIN roles r ON r.id = ura.role_id
       WHERE ura.user_id = ?
         AND ura.assignment_status = 'ACTIVE'
         AND (ura.effective_to IS NULL OR ura.effective_to > NOW())
         AND r.role_status = 'ACTIVE'
         AND p.permission_status = 'ACTIVE'
       ORDER BY p.permission_domain, p.resource_code, p.action_code`,
      [userId],
    );
    return rows.map(mapPermissionRow);
  }

  static async hasPermission(userId: number, permissionCode: string): Promise<boolean> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT p.id
       FROM user_role_assignments ura
       JOIN role_permissions rp ON rp.role_id = ura.role_id AND rp.grant_status = 'ACTIVE'
       JOIN permissions p ON p.id = rp.permission_id
       WHERE ura.user_id = ?
         AND p.permission_code = ?
         AND ura.assignment_status = 'ACTIVE'
         AND (ura.effective_to IS NULL OR ura.effective_to > NOW())
         AND p.permission_status = 'ACTIVE'
       LIMIT 1`,
      [userId, permissionCode],
    );
    return rows.length > 0;
  }

  static async linkUserEmployee(userId: number, employeeId: number, linkedBy?: number | null): Promise<UserEmployeeLink> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.execute(
        `UPDATE user_employee_links
         SET link_status = 'INACTIVE', effective_to = NOW()
         WHERE user_id = ?
           AND employee_id = ?
           AND link_status = 'ACTIVE'
           AND effective_to IS NULL`,
        [userId, employeeId],
      );

      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO user_employee_links (user_id, employee_id, linked_by)
         VALUES (?, ?, ?)`,
        [userId, employeeId, linkedBy ?? null],
      );

      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT * FROM user_employee_links WHERE id = ?`,
        [result.insertId],
      );

      await connection.commit();
      return mapUserEmployeeLinkRow(rows[0]);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 查当前 user 绑定的员工(ACTIVE 连接)。员工自助接口用它把登录身份解析成 employeeId。
   * 无绑定 → null(调用方据此拒绝:账号未关联员工)。
   */
  static async getLinkedEmployee(
    userId: number,
  ): Promise<{ employeeId: number; employeeCode: string; employeeName: string } | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT e.id AS employeeId, e.employee_code AS employeeCode, e.employee_name AS employeeName
       FROM user_employee_links uel
       JOIN employees e ON e.id = uel.employee_id
       WHERE uel.user_id = ?
         AND uel.link_status = 'ACTIVE'
         AND (uel.effective_to IS NULL OR uel.effective_to > NOW())
       ORDER BY uel.effective_from DESC, uel.id DESC
       LIMIT 1`,
      [userId],
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      employeeId: Number(r.employeeId),
      employeeCode: String(r.employeeCode ?? ''),
      employeeName: String(r.employeeName ?? ''),
    };
  }

  static async revokeUserRole(userId: number, roleId: number, revokedBy?: number | null, reasonText?: string | null): Promise<void> {
    // revoked_by 记录撤销人，assigned_by 保留原授予人（不被撤销人覆盖，保全审计）。
    await pool.execute(
      `UPDATE user_role_assignments
       SET assignment_status = 'REVOKED',
           effective_to = COALESCE(effective_to, NOW()),
           reason_text = COALESCE(?, reason_text),
           revoked_by = COALESCE(?, revoked_by)
       WHERE user_id = ?
         AND role_id = ?
         AND assignment_status = 'ACTIVE'
         AND effective_to IS NULL`,
      [reasonText ?? null, revokedBy ?? null, userId, roleId],
    );
  }
}

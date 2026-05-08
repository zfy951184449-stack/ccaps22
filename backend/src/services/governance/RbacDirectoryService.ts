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

  static async revokeUserRole(userId: number, roleId: number, revokedBy?: number | null, reasonText?: string | null): Promise<void> {
    await pool.execute(
      `UPDATE user_role_assignments
       SET assignment_status = 'REVOKED',
           effective_to = COALESCE(effective_to, NOW()),
           reason_text = COALESCE(?, reason_text),
           assigned_by = COALESCE(?, assigned_by)
       WHERE user_id = ?
         AND role_id = ?
         AND assignment_status = 'ACTIVE'
         AND effective_to IS NULL`,
      [reasonText ?? null, revokedBy ?? null, userId, roleId],
    );
  }
}

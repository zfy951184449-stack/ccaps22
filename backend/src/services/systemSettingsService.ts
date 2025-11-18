import { RowDataPacket } from 'mysql2';
import pool from '../config/database';

interface SystemSettingRow extends RowDataPacket {
  setting_key: string;
  setting_value: string | null;
  description?: string | null;
  updated_by?: string | null;
  updated_at?: string;
}

class SystemSettingsService {
  private static tableEnsured = false;

  private static async ensureTable(): Promise<void> {
    if (SystemSettingsService.tableEnsured) {
      return;
    }
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS system_settings (
        id INT PRIMARY KEY AUTO_INCREMENT,
        setting_key VARCHAR(100) NOT NULL UNIQUE,
        setting_value TEXT NULL,
        description VARCHAR(255) NULL,
        updated_by VARCHAR(100) NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通用系统配置';
    `;
    await pool.query(createTableSql);
    SystemSettingsService.tableEnsured = true;
  }

  static async getSetting(key: string): Promise<string | null> {
    try {
      await SystemSettingsService.ensureTable();
      const [rows] = await pool.execute<SystemSettingRow[]>(
        'SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1',
        [key],
      );
      if (Array.isArray(rows) && rows.length > 0) {
        return rows[0].setting_value ?? null;
      }
      return null;
    } catch (error) {
      console.error(`Failed to read system setting ${key}:`, error);
      return null;
    }
  }

  static async setSetting(key: string, value: string | null, options?: { description?: string; updatedBy?: string | number | null }): Promise<void> {
    await SystemSettingsService.ensureTable();
    await pool.execute(
      `INSERT INTO system_settings (setting_key, setting_value, description, updated_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         setting_value = VALUES(setting_value),
         description = VALUES(description),
         updated_by = VALUES(updated_by),
         updated_at = CURRENT_TIMESTAMP`,
      [key, value, options?.description ?? null, options?.updatedBy?.toString() ?? null],
    );
  }
}

export default SystemSettingsService;

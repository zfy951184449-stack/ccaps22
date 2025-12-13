import { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);

// Backup directory path (relative to project root)
const BACKUP_DIR = path.resolve(__dirname, '../../../database/backups');

// Ensure backup directory exists
function ensureBackupDir(): void {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
}

interface BackupInfo {
    filename: string;
    filepath: string;
    size: number;
    sizeFormatted: string;
    createdAt: string;
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getBackupInfo(filename: string): BackupInfo | null {
    const filepath = path.join(BACKUP_DIR, filename);
    if (!fs.existsSync(filepath)) return null;

    const stats = fs.statSync(filepath);
    return {
        filename,
        filepath,
        size: stats.size,
        sizeFormatted: formatFileSize(stats.size),
        createdAt: stats.mtime.toISOString(),
    };
}

/**
 * Export database to SQL file using mysqldump
 */
export async function exportDatabase(req: Request, res: Response): Promise<void> {
    try {
        ensureBackupDir();

        const dbHost = process.env.DB_HOST || 'localhost';
        const dbUser = process.env.DB_USER || 'root';
        const dbPassword = process.env.DB_PASSWORD || '';
        const dbName = process.env.DB_NAME || 'aps_system';
        const dbPort = process.env.DB_PORT || '3306';

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
        const filename = `${dbName}_${timestamp}.sql`;
        const filepath = path.join(BACKUP_DIR, filename);

        // Build mysqldump command
        let command = `mysqldump -h ${dbHost} -P ${dbPort} -u ${dbUser}`;
        if (dbPassword) {
            command += ` -p'${dbPassword}'`;
        }
        command += ` --single-transaction --routines --triggers ${dbName} > "${filepath}"`;

        console.log(`Executing database export to: ${filepath}`);

        await execAsync(command, { shell: '/bin/bash' });

        // Verify the file was created
        if (!fs.existsSync(filepath)) {
            res.status(500).json({ error: 'Export failed: backup file was not created' });
            return;
        }

        const backupInfo = getBackupInfo(filename);
        if (!backupInfo) {
            res.status(500).json({ error: 'Export completed but failed to read backup info' });
            return;
        }

        console.log(`Database export completed: ${filename} (${backupInfo.sizeFormatted})`);

        res.json({
            success: true,
            message: 'Database exported successfully',
            backup: backupInfo,
        });
    } catch (error: any) {
        console.error('Database export error:', error);
        res.status(500).json({
            error: 'Failed to export database',
            details: error.message || String(error),
        });
    }
}

/**
 * Get the latest backup status
 */
export async function getBackupStatus(req: Request, res: Response): Promise<void> {
    try {
        ensureBackupDir();

        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.endsWith('.sql'))
            .sort()
            .reverse();

        if (files.length === 0) {
            res.json({
                hasBackup: false,
                latestBackup: null,
                backupDir: BACKUP_DIR,
            });
            return;
        }

        const latestBackup = getBackupInfo(files[0]);

        res.json({
            hasBackup: true,
            latestBackup,
            backupDir: BACKUP_DIR,
            totalBackups: files.length,
        });
    } catch (error: any) {
        console.error('Get backup status error:', error);
        res.status(500).json({
            error: 'Failed to get backup status',
            details: error.message || String(error),
        });
    }
}

/**
 * List all backup files
 */
export async function listBackups(req: Request, res: Response): Promise<void> {
    try {
        ensureBackupDir();

        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.endsWith('.sql'))
            .sort()
            .reverse();

        const backups = files
            .map(f => getBackupInfo(f))
            .filter((b): b is BackupInfo => b !== null);

        res.json({
            backups,
            total: backups.length,
            backupDir: BACKUP_DIR,
        });
    } catch (error: any) {
        console.error('List backups error:', error);
        res.status(500).json({
            error: 'Failed to list backups',
            details: error.message || String(error),
        });
    }
}

/**
 * Delete a specific backup file
 */
export async function deleteBackup(req: Request, res: Response): Promise<void> {
    try {
        const { filename } = req.params;

        if (!filename || !filename.endsWith('.sql')) {
            res.status(400).json({ error: 'Invalid filename' });
            return;
        }

        const filepath = path.join(BACKUP_DIR, filename);

        // Security check: ensure the file is within the backup directory
        if (!filepath.startsWith(BACKUP_DIR)) {
            res.status(400).json({ error: 'Invalid file path' });
            return;
        }

        if (!fs.existsSync(filepath)) {
            res.status(404).json({ error: 'Backup file not found' });
            return;
        }

        fs.unlinkSync(filepath);

        console.log(`Backup deleted: ${filename}`);

        res.json({
            success: true,
            message: 'Backup deleted successfully',
            filename,
        });
    } catch (error: any) {
        console.error('Delete backup error:', error);
        res.status(500).json({
            error: 'Failed to delete backup',
            details: error.message || String(error),
        });
    }
}

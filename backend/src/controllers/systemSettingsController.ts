import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import dayjs from 'dayjs';

const execPromise = util.promisify(exec);

// Helper to read config file without loading it into process.env
const readEnvFile = (filePath: string): any => {
    if (!fs.existsSync(filePath)) return {};
    return dotenv.parse(fs.readFileSync(filePath));
};

const ROOT_DIR = path.resolve(__dirname, '../../'); // backend root
const ENV_PATH = path.join(ROOT_DIR, '.env');
const ENV_CLOUD_PATH = path.join(ROOT_DIR, '.env.cloud');
const ENV_LOCAL_PATH = path.join(ROOT_DIR, '.env.local');

// Get current DB Config mode
export const getDbConfig = async (req: Request, res: Response) => {
    const currentHost = process.env.DB_HOST || '';
    // Simple heuristic: if host contains 'aliyuncs', it's cloud. Else local.
    const mode = currentHost.includes('aliyuncs.com') ? 'cloud' : 'local';
    res.json({ mode, host: currentHost });
};

// Switch DB Config
export const updateDbConfig = async (req: Request, res: Response) => {
    const { mode } = req.body;
    if (mode !== 'cloud' && mode !== 'local') {
        return res.status(400).json({ error: 'Invalid mode' });
    }

    const sourcePath = mode === 'cloud' ? ENV_CLOUD_PATH : ENV_LOCAL_PATH;

    if (!fs.existsSync(sourcePath)) {
        return res.status(404).json({ error: `Configuration file for ${mode} not found` });
    }

    try {
        // Copy file content
        fs.copyFileSync(sourcePath, ENV_PATH);

        // Force restart by touching server.ts (ts-node-dev watches this)
        const serverFile = path.join(ROOT_DIR, 'src', 'server.ts');
        if (fs.existsSync(serverFile)) {
            const now = new Date();
            fs.utimesSync(serverFile, now, now);
        }

        // Response before restart (frontend should handle the grace period)
        res.json({ message: `Switched to ${mode}. Server restarting...` });

        // Forced restart via touch if nodemon doesn't pick up immidiately, 
        // but fs.copyFileSync triggers change event usually.
        // We can explicitly kill process to force restart if managed by PM2/Nodemon
        // process.exit(0); // Optional: let the file watcher do it
    } catch (error: any) {
        console.error('Switch Config Error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Sync Database
export const syncDb = async (req: Request, res: Response) => {
    const { direction, force } = req.body; // direction: 'up' (local->cloud) | 'down' (cloud->local)

    if (direction !== 'up' && direction !== 'down') {
        return res.status(400).json({ error: 'Invalid direction' });
    }

    // Load configs
    const localConfig = readEnvFile(ENV_LOCAL_PATH);
    const cloudConfig = readEnvFile(ENV_CLOUD_PATH);

    if (!localConfig.DB_HOST || !cloudConfig.DB_HOST) {
        return res.status(500).json({ error: 'Missing environment configuration files' });
    }

    const sourceConfig = direction === 'up' ? localConfig : cloudConfig;
    const targetConfig = direction === 'up' ? cloudConfig : localConfig;

    try {
        // 1. Safety Check (Timestamp)
        if (!force) {
            const getLatestUpdate = async (config: any) => {
                const conn = await mysql.createConnection({
                    host: config.DB_HOST,
                    user: config.DB_USER,
                    password: config.DB_PASSWORD,
                    database: config.DB_NAME,
                    port: Number(config.DB_PORT) || 3306
                });
                try {
                    // Check production_batch_plans updated_at
                    const [rows] = await conn.query('SELECT MAX(updated_at) as last_update FROM production_batch_plans');
                    await conn.end();
                    return (rows as any)[0].last_update ? dayjs((rows as any)[0].last_update) : dayjs(0);
                } catch (e) {
                    await conn.end();
                    return dayjs(0); // Table might be empty or missing
                }
            };

            const sourceTime = await getLatestUpdate(sourceConfig);
            const targetTime = await getLatestUpdate(targetConfig);

            // If Target is NEWER than Source (and diff > 1 minute), warn user
            if (targetTime.isAfter(sourceTime.add(1, 'minute'))) {
                return res.status(409).json({
                    error: 'Target database has newer data!',
                    sourceTime: sourceTime.format('YYYY-MM-DD HH:mm:ss'),
                    targetTime: targetTime.format('YYYY-MM-DD HH:mm:ss'),
                    message: `Target (${direction === 'up' ? 'Cloud' : 'Local'}) is newer than Source.`
                });
            }
        }

        // 2. Execute Sync via mysqldump
        // Requires mysql and mysqldump in PATH
        // Dumping Source -> Piping to Target

        // Construct commands
        // FLags explained:
        // --routines: Include stored procedures and functions (Critical for this project)
        // --triggers: Include triggers (Default on, but explicit is safer)
        // --events: Include scheduled events
        // --add-drop-table: Drop table before creating (Default on, needed for overwrite)
        const dumpCmd = `mysqldump -h ${sourceConfig.DB_HOST} -P ${sourceConfig.DB_PORT} -u ${sourceConfig.DB_USER} -p"${sourceConfig.DB_PASSWORD}" --routines --triggers --events --no-tablespaces --column-statistics=0 ${sourceConfig.DB_NAME}`;
        const importCmd = `mysql -h ${targetConfig.DB_HOST} -P ${targetConfig.DB_PORT} -u ${targetConfig.DB_USER} -p"${targetConfig.DB_PASSWORD}" ${targetConfig.DB_NAME}`;

        // Using pipe
        const fullCmd = `${dumpCmd} | ${importCmd}`;

        // Execute
        // console.log('Executing sync...'); // Don't log passwords
        await execPromise(fullCmd);

        res.json({ message: 'Synchronization completed successfully.' });

    } catch (error: any) {
        console.error('Sync Error:', error.message);
        res.status(500).json({ error: 'Sync failed: ' + error.message });
    }
};

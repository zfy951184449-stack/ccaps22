import express from 'express';
import {
    exportDatabase,
    getBackupStatus,
    listBackups,
    deleteBackup,
} from '../controllers/databaseController';

const router = express.Router();

// Export database to SQL file
router.post('/export', exportDatabase);

// Get latest backup status
router.get('/status', getBackupStatus);

// List all backups
router.get('/list', listBackups);

// Delete a specific backup
router.delete('/backup/:filename', deleteBackup);

export default router;

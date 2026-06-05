import express from 'express';
import {
  getHolidayServiceStatus,
  updateHolidayApiKey,
  triggerHolidayImport,
  getSchedulingSettings,
  updateSchedulingSettings,
} from '../controllers/systemController';
import {
  getDbConfig,
  updateDbConfig,
  syncDb
} from '../controllers/systemSettingsController';
import requirePermission from '../middleware/requirePermission';

const router = express.Router();

router.get('/holiday/status', requirePermission('SYSTEM_SETTING_READ'), getHolidayServiceStatus);
router.patch('/holiday/key', requirePermission('SYSTEM_SETTING_WRITE'), updateHolidayApiKey);
router.post('/holiday/import', requirePermission('SYSTEM_HOLIDAY_OPERATE'), triggerHolidayImport);
router.get('/scheduling/settings', requirePermission('SYSTEM_SETTING_READ'), getSchedulingSettings);
router.put('/scheduling/settings', requirePermission('SYSTEM_SETTING_WRITE'), updateSchedulingSettings);

// Database Setting Routes
router.get('/db-config', requirePermission('SYSTEM_DB_READ'), getDbConfig);
router.post('/db-config', requirePermission('SYSTEM_DB_SWITCH'), updateDbConfig);
router.post('/sync-db', requirePermission('SYSTEM_DB_SYNC'), syncDb);

export default router;

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

const router = express.Router();

router.get('/holiday/status', getHolidayServiceStatus);
router.patch('/holiday/key', updateHolidayApiKey);
router.post('/holiday/import', triggerHolidayImport);
router.get('/scheduling/settings', getSchedulingSettings);
router.put('/scheduling/settings', updateSchedulingSettings);

// Database Setting Routes
router.get('/db-config', getDbConfig);
router.post('/db-config', updateDbConfig);
router.post('/sync-db', syncDb);

export default router;

import express from 'express';
import {
  getHolidayServiceStatus,
  updateHolidayApiKey,
  triggerHolidayImport,
  getSchedulingSettings,
  updateSchedulingSettings,
} from '../controllers/systemController';

const router = express.Router();

router.get('/holiday/status', getHolidayServiceStatus);
router.patch('/holiday/key', updateHolidayApiKey);
router.post('/holiday/import', triggerHolidayImport);
router.get('/scheduling/settings', getSchedulingSettings);
router.put('/scheduling/settings', updateSchedulingSettings);

export default router;

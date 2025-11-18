import express from 'express';
import {
  getHolidayServiceStatus,
  updateHolidayApiKey,
  triggerHolidayImport,
} from '../controllers/systemController';

const router = express.Router();

router.get('/holiday/status', getHolidayServiceStatus);
router.patch('/holiday/key', updateHolidayApiKey);
router.post('/holiday/import', triggerHolidayImport);

export default router;

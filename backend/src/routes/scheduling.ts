import { Router } from 'express';
import {
  lockShiftPlan,
  unlockShiftPlan,
} from '../controllers/lockController';

const router = Router();

router.post('/shift-plans/:shiftPlanId/lock', lockShiftPlan);
router.delete('/shift-plans/:shiftPlanId/lock', unlockShiftPlan);

export default router;

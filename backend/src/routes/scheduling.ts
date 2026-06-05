import { Router } from 'express';
import {
  lockShiftPlan,
  unlockShiftPlan,
} from '../controllers/lockController';
import requirePermission from '../middleware/requirePermission';
import requireScope from '../middleware/requireScope';
import { ScopeService } from '../services/governance/ScopeService';
import type { Request } from 'express';

const router = Router();

// scope resolver：班次计划锁定/解锁归属 = employee_shift_plans → employee_id → employees.unit_id。
// param 名为 :shiftPlanId（非 :id），对应 shift_plan resolver。
const shiftPlanScope = (req: Request) =>
  ScopeService.resolveResourceUnit('shift_plan', Number(req.params.shiftPlanId));

router.post('/shift-plans/:shiftPlanId/lock', requirePermission('ROSTER_SCHEDULE_OPERATE'), requireScope(shiftPlanScope), lockShiftPlan);
router.delete('/shift-plans/:shiftPlanId/lock', requirePermission('ROSTER_SCHEDULE_OPERATE'), requireScope(shiftPlanScope), unlockShiftPlan);

export default router;

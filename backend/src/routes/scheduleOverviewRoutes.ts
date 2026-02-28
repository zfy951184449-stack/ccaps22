import { Router } from 'express';
import { getScheduleOverview } from '../controllers/scheduleOverviewController';

const router = Router();

router.get('/', getScheduleOverview);

export default router;

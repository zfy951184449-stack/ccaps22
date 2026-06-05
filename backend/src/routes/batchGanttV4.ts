import express from 'express';
import { getGanttHierarchy, getGanttDependencies } from '../controllers/batchGanttV4Controller';
import requirePermission from '../middleware/requirePermission';

const router = express.Router();

router.get('/hierarchy', requirePermission('APS_GANTT_READ'), getGanttHierarchy);
router.get('/dependencies', requirePermission('APS_GANTT_READ'), getGanttDependencies);

export default router;

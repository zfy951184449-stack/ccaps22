import express from 'express';
import { getGanttHierarchy, getGanttDependencies, updateGanttOperation, updateGanttOperationsBatch, deleteGanttOperation } from '../controllers/batchGanttV5Controller';
import requirePermission from '../middleware/requirePermission';

const router = express.Router();

router.get('/hierarchy', requirePermission('APS_GANTT_READ'), getGanttHierarchy);
router.get('/dependencies', requirePermission('APS_GANTT_READ'), getGanttDependencies);
// Atomic batch time update must be registered before '/operations/:id' so it is not
// swallowed by the param route.
router.put('/operations/batch-time', requirePermission('APS_GANTT_WRITE'), updateGanttOperationsBatch);
router.put('/operations/:id', requirePermission('APS_GANTT_WRITE'), updateGanttOperation);
router.delete('/operations/:id', requirePermission('APS_GANTT_WRITE'), deleteGanttOperation);

export default router;

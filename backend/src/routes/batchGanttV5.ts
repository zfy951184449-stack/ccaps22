import express from 'express';
import { getGanttHierarchy, getGanttDependencies, updateGanttOperation, deleteGanttOperation } from '../controllers/batchGanttV5Controller';

const router = express.Router();

router.get('/hierarchy', getGanttHierarchy);
router.get('/dependencies', getGanttDependencies);
router.put('/operations/:id', updateGanttOperation);
router.delete('/operations/:id', deleteGanttOperation);

export default router;

import express from 'express';
import { getGanttHierarchy, getGanttDependencies } from '../controllers/batchGanttV4Controller';

const router = express.Router();

router.get('/hierarchy', getGanttHierarchy);
router.get('/dependencies', getGanttDependencies);

export default router;

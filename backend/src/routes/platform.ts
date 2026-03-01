import { Router } from 'express';
import {
  getPlatformConflicts,
  getPlatformOverview,
  getPlatformProjectById,
  getPlatformProjects,
} from '../controllers/platformController';

const router = Router();

router.get('/overview', getPlatformOverview);
router.get('/projects', getPlatformProjects);
router.get('/projects/:id', getPlatformProjectById);
router.get('/conflicts', getPlatformConflicts);

export default router;

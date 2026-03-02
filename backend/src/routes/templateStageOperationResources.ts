import { Router } from 'express';
import {
  deleteTemplateStageOperationResources,
  getTemplateStageOperationResources,
  putTemplateStageOperationResources,
} from '../controllers/templateStageOperationResourceController';

const router = Router();

router.get('/:scheduleId/resources', getTemplateStageOperationResources);
router.put('/:scheduleId/resources', putTemplateStageOperationResources);
router.delete('/:scheduleId/resources', deleteTemplateStageOperationResources);

export default router;


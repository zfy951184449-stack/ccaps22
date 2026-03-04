import { Router } from 'express';
import {
  deleteTemplateStageOperationResources,
  getTemplateStageOperationResources,
  putTemplateStageOperationResources,
} from '../controllers/templateStageOperationResourceController';
import {
  getTemplateStageOperationResourceBinding,
  putTemplateStageOperationResourceBinding,
} from '../controllers/templateStageOperationBindingController';

const router = Router();

router.get('/:scheduleId/resources', getTemplateStageOperationResources);
router.put('/:scheduleId/resources', putTemplateStageOperationResources);
router.delete('/:scheduleId/resources', deleteTemplateStageOperationResources);
router.get('/:scheduleId/resource-binding', getTemplateStageOperationResourceBinding);
router.put('/:scheduleId/resource-binding', putTemplateStageOperationResourceBinding);

export default router;

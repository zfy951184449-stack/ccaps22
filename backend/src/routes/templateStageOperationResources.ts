import { Router } from 'express';
import {
  deleteTemplateStageOperationResources,
  getTemplateStageOperationResources,
  putTemplateStageOperationResources,
} from '../controllers/templateStageOperationResourceController';
import {
  getTemplateStageOperationResourceBinding,
  putTemplateStageOperationResourceBinding,
  listBindingsByTemplate,
  batchUpdateBindings,
} from '../controllers/templateStageOperationBindingController';
import requirePermission from '../middleware/requirePermission';

const router = Router();

router.get('/template/:templateId/bindings', requirePermission('APS_TEMPLATE_READ'), listBindingsByTemplate);
router.get('/:scheduleId/resources', requirePermission('APS_TEMPLATE_READ'), getTemplateStageOperationResources);
router.put('/:scheduleId/resources', requirePermission('APS_TEMPLATE_WRITE'), putTemplateStageOperationResources);
router.delete('/:scheduleId/resources', requirePermission('APS_TEMPLATE_WRITE'), deleteTemplateStageOperationResources);
router.get('/:scheduleId/resource-binding', requirePermission('APS_TEMPLATE_READ'), getTemplateStageOperationResourceBinding);
router.put('/:scheduleId/resource-binding', requirePermission('APS_TEMPLATE_WRITE'), putTemplateStageOperationResourceBinding);
router.put('/batch-binding', requirePermission('APS_TEMPLATE_WRITE'), batchUpdateBindings);

export default router;

import { Router } from 'express';
import {
  getBatchOperationResources,
  putBatchOperationResources,
} from '../controllers/batchOperationResourceController';
import requirePermission from '../middleware/requirePermission';

const router = Router();

router.get('/:operationPlanId/resources', requirePermission('APS_BATCH_READ'), getBatchOperationResources);
router.put('/:operationPlanId/resources', requirePermission('APS_BATCH_WRITE'), putBatchOperationResources);

export default router;


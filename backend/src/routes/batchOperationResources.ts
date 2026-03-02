import { Router } from 'express';
import {
  getBatchOperationResources,
  putBatchOperationResources,
} from '../controllers/batchOperationResourceController';

const router = Router();

router.get('/:operationPlanId/resources', getBatchOperationResources);
router.put('/:operationPlanId/resources', putBatchOperationResources);

export default router;


import express from 'express';
import { getBatchWorkbenchV2Context } from '../controllers/batchWorkbenchV2Controller';
import requirePermission from '../middleware/requirePermission';

const router = express.Router();

router.get('/context', requirePermission('APS_BATCH_READ'), getBatchWorkbenchV2Context);

export default router;

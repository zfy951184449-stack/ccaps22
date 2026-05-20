import express from 'express';
import { getBatchWorkbenchV2Context } from '../controllers/batchWorkbenchV2Controller';

const router = express.Router();

router.get('/context', getBatchWorkbenchV2Context);

export default router;

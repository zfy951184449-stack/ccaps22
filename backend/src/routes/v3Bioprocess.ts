import { Router } from 'express';
import {
  getV3TemplateById,
  getV3SyncStatus,
  getV3Templates,
  postV3ProjectionPreview,
  postV3Sync,
} from '../controllers/v3BioprocessController';

const router = Router();

router.get('/templates', getV3Templates);
router.get('/templates/:templateId', getV3TemplateById);
router.get('/master-data/sync-status', getV3SyncStatus);
router.post('/master-data/sync', postV3Sync);
router.post('/projections/preview', postV3ProjectionPreview);

export default router;

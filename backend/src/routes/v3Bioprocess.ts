import { Router } from 'express';
import {
  getV3TemplateById,
  getV3SyncStatus,
  getV3Templates,
  postV3ProjectionPreview,
  postV3Sync,
} from '../controllers/v3BioprocessController';
import requirePermission from '../middleware/requirePermission';

const router = Router();

router.get('/templates', requirePermission('MASTER_RECIPE_READ'), getV3Templates);
router.get('/templates/:templateId', requirePermission('MASTER_RECIPE_READ'), getV3TemplateById);
router.get('/master-data/sync-status', requirePermission('MASTER_RECIPE_READ'), getV3SyncStatus);
router.post('/master-data/sync', requirePermission('MASTER_RECIPE_SYNC'), postV3Sync);
router.post('/projections/preview', requirePermission('MASTER_RECIPE_READ'), postV3ProjectionPreview);

export default router;

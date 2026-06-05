import express from 'express';
import {
  getQualifications,
  getQualificationMatrixView,
  getQualificationShortageMonitoringView,
  getQualificationsOverview,
  getQualificationShortagesView,
  getQualificationImpactById,
  createQualification,
  updateQualification,
  deleteQualification,
} from '../controllers/qualificationController';
import requirePermission from '../middleware/requirePermission';

const router = express.Router();

router.get('/overview', requirePermission('MASTER_QUALIFICATION_READ'), getQualificationsOverview);
router.get('/matrix', requirePermission('MASTER_QUALIFICATION_READ'), getQualificationMatrixView);
router.get('/shortages', requirePermission('MASTER_QUALIFICATION_READ'), getQualificationShortagesView);
router.get('/shortages/monitoring', requirePermission('MASTER_QUALIFICATION_READ'), getQualificationShortageMonitoringView);
router.get('/:id/impact', requirePermission('MASTER_QUALIFICATION_READ'), getQualificationImpactById);
router.get('/', requirePermission('MASTER_QUALIFICATION_READ'), getQualifications);
router.post('/', requirePermission('MASTER_QUALIFICATION_WRITE'), createQualification);
router.put('/:id', requirePermission('MASTER_QUALIFICATION_WRITE'), updateQualification);
router.delete('/:id', requirePermission('MASTER_QUALIFICATION_WRITE'), deleteQualification);

export default router;

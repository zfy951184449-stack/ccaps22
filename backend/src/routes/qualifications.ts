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

const router = express.Router();

router.get('/overview', getQualificationsOverview);
router.get('/matrix', getQualificationMatrixView);
router.get('/shortages', getQualificationShortagesView);
router.get('/shortages/monitoring', getQualificationShortageMonitoringView);
router.get('/:id/impact', getQualificationImpactById);
router.get('/', getQualifications);
router.post('/', createQualification);
router.put('/:id', updateQualification);
router.delete('/:id', deleteQualification);

export default router;

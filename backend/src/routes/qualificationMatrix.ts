import express from 'express';
import { getQualificationMatrix, getQualificationStatistics } from '../controllers/qualificationMatrixController';
import requirePermission from '../middleware/requirePermission';

const router = express.Router();

router.get('/', requirePermission('MASTER_QUALIFICATION_READ'), getQualificationMatrix);
router.get('/statistics', requirePermission('MASTER_QUALIFICATION_READ'), getQualificationStatistics);

export default router;
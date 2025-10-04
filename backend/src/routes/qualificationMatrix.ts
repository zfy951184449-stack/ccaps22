import express from 'express';
import { getQualificationMatrix, getQualificationStatistics } from '../controllers/qualificationMatrixController';

const router = express.Router();

router.get('/', getQualificationMatrix);
router.get('/statistics', getQualificationStatistics);

export default router;
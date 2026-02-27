import express from 'express';
import {
    getFilters,
    getShiftStyles,
    getGridData
} from '../controllers/personnelScheduleV2Controller';

console.log('=== Loading personnelSchedulesV2 routes ===');

const router = express.Router();

router.get('/filters', getFilters);
router.get('/shift-styles', getShiftStyles);
router.get('/grid', getGridData);

export default router;

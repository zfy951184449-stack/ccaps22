import express from 'express';
import {
    getFilters,
    getShiftStyles,
    getGridData,
    getCalendarData
} from '../controllers/personnelScheduleV2Controller';
import requirePermission from '../middleware/requirePermission';

console.log('=== Loading personnelSchedulesV2 routes ===');

const router = express.Router();

router.get('/filters', requirePermission('ROSTER_SCHEDULE_READ'), getFilters);
router.get('/shift-styles', requirePermission('ROSTER_SCHEDULE_READ'), getShiftStyles);
router.get('/grid', requirePermission('ROSTER_SCHEDULE_READ'), getGridData);
router.get('/calendar', requirePermission('ROSTER_SCHEDULE_READ'), getCalendarData);

export default router;

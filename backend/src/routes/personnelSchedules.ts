import express from 'express';
import {
  getPersonnelSchedules,
  getPersonnelScheduleById,
  createPersonnelSchedule,
  updatePersonnelSchedule,
  deletePersonnelSchedule,
  getAvailableEmployees,
  getShiftCalendarOverview,
  getEmployeeMetrics
} from '../controllers/personnelScheduleController';

console.log('=== Loading personnelSchedules routes ===');

const router = express.Router();

router.get('/', getPersonnelSchedules);
router.get('/available-employees', getAvailableEmployees);
router.get('/overview', getShiftCalendarOverview);
router.get('/metrics', getEmployeeMetrics);
router.get('/:id(\\d+)', getPersonnelScheduleById);
router.post('/', createPersonnelSchedule);
router.put('/:id', updatePersonnelSchedule);
router.delete('/:id', deletePersonnelSchedule);

export default router;

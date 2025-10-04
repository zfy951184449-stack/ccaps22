import express from 'express';
import {
  getPersonnelSchedules,
  getPersonnelScheduleById,
  createPersonnelSchedule,
  updatePersonnelSchedule,
  deletePersonnelSchedule,
  getAvailableEmployees,
  getShiftCalendarOverview
} from '../controllers/personnelScheduleController';

const router = express.Router();

router.get('/', getPersonnelSchedules);
router.get('/available-employees', getAvailableEmployees);
router.get('/overview', getShiftCalendarOverview);
router.get('/:id(\\d+)', getPersonnelScheduleById);
router.post('/', createPersonnelSchedule);
router.put('/:id', updatePersonnelSchedule);
router.delete('/:id', deletePersonnelSchedule);

export default router;

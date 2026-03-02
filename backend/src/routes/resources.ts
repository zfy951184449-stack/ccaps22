import { Router } from 'express';
import {
  createResource,
  createResourceCalendarEntry,
  deleteResourceCalendarEntry,
  getResourceById,
  getResourceCalendar,
  getResources,
  updateResource,
  updateResourceCalendarEntry,
} from '../controllers/resourcesController';

const router = Router();

router.get('/', getResources);
router.post('/', createResource);
router.get('/:id', getResourceById);
router.patch('/:id', updateResource);
router.get('/:id/calendar', getResourceCalendar);
router.post('/:id/calendar', createResourceCalendarEntry);
router.patch('/:id/calendar/:eventId', updateResourceCalendarEntry);
router.delete('/:id/calendar/:eventId', deleteResourceCalendarEntry);

export default router;

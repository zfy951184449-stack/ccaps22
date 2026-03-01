import { Router } from 'express';
import {
  createResource,
  createResourceCalendarEntry,
  getResourceById,
  getResourceCalendar,
  getResources,
  updateResource,
} from '../controllers/resourcesController';

const router = Router();

router.get('/', getResources);
router.post('/', createResource);
router.get('/:id', getResourceById);
router.patch('/:id', updateResource);
router.get('/:id/calendar', getResourceCalendar);
router.post('/:id/calendar', createResourceCalendarEntry);

export default router;

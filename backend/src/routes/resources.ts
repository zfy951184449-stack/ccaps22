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
import requirePermission from '../middleware/requirePermission';

const router = Router();

router.get('/', requirePermission('MASTER_RESOURCE_READ'), getResources);
router.post('/', requirePermission('MASTER_RESOURCE_WRITE'), createResource);
router.get('/:id', requirePermission('MASTER_RESOURCE_READ'), getResourceById);
router.patch('/:id', requirePermission('MASTER_RESOURCE_WRITE'), updateResource);
router.get('/:id/calendar', requirePermission('MASTER_RESOURCE_READ'), getResourceCalendar);
router.post('/:id/calendar', requirePermission('MASTER_RESOURCE_WRITE'), createResourceCalendarEntry);
router.patch('/:id/calendar/:eventId', requirePermission('MASTER_RESOURCE_WRITE'), updateResourceCalendarEntry);
router.delete('/:id/calendar/:eventId', requirePermission('MASTER_RESOURCE_WRITE'), deleteResourceCalendarEntry);

export default router;

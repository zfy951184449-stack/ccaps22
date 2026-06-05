import { Router } from 'express';
import {
  createMaintenanceWindow,
  deleteMaintenanceWindow,
  getMaintenanceWindows,
  updateMaintenanceWindow,
} from '../controllers/maintenanceWindowController';
import requirePermission from '../middleware/requirePermission';

const router = Router();

router.get('/', requirePermission('MASTER_RESOURCE_READ'), getMaintenanceWindows);
router.post('/', requirePermission('MASTER_RESOURCE_WRITE'), createMaintenanceWindow);
router.patch('/:id', requirePermission('MASTER_RESOURCE_WRITE'), updateMaintenanceWindow);
router.delete('/:id', requirePermission('MASTER_RESOURCE_WRITE'), deleteMaintenanceWindow);

export default router;

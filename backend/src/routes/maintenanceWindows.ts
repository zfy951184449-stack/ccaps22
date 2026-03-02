import { Router } from 'express';
import {
  createMaintenanceWindow,
  deleteMaintenanceWindow,
  getMaintenanceWindows,
  updateMaintenanceWindow,
} from '../controllers/maintenanceWindowController';

const router = Router();

router.get('/', getMaintenanceWindows);
router.post('/', createMaintenanceWindow);
router.patch('/:id', updateMaintenanceWindow);
router.delete('/:id', deleteMaintenanceWindow);

export default router;

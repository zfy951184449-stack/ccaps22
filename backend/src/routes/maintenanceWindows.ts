import { Router } from 'express';
import {
  createMaintenanceWindow,
  getMaintenanceWindows,
  updateMaintenanceWindow,
} from '../controllers/maintenanceWindowController';

const router = Router();

router.get('/', getMaintenanceWindows);
router.post('/', createMaintenanceWindow);
router.patch('/:id', updateMaintenanceWindow);

export default router;

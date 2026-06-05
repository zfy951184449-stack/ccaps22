import express from 'express';
import {
  listShiftDefinitions,
  getShiftDefinition,
  createShiftDefinition,
  updateShiftDefinition,
  deleteShiftDefinition,
} from '../controllers/shiftDefinitionController';
import requirePermission from '../middleware/requirePermission';

const router = express.Router();

router.get('/', requirePermission('MASTER_SHIFT_DEF_READ'), listShiftDefinitions);
router.get('/:id', requirePermission('MASTER_SHIFT_DEF_READ'), getShiftDefinition);
router.post('/', requirePermission('MASTER_SHIFT_DEF_WRITE'), createShiftDefinition);
router.put('/:id', requirePermission('MASTER_SHIFT_DEF_WRITE'), updateShiftDefinition);
router.delete('/:id', requirePermission('MASTER_SHIFT_DEF_WRITE'), deleteShiftDefinition);

export default router;

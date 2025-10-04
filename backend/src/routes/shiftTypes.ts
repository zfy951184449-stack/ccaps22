import express from 'express';
import {
  getShiftTypes,
  getShiftTypeById,
  createShiftType,
  updateShiftType,
  deleteShiftType
} from '../controllers/shiftTypeController';

const router = express.Router();

router.get('/', getShiftTypes);
router.get('/:id', getShiftTypeById);
router.post('/', createShiftType);
router.put('/:id', updateShiftType);
router.delete('/:id', deleteShiftType);

export default router;
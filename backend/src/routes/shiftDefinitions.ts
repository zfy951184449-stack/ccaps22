import express from 'express';
import {
  listShiftDefinitions,
  getShiftDefinition,
  createShiftDefinition,
  updateShiftDefinition,
  deleteShiftDefinition,
} from '../controllers/shiftDefinitionController';

const router = express.Router();

router.get('/', listShiftDefinitions);
router.get('/:id', getShiftDefinition);
router.post('/', createShiftDefinition);
router.put('/:id', updateShiftDefinition);
router.delete('/:id', deleteShiftDefinition);

export default router;

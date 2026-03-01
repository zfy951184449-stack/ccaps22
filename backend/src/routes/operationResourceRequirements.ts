import { Router } from 'express';
import {
  createOperationResourceRequirement,
  getOperationResourceRequirements,
  updateOperationResourceRequirement,
} from '../controllers/operationResourceRequirementController';

const router = Router();

router.get('/', getOperationResourceRequirements);
router.post('/', createOperationResourceRequirement);
router.patch('/:id', updateOperationResourceRequirement);

export default router;

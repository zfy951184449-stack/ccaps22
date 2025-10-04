import express from 'express';
import { 
  getEmployeeQualifications, 
  getEmployeeQualificationsByEmployeeId,
  createEmployeeQualification, 
  updateEmployeeQualification, 
  deleteEmployeeQualification 
} from '../controllers/employeeQualificationController';

const router = express.Router();

router.get('/', getEmployeeQualifications);
router.get('/employee/:employeeId', getEmployeeQualificationsByEmployeeId);
router.post('/', createEmployeeQualification);
router.put('/:id', updateEmployeeQualification);
router.delete('/:id', deleteEmployeeQualification);

export default router;
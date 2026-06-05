import express from 'express';
import { 
  getEmployeeQualifications, 
  getEmployeeQualificationsByEmployeeId,
  createEmployeeQualification, 
  updateEmployeeQualification, 
  deleteEmployeeQualification 
} from '../controllers/employeeQualificationController';
import requirePermission from '../middleware/requirePermission';

const router = express.Router();

router.get('/', requirePermission('MASTER_QUALIFICATION_READ'), getEmployeeQualifications);
router.get('/employee/:employeeId', requirePermission('MASTER_QUALIFICATION_READ'), getEmployeeQualificationsByEmployeeId);
router.post('/', requirePermission('MASTER_QUALIFICATION_WRITE'), createEmployeeQualification);
router.put('/:id', requirePermission('MASTER_QUALIFICATION_WRITE'), updateEmployeeQualification);
router.delete('/:id', requirePermission('MASTER_QUALIFICATION_WRITE'), deleteEmployeeQualification);

export default router;
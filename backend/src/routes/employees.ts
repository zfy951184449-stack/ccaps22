import express from 'express';
import {
  getEmployees,
  updateEmployeeWorkloadProfile,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  updateEmployeeOrganization,
  listEmployeeAssignments,
  createEmployeeAssignment,
  deleteEmployeeAssignment,
  updateEmployeeAssignment,
  getEmployeeReporting,
  updateEmployeeDirectReports,
  getEmployeeOrgContext,
  getRoles
} from '../controllers/employeeController';

const router = express.Router();

router.get('/roles', getRoles);
router.get('/', getEmployees);
router.post('/', createEmployee);
router.put('/:id', updateEmployee);
router.delete('/:id', deleteEmployee);
router.put('/:id/workload-profile', updateEmployeeWorkloadProfile);
router.put('/:id/organization', updateEmployeeOrganization);
router.get('/:id/reporting', getEmployeeReporting);
router.put('/:id/reporting', updateEmployeeDirectReports);
router.get('/:id/organization-context', getEmployeeOrgContext);
router.get('/:id/assignments', listEmployeeAssignments);
router.post('/:id/assignments', createEmployeeAssignment);
router.put('/:id/assignments/:assignmentId', updateEmployeeAssignment);
router.delete('/:id/assignments/:assignmentId', deleteEmployeeAssignment);

export default router;

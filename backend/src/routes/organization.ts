import express from 'express';
import {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getTeams,
  createTeam,
  updateTeam,
  deleteTeam,
  getEmployeeRoles,
  createEmployeeRole,
  updateEmployeeRole,
  deleteEmployeeRole,
  listEmployeeTeamRoles,
  createEmployeeTeamRole,
  updateEmployeeTeamRole,
  deleteEmployeeTeamRole,
  listEmployeeUnavailability,
  createEmployeeUnavailability,
  updateEmployeeUnavailability,
  deleteEmployeeUnavailability,
} from '../controllers/organizationController';

const router = express.Router();

router.get('/departments', getDepartments);
router.post('/departments', createDepartment);
router.put('/departments/:id', updateDepartment);
router.delete('/departments/:id', deleteDepartment);

router.get('/teams', getTeams);
router.post('/teams', createTeam);
router.put('/teams/:id', updateTeam);
router.delete('/teams/:id', deleteTeam);

router.get('/roles', getEmployeeRoles);
router.post('/roles', createEmployeeRole);
router.put('/roles/:id', updateEmployeeRole);
router.delete('/roles/:id', deleteEmployeeRole);

router.get('/assignments', listEmployeeTeamRoles);
router.post('/assignments', createEmployeeTeamRole);
router.put('/assignments/:id', updateEmployeeTeamRole);
router.delete('/assignments/:id', deleteEmployeeTeamRole);

router.get('/unavailability', listEmployeeUnavailability);
router.post('/unavailability', createEmployeeUnavailability);
router.put('/unavailability/:id', updateEmployeeUnavailability);
router.delete('/unavailability/:id', deleteEmployeeUnavailability);

export default router;

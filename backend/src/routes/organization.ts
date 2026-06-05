import express from 'express';
import {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getTeams,
  getSolverTeams,
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
import requirePermission from '../middleware/requirePermission';

const router = express.Router();

router.get('/departments', requirePermission('MASTER_ORG_READ'), getDepartments);
router.post('/departments', requirePermission('MASTER_ORG_WRITE'), createDepartment);
router.put('/departments/:id', requirePermission('MASTER_ORG_WRITE'), updateDepartment);
router.delete('/departments/:id', requirePermission('MASTER_ORG_WRITE'), deleteDepartment);

router.get('/teams', requirePermission('MASTER_ORG_READ'), getTeams);
router.get('/solver-teams', requirePermission('MASTER_ORG_READ'), getSolverTeams);
router.post('/teams', requirePermission('MASTER_ORG_WRITE'), createTeam);
router.put('/teams/:id', requirePermission('MASTER_ORG_WRITE'), updateTeam);
router.delete('/teams/:id', requirePermission('MASTER_ORG_WRITE'), deleteTeam);

router.get('/roles', requirePermission('MASTER_ORG_READ'), getEmployeeRoles);
router.post('/roles', requirePermission('MASTER_ORG_WRITE'), createEmployeeRole);
router.put('/roles/:id', requirePermission('MASTER_ORG_WRITE'), updateEmployeeRole);
router.delete('/roles/:id', requirePermission('MASTER_ORG_WRITE'), deleteEmployeeRole);

router.get('/assignments', requirePermission('MASTER_ORG_READ'), listEmployeeTeamRoles);
router.post('/assignments', requirePermission('MASTER_ORG_WRITE'), createEmployeeTeamRole);
router.put('/assignments/:id', requirePermission('MASTER_ORG_WRITE'), updateEmployeeTeamRole);
router.delete('/assignments/:id', requirePermission('MASTER_ORG_WRITE'), deleteEmployeeTeamRole);

router.get('/unavailability', requirePermission('ROSTER_UNAVAILABILITY_READ'), listEmployeeUnavailability);
router.post('/unavailability', requirePermission('ROSTER_UNAVAILABILITY_WRITE'), createEmployeeUnavailability);
router.put('/unavailability/:id', requirePermission('ROSTER_UNAVAILABILITY_WRITE'), updateEmployeeUnavailability);
router.delete('/unavailability/:id', requirePermission('ROSTER_UNAVAILABILITY_WRITE'), deleteEmployeeUnavailability);

export default router;

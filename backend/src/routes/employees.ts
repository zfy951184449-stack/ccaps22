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
import requirePermission from '../middleware/requirePermission';
import requireScope from '../middleware/requireScope';
import { ScopeService } from '../services/governance/ScopeService';

const router = express.Router();

// scope resolver：员工主数据归属 = employees.unit_id（指向 organization_units.id）。
//   - 更新/删除及其下子资源（workload-profile/organization/reporting/assignments）：:id 是 employees.id。
//   - 创建：员工尚未落库，按 body 解析目标单元（与 controller 的 finalUnitId 同口径：
//     unitId ?? primaryTeamId ?? departmentId）；均缺(null)→ 放行，交 handler。
const employeeScopeById = (req: express.Request) =>
  ScopeService.resolveResourceUnit('employee', Number(req.params.id));
const employeeScopeByBodyUnit = (req: express.Request) => {
  const body = req.body || {};
  const candidate = body.unitId ?? body.primaryTeamId ?? body.departmentId;
  const unitId = Number(candidate);
  return Number.isFinite(unitId) ? unitId : null;
};

router.get('/roles', requirePermission('MASTER_EMPLOYEE_READ'), getRoles);
router.get('/', requirePermission('MASTER_EMPLOYEE_READ'), getEmployees);
router.post('/', requirePermission('MASTER_EMPLOYEE_WRITE'), requireScope(employeeScopeByBodyUnit), createEmployee);
router.put('/:id', requirePermission('MASTER_EMPLOYEE_WRITE'), requireScope(employeeScopeById), updateEmployee);
router.delete('/:id', requirePermission('MASTER_EMPLOYEE_WRITE'), requireScope(employeeScopeById), deleteEmployee);
router.put('/:id/workload-profile', requirePermission('MASTER_EMPLOYEE_WRITE'), requireScope(employeeScopeById), updateEmployeeWorkloadProfile);
router.put('/:id/organization', requirePermission('MASTER_EMPLOYEE_WRITE'), requireScope(employeeScopeById), updateEmployeeOrganization);
router.get('/:id/reporting', requirePermission('MASTER_EMPLOYEE_READ'), getEmployeeReporting);
router.put('/:id/reporting', requirePermission('MASTER_EMPLOYEE_WRITE'), requireScope(employeeScopeById), updateEmployeeDirectReports);
router.get('/:id/organization-context', requirePermission('MASTER_EMPLOYEE_READ'), getEmployeeOrgContext);
router.get('/:id/assignments', requirePermission('MASTER_EMPLOYEE_READ'), listEmployeeAssignments);
router.post('/:id/assignments', requirePermission('MASTER_EMPLOYEE_WRITE'), requireScope(employeeScopeById), createEmployeeAssignment);
router.put('/:id/assignments/:assignmentId', requirePermission('MASTER_EMPLOYEE_WRITE'), requireScope(employeeScopeById), updateEmployeeAssignment);
router.delete('/:id/assignments/:assignmentId', requirePermission('MASTER_EMPLOYEE_WRITE'), requireScope(employeeScopeById), deleteEmployeeAssignment);

export default router;

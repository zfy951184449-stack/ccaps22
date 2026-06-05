import express from 'express';
import {
  getPersonnelSchedules,
  getPersonnelScheduleById,
  createPersonnelSchedule,
  updatePersonnelSchedule,
  deletePersonnelSchedule,
  getAvailableEmployees,
  getShiftCalendarOverview,
  getEmployeeMetrics,
  deleteMonthlySchedule
} from '../controllers/personnelScheduleController';
import requirePermission from '../middleware/requirePermission';
import requireScope from '../middleware/requireScope';
import { ScopeService, REQUIRE_GLOBAL_SENTINEL } from '../services/governance/ScopeService';

console.log('=== Loading personnelSchedules routes ===');

const router = express.Router();

// scope resolver：排班写端点归属 = 员工所属 unit。
//   - 创建：employee_id 在 body → employees.unit_id；
//   - 更新/删除单条：:id 是 personnel_schedules.id → employee_id → employees.unit_id；
//   - 删除整月（DELETE /monthly）：只有 year/month、无单一资源 id，按规则保守=仅全局可做 → 哨兵。
const scheduleByBodyEmployee = (req: express.Request) => {
  const employeeId = Number(req.body?.employee_id);
  return Number.isFinite(employeeId)
    ? ScopeService.resolveResourceUnit('employee', employeeId)
    : null; // 缺 employee_id → 放行，交给 handler 自身 400 校验。
};
const scheduleById = (req: express.Request) =>
  ScopeService.resolveResourceUnit('personnel_schedule', Number(req.params.id));
const monthlyScopeRequireGlobal = () => REQUIRE_GLOBAL_SENTINEL;

router.get('/', requirePermission('ROSTER_SCHEDULE_READ'), getPersonnelSchedules);
router.get('/available-employees', requirePermission('ROSTER_SCHEDULE_READ'), getAvailableEmployees);
router.get('/overview', requirePermission('ROSTER_SCHEDULE_READ'), getShiftCalendarOverview);
router.get('/shift-plans', requirePermission('ROSTER_SCHEDULE_READ'), getShiftCalendarOverview);
router.get('/metrics', requirePermission('ROSTER_SCHEDULE_READ'), getEmployeeMetrics);
router.get('/:id(\\d+)', requirePermission('ROSTER_SCHEDULE_READ'), getPersonnelScheduleById);
router.post('/', requirePermission('ROSTER_SCHEDULE_WRITE'), requireScope(scheduleByBodyEmployee), createPersonnelSchedule);
router.put('/:id', requirePermission('ROSTER_SCHEDULE_WRITE'), requireScope(scheduleById), updatePersonnelSchedule);
router.delete('/monthly', requirePermission('ROSTER_SCHEDULE_OPERATE'), requireScope(monthlyScopeRequireGlobal), deleteMonthlySchedule);
router.delete('/:id', requirePermission('ROSTER_SCHEDULE_WRITE'), requireScope(scheduleById), deletePersonnelSchedule);

export default router;

import { Router } from 'express';
import {
    getAllTasks,
    getTaskById,
    createTask,
    updateTask,
    deleteTask,
    completeTask,
    generateRecurringTasks,
    getAssignments,
    batchDeleteTasks,
    deleteTemplateInstances,
} from '../controllers/standaloneTaskController';
import requirePermission from '../middleware/requirePermission';
import requireScope from '../middleware/requireScope';
import { ScopeService } from '../services/governance/ScopeService';
import type { Request } from 'express';

const router = Router();

// scope resolver：独立任务归属 = standalone_tasks.team_id（指向 organization_units.id）。
//   - 创建：team_id 在 body，本身就是归属单元；未填(null)→ 全局任务 → 放行。
//   - 更新/删除：:id 是 standalone_tasks.id → team_id。
const taskByBodyTeam = (req: Request) => {
  const teamId = Number(req.body?.team_id);
  return Number.isFinite(teamId) ? teamId : null;
};
const taskById = (req: Request) =>
  ScopeService.resolveResourceUnit('standalone_task', Number(req.params.id));

// /api/standalone-tasks
router.get('/', requirePermission('ROSTER_TASK_READ'), getAllTasks);
router.get('/assignments', requirePermission('ROSTER_TASK_READ'), getAssignments); // Must be before /:id
router.post('/generate-recurring', requirePermission('ROSTER_TASK_GENERATE'), generateRecurringTasks); // Must be before /:id
router.post('/batch-delete', requirePermission('ROSTER_TASK_PURGE'), batchDeleteTasks); // Must be before /:id
router.get('/:id', requirePermission('ROSTER_TASK_READ'), getTaskById);
router.post('/', requirePermission('ROSTER_TASK_WRITE'), requireScope(taskByBodyTeam), createTask);
router.put('/:id', requirePermission('ROSTER_TASK_WRITE'), requireScope(taskById), updateTask);
router.delete('/:id', requirePermission('ROSTER_TASK_WRITE'), requireScope(taskById), deleteTask);
router.post('/:id/complete', requirePermission('ROSTER_TASK_COMPLETE'), completeTask);
router.post('/:id/delete-instances', requirePermission('ROSTER_TASK_PURGE'), deleteTemplateInstances);

export default router;

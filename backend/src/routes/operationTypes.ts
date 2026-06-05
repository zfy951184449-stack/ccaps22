import { Router } from 'express';
import {
    getAllOperationTypes,
    getOperationTypesGroupedByTeam,
    getOperationTypeById,
    createOperationType,
    updateOperationType,
    deleteOperationType
} from '../controllers/operationTypeController';
import requirePermission from '../middleware/requirePermission';
import requireScope from '../middleware/requireScope';
import { ScopeService } from '../services/governance/ScopeService';
import type { Request } from 'express';

const router = Router();

// scope resolver：操作类型主数据归属 = operation_types.team_id（指向 organization_units.id）。
//   - 更新/删除：:id 是 operation_types.id → operation_type resolver。
//   - 创建：team_id 在 body，本身即归属单元；缺(null)→ 放行，交 handler 的 400 校验（team_id 必填）。
const operationTypeScopeById = (req: Request) =>
  ScopeService.resolveResourceUnit('operation_type', Number(req.params.id));
const operationTypeScopeByBodyTeam = (req: Request) => {
  const teamId = Number(req.body?.team_id);
  return Number.isFinite(teamId) ? teamId : null;
};

// GET /api/operation-types - 获取所有操作类型
router.get('/', requirePermission('MASTER_OPERATION_READ'), getAllOperationTypes);

// GET /api/operation-types/grouped - 获取按Team分组的操作类型
router.get('/grouped', requirePermission('MASTER_OPERATION_READ'), getOperationTypesGroupedByTeam);

// GET /api/operation-types/:id - 获取单个操作类型
router.get('/:id', requirePermission('MASTER_OPERATION_READ'), getOperationTypeById);

// POST /api/operation-types - 创建新操作类型
router.post('/', requirePermission('MASTER_OPERATION_WRITE'), requireScope(operationTypeScopeByBodyTeam), createOperationType);

// PUT /api/operation-types/:id - 更新操作类型
router.put('/:id', requirePermission('MASTER_OPERATION_WRITE'), requireScope(operationTypeScopeById), updateOperationType);

// DELETE /api/operation-types/:id - 删除操作类型
router.delete('/:id', requirePermission('MASTER_OPERATION_WRITE'), requireScope(operationTypeScopeById), deleteOperationType);

export default router;

import { Router } from 'express';
import {
  clearResourceNodeTreeController,
  getResourceNodeCleanableTargets,
  getResourceNodes,
  moveResourceNodeController,
  patchResourceNode,
  postResourceNode,
  putResourceNodeCleanableTargets,
  removeResourceNode,
} from '../controllers/resourceNodeController';
import requirePermission from '../middleware/requirePermission';

const router = Router();

router.get('/', requirePermission('MASTER_RESOURCE_READ'), getResourceNodes);
router.post('/', requirePermission('MASTER_RESOURCE_WRITE'), postResourceNode);
router.post('/rebuild/clear', requirePermission('MASTER_RESOURCE_OPERATE'), clearResourceNodeTreeController);
router.get('/:id/cleanable-targets', requirePermission('MASTER_RESOURCE_READ'), getResourceNodeCleanableTargets);
router.put('/:id/cleanable-targets', requirePermission('MASTER_RESOURCE_WRITE'), putResourceNodeCleanableTargets);
router.patch('/:id', requirePermission('MASTER_RESOURCE_WRITE'), patchResourceNode);
router.post('/:id/move', requirePermission('MASTER_RESOURCE_WRITE'), moveResourceNodeController);
router.delete('/:id', requirePermission('MASTER_RESOURCE_WRITE'), removeResourceNode);

export default router;

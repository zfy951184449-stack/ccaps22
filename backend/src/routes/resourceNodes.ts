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

const router = Router();

router.get('/', getResourceNodes);
router.post('/', postResourceNode);
router.post('/rebuild/clear', clearResourceNodeTreeController);
router.get('/:id/cleanable-targets', getResourceNodeCleanableTargets);
router.put('/:id/cleanable-targets', putResourceNodeCleanableTargets);
router.patch('/:id', patchResourceNode);
router.post('/:id/move', moveResourceNodeController);
router.delete('/:id', removeResourceNode);

export default router;

import { Router } from 'express';
import {
  getResourceNodes,
  moveResourceNodeController,
  patchResourceNode,
  postResourceNode,
  removeResourceNode,
} from '../controllers/resourceNodeController';

const router = Router();

router.get('/', getResourceNodes);
router.post('/', postResourceNode);
router.patch('/:id', patchResourceNode);
router.post('/:id/move', moveResourceNodeController);
router.delete('/:id', removeResourceNode);

export default router;

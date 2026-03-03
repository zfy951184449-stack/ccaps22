import { Router } from 'express';
import {
  activateSpecialShiftWindow,
  cancelSpecialShiftWindow,
  createSpecialShiftWindow,
  getSpecialShiftWindow,
  listSpecialShiftOccurrences,
  listSpecialShiftWindows,
  previewSpecialShiftWindow,
  updateSpecialShiftWindow,
} from '../controllers/specialShiftWindowController';

const router = Router();

router.get('/', listSpecialShiftWindows);
router.post('/', createSpecialShiftWindow);
router.get('/:id', getSpecialShiftWindow);
router.put('/:id', updateSpecialShiftWindow);
router.post('/:id/preview', previewSpecialShiftWindow);
router.post('/:id/activate', activateSpecialShiftWindow);
router.post('/:id/cancel', cancelSpecialShiftWindow);
router.get('/:id/occurrences', listSpecialShiftOccurrences);

export default router;

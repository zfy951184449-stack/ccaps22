import express from 'express';
import {
  applyRosterExceptionProposal,
  previewRosterException,
} from '../controllers/rosterExceptionController';
import requirePermission from '../middleware/requirePermission';

const router = express.Router();

router.post('/preview', requirePermission('ROSTER_EXCEPTION_PREVIEW'), previewRosterException);
router.post('/apply-proposal', requirePermission('ROSTER_EXCEPTION_APPLY'), applyRosterExceptionProposal);

export default router;

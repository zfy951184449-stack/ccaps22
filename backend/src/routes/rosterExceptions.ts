import express from 'express';
import {
  applyRosterExceptionProposal,
  previewRosterException,
} from '../controllers/rosterExceptionController';

const router = express.Router();

router.post('/preview', previewRosterException);
router.post('/apply-proposal', applyRosterExceptionProposal);

export default router;

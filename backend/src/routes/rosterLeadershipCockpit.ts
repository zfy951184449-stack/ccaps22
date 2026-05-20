import express from 'express';
import { getRosterLeadershipCockpit } from '../controllers/rosterLeadershipCockpitController';

const router = express.Router();

router.get('/', getRosterLeadershipCockpit);

export default router;

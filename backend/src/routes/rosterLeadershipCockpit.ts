import express from 'express';
import { getRosterLeadershipCockpit } from '../controllers/rosterLeadershipCockpitController';
import requirePermission from '../middleware/requirePermission';

const router = express.Router();

router.get('/', requirePermission('ROSTER_COCKPIT_READ'), getRosterLeadershipCockpit);

export default router;

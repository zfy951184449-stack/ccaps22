import type { Request, Response } from 'express';
import { RosterLeadershipCockpitService } from '../services/rosterLeadershipCockpit/RosterLeadershipCockpitService';

const parseWindowDays = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 365;
  return Math.max(1, Math.min(366, Math.round(parsed)));
};

export const getRosterLeadershipCockpit = async (req: Request, res: Response) => {
  try {
    const snapshot = await RosterLeadershipCockpitService.getSnapshot({
      windowDays: parseWindowDays(req.query.window_days ?? req.query.windowDays),
      windowStart: typeof req.query.window_start === 'string' ? req.query.window_start : undefined,
    });
    res.json(snapshot);
  } catch (error: any) {
    console.error('[RosterLeadershipCockpit] Failed to build snapshot:', error?.message || error);
    res.status(500).json({
      error: 'ROSTER_LEADERSHIP_COCKPIT_FAILED',
      message: 'Failed to build roster leadership cockpit snapshot',
    });
  }
};

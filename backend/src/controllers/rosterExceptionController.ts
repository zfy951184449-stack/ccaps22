import type { Request, Response } from 'express';
import type {
  RosterExceptionApplyRequest,
  RosterExceptionPreviewRequest,
} from '../domain/rosterException/rosterExceptionTypes';
import {
  RosterExceptionPreviewError,
  RosterExceptionPreviewService,
} from '../services/rosterException/RosterExceptionPreviewService';

export const previewRosterException = async (req: Request, res: Response) => {
  try {
    const payload = req.body as RosterExceptionPreviewRequest;
    const result = await RosterExceptionPreviewService.previewEmployeeUnavailable(payload);
    res.json(result);
  } catch (error: any) {
    if (error instanceof RosterExceptionPreviewError) {
      res.status(error.statusCode).json({
        error: error.code,
        message: error.message,
      });
      return;
    }

    console.error('[RosterException] Preview failed:', error?.message || error);
    res.status(500).json({
      error: 'ROSTER_EXCEPTION_PREVIEW_FAILED',
      message: 'Failed to build roster exception preview',
    });
  }
};

export const applyRosterExceptionProposal = async (req: Request, res: Response) => {
  try {
    const payload = req.body as RosterExceptionApplyRequest;
    const result = await RosterExceptionPreviewService.applySelectedProposal(payload);
    res.json(result);
  } catch (error: any) {
    if (error instanceof RosterExceptionPreviewError) {
      res.status(error.statusCode).json({
        error: error.code,
        message: error.message,
      });
      return;
    }

    console.error('[RosterException] Apply proposal failed:', error?.message || error);
    res.status(500).json({
      error: 'ROSTER_EXCEPTION_APPLY_FAILED',
      message: 'Failed to apply selected roster repair proposal',
    });
  }
};

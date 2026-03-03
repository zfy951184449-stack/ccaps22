import { Request, Response } from 'express';
import SpecialShiftWindowService, {
  SpecialShiftWindowError,
  SpecialShiftWindowInput,
} from '../services/specialShiftWindowService';

const handleError = (res: Response, error: unknown) => {
  const normalized = error instanceof SpecialShiftWindowError
    ? error
    : SpecialShiftWindowService.normalizeError(error);

  const payload: Record<string, unknown> = {
    error: normalized.message,
  };
  if (normalized.details !== undefined) {
    payload.details = normalized.details;
  }

  res.status(normalized.statusCode || 500).json(payload);
};

export const listSpecialShiftWindows = async (req: Request, res: Response) => {
  try {
    const windows = await SpecialShiftWindowService.listWindows({
      status: req.query.status ? String(req.query.status) : undefined,
      org_unit_id: req.query.org_unit_id ? Number(req.query.org_unit_id) : undefined,
      start_date: req.query.start_date ? String(req.query.start_date) : undefined,
      end_date: req.query.end_date ? String(req.query.end_date) : undefined,
    });
    res.json(windows);
  } catch (error) {
    handleError(res, error);
  }
};

export const getSpecialShiftWindow = async (req: Request, res: Response) => {
  try {
    const windowId = Number(req.params.id);
    if (!Number.isFinite(windowId) || windowId <= 0) {
      return res.status(400).json({ error: 'id 必须是正整数' });
    }

    const detail = await SpecialShiftWindowService.getWindowDetail(windowId);
    res.json(detail);
  } catch (error) {
    handleError(res, error);
  }
};

export const createSpecialShiftWindow = async (req: Request, res: Response) => {
  try {
    const detail = await SpecialShiftWindowService.createWindow(req.body as SpecialShiftWindowInput);
    res.status(201).json(detail);
  } catch (error) {
    handleError(res, error);
  }
};

export const updateSpecialShiftWindow = async (req: Request, res: Response) => {
  try {
    const windowId = Number(req.params.id);
    if (!Number.isFinite(windowId) || windowId <= 0) {
      return res.status(400).json({ error: 'id 必须是正整数' });
    }

    const detail = await SpecialShiftWindowService.updateWindow(windowId, req.body as SpecialShiftWindowInput);
    res.json(detail);
  } catch (error) {
    handleError(res, error);
  }
};

export const previewSpecialShiftWindow = async (req: Request, res: Response) => {
  try {
    const windowId = Number(req.params.id);
    if (!Number.isFinite(windowId) || windowId <= 0) {
      return res.status(400).json({ error: 'id 必须是正整数' });
    }

    const preview = await SpecialShiftWindowService.previewWindow(windowId);
    res.json(preview);
  } catch (error) {
    handleError(res, error);
  }
};

export const activateSpecialShiftWindow = async (req: Request, res: Response) => {
  try {
    const windowId = Number(req.params.id);
    if (!Number.isFinite(windowId) || windowId <= 0) {
      return res.status(400).json({ error: 'id 必须是正整数' });
    }

    const detail = await SpecialShiftWindowService.activateWindow(windowId);
    res.json(detail);
  } catch (error) {
    handleError(res, error);
  }
};

export const cancelSpecialShiftWindow = async (req: Request, res: Response) => {
  try {
    const windowId = Number(req.params.id);
    if (!Number.isFinite(windowId) || windowId <= 0) {
      return res.status(400).json({ error: 'id 必须是正整数' });
    }

    const detail = await SpecialShiftWindowService.cancelWindow(windowId);
    res.json(detail);
  } catch (error) {
    handleError(res, error);
  }
};

export const listSpecialShiftOccurrences = async (req: Request, res: Response) => {
  try {
    const windowId = Number(req.params.id);
    if (!Number.isFinite(windowId) || windowId <= 0) {
      return res.status(400).json({ error: 'id 必须是正整数' });
    }

    const occurrences = await SpecialShiftWindowService.getWindowOccurrences(windowId, {
      startDate: req.query.start_date ? String(req.query.start_date) : undefined,
      endDate: req.query.end_date ? String(req.query.end_date) : undefined,
      status: req.query.status ? String(req.query.status) : undefined,
    });
    res.json(occurrences);
  } catch (error) {
    handleError(res, error);
  }
};

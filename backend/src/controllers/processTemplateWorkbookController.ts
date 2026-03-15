import { Request, Response } from 'express';
import {
  exportProcessTemplateWorkbook,
  importProcessTemplateWorkbook,
  ProcessTemplateWorkbookError,
} from '../services/processTemplateWorkbookService';

const parseTemplateIds = (value: unknown): number[] => {
  if (typeof value !== 'string' || !value.trim()) {
    return [];
  }

  return value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);
};

export const exportTemplateWorkbook = async (req: Request, res: Response) => {
  try {
    const templateIds = parseTemplateIds(req.query.template_ids);
    const data = await exportProcessTemplateWorkbook(templateIds.length ? templateIds : undefined);
    res.json(data);
  } catch (error) {
    console.error('Error exporting process template workbook:', error);
    res.status(500).json({ error: 'Failed to export process template workbook' });
  }
};

export const importTemplateWorkbook = async (req: Request, res: Response) => {
  try {
    const result = await importProcessTemplateWorkbook(req.body ?? {});
    res.json({
      message: 'Process template workbook imported successfully',
      ...result,
    });
  } catch (error) {
    if (error instanceof ProcessTemplateWorkbookError) {
      return res.status(error.status).json({
        error: error.message,
        details: error.details ?? null,
      });
    }

    console.error('Error importing process template workbook:', error);
    res.status(500).json({ error: 'Failed to import process template workbook' });
  }
};

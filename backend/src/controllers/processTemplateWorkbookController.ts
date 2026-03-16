import { Request, Response } from 'express';
import {
  exportTemplateWorkbook,
  importTemplateWorkbook,
  previewTemplateWorkbookImport,
  TemplateWorkbookImportMode,
} from '../services/processTemplateWorkbookService';

const resolveImportMode = (value: unknown): TemplateWorkbookImportMode | null => {
  if (value === 'create' || value === 'replace') {
    return value;
  }
  return null;
};

export const exportProcessTemplateWorkbook = async (req: Request, res: Response) => {
  try {
    const templateId = Number(req.params.id);
    if (!Number.isInteger(templateId) || templateId <= 0) {
      return res.status(400).json({ error: 'Invalid template id' });
    }

    const { fileName, buffer } = await exportTemplateWorkbook(templateId);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.send(buffer);
  } catch (error: any) {
    if (error instanceof Error && error.message === 'Template not found') {
      return res.status(404).json({ error: 'Template not found' });
    }
    console.error('Failed to export process template workbook:', error);
    res.status(500).json({ error: 'Failed to export process template workbook' });
  }
};

export const previewProcessTemplateWorkbookImport = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const mode = resolveImportMode(req.body?.mode);
    if (!file) {
      return res.status(400).json({ error: 'Workbook file is required' });
    }
    if (!mode) {
      return res.status(400).json({ error: 'mode must be create or replace' });
    }

    const result = await previewTemplateWorkbookImport(file.buffer, mode);
    res.json(result);
  } catch (error) {
    console.error('Failed to preview process template workbook import:', error);
    res.status(500).json({ error: 'Failed to preview process template workbook import' });
  }
};

export const importProcessTemplateWorkbook = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const mode = resolveImportMode(req.body?.mode);
    if (!file) {
      return res.status(400).json({ error: 'Workbook file is required' });
    }
    if (!mode) {
      return res.status(400).json({ error: 'mode must be create or replace' });
    }

    const result = await importTemplateWorkbook(file.buffer, mode);
    if (!result.can_import) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (error) {
    console.error('Failed to import process template workbook:', error);
    res.status(500).json({ error: 'Failed to import process template workbook' });
  }
};

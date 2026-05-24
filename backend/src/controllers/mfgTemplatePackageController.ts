import { Request, Response } from 'express';
import { MfgTemplatePackageService } from '../services/mfgTemplatePackageService';

const toPackageId = (value: unknown): number | null => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const handleServiceError = (res: Response, error: any) => {
  const message = error instanceof Error ? error.message : 'MFG_PACKAGE_ERROR';
  console.error('MFG package API error:', error);

  if (message.includes('MFG_PACKAGE_NOT_FOUND')) {
    return res.status(404).json({ error: '总包不存在', code: 'MFG_PACKAGE_NOT_FOUND' });
  }

  if (message.includes('MFG_PACKAGE_REQUIRES_MODULES')) {
    return res.status(400).json({ error: '总包至少需要一个模板模块', code: 'MFG_PACKAGE_REQUIRES_MODULES' });
  }

  if (message.includes('MFG_PACKAGE_LINK_UNKNOWN_ROLE')) {
    return res.status(400).json({ error: '锚点规则引用了不存在的模块角色', code: 'MFG_PACKAGE_LINK_UNKNOWN_ROLE' });
  }

  if (message.includes('MFG_PACKAGE_DAY_LINK_CONFLICT')) {
    return res.status(409).json({ error: '总包 Day 锚点存在冲突', code: 'MFG_PACKAGE_DAY_LINK_CONFLICT' });
  }

  if (message.includes('MFG_PACKAGE_WITHOUT_OPERATIONS')) {
    return res.status(400).json({ error: '总包没有可生成的工序', code: 'MFG_PACKAGE_WITHOUT_OPERATIONS' });
  }

  if (error?.code === 'ER_DUP_ENTRY') {
    return res.status(400).json({ error: '总包编码已存在', code: 'MFG_PACKAGE_CODE_DUPLICATED' });
  }

  if (error?.code === 'ER_ROW_IS_REFERENCED_2') {
    return res.status(409).json({ error: '总包已被批次引用，不能删除', code: 'MFG_PACKAGE_IN_USE' });
  }

  return res.status(500).json({ error: '总包操作失败', code: 'MFG_PACKAGE_ERROR' });
};

export const listMfgTemplatePackages = async (_req: Request, res: Response) => {
  try {
    const packages = await MfgTemplatePackageService.listPackages();
    res.json(packages);
  } catch (error) {
    handleServiceError(res, error);
  }
};

export const getMfgTemplatePackage = async (req: Request, res: Response) => {
  try {
    const packageId = toPackageId(req.params.id);
    if (!packageId) {
      return res.status(400).json({ error: '非法总包 ID' });
    }

    const detail = await MfgTemplatePackageService.getPackageDetail(packageId);
    if (!detail) {
      return res.status(404).json({ error: '总包不存在' });
    }

    res.json(detail);
  } catch (error) {
    handleServiceError(res, error);
  }
};

export const createMfgTemplatePackage = async (req: Request, res: Response) => {
  try {
    const detail = await MfgTemplatePackageService.createPackage(req.body);
    res.status(201).json(detail);
  } catch (error) {
    handleServiceError(res, error);
  }
};

export const updateMfgTemplatePackage = async (req: Request, res: Response) => {
  try {
    const packageId = toPackageId(req.params.id);
    if (!packageId) {
      return res.status(400).json({ error: '非法总包 ID' });
    }

    const detail = await MfgTemplatePackageService.updatePackage(packageId, req.body);
    res.json(detail);
  } catch (error) {
    handleServiceError(res, error);
  }
};

export const deleteMfgTemplatePackage = async (req: Request, res: Response) => {
  try {
    const packageId = toPackageId(req.params.id);
    if (!packageId) {
      return res.status(400).json({ error: '非法总包 ID' });
    }

    await MfgTemplatePackageService.deletePackage(packageId);
    res.json({ message: '总包已删除' });
  } catch (error) {
    handleServiceError(res, error);
  }
};

export const previewMfgTemplatePackage = async (req: Request, res: Response) => {
  try {
    const packageId = toPackageId(req.params.id);
    if (!packageId) {
      return res.status(400).json({ error: '非法总包 ID' });
    }

    const preview = await MfgTemplatePackageService.buildPreview(packageId);
    res.json(preview);
  } catch (error) {
    handleServiceError(res, error);
  }
};

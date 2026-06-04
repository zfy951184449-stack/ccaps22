import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  WxbButton,
  WxbDataTable,
  WxbIcon,
  WxbInput,
  WxbInputNumber,
  WxbModal,
  WxbSelect,
  WxbTableActionCell,
  WxbTag,
  wxbToast,
} from './wxb-ui';
import { mfgTemplatePackageApi, MfgTemplatePackagePayload } from '../services/api';
import { processTemplateV2Api } from '../services';
import type { PlannerOperation } from './ProcessTemplateV2/types';
import type {
  MfgTemplatePackageDetail,
  MfgTemplatePackageSummary,
} from '../types';
import './MfgTemplatePackagePanel.css';

interface MfgTemplatePackagePanelProps {
  templates: TemplateOption[];
}

interface TemplateOption {
  id?: number;
  template_code: string;
  template_name: string;
  total_days?: number | null;
}

type SimpleModule = {
  role_code: string;
  template_id?: number;
};

type SimpleLink = {
  source_role_code: string;
  source_schedule_id?: number | null;
  source_anchor_day: number;
  source_anchor_restored?: boolean;
  target_role_code: string;
  target_schedule_id?: number | null;
  target_anchor_day: number;
  target_anchor_restored?: boolean;
  lag_days: number;
  description?: string | null;
};

type PackageFormState = {
  package_name: string;
  modules: SimpleModule[];
  links: SimpleLink[];
};

type AnchorOperationOption = {
  scheduleId: number;
  operationName: string;
  operationCode: string;
  stageName: string;
  absoluteDay: number;
  label: string;
};

type LinkSide = 'source' | 'target';

type OperationSelectValue = number | string | undefined;

type LinkWithOptionalScheduleIds = MfgTemplatePackageDetail['day_links'][number] & {
  source_schedule_id?: number | null;
  target_schedule_id?: number | null;
};

const createRoleCode = (index: number) => `T${index + 1}`;

const createNextRoleCode = (modules: SimpleModule[]) => {
  const used = new Set(modules.map((module) => module.role_code));
  let index = modules.length;
  let next = createRoleCode(index);
  while (used.has(next)) {
    index += 1;
    next = createRoleCode(index);
  }
  return next;
};

const createDefaultForm = (): PackageFormState => ({
  package_name: '',
  modules: [
    { role_code: createRoleCode(0), template_id: undefined },
    { role_code: createRoleCode(1), template_id: undefined },
  ],
  links: [
    {
      source_role_code: createRoleCode(0),
      source_schedule_id: null,
      source_anchor_day: 0,
      target_role_code: createRoleCode(1),
      target_schedule_id: null,
      target_anchor_day: 0,
      lag_days: 0,
    },
  ],
});

const createEmptyLink = (sourceRoleCode: string, targetRoleCode: string): SimpleLink => ({
  source_role_code: sourceRoleCode,
  source_schedule_id: null,
  source_anchor_day: 0,
  target_role_code: targetRoleCode,
  target_schedule_id: null,
  target_anchor_day: 0,
  lag_days: 0,
});

const getOperationAbsoluteDay = (operation: PlannerOperation) => (
  Number(operation.stage_start_day ?? 0) +
  Number(operation.operation_day ?? 0) +
  Number(operation.recommended_day_offset ?? 0)
);

const toAnchorOperationOption = (operation: PlannerOperation): AnchorOperationOption => {
  const absoluteDay = getOperationAbsoluteDay(operation);
  return {
    scheduleId: operation.id,
    operationName: operation.operation_name,
    operationCode: operation.operation_code,
    stageName: operation.stage_name,
    absoluteDay,
    label: `${operation.operation_name} · ${operation.stage_name} · Day ${absoluteDay}`,
  };
};

const getTemplateLabel = (template?: TemplateOption) => {
  if (!template) return '未选择模板';
  return `${template.template_code} · ${template.template_name}`;
};

const normalizeMatchText = (value?: string | null) => (
  String(value ?? '').trim().toLowerCase().replace(/\s+/g, '')
);

const extractSavedOperationLabel = (description: string | null | undefined, side: LinkSide): string | null => {
  const text = String(description ?? '').trim();
  if (!text) return null;

  const relationMatch = text.match(/\s(?:同一天|相差 [+-]?\d+ 天)\s/);
  const segment = side === 'source'
    ? text.slice(0, relationMatch?.index ?? text.length)
    : text.slice(relationMatch ? (relationMatch.index ?? 0) + relationMatch[0].length : 0);
  const slashIndex = segment.lastIndexOf(' / ');
  const label = slashIndex >= 0 ? segment.slice(slashIndex + 3).trim() : '';
  return label || null;
};

const createRestoredAnchorValue = (side: LinkSide, roleCode: string, anchorDay: number) => (
  `restored-anchor:${side}:${roleCode}:${anchorDay}`
);

const toFormState = (detail: MfgTemplatePackageDetail): PackageFormState => ({
  package_name: detail.package_name,
  modules: detail.modules.map((module, index) => ({
    role_code: module.role_code || createRoleCode(index),
    template_id: module.template_id,
  })),
  links: detail.day_links.map((rawLink) => {
    const link = rawLink as LinkWithOptionalScheduleIds;
    const sourceScheduleId = link.source_schedule_id ?? null;
    const targetScheduleId = link.target_schedule_id ?? null;

    return {
      source_role_code: link.source_role_code,
      source_schedule_id: sourceScheduleId,
      source_anchor_day: link.source_anchor_day,
      source_anchor_restored: !sourceScheduleId,
      target_role_code: link.target_role_code,
      target_schedule_id: targetScheduleId,
      target_anchor_day: link.target_anchor_day,
      target_anchor_restored: !targetScheduleId,
      lag_days: link.lag_days,
      description: link.description ?? null,
    };
  }),
});

const PackageDesignerModal: React.FC<{
  open: boolean;
  templates: TemplateOption[];
  editingPackage: MfgTemplatePackageDetail | null;
  onCancel: () => void;
  onSubmit: (payload: MfgTemplatePackagePayload, editingId?: number) => Promise<void>;
}> = ({ open, templates, editingPackage, onCancel, onSubmit }) => {
  const [form, setForm] = useState<PackageFormState>(createDefaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [operationsByTemplateId, setOperationsByTemplateId] = useState<Record<number, AnchorOperationOption[]>>({});
  const [operationLoadingByTemplateId, setOperationLoadingByTemplateId] = useState<Record<number, boolean>>({});
  const operationRequestsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!open) return;
    setForm(editingPackage ? toFormState(editingPackage) : createDefaultForm());
  }, [editingPackage, open]);

  useEffect(() => {
    if (!open) return;

    const templateIds = Array.from(new Set(
      form.modules
        .map((module) => module.template_id)
        .filter((id): id is number => typeof id === 'number' && id > 0),
    ));
    const missingTemplateIds = templateIds.filter((templateId) => (
      operationsByTemplateId[templateId] === undefined &&
      !operationRequestsRef.current.has(templateId)
    ));

    if (!missingTemplateIds.length) return;

    missingTemplateIds.forEach((templateId) => {
      operationRequestsRef.current.add(templateId);
    });

    setOperationLoadingByTemplateId((current) => {
      const next = { ...current };
      missingTemplateIds.forEach((templateId) => {
        next[templateId] = true;
      });
      return next;
    });

    missingTemplateIds.forEach((templateId) => {
      processTemplateV2Api.getPlanner(templateId)
        .then((response) => {
          setOperationsByTemplateId((current) => ({
            ...current,
            [templateId]: response.operations.map(toAnchorOperationOption),
          }));
        })
        .catch((error) => {
          console.error('Failed to load template operations for package anchors', error);
          wxbToast.error('加载模板操作失败');
          setOperationsByTemplateId((current) => ({
            ...current,
            [templateId]: [],
          }));
        })
        .finally(() => {
          operationRequestsRef.current.delete(templateId);
          setOperationLoadingByTemplateId((current) => ({
            ...current,
            [templateId]: false,
          }));
        });
    });
  }, [form.modules, open, operationsByTemplateId]);

  const templateById = useMemo(() => (
    new Map(templates
      .filter((template): template is TemplateOption & { id: number } => typeof template.id === 'number')
      .map((template) => [template.id, template]))
  ), [templates]);

  const moduleByRole = useMemo(() => (
    new Map(form.modules.map((module) => [module.role_code, module]))
  ), [form.modules]);

  const moduleOptions = useMemo(() => (
    form.modules.map((module, index) => {
      const template = module.template_id ? templateById.get(module.template_id) : undefined;
      return {
        value: module.role_code,
        label: template ? template.template_name : `模板 ${index + 1}`,
      };
    })
  ), [form.modules, templateById]);

  const templateOptions = useMemo(() => (
    templates
      .filter((template): template is TemplateOption & { id: number } => typeof template.id === 'number')
      .map((template) => ({
        value: template.id,
        label: getTemplateLabel(template),
      }))
  ), [templates]);

  const getOperationOptionsForRole = useCallback((roleCode: string) => {
    const templateId = moduleByRole.get(roleCode)?.template_id;
    if (!templateId) return [];
    return operationsByTemplateId[templateId] ?? [];
  }, [moduleByRole, operationsByTemplateId]);

  const isOperationLoadingForRole = useCallback((roleCode: string) => {
    const templateId = moduleByRole.get(roleCode)?.template_id;
    return templateId ? Boolean(operationLoadingByTemplateId[templateId]) : false;
  }, [moduleByRole, operationLoadingByTemplateId]);

  const findOperation = useCallback((roleCode: string, scheduleId?: number | null) => {
    if (!scheduleId) return undefined;
    return getOperationOptionsForRole(roleCode).find((operation) => operation.scheduleId === scheduleId);
  }, [getOperationOptionsForRole]);

  const findSavedOperationByAnchor = useCallback((roleCode: string, anchorDay: number, description?: string | null) => {
    const matches = getOperationOptionsForRole(roleCode)
      .filter((operation) => operation.absoluteDay === anchorDay);

    const normalizedDescription = normalizeMatchText(description);
    if (normalizedDescription) {
      const describedMatches = matches.filter((operation) => (
        normalizedDescription.includes(normalizeMatchText(operation.operationName)) ||
        normalizedDescription.includes(normalizeMatchText(operation.operationCode))
      ));
      if (describedMatches.length === 1) return describedMatches[0];
    }

    return matches.length === 1 ? matches[0] : undefined;
  }, [getOperationOptionsForRole]);

  useEffect(() => {
    if (!open) return;

    setForm((current) => {
      let changed = false;
      const links = current.links.map((link) => {
        let next = link;

        if (!link.source_schedule_id && link.source_anchor_restored) {
          const operation = findSavedOperationByAnchor(link.source_role_code, link.source_anchor_day, link.description);
          if (operation) {
            next = {
              ...next,
              source_schedule_id: operation.scheduleId,
              source_anchor_restored: false,
            };
            changed = true;
          }
        }

        if (!next.target_schedule_id && next.target_anchor_restored) {
          const operation = findSavedOperationByAnchor(next.target_role_code, next.target_anchor_day, next.description);
          if (operation) {
            next = {
              ...next,
              target_schedule_id: operation.scheduleId,
              target_anchor_restored: false,
            };
            changed = true;
          }
        }

        return next;
      });

      return changed ? { ...current, links } : current;
    });
  }, [findSavedOperationByAnchor, open]);

  const getOperationSelectValue = useCallback((link: SimpleLink, side: LinkSide): OperationSelectValue => {
    if (side === 'source') {
      if (link.source_schedule_id) return link.source_schedule_id;
      return link.source_anchor_restored
        ? createRestoredAnchorValue('source', link.source_role_code, link.source_anchor_day)
        : undefined;
    }

    if (link.target_schedule_id) return link.target_schedule_id;
    return link.target_anchor_restored
      ? createRestoredAnchorValue('target', link.target_role_code, link.target_anchor_day)
      : undefined;
  }, []);

  const getOperationSelectOptions = useCallback((link: SimpleLink, side: LinkSide) => {
    const roleCode = side === 'source' ? link.source_role_code : link.target_role_code;
    const anchorDay = side === 'source' ? link.source_anchor_day : link.target_anchor_day;
    const restored = side === 'source' ? link.source_anchor_restored : link.target_anchor_restored;
    const scheduleId = side === 'source' ? link.source_schedule_id : link.target_schedule_id;
    const options = getOperationOptionsForRole(roleCode).map((operation) => ({
      value: operation.scheduleId,
      label: operation.label,
    }));

    if (!scheduleId && restored) {
      const savedOperationLabel = extractSavedOperationLabel(link.description, side);
      return [
        {
          value: createRestoredAnchorValue(side, roleCode, anchorDay),
          label: savedOperationLabel ? `${savedOperationLabel} · Day ${anchorDay}` : `Day ${anchorDay}`,
        },
        ...options,
      ];
    }

    return options;
  }, [getOperationOptionsForRole]);

  const describeLink = useCallback((link: SimpleLink) => {
    const sourceTemplate = moduleByRole.get(link.source_role_code)?.template_id;
    const targetTemplate = moduleByRole.get(link.target_role_code)?.template_id;
    const sourceTemplateName = sourceTemplate ? templateById.get(sourceTemplate)?.template_name : undefined;
    const targetTemplateName = targetTemplate ? templateById.get(targetTemplate)?.template_name : undefined;
    const sourceOperation = findOperation(link.source_role_code, link.source_schedule_id);
    const targetOperation = findOperation(link.target_role_code, link.target_schedule_id);
    const relation = link.lag_days === 0 ? '同一天' : `相差 ${link.lag_days > 0 ? '+' : ''}${link.lag_days} 天`;

    if ((link.source_anchor_restored || link.target_anchor_restored) && link.description) {
      return link.description;
    }

    return `${sourceTemplateName ?? '源模板'} / ${sourceOperation?.operationName ?? `Day ${link.source_anchor_day}`} ${relation} ${targetTemplateName ?? '目标模板'} / ${targetOperation?.operationName ?? `Day ${link.target_anchor_day}`}`;
  }, [findOperation, moduleByRole, templateById]);

  const updateModuleTemplate = useCallback((index: number, templateId?: number) => {
    setForm((current) => {
      const roleCode = current.modules[index]?.role_code;
      return {
        ...current,
        modules: current.modules.map((module, moduleIndex) => (
          moduleIndex === index ? { ...module, template_id: templateId } : module
        )),
        links: current.links.map((link) => {
          if (link.source_role_code === roleCode) {
            return {
              ...link,
              source_schedule_id: null,
              source_anchor_day: 0,
              source_anchor_restored: false,
              description: null,
            };
          }
          if (link.target_role_code === roleCode) {
            return {
              ...link,
              target_schedule_id: null,
              target_anchor_day: 0,
              target_anchor_restored: false,
              description: null,
            };
          }
          return link;
        }),
      };
    });
  }, []);

  const updateLink = useCallback((index: number, patch: Partial<SimpleLink>) => {
    setForm((current) => ({
      ...current,
      links: current.links.map((link, linkIndex) => (
        linkIndex === index ? { ...link, ...patch, description: null } : link
      )),
    }));
  }, []);

  const updateLinkOperation = useCallback((index: number, side: 'source' | 'target', scheduleId?: number | null) => {
    setForm((current) => ({
      ...current,
      links: current.links.map((link, linkIndex) => {
        if (linkIndex !== index) return link;
        const roleCode = side === 'source' ? link.source_role_code : link.target_role_code;
        const operation = getOperationOptionsForRole(roleCode).find((item) => item.scheduleId === scheduleId);

        if (side === 'source') {
          return {
            ...link,
            source_schedule_id: operation?.scheduleId ?? null,
            source_anchor_day: operation?.absoluteDay ?? link.source_anchor_day,
            source_anchor_restored: false,
            description: null,
          };
        }

        return {
          ...link,
          target_schedule_id: operation?.scheduleId ?? null,
          target_anchor_day: operation?.absoluteDay ?? link.target_anchor_day,
          target_anchor_restored: false,
          description: null,
        };
      }),
    }));
  }, [getOperationOptionsForRole]);

  const addModule = useCallback(() => {
    setForm((current) => {
      const nextRoleCode = createNextRoleCode(current.modules);
      const previousRoleCode = current.modules[current.modules.length - 1]?.role_code ?? createRoleCode(0);

      return {
        ...current,
        modules: [
          ...current.modules,
          { role_code: nextRoleCode, template_id: undefined },
        ],
        links: [
          ...current.links,
          createEmptyLink(previousRoleCode, nextRoleCode),
        ],
      };
    });
  }, []);

  const removeModule = useCallback((roleCode: string) => {
    setForm((current) => {
      const modules = current.modules.filter((module) => module.role_code !== roleCode);
      const validRoleCodes = new Set(modules.map((module) => module.role_code));
      const retainedLinks = current.links.filter((link) => (
        validRoleCodes.has(link.source_role_code) && validRoleCodes.has(link.target_role_code)
      ));
      const requiredLinks = Math.max(modules.length - 1, 0);
      const links = retainedLinks.slice(0, requiredLinks);

      while (links.length < requiredLinks) {
        const sourceRoleCode = modules[links.length]?.role_code;
        const targetRoleCode = modules[links.length + 1]?.role_code;
        if (!sourceRoleCode || !targetRoleCode) break;
        links.push(createEmptyLink(sourceRoleCode, targetRoleCode));
      }

      return {
        ...current,
        modules,
        links,
      };
    });
  }, []);

  const validate = useCallback(() => {
    const selectedModules = form.modules.filter((module) => module.template_id);
    if (!form.package_name.trim()) {
      wxbToast.error('请输入总包名称');
      return false;
    }
    if (selectedModules.length < 2) {
      wxbToast.error('至少选择两个工艺模板');
      return false;
    }
    if (form.links.length === 0) {
      wxbToast.error('至少设置一条时间串联关系');
      return false;
    }
    const invalidLink = form.links.find((link) => (
      !moduleByRole.get(link.source_role_code)?.template_id ||
      !moduleByRole.get(link.target_role_code)?.template_id ||
      (!link.source_schedule_id && !link.source_anchor_restored) ||
      (!link.target_schedule_id && !link.target_anchor_restored)
    ));
    if (invalidLink) {
      wxbToast.error('请为每条串联关系选择源模板操作和目标模板操作');
      return false;
    }
    return true;
  }, [form, moduleByRole]);

  const toPayload = useCallback((): MfgTemplatePackagePayload => {
    const selectedModules = form.modules.filter((module) => module.template_id);

    return {
      package_code: editingPackage?.package_code ?? null,
      package_name: form.package_name.trim(),
      package_status: editingPackage?.package_status ?? 'ACTIVE',
      description: null,
      modules: selectedModules.map((module, index) => {
        const template = module.template_id ? templateById.get(module.template_id) : undefined;
        return {
          role_code: module.role_code,
          role_name: template?.template_name ?? `模板 ${index + 1}`,
          template_id: Number(module.template_id),
          start_offset_days: index === 0 ? 0 : null,
          is_anchor: index === 0,
          sort_order: index,
        };
      }),
      day_links: form.links.map((link) => ({
        source_role_code: link.source_role_code,
        target_role_code: link.target_role_code,
        source_anchor_day: link.source_anchor_day,
        target_anchor_day: link.target_anchor_day,
        lag_days: link.lag_days,
        description: describeLink(link),
        is_active: true,
      })),
    };
  }, [describeLink, editingPackage?.package_code, editingPackage?.package_status, form, templateById]);

  const handleSubmit = useCallback(async () => {
    if (!validate()) return;

    setSubmitting(true);
    try {
      await onSubmit(toPayload(), editingPackage?.id);
    } finally {
      setSubmitting(false);
    }
  }, [editingPackage?.id, onSubmit, toPayload, validate]);

  return (
    <WxbModal
      open={open}
      title={editingPackage ? '编辑总包设计' : '新建总包设计'}
      okText={editingPackage ? '保存' : '创建'}
      cancelText="取消"
      confirmLoading={submitting}
      onOk={handleSubmit}
      onCancel={onCancel}
      width={840}
      centered
    >
      <div className="mfg-package-modal">
        <WxbInput
          label="总包名称"
          value={form.package_name}
          placeholder="例如 WBP2486 上下游联动"
          onChange={(event) => setForm((current) => ({ ...current, package_name: event.target.value }))}
        />

        <div className="mfg-package-modal__section-head">
          <div>
            <h3>包含模板</h3>
            <p>选择这个总包要串起来的已有工艺模板。</p>
          </div>
          <WxbButton type="button" variant="secondary" size="sm" onClick={addModule}>
            <WxbIcon name="receipt" size={14} />
            增加模板
          </WxbButton>
        </div>

        <div className="mfg-package-modal__rows">
          {form.modules.map((module, index) => (
            <div className="mfg-package-modal__simple-module-row" key={module.role_code}>
              <WxbSelect
                label={`模板 ${index + 1}`}
                value={module.template_id}
                placeholder="选择工艺模板"
                showSearch
                optionFilterProp="label"
                options={templateOptions}
                onChange={(value) => updateModuleTemplate(index, value as number)}
              />
              <WxbButton
                type="button"
                variant="ghost"
                size="sm"
                disabled={form.modules.length <= 2}
                onClick={() => removeModule(module.role_code)}
              >
                删除
              </WxbButton>
            </div>
          ))}
        </div>

        <div className="mfg-package-modal__section-head">
          <div>
            <h3>时间串联</h3>
            <p>每相邻两个模板自动生成一条串联；只有两个模板时只需要设置这一条。</p>
          </div>
        </div>

        <div className="mfg-package-modal__rows">
          {form.links.map((link, index) => (
            <div className="mfg-package-modal__simple-link-row" key={`${link.source_role_code}-${link.target_role_code}-${index}`}>
              <WxbSelect
                label="源模板"
                value={link.source_role_code}
                options={moduleOptions}
                onChange={(value) => updateLink(index, {
                  source_role_code: value as string,
                  source_schedule_id: null,
                  source_anchor_day: 0,
                  source_anchor_restored: false,
                })}
              />
              <WxbSelect
                label="源操作"
                value={getOperationSelectValue(link, 'source')}
                placeholder={isOperationLoadingForRole(link.source_role_code) ? '操作加载中' : '选择操作'}
                showSearch
                optionFilterProp="label"
                options={getOperationSelectOptions(link, 'source')}
                onChange={(value) => {
                  if (typeof value === 'number') updateLinkOperation(index, 'source', value);
                }}
              />
              <WxbInputNumber
                label="相差天数"
                value={link.lag_days}
                precision={0}
                addonAfter="天"
                onChange={(value) => updateLink(index, { lag_days: Number(value ?? 0) })}
              />
              <WxbSelect
                label="目标模板"
                value={link.target_role_code}
                options={moduleOptions}
                onChange={(value) => updateLink(index, {
                  target_role_code: value as string,
                  target_schedule_id: null,
                  target_anchor_day: 0,
                  target_anchor_restored: false,
                })}
              />
              <WxbSelect
                label="目标操作"
                value={getOperationSelectValue(link, 'target')}
                placeholder={isOperationLoadingForRole(link.target_role_code) ? '操作加载中' : '选择操作'}
                showSearch
                optionFilterProp="label"
                options={getOperationSelectOptions(link, 'target')}
                onChange={(value) => {
                  if (typeof value === 'number') updateLinkOperation(index, 'target', value);
                }}
              />
              <div className="mfg-package-modal__link-summary">
                {describeLink(link)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </WxbModal>
  );
};

const MfgTemplatePackagePanel: React.FC<MfgTemplatePackagePanelProps> = ({ templates }) => {
  const [packages, setPackages] = useState<MfgTemplatePackageSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [designerOpen, setDesignerOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<MfgTemplatePackageDetail | null>(null);

  const loadPackages = useCallback(async () => {
    setLoading(true);
    try {
      const data = await mfgTemplatePackageApi.list();
      setPackages(data);
    } catch (error) {
      console.error('Failed to load MFG packages', error);
      wxbToast.error('加载总包失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPackages();
  }, [loadPackages]);

  const handleCreate = useCallback(() => {
    setEditingPackage(null);
    setDesignerOpen(true);
  }, []);

  const handleEdit = useCallback(async (packageId: number) => {
    try {
      const detail = await mfgTemplatePackageApi.get(packageId);
      setEditingPackage(detail);
      setDesignerOpen(true);
    } catch (error) {
      console.error('Failed to load package for editing', error);
      wxbToast.error('读取总包失败');
    }
  }, []);

  const handleDelete = useCallback(async (packageId: number) => {
    try {
      await mfgTemplatePackageApi.remove(packageId);
      wxbToast.success('总包已删除');
      await loadPackages();
    } catch (error: any) {
      console.error('Failed to delete package', error);
      wxbToast.error(error?.response?.data?.error ?? '删除总包失败');
    }
  }, [loadPackages]);

  const handleSubmit = useCallback(async (payload: MfgTemplatePackagePayload, editingId?: number) => {
    try {
      if (editingId) {
        await mfgTemplatePackageApi.update(editingId, payload);
        wxbToast.success('总包已更新');
      } else {
        await mfgTemplatePackageApi.create(payload);
        wxbToast.success('总包已创建');
      }
      setDesignerOpen(false);
      setEditingPackage(null);
      await loadPackages();
    } catch (error: any) {
      console.error('Failed to save package', error);
      wxbToast.error(error?.response?.data?.error ?? '保存总包失败');
      throw error;
    }
  }, [loadPackages]);

  const packageColumns = useMemo(() => [
    {
      title: '总包',
      dataIndex: 'package_name',
      key: 'package_name',
      render: (_: unknown, record: MfgTemplatePackageSummary) => (
        <div className="mfg-package-panel__identity">
          <span className="mfg-package-panel__name">{record.package_name}</span>
          <span className="mfg-package-panel__code">{record.package_code}</span>
        </div>
      ),
    },
    {
      title: '模板',
      key: 'module_count',
      width: 90,
      render: (_: unknown, record: MfgTemplatePackageSummary) => `${record.module_count} 个`,
    },
    {
      title: '串联',
      key: 'day_link_count',
      width: 90,
      render: (_: unknown, record: MfgTemplatePackageSummary) => `${record.day_link_count} 条`,
    },
    {
      title: '周期',
      key: 'total_days',
      width: 100,
      render: (_: unknown, record: MfgTemplatePackageSummary) => (
        record.total_days ? `${record.total_days} 天` : '-'
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      render: (_: unknown, record: MfgTemplatePackageSummary) => (
        <WxbTableActionCell
          maxInline={2}
          actions={[
            { key: 'edit', label: '编辑', onClick: () => handleEdit(record.id) },
            {
              key: 'delete',
              label: '删除',
              variant: 'danger',
              onClick: () => handleDelete(record.id),
              confirm: {
                title: '删除总包',
                description: `确定删除 ${record.package_name} 吗？已被批次引用的总包会被阻止删除。`,
                okText: '删除',
                cancelText: '取消',
              },
            },
          ]}
        />
      ),
    },
  ], [handleDelete, handleEdit]);

  return (
    <section className="mfg-package-panel" aria-label="总包设计">
      <div className="mfg-package-panel__header">
        <div>
          <div className="wxb-template-eyebrow">Package Design</div>
          <h3>总包设计</h3>
          <p>选择多个已有工艺模板，用关键操作发生的日期把模板串起来。总包只保存串联关系，不复制模板内容。</p>
        </div>
        <WxbButton type="button" variant="primary" onClick={handleCreate}>
          <WxbIcon name="batch-record" size={16} />
          新建总包
        </WxbButton>
      </div>

      <div className="mfg-package-panel__guide">
        <WxbTag color="blue">例</WxbTag>
        <span>上游模板 / 收获</span>
        <span>=</span>
        <span>下游模板 / AC C1</span>
      </div>

      <WxbDataTable<MfgTemplatePackageSummary>
        density="compact"
        rowKey="id"
        loading={loading}
        columns={packageColumns}
        dataSource={packages}
        pagination={false}
        emptyState={{
          description: '暂无总包设计',
          action: (
            <WxbButton type="button" size="sm" onClick={handleCreate}>
              新建第一个总包
            </WxbButton>
          ),
        }}
      />

      <PackageDesignerModal
        open={designerOpen}
        templates={templates}
        editingPackage={editingPackage}
        onCancel={() => {
          setDesignerOpen(false);
          setEditingPackage(null);
        }}
        onSubmit={handleSubmit}
      />
    </section>
  );
};

export default MfgTemplatePackagePanel;

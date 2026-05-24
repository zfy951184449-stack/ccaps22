import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  WxbBadge,
  WxbButton,
  WxbCheckbox,
  WxbDataTable,
  WxbEmpty,
  WxbGanttChart,
  WxbIcon,
  WxbInput,
  WxbInputNumber,
  WxbModal,
  WxbSelect,
  WxbSpinner,
  WxbTableActionCell,
  WxbTag,
  WxbTextarea,
  wxbToast,
} from './wxb-ui';
import { mfgTemplatePackageApi, MfgTemplatePackagePayload } from '../services/api';
import type { GanttGroup, GanttTask } from './wxb-ui';
import type {
  MfgTemplatePackageDayLink,
  MfgTemplatePackageDetail,
  MfgTemplatePackageModule,
  MfgTemplatePackagePreview,
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

type PackageFormModule = {
  role_code: string;
  role_name: string;
  template_id?: number;
  start_offset_days?: number | null;
  is_anchor: boolean;
  sort_order: number;
};

type PackageFormLink = {
  source_role_code: string;
  target_role_code: string;
  source_anchor_day: number;
  target_anchor_day: number;
  lag_days: number;
  description?: string | null;
};

type PackageFormState = {
  package_code?: string | null;
  package_name: string;
  description?: string | null;
  package_status: 'DRAFT' | 'ACTIVE' | 'RETIRED';
  modules: PackageFormModule[];
  day_links: PackageFormLink[];
};

const ROLE_PRESETS = [
  { value: 'USP', label: 'USP 上游', roleName: '上游' },
  { value: 'DSP', label: 'DSP 下游', roleName: '下游' },
  { value: 'BUFFER', label: 'Buffer 配液', roleName: '配液' },
  { value: 'MEDIA', label: 'Media 培养基', roleName: '培养基' },
  { value: 'ANCILLARY', label: 'Ancillary 辅助', roleName: '辅助' },
];

const ROLE_COLOR: Record<string, string> = {
  USP: 'var(--wx-blue-500)',
  DSP: 'var(--wx-green-500)',
  BUFFER: 'var(--wx-amber-500)',
  MEDIA: 'var(--wx-blue-400)',
  ANCILLARY: 'var(--wx-fg-3)',
};

const createDefaultForm = (): PackageFormState => ({
  package_code: null,
  package_name: '',
  description: '',
  package_status: 'DRAFT',
  modules: [
    { role_code: 'USP', role_name: '上游', template_id: undefined, start_offset_days: 0, is_anchor: true, sort_order: 0 },
    { role_code: 'DSP', role_name: '下游', template_id: undefined, start_offset_days: null, is_anchor: false, sort_order: 1 },
    { role_code: 'BUFFER', role_name: '配液', template_id: undefined, start_offset_days: null, is_anchor: false, sort_order: 2 },
  ],
  day_links: [
    { source_role_code: 'USP', target_role_code: 'DSP', source_anchor_day: 18, target_anchor_day: 1, lag_days: 0 },
    { source_role_code: 'BUFFER', target_role_code: 'DSP', source_anchor_day: 1, target_anchor_day: 3, lag_days: -1 },
  ],
});

const toFormState = (detail: MfgTemplatePackageDetail): PackageFormState => ({
  package_code: detail.package_code,
  package_name: detail.package_name,
  description: detail.description ?? '',
  package_status: detail.package_status,
  modules: detail.modules.map((module, index) => ({
    role_code: module.role_code,
    role_name: module.role_name,
    template_id: module.template_id,
    start_offset_days: module.start_offset_days ?? null,
    is_anchor: module.is_anchor,
    sort_order: module.sort_order ?? index,
  })),
  day_links: detail.day_links.map((link) => ({
    source_role_code: link.source_role_code,
    target_role_code: link.target_role_code,
    source_anchor_day: link.source_anchor_day,
    target_anchor_day: link.target_anchor_day,
    lag_days: link.lag_days,
    description: link.description ?? null,
  })),
});

const getStatusBadge = (status: MfgTemplatePackageSummary['package_status']) => {
  if (status === 'ACTIVE') return <WxbBadge status="success" variant="bar" label="Active" />;
  if (status === 'RETIRED') return <WxbBadge status="neutral" variant="bar" label="Retired" />;
  return <WxbBadge status="info" variant="bar" label="Draft" />;
};

const buildGanttData = (preview: MfgTemplatePackagePreview | null): { groups: GanttGroup[]; tasks: GanttTask[]; range: { start: number; end: number } } => {
  if (!preview) {
    return { groups: [], tasks: [], range: { start: 0, end: 24 } };
  }

  const groups: GanttGroup[] = [];
  const stageGroupIds = new Set<string>();

  preview.modules.forEach((module) => {
    groups.push({
      id: `module-${module.role_code}`,
      label: `${module.role_name} · ${module.template_name ?? module.template_id}`,
      color: ROLE_COLOR[module.role_code] ?? 'var(--wx-fg-3)',
      type: 'template',
    });
  });

  preview.tasks.forEach((task) => {
    const stageGroupId = `stage-${task.role_code}-${task.stage_id}`;
    if (!stageGroupIds.has(stageGroupId)) {
      stageGroupIds.add(stageGroupId);
      groups.push({
        id: stageGroupId,
        parentId: `module-${task.role_code}`,
        label: task.stage_name,
        color: ROLE_COLOR[task.role_code] ?? 'var(--wx-fg-3)',
        type: 'stage',
      });
    }
  });

  const tasks: GanttTask[] = preview.tasks.map((task) => ({
    id: task.id,
    label: task.operation_name,
    start: task.start_hour,
    end: task.end_hour,
    windowStart: task.window_start_hour,
    windowEnd: task.window_end_hour,
    groupId: `stage-${task.role_code}-${task.stage_id}`,
    color: ROLE_COLOR[task.role_code] ?? 'var(--wx-fg-3)',
    requiredPeople: task.required_people,
    type: 'operation',
    readOnly: true,
    data: {
      roleCode: task.role_code,
      templateCode: task.template_code,
      operationCode: task.operation_code,
    },
  }));

  return {
    groups,
    tasks,
    range: {
      start: preview.min_day * 24,
      end: Math.max((preview.max_day + 1) * 24, preview.min_day * 24 + 24),
    },
  };
};

const toPayload = (form: PackageFormState): MfgTemplatePackagePayload => ({
  package_code: form.package_code || null,
  package_name: form.package_name.trim(),
  description: form.description?.trim() || null,
  package_status: form.package_status,
  modules: form.modules
    .filter((module) => module.template_id)
    .map((module, index) => ({
      role_code: module.role_code,
      role_name: module.role_name,
      template_id: Number(module.template_id),
      start_offset_days: module.is_anchor ? (module.start_offset_days ?? 0) : module.start_offset_days ?? null,
      is_anchor: module.is_anchor,
      sort_order: index,
    })),
  day_links: form.day_links,
});

const PackageEditorModal: React.FC<{
  open: boolean;
  templates: TemplateOption[];
  editingPackage: MfgTemplatePackageDetail | null;
  onCancel: () => void;
  onSubmit: (payload: MfgTemplatePackagePayload, editingId?: number) => Promise<void>;
}> = ({ open, templates, editingPackage, onCancel, onSubmit }) => {
  const [form, setForm] = useState<PackageFormState>(createDefaultForm);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(editingPackage ? toFormState(editingPackage) : createDefaultForm());
  }, [editingPackage, open]);

  const templateOptions = useMemo(() => (
    templates
      .filter((template): template is TemplateOption & { id: number } => typeof template.id === 'number')
      .map((template) => ({
        value: template.id,
        label: `${template.template_code} · ${template.template_name}`,
      }))
  ), [templates]);

  const roleOptions = useMemo(() => (
    form.modules.map((module) => ({
      value: module.role_code,
      label: `${module.role_code} · ${module.role_name}`,
    }))
  ), [form.modules]);

  const updateModule = useCallback((index: number, patch: Partial<PackageFormModule>) => {
    setForm((current) => ({
      ...current,
      modules: current.modules.map((module, moduleIndex) => (
        moduleIndex === index ? { ...module, ...patch } : module
      )),
    }));
  }, []);

  const updateLink = useCallback((index: number, patch: Partial<PackageFormLink>) => {
    setForm((current) => ({
      ...current,
      day_links: current.day_links.map((link, linkIndex) => (
        linkIndex === index ? { ...link, ...patch } : link
      )),
    }));
  }, []);

  const addModule = useCallback(() => {
    setForm((current) => ({
      ...current,
      modules: [
        ...current.modules,
        {
          role_code: `MOD${current.modules.length + 1}`,
          role_name: `模块 ${current.modules.length + 1}`,
          template_id: undefined,
          start_offset_days: null,
          is_anchor: false,
          sort_order: current.modules.length,
        },
      ],
    }));
  }, []);

  const addLink = useCallback(() => {
    setForm((current) => {
      const source = current.modules[0]?.role_code ?? 'USP';
      const target = current.modules[1]?.role_code ?? source;
      return {
        ...current,
        day_links: [
          ...current.day_links,
          { source_role_code: source, target_role_code: target, source_anchor_day: 1, target_anchor_day: 1, lag_days: 0 },
        ],
      };
    });
  }, []);

  const validate = useCallback(() => {
    if (!form.package_name.trim()) {
      wxbToast.error('请输入总包名称');
      return false;
    }

    const modules = form.modules.filter((module) => module.template_id);
    if (!modules.length) {
      wxbToast.error('至少选择一个模板模块');
      return false;
    }

    const roleCodes = modules.map((module) => module.role_code);
    if (new Set(roleCodes).size !== roleCodes.length) {
      wxbToast.error('模块角色编码不能重复');
      return false;
    }

    return true;
  }, [form]);

  const handleOk = useCallback(async () => {
    if (!validate()) return;

    setSubmitting(true);
    try {
      await onSubmit(toPayload(form), editingPackage?.id);
    } finally {
      setSubmitting(false);
    }
  }, [editingPackage?.id, form, onSubmit, validate]);

  return (
    <WxbModal
      open={open}
      title={editingPackage ? '编辑 MFG 总包' : '新建 MFG 总包'}
      okText={editingPackage ? '保存总包' : '创建总包'}
      cancelText="取消"
      confirmLoading={submitting}
      onOk={handleOk}
      onCancel={onCancel}
      width={980}
      centered
    >
      <div className="mfg-package-modal">
        <div className="mfg-package-modal__grid">
          <WxbInput
            label="总包名称"
            value={form.package_name}
            placeholder="例如 WBP2486 MFG 联动总包"
            onChange={(event) => setForm((current) => ({ ...current, package_name: event.target.value }))}
          />
          <WxbInput
            label="总包编码"
            value={form.package_code ?? ''}
            placeholder="留空自动生成"
            onChange={(event) => setForm((current) => ({ ...current, package_code: event.target.value }))}
          />
          <WxbSelect
            label="状态"
            value={form.package_status}
            options={[
              { value: 'DRAFT', label: '草稿' },
              { value: 'ACTIVE', label: '启用' },
              { value: 'RETIRED', label: '停用' },
            ]}
            onChange={(value) => setForm((current) => ({ ...current, package_status: value as PackageFormState['package_status'] }))}
          />
        </div>

        <WxbTextarea
          label="说明"
          value={form.description ?? ''}
          placeholder="说明该总包适用产品、上游/下游/配液组合关系"
          onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
        />

        <div className="mfg-package-modal__section-head">
          <div>
            <h3>模板模块</h3>
            <p>模块保留原模板独立维护，总包只记录角色和 Day 偏移。</p>
          </div>
          <WxbButton type="button" variant="secondary" size="sm" onClick={addModule}>
            <WxbIcon name="receipt" size={14} />
            新增模块
          </WxbButton>
        </div>

        <div className="mfg-package-modal__rows">
          {form.modules.map((module, index) => {
            const preset = ROLE_PRESETS.find((item) => item.value === module.role_code);
            return (
              <div className="mfg-package-modal__module-row" key={`${module.role_code}-${index}`}>
                <WxbSelect
                  label="角色"
                  value={module.role_code}
                  options={ROLE_PRESETS.map((item) => ({ value: item.value, label: item.label }))}
                  onChange={(value) => {
                    const roleCode = value as string;
                    const roleName = ROLE_PRESETS.find((item) => item.value === roleCode)?.roleName ?? roleCode;
                    updateModule(index, { role_code: roleCode, role_name: roleName });
                  }}
                />
                <WxbInput
                  label="显示名"
                  value={module.role_name || preset?.roleName || ''}
                  onChange={(event) => updateModule(index, { role_name: event.target.value })}
                />
                <WxbSelect
                  label="工艺模板"
                  value={module.template_id}
                  placeholder="选择模板"
                  showSearch
                  optionFilterProp="label"
                  options={templateOptions}
                  onChange={(value) => updateModule(index, { template_id: value as number })}
                />
                <WxbInputNumber
                  label="固定偏移 Day"
                  value={module.start_offset_days ?? undefined}
                  placeholder="由锚点计算"
                  onChange={(value) => updateModule(index, { start_offset_days: value === null ? null : Number(value) })}
                />
                <div className="mfg-package-modal__anchor-cell">
                  <WxbCheckbox
                    checked={module.is_anchor}
                    onChange={(checked) => updateModule(index, {
                      is_anchor: checked,
                      start_offset_days: checked ? (module.start_offset_days ?? 0) : module.start_offset_days,
                    })}
                  >
                    基准模块
                  </WxbCheckbox>
                  <WxbButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={form.modules.length <= 1}
                    onClick={() => setForm((current) => ({
                      ...current,
                      modules: current.modules.filter((_, moduleIndex) => moduleIndex !== index),
                    }))}
                  >
                    删除
                  </WxbButton>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mfg-package-modal__section-head">
          <div>
            <h3>Day 锚点</h3>
            <p>用源模板 Day 对齐目标模板 Day，不做小时级衔接。</p>
          </div>
          <WxbButton type="button" variant="secondary" size="sm" onClick={addLink}>
            <WxbIcon name="receipt" size={14} />
            新增锚点
          </WxbButton>
        </div>

        <div className="mfg-package-modal__rows">
          {form.day_links.map((link, index) => (
            <div className="mfg-package-modal__link-row" key={`${link.source_role_code}-${link.target_role_code}-${index}`}>
              <WxbSelect
                label="源模块"
                value={link.source_role_code}
                options={roleOptions}
                onChange={(value) => updateLink(index, { source_role_code: value as string })}
              />
              <WxbInputNumber
                label="源 Day"
                value={link.source_anchor_day}
                onChange={(value) => updateLink(index, { source_anchor_day: Number(value ?? 0) })}
              />
              <WxbSelect
                label="目标模块"
                value={link.target_role_code}
                options={roleOptions}
                onChange={(value) => updateLink(index, { target_role_code: value as string })}
              />
              <WxbInputNumber
                label="目标 Day"
                value={link.target_anchor_day}
                onChange={(value) => updateLink(index, { target_anchor_day: Number(value ?? 0) })}
              />
              <WxbInputNumber
                label="偏移 Day"
                value={link.lag_days}
                onChange={(value) => updateLink(index, { lag_days: Number(value ?? 0) })}
              />
              <WxbButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setForm((current) => ({
                  ...current,
                  day_links: current.day_links.filter((_, linkIndex) => linkIndex !== index),
                }))}
              >
                删除
              </WxbButton>
            </div>
          ))}
        </div>
      </div>
    </WxbModal>
  );
};

const MfgTemplatePackagePanel: React.FC<MfgTemplatePackagePanelProps> = ({ templates }) => {
  const [packages, setPackages] = useState<MfgTemplatePackageSummary[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<number | null>(null);
  const [preview, setPreview] = useState<MfgTemplatePackagePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<MfgTemplatePackageDetail | null>(null);

  const loadPackages = useCallback(async () => {
    setLoading(true);
    try {
      const data = await mfgTemplatePackageApi.list();
      setPackages(data);
      setSelectedPackageId((current) => current ?? data[0]?.id ?? null);
    } catch (error) {
      console.error('Failed to load MFG packages', error);
      wxbToast.error('加载 MFG 总包失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPreview = useCallback(async (packageId: number) => {
    setPreviewLoading(true);
    try {
      const data = await mfgTemplatePackageApi.preview(packageId);
      setPreview(data);
    } catch (error) {
      console.error('Failed to load MFG package preview', error);
      setPreview(null);
      wxbToast.error('加载总包甘特失败');
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPackages();
  }, [loadPackages]);

  useEffect(() => {
    if (selectedPackageId) {
      loadPreview(selectedPackageId);
    } else {
      setPreview(null);
    }
  }, [loadPreview, selectedPackageId]);

  const handleCreate = useCallback(() => {
    setEditingPackage(null);
    setEditorOpen(true);
  }, []);

  const handleEdit = useCallback(async (packageId: number) => {
    try {
      const detail = await mfgTemplatePackageApi.get(packageId);
      setEditingPackage(detail);
      setEditorOpen(true);
    } catch (error) {
      console.error('Failed to load package for editing', error);
      wxbToast.error('读取总包失败');
    }
  }, []);

  const handleDelete = useCallback(async (packageId: number) => {
    try {
      await mfgTemplatePackageApi.remove(packageId);
      wxbToast.success('总包已删除');
      if (selectedPackageId === packageId) {
        setSelectedPackageId(null);
      }
      await loadPackages();
    } catch (error: any) {
      console.error('Failed to delete package', error);
      wxbToast.error(error?.response?.data?.error ?? '删除总包失败');
    }
  }, [loadPackages, selectedPackageId]);

  const handleSubmit = useCallback(async (payload: MfgTemplatePackagePayload, editingId?: number) => {
    try {
      const detail = editingId
        ? await mfgTemplatePackageApi.update(editingId, payload)
        : await mfgTemplatePackageApi.create(payload);
      wxbToast.success(editingId ? '总包已更新' : '总包已创建');
      setEditorOpen(false);
      setEditingPackage(null);
      setSelectedPackageId(detail.id);
      await loadPackages();
      await loadPreview(detail.id);
    } catch (error: any) {
      console.error('Failed to save package', error);
      wxbToast.error(error?.response?.data?.error ?? '保存总包失败');
      throw error;
    }
  }, [loadPackages, loadPreview]);

  const packageColumns = useMemo(() => [
    {
      title: '总包',
      dataIndex: 'package_name',
      key: 'package_name',
      render: (_: unknown, record: MfgTemplatePackageSummary) => (
        <div className="mfg-package-panel__identity">
          <span className="mfg-package-panel__code">{record.package_code}</span>
          <span className="mfg-package-panel__name">{record.package_name}</span>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'package_status',
      key: 'package_status',
      width: 110,
      render: (status: MfgTemplatePackageSummary['package_status']) => getStatusBadge(status),
    },
    {
      title: '模块',
      key: 'module_count',
      width: 90,
      render: (_: unknown, record: MfgTemplatePackageSummary) => `${record.module_count} 个`,
    },
    {
      title: '总周期',
      key: 'total_days',
      width: 110,
      render: (_: unknown, record: MfgTemplatePackageSummary) => (
        record.total_days ? `${record.total_days} 天` : '-'
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 210,
      render: (_: unknown, record: MfgTemplatePackageSummary) => (
        <WxbTableActionCell
          maxInline={3}
          actions={[
            { key: 'view', label: '查看', onClick: () => setSelectedPackageId(record.id) },
            { key: 'edit', label: '编辑', onClick: () => handleEdit(record.id) },
            {
              key: 'delete',
              label: '删除',
              variant: 'danger',
              onClick: () => handleDelete(record.id),
              confirm: {
                title: '删除 MFG 总包',
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

  const ganttData = useMemo(() => buildGanttData(preview), [preview]);

  return (
    <section className="mfg-package-panel" aria-label="MFG 总包管理">
      <div className="mfg-package-panel__header">
        <div>
          <div className="wxb-template-eyebrow">MFG Package · 生产联动总包</div>
          <h3>总包管理</h3>
          <p>把上游、下游和配液模板按 Day 锚点组合成一个可预览、可生成批次的 MFG 总包。</p>
        </div>
        <WxbButton type="button" variant="primary" onClick={handleCreate}>
          <WxbIcon name="batch-record" size={16} />
          新建总包
        </WxbButton>
      </div>

      <div className="mfg-package-panel__layout">
        <div className="mfg-package-panel__list">
          <WxbDataTable<MfgTemplatePackageSummary>
            density="compact"
            rowKey="id"
            loading={loading}
            columns={packageColumns}
            dataSource={packages}
            pagination={false}
            onRow={(record) => ({
              onClick: () => setSelectedPackageId(record.id),
              className: record.id === selectedPackageId ? 'mfg-package-panel__row-selected' : '',
            })}
            emptyState={{
              description: '暂无 MFG 总包',
              action: (
                <WxbButton type="button" size="sm" onClick={handleCreate}>
                  新建第一个总包
                </WxbButton>
              ),
            }}
          />
        </div>

        <div className="mfg-package-panel__preview">
          {previewLoading ? (
            <div className="mfg-package-panel__preview-state">
              <WxbSpinner tip="总包甘特加载中" />
            </div>
          ) : preview ? (
            <>
              <div className="mfg-package-panel__preview-head">
                <div>
                  <h4>{preview.package.package_name}</h4>
                  <p>
                    Day {preview.min_day} 到 Day {preview.max_day}，共 {preview.total_days} 天。
                  </p>
                </div>
                <div className="mfg-package-panel__tags">
                  {preview.modules.map((module: MfgTemplatePackageModule) => (
                    <WxbTag key={module.role_code} color={module.role_code === 'DSP' ? 'green' : module.role_code === 'BUFFER' ? 'amber' : 'blue'}>
                      {module.role_code} Day {module.computed_start_offset_days ?? 0}
                    </WxbTag>
                  ))}
                </div>
              </div>

              {preview.conflicts.length > 0 && (
                <div className="mfg-package-panel__conflict" role="alert">
                  <WxbIcon name="rejected" size={16} />
                  Day 锚点存在冲突，请调整后再用于生成批次。
                </div>
              )}

              <div className="mfg-package-panel__link-strip">
                {preview.day_links.length > 0 ? preview.day_links.map((link: MfgTemplatePackageDayLink) => (
                  <span key={`${link.source_role_code}-${link.target_role_code}-${link.id ?? link.source_anchor_day}`}>
                    {link.source_role_code} Day {link.source_anchor_day}
                    {' -> '}
                    {link.target_role_code} Day {link.target_anchor_day}
                    {link.lag_days ? ` (${link.lag_days > 0 ? '+' : ''}${link.lag_days}D)` : ''}
                  </span>
                )) : <span>暂无 Day 锚点，模块将按固定偏移展示。</span>}
              </div>

              {ganttData.tasks.length > 0 ? (
                <div className="mfg-package-panel__gantt">
                  <WxbGanttChart
                    tasks={ganttData.tasks}
                    groups={ganttData.groups}
                    timeRange={ganttData.range}
                    timeUnit="day"
                    readOnly
                    showMinimap
                    showToday={false}
                    initialDayWidth={80}
                    sidebarWidth={260}
                    rowHeight={34}
                  />
                </div>
              ) : (
                <WxbEmpty description="该总包暂无可展示的模板工序" />
              )}
            </>
          ) : (
            <div className="mfg-package-panel__preview-state">
              <WxbEmpty description="选择一个总包查看组合甘特图" />
            </div>
          )}
        </div>
      </div>

      <PackageEditorModal
        open={editorOpen}
        templates={templates}
        editingPackage={editingPackage}
        onCancel={() => {
          setEditorOpen(false);
          setEditingPackage(null);
        }}
        onSubmit={handleSubmit}
      />
    </section>
  );
};

export default MfgTemplatePackagePanel;

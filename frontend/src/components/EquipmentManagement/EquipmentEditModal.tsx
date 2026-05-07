/**
 * 节点编辑/创建弹窗 — 完整 13 字段表单
 * 支持三种模式：create-root / create-child / edit
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { message } from 'antd';
import {
  WxbModal,
  WxbInput,
  WxbInputNumber,
  WxbSelect,
  WxbSwitch,
  WxbFormField,
  WxbTextarea,
  WxbTag,
  WxbAlert,
} from '../wxb-ui';
import type {
  ResourceNode,
  ResourceNodeClass,
  ResourceNodeScope,
  EquipmentSystemType,
  ResourceNodePayload,
} from '../ProcessTemplateV2/types';
import {
  NODE_CLASS_OPTIONS,
  NODE_SUBTYPE_OPTIONS,
  NODE_SCOPE_OPTIONS,
  DEPARTMENT_OPTIONS,
  SYSTEM_TYPE_OPTIONS,
  allowedChildBlueprints,
  buildNodeCodePreview,
  requiresSubtype,
  supportsOptionalSubtype,
  type NodeBlueprint,
} from './resourceNodeConstants';

/* ────────────────── Types ────────────────── */

export type FormMode = 'edit' | 'create-root' | 'create-child';

interface NodeFormValues {
  nodeName: string;
  nodeCode: string;
  nodeClass: ResourceNodeClass;
  nodeSubtype: string;
  parentId: number | null;
  nodeScope: ResourceNodeScope;
  departmentCode: string | null;
  equipmentSystemType: EquipmentSystemType | null;
  equipmentClass: string;
  equipmentModel: string;
  sortOrder: number | undefined;
  isActive: boolean;
  metadataText: string;
}

interface EquipmentEditModalProps {
  open: boolean;
  mode: FormMode;
  editingNode: ResourceNode | null;
  parentNode: ResourceNode | null;
  allNodes: ResourceNode[];
  onCancel: () => void;
  onCreate: (payload: ResourceNodePayload) => Promise<any>;
  onUpdate: (nodeId: number, payload: Partial<ResourceNodePayload>) => Promise<void>;
}

/* ────────────────── Component ────────────────── */

const EquipmentEditModal: React.FC<EquipmentEditModalProps> = ({
  open,
  mode,
  editingNode,
  parentNode,
  allNodes,
  onCancel,
  onCreate,
  onUpdate,
}) => {
  const [draft, setDraft] = useState<NodeFormValues>({
    nodeName: '',
    nodeCode: '',
    nodeClass: 'SITE',
    nodeSubtype: '',
    parentId: null,
    nodeScope: 'GLOBAL',
    departmentCode: null,
    equipmentSystemType: null,
    equipmentClass: '',
    equipmentModel: '',
    sortOrder: undefined,
    isActive: true,
    metadataText: '',
  });
  const [submitting, setSubmitting] = useState(false);

  /* ── Derive child blueprints ── */
  const childBlueprints = useMemo<NodeBlueprint[]>(
    () => (mode === 'create-child' ? allowedChildBlueprints(parentNode) : []),
    [mode, parentNode],
  );

  /* ── Class options filtered by mode ── */
  const classOptions = useMemo(() => {
    if (mode === 'create-root') {
      return NODE_CLASS_OPTIONS.filter((o) => o.value === 'SITE');
    }
    if (mode === 'create-child') {
      const allowed = new Set(childBlueprints.map((b) => b.nodeClass));
      return NODE_CLASS_OPTIONS.filter((o) => allowed.has(o.value));
    }
    return NODE_CLASS_OPTIONS;
  }, [childBlueprints, mode]);

  /* ── Subtype options ── */
  const subtypeOptions = useMemo(() => {
    if (mode === 'create-child') {
      const fromBlueprints = childBlueprints
        .filter((b) => b.nodeClass === draft.nodeClass && b.nodeSubtype)
        .map((b) => ({ label: b.nodeSubtype!, value: b.nodeSubtype! }));
      if (fromBlueprints.length) return fromBlueprints;
    }
    return NODE_SUBTYPE_OPTIONS[draft.nodeClass] ?? [];
  }, [childBlueprints, draft.nodeClass, mode]);

  /* ── Code preview ── */
  const codePreview = useMemo(() => {
    if (mode === 'edit') return draft.nodeCode;
    return buildNodeCodePreview(draft.nodeScope, draft.departmentCode, draft.nodeClass, allNodes);
  }, [allNodes, draft.departmentCode, draft.nodeClass, draft.nodeCode, draft.nodeScope, mode]);

  /* ── Initialize form on open ── */
  useEffect(() => {
    if (!open) return;

    if (mode === 'edit' && editingNode) {
      setDraft({
        nodeName: editingNode.nodeName,
        nodeCode: editingNode.nodeCode,
        nodeClass: editingNode.nodeClass,
        nodeSubtype: editingNode.nodeSubtype ?? '',
        parentId: editingNode.parentId ?? null,
        nodeScope: editingNode.nodeScope,
        departmentCode: editingNode.departmentCode,
        equipmentSystemType: editingNode.equipmentSystemType ?? null,
        equipmentClass: editingNode.equipmentClass ?? '',
        equipmentModel: editingNode.equipmentModel ?? '',
        sortOrder: editingNode.sortOrder,
        isActive: editingNode.isActive,
        metadataText: editingNode.metadata ? JSON.stringify(editingNode.metadata, null, 2) : '',
      });
    } else if (mode === 'create-root') {
      setDraft({
        nodeName: '',
        nodeCode: '',
        nodeClass: 'SITE',
        nodeSubtype: '',
        parentId: null,
        nodeScope: 'GLOBAL',
        departmentCode: null,
        equipmentSystemType: null,
        equipmentClass: '',
        equipmentModel: '',
        sortOrder: undefined,
        isActive: true,
        metadataText: '',
      });
    } else if (mode === 'create-child' && parentNode) {
      const firstBp = childBlueprints[0];
      setDraft({
        nodeName: '',
        nodeCode: '',
        nodeClass: firstBp?.nodeClass ?? 'EQUIPMENT_UNIT',
        nodeSubtype: firstBp?.nodeSubtype ?? '',
        parentId: parentNode.id,
        nodeScope: parentNode.nodeScope,
        departmentCode: parentNode.departmentCode,
        equipmentSystemType: null,
        equipmentClass: '',
        equipmentModel: '',
        sortOrder: undefined,
        isActive: true,
        metadataText: '',
      });
    }
  }, [open, mode, editingNode, parentNode, childBlueprints]);

  /* ── Side effects: auto-fix scope/equipment constraints ── */
  useEffect(() => {
    setDraft((prev) => {
      let next = { ...prev };

      // SITE must be GLOBAL
      if (next.nodeClass === 'SITE' && next.nodeScope !== 'GLOBAL') {
        next.nodeScope = 'GLOBAL';
      }

      // GLOBAL => no department
      if (next.nodeScope === 'GLOBAL' && next.departmentCode !== null) {
        next.departmentCode = null;
      }

      // DEPARTMENT => must have department
      if (next.nodeScope === 'DEPARTMENT' && !next.departmentCode) {
        next.departmentCode = 'USP';
      }

      // Non-EQUIPMENT_UNIT => clear equipment fields
      if (next.nodeClass !== 'EQUIPMENT_UNIT') {
        if (next.equipmentSystemType || next.equipmentClass || next.equipmentModel) {
          next.equipmentSystemType = null;
          next.equipmentClass = '';
          next.equipmentModel = '';
        }
      }

      return next;
    });
  }, [draft.nodeClass, draft.nodeScope]);

  /* ── Update helper ── */
  const updateField = useCallback(<K extends keyof NodeFormValues>(key: K, value: NodeFormValues[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  /* ── Validate & submit ── */
  const handleOk = async () => {
    if (!draft.nodeName.trim()) {
      message.error('请输入节点名称');
      return;
    }
    if (requiresSubtype(draft.nodeClass) && !draft.nodeSubtype.trim()) {
      message.error('当前节点类型要求填写子类型');
      return;
    }
    if (draft.nodeScope === 'DEPARTMENT' && !draft.departmentCode) {
      message.error('部门域范围下必须选择部门');
      return;
    }
    if (
      draft.nodeClass === 'EQUIPMENT_UNIT' &&
      (!draft.equipmentSystemType || (draft.equipmentSystemType !== 'VIRTUAL' && (!draft.equipmentClass.trim() || !draft.equipmentModel.trim())))
    ) {
      message.error(draft.equipmentSystemType ? '非 VIRTUAL 设备必须填写设备类别和设备型号' : '设备必须选择系统类型');
      return;
    }

    let metadata: Record<string, unknown> | null = null;
    if (draft.metadataText?.trim()) {
      try {
        metadata = JSON.parse(draft.metadataText);
      } catch {
        message.error('扩展信息 JSON 格式不正确');
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload: any = {
        nodeName: draft.nodeName.trim(),
        nodeClass: draft.nodeClass,
        nodeSubtype:
          requiresSubtype(draft.nodeClass) || supportsOptionalSubtype(draft.nodeClass)
            ? draft.nodeSubtype.trim().toUpperCase() || null
            : null,
        parentId: draft.parentId ?? null,
        nodeScope: draft.nodeScope,
        departmentCode: draft.nodeScope === 'DEPARTMENT' ? draft.departmentCode : null,
        equipmentSystemType: draft.nodeClass === 'EQUIPMENT_UNIT' ? draft.equipmentSystemType : null,
        equipmentClass: draft.nodeClass === 'EQUIPMENT_UNIT' ? draft.equipmentClass.trim() : null,
        equipmentModel: draft.nodeClass === 'EQUIPMENT_UNIT' ? draft.equipmentModel.trim() : null,
        sortOrder: draft.sortOrder,
        isActive: draft.isActive,
        metadata,
      };

      if (mode === 'edit' && editingNode) {
        payload.nodeCode = draft.nodeCode.trim();
        await onUpdate(editingNode.id, payload);
        message.success('节点已更新');
      } else {
        await onCreate(payload);
        message.success('节点已创建');
      }
      onCancel();
    } catch (err: any) {
      message.error(err?.response?.data?.error || err?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Title ── */
  const title =
    mode === 'edit'
      ? '编辑节点'
      : mode === 'create-root'
        ? '创建根节点'
        : `创建子节点（父：${parentNode?.nodeName ?? '—'}）`;

  return (
    <WxbModal
      open={open}
      title={title}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={submitting}
      okText={mode === 'edit' ? '保存' : '创建'}
      width={600}
      destroyOnClose
    >
      <div className="equip-edit-form">
        {/* 1. 节点名称 */}
        <WxbFormField label="节点名称" required>
          <WxbInput
            value={draft.nodeName}
            onChange={(e) => updateField('nodeName', e.target.value)}
            placeholder="例如：反应釜 BR-201"
          />
        </WxbFormField>

        {/* 2. 节点编码 */}
        <WxbFormField label="节点编码">
          {mode === 'edit' ? (
            <WxbInput
              value={draft.nodeCode}
              onChange={(e) => updateField('nodeCode', e.target.value)}
            />
          ) : (
            <div className="equip-code-preview">
              <WxbTag color="blue">{codePreview}</WxbTag>
              <span className="equip-code-hint">自动生成</span>
            </div>
          )}
        </WxbFormField>

        {/* 3. 节点类型 + 4. 子类型 */}
        <div className="equip-edit-form-row">
          <WxbFormField label="节点类型" required>
            <WxbSelect
              value={draft.nodeClass}
              onChange={(v) => updateField('nodeClass', v as ResourceNodeClass)}
              options={classOptions.map((o) => ({ label: o.label, value: o.value }))}
              disabled={mode === 'edit'}
            />
          </WxbFormField>

          {(requiresSubtype(draft.nodeClass) || supportsOptionalSubtype(draft.nodeClass)) && (
            <WxbFormField label="节点子类型" required={requiresSubtype(draft.nodeClass)}>
              <WxbSelect
                value={draft.nodeSubtype || undefined}
                onChange={(v) => updateField('nodeSubtype', v ?? '')}
                options={subtypeOptions}
                placeholder="选择子类型"
                allowClear={supportsOptionalSubtype(draft.nodeClass)}
              />
            </WxbFormField>
          )}
        </div>

        {/* 5. 所属范围 + 6. 部门 */}
        <div className="equip-edit-form-row">
          <WxbFormField label="节点域" required>
            <WxbSelect
              value={draft.nodeScope}
              onChange={(v) => updateField('nodeScope', v as ResourceNodeScope)}
              options={NODE_SCOPE_OPTIONS}
              disabled={draft.nodeClass === 'SITE'}
            />
          </WxbFormField>

          {draft.nodeScope === 'DEPARTMENT' && (
            <WxbFormField label="所属部门" required>
              <WxbSelect
                value={draft.departmentCode ?? undefined}
                onChange={(v) => updateField('departmentCode', v ?? null)}
                options={DEPARTMENT_OPTIONS}
                placeholder="选择部门"
              />
            </WxbFormField>
          )}
        </div>

        {/* 7-9. 设备专属字段 (仅 EQUIPMENT_UNIT) */}
        {draft.nodeClass === 'EQUIPMENT_UNIT' && (
          <>
            <WxbAlert variant="warning" className="equip-alert-compact">
              {draft.equipmentSystemType === 'VIRTUAL'
                ? 'VIRTUAL 设备仅需选择系统类型，类别和型号可选填'
                : '设备必须填写系统类型、设备类别和设备型号'}
            </WxbAlert>

            <div className="equip-edit-form-row">
              <WxbFormField label="系统类型" required>
                <WxbSelect
                  value={draft.equipmentSystemType ?? undefined}
                  onChange={(v) => updateField('equipmentSystemType', (v as EquipmentSystemType) ?? null)}
                  options={SYSTEM_TYPE_OPTIONS}
                  placeholder="SUS / SS / VIRTUAL"
                />
              </WxbFormField>

              <WxbFormField label="设备类别" required={draft.equipmentSystemType !== 'VIRTUAL'}>
                <WxbInput
                  value={draft.equipmentClass}
                  onChange={(e) => updateField('equipmentClass', e.target.value)}
                  placeholder="例如：REACTOR"
                />
              </WxbFormField>
            </div>

            <WxbFormField label="设备型号" required={draft.equipmentSystemType !== 'VIRTUAL'}>
              <WxbInput
                value={draft.equipmentModel}
                onChange={(e) => updateField('equipmentModel', e.target.value)}
                placeholder="例如：BR-201-A"
              />
            </WxbFormField>
          </>
        )}

        {/* 10. 排序 + 11. 激活 */}
        <div className="equip-edit-form-row">
          <WxbFormField label="排序权重">
            <WxbInputNumber
              value={draft.sortOrder}
              onChange={(v) => updateField('sortOrder', typeof v === 'number' ? v : undefined)}
              min={0}
              placeholder="0"
            />
          </WxbFormField>

          <WxbFormField label="激活状态">
            <WxbSwitch
              checked={draft.isActive}
              onChange={(v) => updateField('isActive', v)}
            />
          </WxbFormField>
        </div>

        {/* 12. Metadata */}
        <WxbFormField label="扩展信息 (JSON)" helpText="可选。用于存储自定义属性、布局提示等">
          <WxbTextarea
            value={draft.metadataText}
            onChange={(e) => updateField('metadataText', e.target.value)}
            placeholder='{"key": "value"}'
            rows={4}
          />
        </WxbFormField>
      </div>
    </WxbModal>
  );
};

export default EquipmentEditModal;

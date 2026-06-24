import React, { useEffect, useMemo, useState } from 'react';
import { WxbModal, WxbTreeSelect, WxbTag } from '../wxb-ui';
import type { ResourceNode } from '../ProcessTemplateV2/types';
import { buildBindingTree, flattenNodes } from './QuickCreateOperationModal';
import './QuickCreateOperationModal.css';

/**
 * 并占 (co-occupancy) 设备多选弹窗 —— 供工艺模版编辑器的「右键绑定设备」与「批量绑定」复用,
 * 让这两个入口也能给操作配多台并用设备(1 主设备 + N 并用),而不只是单台。
 * 与「编辑操作」弹窗用同一套设备树(buildBindingTree)、同一套星标主设备清单与样式(qcom-multibind-*),
 * 保证措辞/交互一致。返回 (primaryNodeId, candidateNodeIds);primary=null 即解除该操作全部绑定。
 */
export interface DeviceCoUseBindModalProps {
  open: boolean;
  title: string;
  /** 可选副标题(如批量时说明会作用于几个操作)。 */
  subtitle?: string;
  /** 资源节点树(厂区→产线→房间→设备),与编辑弹窗同源 resourceTree。 */
  resourceNodes: ResourceNode[];
  /** 预填:当前主设备(单操作编辑时传入;批量时一般为 null)。 */
  initialPrimaryId?: number | null;
  /** 预填:当前并用设备(不含主设备)。 */
  initialCandidateIds?: number[];
  confirmText?: string;
  confirmLoading?: boolean;
  onCancel: () => void;
  onConfirm: (primaryNodeId: number | null, candidateNodeIds: number[]) => void | Promise<void>;
}

const DeviceCoUseBindModal: React.FC<DeviceCoUseBindModalProps> = ({
  open,
  title,
  subtitle,
  resourceNodes,
  initialPrimaryId = null,
  initialCandidateIds = [],
  confirmText = '保存',
  confirmLoading = false,
  onCancel,
  onConfirm,
}) => {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [primaryId, setPrimaryId] = useState<number | null>(null);

  // Re-seed state every time the modal opens (or its prefill target changes), so reopening
  // for a different operation / selection starts from that operation's current bindings.
  const initialKey = `${initialPrimaryId ?? ''}:${(initialCandidateIds ?? []).join(',')}`;
  useEffect(() => {
    if (!open) return;
    const primary = initialPrimaryId ?? null;
    const candidates = (initialCandidateIds ?? []).filter((id) => id !== primary);
    const ordered = primary != null ? [primary, ...candidates] : candidates;
    setSelectedIds(ordered);
    setPrimaryId(primary != null ? primary : ordered.length > 0 ? ordered[0] : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialKey]);

  const { treeData, expandedKeys } = useMemo(() => buildBindingTree(resourceNodes), [resourceNodes]);

  const labelById = useMemo(() => {
    const map = new Map<number, string>();
    for (const node of flattenNodes(resourceNodes)) {
      const extra =
        node.nodeClass === 'EQUIPMENT_UNIT'
          ? [node.equipmentSystemType, node.equipmentClass].filter(Boolean).join(' · ')
          : '';
      map.set(Number(node.id), extra ? `${node.nodeName}（${extra}）` : node.nodeName);
    }
    return map;
  }, [resourceNodes]);

  // grp-* group nodes are non-checkable strings; Number() → NaN, so they never enter the set.
  const handleChange = (value: Array<number | string>) => {
    const nextIds = (value ?? [])
      .map((v) => Number(v))
      .filter((v) => Number.isInteger(v) && v > 0);
    setSelectedIds(nextIds);
    setPrimaryId((prev) => (prev != null && nextIds.includes(prev) ? prev : nextIds.length > 0 ? nextIds[0] : null));
  };

  const handleConfirm = () => {
    const candidateIds = selectedIds.filter((id) => id !== primaryId);
    void onConfirm(primaryId, candidateIds);
  };

  return (
    <WxbModal
      open={open}
      title={title}
      okText={confirmText}
      cancelText="取消"
      confirmLoading={confirmLoading}
      onOk={handleConfirm}
      onCancel={onCancel}
      width={520}
      destroyOnClose
    >
      <div className="qcom-multibind">
        {subtitle ? <p className="qcom-multibind-hint">{subtitle}</p> : null}
        <WxbTreeSelect
          label="设备绑定（并用 · 全部必需）"
          treeData={treeData}
          value={selectedIds}
          treeCheckable
          showSearch
          allowClear
          treeNodeFilterProp="title"
          treeDefaultExpandedKeys={expandedKeys}
          popupMatchSelectWidth={false}
          popupClassName="qcom-bind-popup"
          listHeight={360}
          maxTagCount={0}
          maxTagPlaceholder={(omitted) => `已选 ${omitted.length} 台并用（见下方清单）`}
          placeholder="按 厂区 / 产线 / 房间 逐层展开，勾选本操作并用的设备"
          onChange={(value) => handleChange((value as Array<number | string>) ?? [])}
        />
        <p className="qcom-multibind-hint">
          所选设备都将被操作<strong>同时占用</strong>；主设备为锚点（默认显示/排序），其余为并用设备。
        </p>
        {selectedIds.length > 0 ? (
          <ul className="qcom-multibind-list">
            {selectedIds.map((nodeId) => {
              const isPrimary = primaryId === nodeId;
              return (
                <li key={nodeId} className="qcom-multibind-item">
                  <button
                    type="button"
                    className={`qcom-multibind-star ${isPrimary ? 'is-primary' : ''}`}
                    aria-pressed={isPrimary}
                    title={isPrimary ? '主设备（锚点）' : '设为主设备'}
                    onClick={() => setPrimaryId(nodeId)}
                  >
                    <svg width={14} height={14} viewBox="0 0 14 14" aria-hidden="true">
                      <path
                        d="M7 1.2l1.76 3.57 3.94.57-2.85 2.78.67 3.92L7 10.78 3.48 12.06l.67-3.92L1.3 5.34l3.94-.57L7 1.2z"
                        fill={isPrimary ? 'currentColor' : 'none'}
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <span className="qcom-multibind-name">{labelById.get(nodeId) ?? `设备 #${nodeId}`}</span>
                  {isPrimary ? <WxbTag color="green">主设备</WxbTag> : <WxbTag color="blue">并用</WxbTag>}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="qcom-multibind-empty">未选择设备（保存 = 解除该操作的全部设备绑定）</p>
        )}
      </div>
    </WxbModal>
  );
};

export default DeviceCoUseBindModal;

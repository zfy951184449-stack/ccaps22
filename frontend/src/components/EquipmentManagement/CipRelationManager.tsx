/**
 * CIP 清洗关系管理器
 * 仅在节点为 UTILITY_STATION + CIP 时渲染
 */
import React, { useCallback, useEffect, useState } from 'react';
import { message } from 'antd';
import { WxbButton, WxbSelect, WxbSpinner, WxbEmpty } from '../wxb-ui';
import { processTemplateV2Api } from '../../services';
import type { ResourceNode } from '../ProcessTemplateV2/types';

interface CipRelationManagerProps {
  node: ResourceNode;
  allNodes: ResourceNode[];
}

const CipRelationManager: React.FC<CipRelationManagerProps> = ({ node, allNodes }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [targetIds, setTargetIds] = useState<number[]>([]);
  const [candidates, setCandidates] = useState<ResourceNode[]>([]);

  const loadTargets = useCallback(async () => {
    if (node.nodeClass !== 'UTILITY_STATION' || node.nodeSubtype !== 'CIP') return;
    try {
      setLoading(true);
      const response = await processTemplateV2Api.getResourceNodeCleanableTargets(node.id);
      setTargetIds(response.targets.map((t: any) => t.targetNodeId));
      setCandidates(response.candidateTargets);
    } catch (err: any) {
      message.error(err?.response?.data?.error || '加载 CIP 可清洗对象失败');
      setTargetIds([]);
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }, [node.id, node.nodeClass, node.nodeSubtype]);

  useEffect(() => {
    void loadTargets();
  }, [loadTargets]);

  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      await processTemplateV2Api.updateResourceNodeCleanableTargets(node.id, {
        targetNodeIds: targetIds,
      });
      message.success('CIP 可清洗对象已更新');
      await loadTargets();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '更新 CIP 可清洗对象失败');
    } finally {
      setSaving(false);
    }
  }, [loadTargets, node.id, targetIds]);

  if (node.nodeClass !== 'UTILITY_STATION' || node.nodeSubtype !== 'CIP') {
    return (
      <WxbEmpty description="仅 CIP 类型工作站可管理清洗关系" />
    );
  }

  if (loading) {
    return (
      <div className="cip-manager-loading">
        <WxbSpinner />
        <span>加载 CIP 清洗目标...</span>
      </div>
    );
  }

  const candidateOptions = candidates.map((c) => ({
    label: `${c.nodeName} (${c.nodeCode})`,
    value: c.id,
  }));

  return (
    <div className="cip-manager">
      <div className="cip-manager-header">
        <span className="cip-manager-title">可清洗设备目标</span>
        <span className="cip-manager-count">{targetIds.length} 个目标</span>
      </div>

      <div className="cip-manager-body">
        <WxbSelect
          mode="multiple"
          value={targetIds.map(String)}
          onChange={(vals: string[]) => setTargetIds(vals.map(Number))}
          options={candidateOptions.map((o) => ({ ...o, value: String(o.value) }))}
          placeholder="选择可清洗的 SS 设备..."
          style={{ width: '100%' }}
        />
      </div>

      <div className="cip-manager-footer">
        <WxbButton
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? '保存中...' : '保存清洗关系'}
        </WxbButton>
      </div>
    </div>
  );
};

export default CipRelationManager;

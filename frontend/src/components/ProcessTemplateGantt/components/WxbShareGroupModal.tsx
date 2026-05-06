/**
 * WxbShareGroupModal — 共享组创建/编辑弹窗
 *
 * Wxb 设计体系版本（使用 WxbModal + WxbInput + WxbButton + WxbSearchInput）
 *
 * 核心改进：
 * - 预填充已选成员（从多选快建时跳过左栏选择）
 * - 使用 wxb-ui 标准组件（白色主题）
 * - 按阶段分组的双栏选择
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { WxbModal } from '../../wxb-ui/Modal/WxbModal';
import { WxbInput } from '../../wxb-ui/Input/Input';
import { WxbButton } from '../../wxb-ui/Button/Button';
import { WxbSearchInput } from '../../wxb-ui/SearchInput/SearchInput';
import type { ShareGroup } from '../types';
import type { ShareMode } from '../useShareGroupService';

interface WxbShareGroupModalProps {
  visible: boolean;
  templateId: number;
  group: ShareGroup | null; // null = create, non-null = edit
  operations: Array<{
    scheduleId: number;
    operationName: string;
    stageName: string;
    requiredPeople: number;
  }>;
  preSelectedIds: number[];
  onCancel: () => void;
  onSubmit: (name: string, mode: ShareMode, memberIds: number[]) => Promise<void>;
}

// ===== Mode Card Component =====
const ModeCard: React.FC<{
  mode: ShareMode;
  selected: boolean;
  onClick: () => void;
}> = ({ mode, selected, onClick }) => {
  const isSame = mode === 'SAME_TEAM';
  const color = isSame ? 'var(--wx-blue-600, #1F6FEB)' : 'var(--wx-warning, #E8B53C)';
  const bgActive = isSame ? 'var(--wx-blue-50, #E8F4FD)' : '#FFF8E6';

  return (
    <div
      onClick={onClick}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        border: `1.5px solid ${selected ? color : 'var(--wx-border, #E4EAF1)'}`,
        borderRadius: 8,
        cursor: 'pointer',
        background: selected ? bgActive : 'var(--wx-surface-0, #FFFFFF)',
        transition: 'all 0.25s ease',
      }}
    >
      <div style={{ fontSize: 22, color: selected ? color : 'var(--wx-fg-3, #5A6B7E)' }}>
        {isSame
          ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
          : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 16l-4-4 4-4"/><path d="M17 8l4 4-4 4"/><line x1="3" y1="12" x2="21" y2="12"/></svg>}
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--wx-ink, #0F1B2D)' }}>
          {isSame ? '同组执行' : '不同人员'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--wx-fg-3, #5A6B7E)', marginTop: 2 }}>
          {isSame ? '组内操作由同一批人员完成' : '组内操作必须由不同人员完成'}
        </div>
      </div>
      {selected && (
        <div style={{ marginLeft: 'auto', color, fontSize: 14, fontWeight: 700 }}>✔</div>
      )}
    </div>
  );
};

// ===== Main Component =====
const WxbShareGroupModal: React.FC<WxbShareGroupModalProps> = ({
  visible,
  templateId,
  group,
  operations,
  preSelectedIds,
  onCancel,
  onSubmit,
}) => {
  const isEditMode = !!group;

  // State
  const [groupName, setGroupName] = useState('');
  const [shareMode, setShareMode] = useState<ShareMode>('SAME_TEAM');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [showLeftPanel, setShowLeftPanel] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Initialize on open
  useEffect(() => {
    if (!visible) return;

    if (group) {
      // Edit mode
      setGroupName(group.group_name);
      setShareMode(group.share_mode);
      setSelectedIds(group.members?.map((m) => m.schedule_id) || []);
      setShowLeftPanel(true);
    } else {
      // Create mode
      setShareMode('SAME_TEAM');
      setSelectedIds(preSelectedIds);
      setSearchKeyword('');

      // Auto-generate name
      if (preSelectedIds.length > 0) {
        const firstOp = operations.find((op) => op.scheduleId === preSelectedIds[0]);
        setGroupName(firstOp ? `${firstOp.operationName}-共享组` : '新建共享组');
        setShowLeftPanel(false); // Hide left panel when pre-selected
      } else {
        setGroupName('新建共享组');
        setShowLeftPanel(true);
      }
    }
  }, [visible, group, preSelectedIds, operations]);

  // Grouped operations for left panel (excluding already selected)
  const groupedOperations = useMemo(() => {
    const groups: Record<string, typeof operations> = {};

    for (const op of operations) {
      if (selectedIds.includes(op.scheduleId)) continue;
      if (
        searchKeyword &&
        !op.operationName.toLowerCase().includes(searchKeyword.toLowerCase())
      ) {
        continue;
      }

      if (!groups[op.stageName]) {
        groups[op.stageName] = [];
      }
      groups[op.stageName].push(op);
    }

    return groups;
  }, [operations, selectedIds, searchKeyword]);

  // Selected operations details
  const selectedOperations = useMemo(() => {
    return selectedIds
      .map((id) => operations.find((op) => op.scheduleId === id))
      .filter(Boolean) as typeof operations;
  }, [selectedIds, operations]);

  // Handlers
  const handleAdd = useCallback((id: number) => {
    setSelectedIds((prev) => [...prev, id]);
  }, []);

  const handleRemove = useCallback((id: number) => {
    setSelectedIds((prev) => prev.filter((sid) => sid !== id));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!groupName.trim()) return;
    if (selectedIds.length < 2) return;

    setSubmitting(true);
    try {
      await onSubmit(groupName.trim(), shareMode, selectedIds);
    } finally {
      setSubmitting(false);
    }
  }, [groupName, shareMode, selectedIds, onSubmit]);

  const canSubmit = selectedIds.length >= 2 && groupName.trim().length > 0;

  return (
    <WxbModal
      open={visible}
      title={isEditMode ? '编辑共享组' : '创建共享组'}
      onCancel={onCancel}
      onOk={handleSubmit}
      okText={submitting ? '提交中...' : isEditMode ? '更新共享组' : '创建共享组'}
      cancelText="取消"
      confirmLoading={submitting}
      width={showLeftPanel ? 780 : 520}
      destroyOnClose
      centered
      maskClosable={false}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--wx-fg-3, #5A6B7E)' }}>
            {selectedIds.length < 2
              ? '至少需要选择 2 个操作'
              : `已选 ${selectedIds.length} 个操作`}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <WxbButton variant="ghost" onClick={onCancel}>
              取消
            </WxbButton>
            <WxbButton
              variant="primary"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
            >
              {submitting ? '提交中...' : isEditMode ? '更新共享组' : '创建共享组'}
            </WxbButton>
          </div>
        </div>
      }
    >
      {/* Group Name */}
      <div style={{ marginBottom: 16 }}>
        <WxbInput
          label="共享组名称"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          maxLength={50}
          placeholder="例如：接种-培养连续作业"
          error={!groupName.trim() ? '请输入共享组名称' : false}
        />
      </div>

      {/* Share Mode Cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <ModeCard
          mode="SAME_TEAM"
          selected={shareMode === 'SAME_TEAM'}
          onClick={() => setShareMode('SAME_TEAM')}
        />
        <ModeCard
          mode="DIFFERENT"
          selected={shareMode === 'DIFFERENT'}
          onClick={() => setShareMode('DIFFERENT')}
        />
      </div>

      {/* Separator */}
      <div
        style={{
          height: 1,
          background: 'var(--wx-border, #E4EAF1)',
          margin: '0 0 16px 0',
        }}
      />

      {/* Dual-column / Single-column selector */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          height: showLeftPanel ? 320 : 'auto',
        }}
      >
        {/* Left Panel: Available operations */}
        {showLeftPanel && (
          <div
            style={{
              flex: 1,
              border: '1px solid var(--wx-border, #E4EAF1)',
              borderRadius: 8,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '8px 12px',
                borderBottom: '1px solid var(--wx-border, #E4EAF1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span
                style={{ fontSize: 12, fontWeight: 600, color: 'var(--wx-fg-3, #5A6B7E)' }}
              >
                待选操作
              </span>
              <WxbSearchInput
                value={searchKeyword}
                onChange={(v) => setSearchKeyword(v)}
                placeholder="搜索..."
                style={{ width: 120 }}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
              {Object.keys(groupedOperations).length === 0 ? (
                <div
                  style={{
                    padding: 24,
                    textAlign: 'center',
                    color: 'var(--wx-fg-3, #5A6B7E)',
                    fontSize: 12,
                  }}
                >
                  无待选操作
                </div>
              ) : (
                Object.entries(groupedOperations).map(([stageName, ops]) => (
                  <div key={stageName} style={{ marginBottom: 8 }}>
                    <div
                      style={{
                        background: 'var(--wx-surface-1, #F7F9FB)',
                        padding: '3px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        color: 'var(--wx-fg-3, #5A6B7E)',
                        fontWeight: 600,
                        marginBottom: 2,
                      }}
                    >
                      {stageName}
                    </div>
                    {ops.map((op) => (
                      <div
                        key={op.scheduleId}
                        onClick={() => handleAdd(op.scheduleId)}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '6px 8px',
                          borderBottom: '1px solid var(--wx-border-subtle, #F0F3F7)',
                          cursor: 'pointer',
                          borderRadius: 4,
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.background =
                            'var(--wx-blue-50, #E8F4FD)';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.background =
                            'transparent';
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 500,
                              color: 'var(--wx-ink, #0F1B2D)',
                            }}
                          >
                            {op.operationName}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--wx-fg-3, #5A6B7E)' }}>
                            {op.requiredPeople} 人
                          </div>
                        </div>
                        <span
                          style={{
                            fontSize: 14,
                            color: 'var(--wx-blue-600, #1F6FEB)',
                            cursor: 'pointer',
                          }}
                        >
                          +
                        </span>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Right Panel: Selected members */}
        <div
          style={{
            flex: 1,
            border: '1px solid var(--wx-border, #E4EAF1)',
            borderRadius: 8,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '8px 12px',
              borderBottom: '1px solid var(--wx-border, #E4EAF1)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span
              style={{ fontSize: 12, fontWeight: 600, color: 'var(--wx-fg-3, #5A6B7E)' }}
            >
              已选成员{' '}
              <span
                style={{
                  display: 'inline-block',
                  background: 'var(--wx-blue-50, #E8F4FD)',
                  color: 'var(--wx-blue-600, #1F6FEB)',
                  borderRadius: 10,
                  padding: '0 7px',
                  fontSize: 11,
                  fontWeight: 700,
                  marginLeft: 4,
                }}
              >
                {selectedIds.length}
              </span>
            </span>
            {selectedIds.length > 0 && (
              <span
                onClick={() => setSelectedIds([])}
                style={{
                  fontSize: 11,
                  color: 'var(--wx-danger, #D6493A)',
                  cursor: 'pointer',
                }}
              >
                清空
              </span>
            )}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
            {selectedOperations.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  textAlign: 'center',
                  color: 'var(--wx-fg-3, #5A6B7E)',
                  fontSize: 12,
                }}
              >
                {showLeftPanel
                  ? '请从左侧选择操作'
                  : '暂无选中成员'}
              </div>
            ) : (
              selectedOperations.map((op, index) => (
                <div
                  key={op.scheduleId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '6px 8px',
                    background: '#F0FFF4',
                    border: '1px solid #C6F6D5',
                    borderRadius: 6,
                    marginBottom: 6,
                  }}
                >
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      background: '#C6F6D5',
                      color: '#38A169',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 700,
                      marginRight: 8,
                      flexShrink: 0,
                    }}
                  >
                    {index + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: 'var(--wx-ink, #0F1B2D)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {op.operationName}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--wx-fg-3, #5A6B7E)' }}>
                      {op.stageName} · {op.requiredPeople} 人
                    </div>
                  </div>
                  <span
                    onClick={() => handleRemove(op.scheduleId)}
                    style={{
                      cursor: 'pointer',
                      color: 'var(--wx-danger, #D6493A)',
                      fontSize: 14,
                      padding: '0 4px',
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Toggle "add more" button when left panel is hidden */}
          {!showLeftPanel && (
            <div
              style={{
                padding: '6px 12px',
                borderTop: '1px solid var(--wx-border, #E4EAF1)',
              }}
            >
              <WxbButton
                variant="ghost"
                size="sm"
                onClick={() => setShowLeftPanel(true)}
                style={{
                  width: '100%',
                  border: '1px dashed var(--wx-border, #E4EAF1)',
                }}
              >
                + 添加更多成员
              </WxbButton>
            </div>
          )}
        </div>
      </div>
    </WxbModal>
  );
};

export default WxbShareGroupModal;

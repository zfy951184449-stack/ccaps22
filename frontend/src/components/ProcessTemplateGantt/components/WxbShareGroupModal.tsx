/**
 * WxbShareGroupModal — 共享组创建/编辑弹窗
 *
 * Wxb 设计体系版本（替代旧版 Antd ShareGroupModal）
 *
 * 核心改进：
 * - 预填充已选成员（从多选快建时跳过左栏选择）
 * - 原生 HTML + CSS Variables
 * - 入场/退场动画
 * - 按阶段分组的双栏选择
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  const color = isSame ? '#1890ff' : '#faad14';

  return (
    <div
      onClick={onClick}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        border: `1.5px solid ${selected ? color : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 8,
        cursor: 'pointer',
        background: selected
          ? `${color}15`
          : 'rgba(255,255,255,0.02)',
        transition: 'all 0.25s ease',
      }}
    >
      <div style={{ fontSize: 22, color: selected ? color : '#8898A8' }}>
        {isSame ? '👥' : '↔️'}
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 13, color: '#E2E8F0' }}>
          {isSame ? '同组执行' : '不同人员'}
        </div>
        <div style={{ fontSize: 11, color: '#8898A8', marginTop: 2 }}>
          {isSame ? '组内操作由同一批人员完成' : '组内操作必须由不同人员完成'}
        </div>
      </div>
      {selected && (
        <div style={{ marginLeft: 'auto', color, fontSize: 14 }}>✓</div>
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

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        animation: 'wxb-modal-bg-in 0.2s ease',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        style={{
          width: showLeftPanel ? 780 : 520,
          maxHeight: '85vh',
          background: '#1A2332',
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'wxb-modal-in 0.25s ease',
          transition: 'width 0.3s ease',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 600, color: '#E2E8F0' }}>
            {isEditMode ? '编辑共享组' : '创建共享组'}
          </span>
          <span
            onClick={onCancel}
            style={{
              cursor: 'pointer',
              color: '#8898A8',
              fontSize: 18,
              lineHeight: 1,
              padding: '2px 6px',
              borderRadius: 4,
            }}
          >
            ×
          </span>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', flex: 1, overflowY: 'auto' }}>
          {/* Group Name */}
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                color: '#8898A8',
                marginBottom: 6,
                fontWeight: 500,
              }}
            >
              共享组名称 *
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              maxLength={50}
              placeholder="例如：接种-培养连续作业"
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 6,
                color: '#E2E8F0',
                fontSize: 13,
                outline: 'none',
                boxSizing: 'border-box',
              }}
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
              background: 'rgba(255,255,255,0.06)',
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
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{ fontSize: 12, fontWeight: 600, color: '#8898A8' }}
                  >
                    待选操作
                  </span>
                  <input
                    type="text"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    placeholder="搜索..."
                    style={{
                      width: 100,
                      padding: '3px 8px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 4,
                      color: '#CBD5E0',
                      fontSize: 11,
                      outline: 'none',
                    }}
                  />
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
                  {Object.keys(groupedOperations).length === 0 ? (
                    <div
                      style={{
                        padding: 24,
                        textAlign: 'center',
                        color: '#5A6B7E',
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
                            background: 'rgba(255,255,255,0.04)',
                            padding: '3px 8px',
                            borderRadius: 4,
                            fontSize: 11,
                            color: '#6B7FA0',
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
                              borderBottom: '1px solid rgba(255,255,255,0.03)',
                              cursor: 'pointer',
                              borderRadius: 4,
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLElement).style.background =
                                'rgba(24,144,255,0.08)';
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
                                  color: '#CBD5E0',
                                }}
                              >
                                {op.operationName}
                              </div>
                              <div style={{ fontSize: 10, color: '#5A6B7E' }}>
                                {op.requiredPeople} 人
                              </div>
                            </div>
                            <span
                              style={{
                                fontSize: 14,
                                color: '#4A90D9',
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
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '8px 12px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{ fontSize: 12, fontWeight: 600, color: '#8898A8' }}
                >
                  已选成员{' '}
                  <span
                    style={{
                      display: 'inline-block',
                      background: 'rgba(24,144,255,0.2)',
                      color: '#5ba8f5',
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
                      color: '#e25555',
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
                      color: '#5A6B7E',
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
                        background: 'rgba(82,196,26,0.06)',
                        border: '1px solid rgba(82,196,26,0.15)',
                        borderRadius: 6,
                        marginBottom: 6,
                        animation: 'wxb-fade-in 0.2s ease',
                      }}
                    >
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: '50%',
                          background: 'rgba(82,196,26,0.15)',
                          color: '#52c41a',
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
                            color: '#CBD5E0',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {op.operationName}
                        </div>
                        <div style={{ fontSize: 10, color: '#5A6B7E' }}>
                          {op.stageName} · {op.requiredPeople} 人
                        </div>
                      </div>
                      <span
                        onClick={() => handleRemove(op.scheduleId)}
                        style={{
                          cursor: 'pointer',
                          color: '#e25555',
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
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <button
                    onClick={() => setShowLeftPanel(true)}
                    style={{
                      width: '100%',
                      padding: '5px 0',
                      background: 'transparent',
                      border: '1px dashed rgba(255,255,255,0.12)',
                      borderRadius: 6,
                      color: '#5ba8f5',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    + 添加更多成员
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 11, color: '#5A6B7E' }}>
            {selectedIds.length < 2
              ? '⚠ 至少需要选择 2 个操作'
              : `✓ 已选 ${selectedIds.length} 个操作`}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onCancel}
              style={{
                padding: '6px 16px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6,
                color: '#8898A8',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={
                selectedIds.length < 2 || !groupName.trim() || submitting
              }
              style={{
                padding: '6px 20px',
                background:
                  selectedIds.length >= 2 && groupName.trim()
                    ? 'linear-gradient(135deg, #1890ff, #096dd9)'
                    : 'rgba(255,255,255,0.05)',
                border: 'none',
                borderRadius: 6,
                color:
                  selectedIds.length >= 2 && groupName.trim()
                    ? '#fff'
                    : '#5A6B7E',
                fontSize: 12,
                fontWeight: 600,
                cursor:
                  selectedIds.length >= 2 && groupName.trim()
                    ? 'pointer'
                    : 'not-allowed',
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting
                ? '提交中...'
                : isEditMode
                ? '更新共享组'
                : '创建共享组'}
            </button>
          </div>
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes wxb-modal-bg-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes wxb-modal-in {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes wxb-fade-in {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
};

export default WxbShareGroupModal;

/**
 * V3EditorHeader — 编辑器顶栏
 *
 * 使用 WxbCard + WxbButton + WxbTag 组件。
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { WxbButton, WxbCard, WxbTag } from '../wxb-ui';
import { WxbSwitch } from '../wxb-ui';

export interface V3EditorHeaderProps {
  templateCode: string;
  templateName: string;
  teamName: string | null;
  totalDays: number;
  loading?: boolean;
  showTimeWindows: boolean;
  onToggleTimeWindows: (checked: boolean) => void;
  onAutoSchedule: () => void;
}

const V3EditorHeader: React.FC<V3EditorHeaderProps> = ({
  templateCode,
  templateName,
  teamName,
  totalDays,
  loading,
  showTimeWindows,
  onToggleTimeWindows,
  onAutoSchedule,
}) => {
  const navigate = useNavigate();

  return (
    <WxbCard
      noPadding
      style={{
        borderRadius: '8px 8px 0 0',
        borderBottom: '1px solid var(--wx-border, #E4EAF1)',
        zIndex: 10,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '10px 20px',
          minHeight: 48,
        }}
      >
        {/* Back button */}
        <WxbButton
          variant="ghost"
          size="sm"
          onClick={() => navigate('/process-templates-v3')}
          style={{ flexShrink: 0 }}
        >
          ← 返回
        </WxbButton>

        {/* Separator */}
        <div
          style={{
            width: 1,
            height: 24,
            background: 'var(--wx-border, #E4EAF1)',
            flexShrink: 0,
          }}
        />

        {/* Template info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          <WxbTag color="blue">{templateCode}</WxbTag>
          <span
            style={{
              fontWeight: 600,
              fontSize: 15,
              color: 'var(--wx-ink, #0F1B2D)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {templateName}
          </span>
          {teamName && (
            <span style={{ fontSize: 12, color: 'var(--wx-fg-3, #5A6B7E)', flexShrink: 0 }}>
              {teamName}
            </span>
          )}
          <WxbTag color="neutral">周期 {totalDays} 天</WxbTag>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
          {/* Time window toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--wx-fg-3, #5A6B7E)', whiteSpace: 'nowrap' }}>
              时间窗口
            </span>
            <WxbSwitch
              checked={showTimeWindows}
              onChange={onToggleTimeWindows}
              size="sm"
            />
          </div>

          {/* Separator */}
          <div
            style={{
              width: 1,
              height: 20,
              background: 'var(--wx-border, #E4EAF1)',
              flexShrink: 0,
            }}
          />

          <WxbButton
            variant="secondary"
            size="sm"
            onClick={onAutoSchedule}
            disabled={loading}
          >
            {loading ? '排程中...' : '自动排程'}
          </WxbButton>
        </div>
      </div>
    </WxbCard>
  );
};

export default V3EditorHeader;

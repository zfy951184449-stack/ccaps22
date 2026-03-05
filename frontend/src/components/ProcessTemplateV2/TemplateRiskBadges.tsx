import React from 'react';
import { Tag, Tooltip } from 'antd';
import { AlertOutlined, LinkOutlined, NodeIndexOutlined } from '@ant-design/icons';
import { TemplateSummary } from './types';

export type TemplateRiskFocus = 'unbound' | 'conflict' | 'invalid';

interface TemplateRiskBadgesProps {
  template: TemplateSummary;
  onFocus: (focus: TemplateRiskFocus) => void;
  compact?: boolean;
}

const getRiskCount = (value?: number) => (value && value > 0 ? value : 0);

const TemplateRiskBadges: React.FC<TemplateRiskBadgesProps> = ({ template, onFocus, compact = false }) => {
  const unboundCount = getRiskCount(template.unbound_count);
  const conflictCount = getRiskCount(template.constraint_conflict_count);
  const invalidCount = getRiskCount(template.invalid_binding_count);

  const hasRisk = unboundCount > 0 || conflictCount > 0 || invalidCount > 0;

  if (!hasRisk) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Tag color="success" style={{ marginInlineEnd: 0 }}>
          质量正常
        </Tag>
        {!compact ? <span>当前模板未检测到落位与约束风险</span> : null}
      </div>
    );
  }

  const badgeClass =
    'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {unboundCount > 0 ? (
        <Tooltip title="跳转到编辑页并聚焦未落位工序">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onFocus('unbound');
            }}
            className={`${badgeClass} border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:bg-amber-100`}
          >
            <AlertOutlined />
            未绑定 {unboundCount}
          </button>
        </Tooltip>
      ) : null}

      {conflictCount > 0 ? (
        <Tooltip title="跳转到编辑页并聚焦约束冲突">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onFocus('conflict');
            }}
            className={`${badgeClass} border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100`}
          >
            <LinkOutlined />
            约束冲突 {conflictCount}
          </button>
        </Tooltip>
      ) : null}

      {invalidCount > 0 ? (
        <Tooltip title="跳转到编辑页并聚焦绑定异常">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onFocus('invalid');
            }}
            className={`${badgeClass} border-orange-200 bg-orange-50 text-orange-700 hover:border-orange-300 hover:bg-orange-100`}
          >
            <NodeIndexOutlined />
            绑定异常 {invalidCount}
          </button>
        </Tooltip>
      ) : null}
    </div>
  );
};

export default TemplateRiskBadges;

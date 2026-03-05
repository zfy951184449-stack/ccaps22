import React from 'react';
import { AlertOutlined, CheckCircleOutlined, LinkOutlined, NodeIndexOutlined } from '@ant-design/icons';
import { Button, Tag } from 'antd';

export type EditorFocusFilter = 'all' | 'unbound' | 'conflict' | 'invalid';

interface TemplateEditorDiagnosticBarProps {
  nodeCount: number;
  operationCount: number;
  unplacedCount: number;
  conflictCount: number;
  invalidCount: number;
  activeFocus: EditorFocusFilter;
  validating?: boolean;
  onFocusChange: (focus: EditorFocusFilter) => void;
  onValidate: () => void;
  onOpenNodes: () => void;
}

const cardClass = 'rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm';

const TemplateEditorDiagnosticBar: React.FC<TemplateEditorDiagnosticBarProps> = ({
  nodeCount,
  operationCount,
  unplacedCount,
  conflictCount,
  invalidCount,
  activeFocus,
  validating,
  onFocusChange,
  onValidate,
  onOpenNodes,
}) => {
  return (
    <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-sky-50 px-5 py-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <div className={cardClass}>
            <div className="text-xs uppercase tracking-wide text-slate-400">节点</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">{nodeCount}</div>
          </div>
          <div className={cardClass}>
            <div className="text-xs uppercase tracking-wide text-slate-400">工序</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">{operationCount}</div>
          </div>
          <div className={cardClass}>
            <div className="text-xs uppercase tracking-wide text-slate-400">未绑定</div>
            <div className="mt-1 text-xl font-semibold text-amber-700">{unplacedCount}</div>
          </div>
          <div className={cardClass}>
            <div className="text-xs uppercase tracking-wide text-slate-400">约束冲突</div>
            <div className="mt-1 text-xl font-semibold text-rose-700">{conflictCount}</div>
          </div>
          <div className={cardClass}>
            <div className="text-xs uppercase tracking-wide text-slate-400">绑定异常</div>
            <div className="mt-1 text-xl font-semibold text-orange-700">{invalidCount}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type={activeFocus === 'unbound' ? 'primary' : 'default'}
            icon={<AlertOutlined />}
            onClick={() => onFocusChange('unbound')}
          >
            仅看未绑定
          </Button>
          <Button
            type={activeFocus === 'conflict' ? 'primary' : 'default'}
            icon={<LinkOutlined />}
            onClick={() => onFocusChange('conflict')}
          >
            仅看冲突
          </Button>
          <Button
            type={activeFocus === 'invalid' ? 'primary' : 'default'}
            icon={<NodeIndexOutlined />}
            onClick={() => onFocusChange('invalid')}
          >
            仅看绑定异常
          </Button>
          <Button onClick={() => onFocusChange('all')}>恢复全部</Button>
          <Button icon={<CheckCircleOutlined />} loading={validating} onClick={onValidate}>
            自动排程校验
          </Button>
          <Button onClick={onOpenNodes}>节点管理</Button>
        </div>
      </div>

      {activeFocus !== 'all' ? (
        <div className="mt-3">
          <Tag color="blue" style={{ marginInlineEnd: 0 }}>
            当前过滤：
            {activeFocus === 'unbound'
              ? '未绑定'
              : activeFocus === 'conflict'
                ? '约束冲突'
                : '绑定异常'}
          </Tag>
        </div>
      ) : null}
    </section>
  );
};

export default TemplateEditorDiagnosticBar;

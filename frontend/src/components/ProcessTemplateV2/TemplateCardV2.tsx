import React from 'react';
import { ApartmentOutlined, CalendarOutlined, CopyOutlined } from '@ant-design/icons';
import { Button, Radio, Space } from 'antd';
import TemplateRiskBadges, { TemplateRiskFocus } from './TemplateRiskBadges';
import { TemplateSummary } from './types';

interface TemplateCardV2Props {
  template: TemplateSummary;
  density: 'card' | 'compact';
  selected: boolean;
  onSelect: (template: TemplateSummary) => void;
  onContinue: (template: TemplateSummary) => void;
  onCopy: (template: TemplateSummary, event?: React.MouseEvent) => void;
  onFocus: (template: TemplateSummary, focus: TemplateRiskFocus) => void;
}

const formatTemplateDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '未知';
  }
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

const TemplateCardV2: React.FC<TemplateCardV2Props> = ({
  template,
  density,
  selected,
  onSelect,
  onContinue,
  onCopy,
  onFocus,
}) => {
  const stageCount = Number(template.stage_count ?? 0);

  if (density === 'compact') {
    return (
      <article
        role="button"
        tabIndex={0}
        onClick={() => onContinue(template)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onContinue(template);
          }
        }}
        className="group rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-colors hover:border-sky-300"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Radio
                checked={selected}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => {
                  event.stopPropagation();
                  onSelect(template);
                }}
              />
              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-sky-700">
                {template.template_code}
              </span>
              <span className="text-xs text-slate-500">{template.team_name || '未分配单元'}</span>
              <span className="text-xs text-slate-400">周期 {template.total_days} 天</span>
              {stageCount > 0 ? <span className="text-xs text-slate-400">阶段 {stageCount}</span> : null}
            </div>
            <h3 className="mt-1 truncate text-base font-semibold text-slate-900">{template.template_name}</h3>
            <div className="mt-2">
              <TemplateRiskBadges
                template={template}
                compact
                onFocus={(focus) => onFocus(template, focus)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="primary"
              onClick={(event) => {
                event.stopPropagation();
                onContinue(template);
              }}
            >
              继续编辑
            </Button>
            <Button
              icon={<CopyOutlined />}
              onClick={(event) => onCopy(template, event)}
            >
              复制
            </Button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onContinue(template)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onContinue(template);
        }
      }}
      className="group rounded-3xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Space size={8}>
            <Radio
              checked={selected}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => {
                event.stopPropagation();
                onSelect(template);
              }}
            />
            <div className="inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-sky-700">
              {template.template_code}
            </div>
          </Space>
          <h3 className="mt-3 truncate text-lg font-semibold text-slate-900 transition-colors group-hover:text-sky-700">
            {template.template_name}
          </h3>
        </div>
        <div className="shrink-0 rounded-2xl bg-slate-900 px-3 py-2 text-right text-white">
          <div className="text-[10px] uppercase tracking-wide text-slate-300">周期</div>
          <div className="text-sm font-semibold">{template.total_days} 天</div>
        </div>
      </div>

      <p className="mt-3 min-h-[44px] line-clamp-2 text-sm leading-6 text-slate-500">
        {template.description || '暂无工艺描述'}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-500">
        <div className="rounded-2xl bg-slate-50 px-3 py-2">
          <div className="flex items-center gap-2">
            <ApartmentOutlined className="text-slate-400" />
            <span>{template.team_name || '未分配单元'}</span>
          </div>
        </div>
        <div className="rounded-2xl bg-slate-50 px-3 py-2">
          <div className="flex items-center gap-2">
            <CalendarOutlined className="text-slate-400" />
            <span>更新于 {formatTemplateDate(template.updated_at)}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/70 px-3 py-3">
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">质量徽标</div>
        <TemplateRiskBadges template={template} onFocus={(focus) => onFocus(template, focus)} />
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
        <span className="font-medium text-slate-600">进入统一编辑器</span>
        <Space size="small">
          <Button
            type="primary"
            onClick={(event) => {
              event.stopPropagation();
              onContinue(template);
            }}
          >
            继续编辑
          </Button>
          <Button
            icon={<CopyOutlined />}
            onClick={(event) => onCopy(template, event)}
          >
            复制
          </Button>
        </Space>
      </div>
    </article>
  );
};

export default TemplateCardV2;

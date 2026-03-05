import React, { useMemo } from 'react';
import { InputNumber, Segmented, Select } from 'antd';
import { OperationCoreDraft, ResourceNode, TemplateStageSummary } from './types';

export type OperationCoreValidationResult = {
  errors: string[];
  warnings: string[];
};

type ValidateOperationCoreDraftParams = {
  draft: OperationCoreDraft;
  stageStartDay?: number;
  requireStage?: boolean;
  warnUnbound?: boolean;
  bindingWarning?: string | null;
};

type OperationCoreFormProps = {
  value: OperationCoreDraft;
  stages: TemplateStageSummary[];
  leafNodes: ResourceNode[];
  durationHours?: number;
  onChange: (patch: Partial<OperationCoreDraft>) => void;
  showWindowMode?: boolean;
  timingExtra?: React.ReactNode;
};

const HALF_HOUR_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const value = index * 0.5;
  return {
    value,
    label: `${String(Math.floor(value)).padStart(2, '0')}:${value % 1 === 0 ? '00' : '30'}`,
  };
});

const toAbsoluteHour = (
  stageStartDay: number,
  operationDay: number,
  dayOffset: number,
  timeValue: number,
) => (stageStartDay + operationDay + dayOffset) * 24 + timeValue;

export const formatHourLabel = (value: number) => {
  const totalMinutes = Math.round(Number(value ?? 0) * 60);
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

export const validateOperationCoreDraft = ({
  draft,
  stageStartDay = 0,
  requireStage = true,
  warnUnbound = true,
  bindingWarning,
}: ValidateOperationCoreDraftParams): OperationCoreValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (requireStage && !draft.stageId) {
    errors.push('必须选择所属阶段');
  }

  const absoluteWindowStart = toAbsoluteHour(
    stageStartDay,
    Number(draft.operationDay ?? 0),
    Number(draft.windowStartDayOffset ?? 0),
    Number(draft.windowStartTime ?? 0),
  );
  const absoluteWindowEnd = toAbsoluteHour(
    stageStartDay,
    Number(draft.operationDay ?? 0),
    Number(draft.windowEndDayOffset ?? 0),
    Number(draft.windowEndTime ?? 0),
  );

  if (absoluteWindowStart > absoluteWindowEnd) {
    errors.push('时间窗开始不能晚于时间窗结束');
  }

  if (warnUnbound && !draft.resourceNodeId) {
    warnings.push('当前工序未绑定默认资源节点');
  }

  if (bindingWarning) {
    warnings.push(bindingWarning);
  }

  return { errors, warnings };
};

const OperationCoreForm: React.FC<OperationCoreFormProps> = ({
  value,
  stages,
  leafNodes,
  durationHours = 2,
  onChange,
  showWindowMode = true,
  timingExtra,
}) => {
  const stageOptions = useMemo(
    () =>
      stages.map((stage) => ({
        value: stage.id,
        label: `${stage.stage_name} / Day ${stage.start_day}`,
      })),
    [stages],
  );

  const nodeOptions = useMemo(
    () =>
      leafNodes.map((node) => ({
        value: node.id,
        label: `${node.nodeName} / ${node.boundResourceCode ?? '未挂资源'}`,
      })),
    [leafNodes],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">所属阶段</label>
          <Select
            value={value.stageId ?? undefined}
            onChange={(next) => onChange({ stageId: next ?? null })}
            options={stageOptions}
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">默认资源节点</label>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            value={value.resourceNodeId ?? undefined}
            onChange={(next) => onChange({ resourceNodeId: next ?? null })}
            options={nodeOptions}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Day</label>
          <InputNumber
            min={0}
            value={value.operationDay}
            onChange={(next) => onChange({ operationDay: Number(next ?? 0) })}
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">推荐开始时间</label>
          <Select
            options={HALF_HOUR_OPTIONS}
            value={Number(value.recommendedTime ?? 0)}
            onChange={(next) => onChange({ recommendedTime: Number(next ?? 0) })}
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">推荐偏移</label>
          <InputNumber
            min={-7}
            max={7}
            value={value.recommendedDayOffset}
            onChange={(next) => onChange({ recommendedDayOffset: Number(next ?? 0) })}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {timingExtra}

      {showWindowMode ? (
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-slate-700">时间窗</div>
          <Segmented
            options={[
              { label: '自动时间窗', value: 'auto' },
              { label: '手动时间窗', value: 'manual' },
            ]}
            value={value.windowMode}
            onChange={(next) => onChange({ windowMode: next as OperationCoreDraft['windowMode'] })}
          />
        </div>
      ) : null}

      {value.windowMode === 'manual' ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="mb-3 text-sm font-semibold text-slate-700">时间窗开始</div>
            <div className="grid gap-3 md:grid-cols-2">
              <Select
                options={HALF_HOUR_OPTIONS}
                value={Number(value.windowStartTime ?? 0)}
                onChange={(next) => onChange({ windowStartTime: Number(next ?? 0) })}
                style={{ width: '100%' }}
              />
              <InputNumber
                min={-7}
                max={7}
                value={value.windowStartDayOffset}
                onChange={(next) => onChange({ windowStartDayOffset: Number(next ?? 0) })}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="mb-3 text-sm font-semibold text-slate-700">时间窗结束</div>
            <div className="grid gap-3 md:grid-cols-2">
              <Select
                options={HALF_HOUR_OPTIONS}
                value={Number(value.windowEndTime ?? 0)}
                onChange={(next) => onChange({ windowEndTime: Number(next ?? 0) })}
                style={{ width: '100%' }}
              />
              <InputNumber
                min={-7}
                max={7}
                value={value.windowEndDayOffset}
                onChange={(next) => onChange({ windowEndDayOffset: Number(next ?? 0) })}
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          自动时间窗：最早开始 {formatHourLabel(value.windowStartTime)} / 偏移 {value.windowStartDayOffset}，最晚开始{' '}
          {formatHourLabel(value.windowEndTime)} / 偏移 {value.windowEndDayOffset}。预计时长 {Math.max(Number(durationHours ?? 2), 1)}h。
        </div>
      )}
    </div>
  );
};

export default OperationCoreForm;

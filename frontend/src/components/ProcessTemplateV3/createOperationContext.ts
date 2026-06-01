import type { TemplateStageSummary } from '../ProcessTemplateV2/types';

export function parseStageIdFromGroupId(groupId?: string | null): number | null {
  if (!groupId) return null;
  const match = groupId.match(/stage_(\d+)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function toLocalHourValue(value: number): number {
  const remainder = value % 24;
  return remainder < 0 ? remainder + 24 : remainder;
}

export function buildCreateTimingContext(stage: TemplateStageSummary | null, absoluteStartHour: number) {
  const stageStartDay = Number(stage?.start_day ?? 0);
  const absoluteDay = Math.floor(absoluteStartHour / 24);
  const operationDay = Math.max(0, absoluteDay - stageStartDay);

  return {
    operationDay,
    recommendedTime: toLocalHourValue(absoluteStartHour),
    recommendedDayOffset: absoluteDay - stageStartDay - operationDay,
  };
}

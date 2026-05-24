import type { UpdateStageOperationPayload } from '../ProcessTemplateV2/types';

const toHourValue = (value: number) => {
  const remainder = value % 24;
  return remainder < 0 ? remainder + 24 : remainder;
};

export function buildDraggedOperationTimingUpdate(
  newStart: number,
  newEnd: number,
  stageStartDay: number,
): UpdateStageOperationPayload {
  const newAbsoluteDay = Math.floor(newStart / 24);
  const newRecommendedTime = toHourValue(newStart);
  const newOperationDay = newAbsoluteDay - stageStartDay;

  const duration = newEnd - newStart;
  const windowPadding = 2; // hours of padding around operation
  const windowStartAbsolute = newStart - windowPadding;
  const windowEndAbsolute = newStart + Math.max(duration, windowPadding);
  const windowStartDay = Math.floor(windowStartAbsolute / 24);
  const windowEndDay = Math.floor(windowEndAbsolute / 24);

  return {
    operationDay: newOperationDay,
    recommendedTime: newRecommendedTime,
    recommendedDayOffset: 0,
    windowStartTime: toHourValue(windowStartAbsolute),
    windowStartDayOffset: windowStartDay - stageStartDay - newOperationDay,
    windowEndTime: toHourValue(windowEndAbsolute),
    windowEndDayOffset: windowEndDay - stageStartDay - newOperationDay,
  };
}

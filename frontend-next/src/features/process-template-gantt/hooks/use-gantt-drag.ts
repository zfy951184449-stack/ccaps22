/* ── useGanttDrag ─────────────────────────────────────────────────
 *
 * Operation bar + time window horizontal drag.
 * Pointer-event based, silent local update during drag, API persist on end.
 */

"use client";

import { useCallback, useRef } from "react";

interface UseGanttDragOptions {
  hourWidth: number;
  startDay: number;
  endDay: number;
  onDragEnd: (
    scheduleId: number,
    stageId: number,
    updates: Partial<{
      operationDay: number;
      recommendedTime: number;
      windowStartTime: number;
      windowStartDayOffset: number;
      windowEndTime: number;
      windowEndDayOffset: number;
    }>,
  ) => Promise<void>;
  onNodeUpdate: (
    nodeId: string,
    updates: {
      operationDay?: number;
      recommendedTime?: number;
      windowStartTime?: number;
      windowStartDayOffset?: number;
      windowEndTime?: number;
      windowEndDayOffset?: number;
    },
  ) => void;
}

export function useGanttDrag({
  hourWidth,
  startDay,
  onDragEnd,
  onNodeUpdate,
}: UseGanttDragOptions) {
  const isDragging = useRef(false);

  const handleDragStart = useCallback(
    (
      e: React.PointerEvent,
      nodeId: string,
      blockType: "operation" | "window-start" | "window-end",
      originalStartHour: number,
      originalDurationHours: number,
      scheduleId: number,
      stageId: number,
    ) => {
      e.preventDefault();
      e.stopPropagation();

      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      isDragging.current = true;

      const startX = e.clientX;
      let currentOffset = 0;

      const handleMove = (me: PointerEvent) => {
        if (!isDragging.current) return;
        const dx = me.clientX - startX;
        currentOffset = dx;

        // Visual feedback via transform (no state update during drag)
        if (blockType === "operation") {
          target.style.transform = `translateX(${dx}px)`;
        }
      };

      const handleUp = async () => {
        isDragging.current = false;
        target.releasePointerCapture(e.pointerId);
        target.style.transform = "";

        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);

        if (Math.abs(currentOffset) < 4) return;

        const hourDelta = currentOffset / hourWidth;
        const newStartHour = originalStartHour + hourDelta;

        if (blockType === "operation") {
          const newDay = Math.floor(newStartHour / 24) - startDay;
          const newTime = newStartHour - Math.floor(newStartHour / 24) * 24;
          const snappedTime = Math.round(newTime * 2) / 2;

          const updates = {
            operationDay: Math.max(0, newDay),
            recommendedTime: Math.max(0, Math.min(23.5, snappedTime)),
          };

          onNodeUpdate(nodeId, {
            operationDay: updates.operationDay,
            recommendedTime: updates.recommendedTime,
          });

          try {
            await onDragEnd(scheduleId, stageId, updates);
          } catch {
            // Revert will happen via re-fetch
          }
        }
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [hourWidth, startDay, onDragEnd, onNodeUpdate],
  );

  return { handleDragStart, isDragging };
}

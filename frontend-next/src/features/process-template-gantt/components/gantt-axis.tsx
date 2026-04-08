/* ── GanttAxis ────────────────────────────────────────────────────
 *
 * Time axis header: day labels, hour marks, personnel peaks.
 */

"use client";

import React from "react";

interface DailyPeak {
  day: number;
  peakCount: number;
}

interface GanttAxisProps {
  startDay: number;
  endDay: number;
  hourWidth: number;
  baseDate?: string;
  expandedDay: number | null;
  originalStartDay: number;
  originalEndDay: number;
  onDayDoubleClick: (day: number) => void;
  onCollapseDay: () => void;
  onPrevDay: () => void;
  onNextDay: () => void;
  dailyPeaks: DailyPeak[];
}

function formatDayLabel(day: number, baseDate?: string): string {
  if (baseDate) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + day);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
  return `D${day}`;
}

export function GanttAxis({
  startDay,
  endDay,
  hourWidth,
  baseDate,
  expandedDay,
  originalStartDay,
  originalEndDay,
  onDayDoubleClick,
  onCollapseDay,
  onPrevDay,
  onNextDay,
  dailyPeaks,
}: GanttAxisProps) {
  const days: number[] = [];
  for (let d = startDay; d <= endDay; d++) days.push(d);

  const dayWidth = 24 * hourWidth;
  const isExpanded = expandedDay !== null;

  return (
    <div className="relative flex h-full select-none" style={{ width: days.length * dayWidth }}>
      {/* Expanded mode navigation */}
      {isExpanded && (
        <div className="absolute left-2 top-0 z-10 flex h-full items-center gap-1">
          <button
            onClick={onPrevDay}
            disabled={expandedDay <= originalStartDay}
            className="rounded bg-[var(--pl-surface-elevated)] px-1.5 py-0.5 text-xs text-[var(--pl-text-secondary)] shadow-sm transition-colors hover:bg-[var(--pl-canvas)] disabled:opacity-30"
          >
            ◀
          </button>
          <button
            onClick={onCollapseDay}
            className="rounded bg-[var(--pl-accent-soft)] px-2 py-0.5 text-xs font-medium text-[var(--pl-accent)] transition-colors hover:bg-[var(--pl-accent)] hover:text-white"
          >
            收起
          </button>
          <button
            onClick={onNextDay}
            disabled={expandedDay >= originalEndDay}
            className="rounded bg-[var(--pl-surface-elevated)] px-1.5 py-0.5 text-xs text-[var(--pl-text-secondary)] shadow-sm transition-colors hover:bg-[var(--pl-canvas)] disabled:opacity-30"
          >
            ▶
          </button>
        </div>
      )}

      {days.map((day) => {
        const peak = dailyPeaks.find((p) => p.day === day);
        const maxPeak = Math.max(...dailyPeaks.map((p) => p.peakCount), 1);
        const heatIntensity = peak ? peak.peakCount / maxPeak : 0;

        return (
          <div
            key={day}
            className="relative flex-shrink-0 border-r border-[var(--pl-border)]"
            style={{ width: dayWidth }}
            onDoubleClick={() => onDayDoubleClick(day)}
          >
            {/* Day label row */}
            <div className="flex h-1/2 items-center justify-between px-2">
              <span className="text-xs font-medium text-[var(--pl-text-primary)]">
                {formatDayLabel(day, baseDate)}
              </span>
              {peak && peak.peakCount > 0 && (
                <span
                  className="rounded px-1 text-[10px] font-medium"
                  style={{
                    backgroundColor: `rgba(37, 99, 235, ${0.1 + heatIntensity * 0.3})`,
                    color:
                      heatIntensity > 0.6
                        ? "rgb(30, 64, 175)"
                        : "var(--pl-text-tertiary)",
                  }}
                >
                  {peak.peakCount}人
                </span>
              )}
            </div>

            {/* Hour marks row */}
            <div className="flex h-1/2 items-end">
              {hourWidth >= 3 &&
                Array.from({ length: 24 }, (_, h) => (
                  <div
                    key={h}
                    className="flex-shrink-0 border-r border-[var(--pl-border)] opacity-30"
                    style={{ width: hourWidth }}
                  >
                    {hourWidth >= 8 && h % 6 === 0 && (
                      <span className="block text-center text-[9px] text-[var(--pl-text-tertiary)]">
                        {h}
                      </span>
                    )}
                  </div>
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

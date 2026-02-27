import { useMemo } from 'react';
import dayjs from 'dayjs';
import { GanttBatch, GanttShareGroup } from '../types';

export interface DailyPeak {
    dayKey: string;     // YYYY-MM-DD
    peak: number;       // Peak personnel count
    peakHour: number;   // Hour of peak (0-23)
    color: string;      // Heatmap color
}

// Helper: Union-Find for Share Groups
class UnionFind {
    parent: Map<number, number>;

    constructor() {
        this.parent = new Map();
    }

    find(i: number): number {
        if (!this.parent.has(i)) {
            this.parent.set(i, i);
        }
        if (this.parent.get(i) !== i) {
            this.parent.set(i, this.find(this.parent.get(i)!));
        }
        return this.parent.get(i)!;
    }

    union(i: number, j: number) {
        const rootI = this.find(i);
        const rootJ = this.find(j);
        if (rootI !== rootJ) {
            this.parent.set(rootI, rootJ);
        }
    }
}

// Helper: Get Heatmap Color
const getHeatColor = (peak: number, minPeak: number, maxPeak: number): string => {
    if (peak === 0) return 'transparent';
    if (maxPeak === minPeak) return '#DCFCE7'; // Green-100 (Single non-zero value)

    const ratio = (peak - minPeak) / (maxPeak - minPeak);

    if (ratio < 0.25) return '#DCFCE7';   // Green-100
    if (ratio < 0.50) return '#FEF9C3';   // Yellow-100
    if (ratio < 0.75) return '#FFEDD5';   // Orange-100
    return '#FEE2E2';                     // Red-100
};

export const usePeakPersonnelV4 = (
    batches: GanttBatch[],
    shareGroups: GanttShareGroup[],
    startDate: dayjs.Dayjs,
    endDate: dayjs.Dayjs
) => {
    return useMemo(() => {
        const dailyPeaks = new Map<string, DailyPeak>();
        const uf = new UnionFind();

        // 1. Build Union-Find for SAME_TEAM share groups
        shareGroups.forEach(group => {
            if (group.share_mode === 'SAME_TEAM' && group.member_operation_ids.length > 1) {
                const firstOpId = group.member_operation_ids[0];
                for (let i = 1; i < group.member_operation_ids.length; i++) {
                    uf.union(firstOpId, group.member_operation_ids[i]);
                }
            }
        });

        // 2. Collect all operations with time windows
        interface FlattenedOp {
            id: number;
            requiredPeople: number;
            start: dayjs.Dayjs;
            end: dayjs.Dayjs;
            rootId: number;
        }

        const allOps: FlattenedOp[] = [];
        batches.forEach(batch => {
            batch.stages.forEach(stage => {
                stage.operations.forEach(op => {
                    const start = dayjs(op.startDate);
                    const end = dayjs(op.endDate);
                    // Filter out operations outside the view range (optimization)
                    // Expanded range: check if op overlaps with [startDate, endDate]
                    if (start.isBefore(endDate.endOf('day')) && end.isAfter(startDate.startOf('day'))) {
                        allOps.push({
                            id: op.id,
                            requiredPeople: op.requiredPeople,
                            start,
                            end,
                            rootId: uf.find(op.id)
                        });
                    }
                });
            });
        });

        if (allOps.length === 0) return dailyPeaks;

        // 3. Sweep line / Sampling per day
        // Since operations are discrete and we want 15min granularity, sampling is robust.
        const totalDays = endDate.diff(startDate, 'day') + 1;

        for (let i = 0; i < totalDays; i++) {
            const currentDay = startDate.add(i, 'day');
            const dayKey = currentDay.format('YYYY-MM-DD');

            // Find ops active on this day
            const dayStart = currentDay.startOf('day');
            const dayEnd = currentDay.endOf('day');

            const activeOps = allOps.filter(op =>
                op.start.isBefore(dayEnd) && op.end.isAfter(dayStart)
            );

            if (activeOps.length === 0) {
                dailyPeaks.set(dayKey, { dayKey, peak: 0, peakHour: 0, color: 'transparent' });
                continue;
            }

            let maxPeople = 0;
            let peakHour = 0;

            // Sample every 15 minutes (0.25 hour)
            for (let hour = 0; hour < 24; hour += 0.25) {
                const sampleTime = dayStart.add(hour, 'hour'); // auto-handles minutes if hour is float

                // Find ops active at this sample time
                const concurrentOps = activeOps.filter(op =>
                    (op.start.isBefore(sampleTime) || op.start.isSame(sampleTime)) &&
                    op.end.isAfter(sampleTime)
                );

                if (concurrentOps.length === 0) continue;

                // Calculate max considering share groups
                // Map<rootId, max_required_people>
                const groupMaxMap = new Map<number, number>();

                concurrentOps.forEach(op => {
                    const currentMax = groupMaxMap.get(op.rootId) || 0;
                    groupMaxMap.set(op.rootId, Math.max(currentMax, op.requiredPeople));
                });

                // Sum up the maxes of each group
                let currentTotal = 0;
                groupMaxMap.forEach(val => currentTotal += val);

                if (currentTotal > maxPeople) {
                    maxPeople = currentTotal;
                    peakHour = Math.floor(hour);
                }
            }

            dailyPeaks.set(dayKey, {
                dayKey,
                peak: maxPeople,
                peakHour,
                color: '' // Calculated later
            });
        }

        // 4. Calculate colors
        const peaks = Array.from(dailyPeaks.values()).map(d => d.peak).filter(p => p > 0);
        if (peaks.length > 0) {
            const min = Math.min(...peaks);
            const max = Math.max(...peaks);
            dailyPeaks.forEach(d => {
                d.color = getHeatColor(d.peak, min, max);
            });
        }

        return dailyPeaks;

    }, [batches, shareGroups, startDate, endDate]);
};

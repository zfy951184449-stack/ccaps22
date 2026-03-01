import { useMemo } from 'react';
import dayjs from 'dayjs';
import { GanttBatch, GanttShareGroup } from '../types';

export interface DailyPeak {
    dayKey: string;     // YYYY-MM-DD
    peak: number;       // Peak personnel count
    peakHour: number;   // Hour of peak (0-23)
    color: string;      // Heatmap color
}

interface PersonnelEvent {
    time: number;
    type: 'start' | 'end';
    rootId: number;
    requiredPeople: number;
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
        const viewStart = startDate.startOf('day');
        const viewEndExclusive = endDate.add(1, 'day').startOf('day');

        // 1. Build Union-Find for SAME_TEAM share groups
        shareGroups.forEach(group => {
            if (group.share_mode === 'SAME_TEAM' && group.member_operation_ids.length > 1) {
                const firstOpId = group.member_operation_ids[0];
                for (let i = 1; i < group.member_operation_ids.length; i++) {
                    uf.union(firstOpId, group.member_operation_ids[i]);
                }
            }
        });

        const dayEvents = new Map<string, PersonnelEvent[]>();

        batches.forEach(batch => {
            batch.stages.forEach(stage => {
                stage.operations.forEach(op => {
                    const start = dayjs(op.startDate);
                    const end = dayjs(op.endDate);
                    const overlapStart = start.isAfter(viewStart) ? start : viewStart;
                    const overlapEnd = end.isBefore(viewEndExclusive) ? end : viewEndExclusive;

                    if (!overlapStart.isBefore(overlapEnd)) {
                        return;
                    }

                    const rootId = uf.find(op.id);
                    let dayCursor = overlapStart.startOf('day');

                    while (dayCursor.isBefore(overlapEnd)) {
                        const nextDay = dayCursor.add(1, 'day');
                        const dayKey = dayCursor.format('YYYY-MM-DD');
                        const eventStart = overlapStart.isAfter(dayCursor) ? overlapStart : dayCursor;
                        const eventEnd = overlapEnd.isBefore(nextDay) ? overlapEnd : nextDay;

                        if (eventStart.isBefore(eventEnd)) {
                            const events = dayEvents.get(dayKey) || [];
                            events.push(
                                {
                                    time: eventStart.valueOf(),
                                    type: 'start',
                                    rootId,
                                    requiredPeople: op.requiredPeople,
                                },
                                {
                                    time: eventEnd.valueOf(),
                                    type: 'end',
                                    rootId,
                                    requiredPeople: op.requiredPeople,
                                }
                            );
                            dayEvents.set(dayKey, events);
                        }

                        dayCursor = nextDay;
                    }
                });
            });
        });
        const totalDays = endDate.diff(startDate, 'day') + 1;

        for (let i = 0; i < totalDays; i++) {
            const currentDay = startDate.add(i, 'day');
            const dayKey = currentDay.format('YYYY-MM-DD');
            const events = dayEvents.get(dayKey);

            if (!events || events.length === 0) {
                dailyPeaks.set(dayKey, { dayKey, peak: 0, peakHour: 0, color: 'transparent' });
                continue;
            }

            events.sort((left, right) => {
                if (left.time !== right.time) {
                    return left.time - right.time;
                }

                if (left.type === right.type) {
                    return left.rootId - right.rootId;
                }

                return left.type === 'end' ? -1 : 1;
            });

            const dayStart = currentDay.startOf('day');
            const groupLoads = new Map<number, Map<number, number>>();
            let maxPeople = 0;
            let peakHour = 0;
            let currentTotal = 0;
            let index = 0;

            while (index < events.length) {
                const currentTime = events[index].time;

                while (index < events.length && events[index].time === currentTime) {
                    const event = events[index];
                    const loadCounts = groupLoads.get(event.rootId) || new Map<number, number>();
                    const previousMax = loadCounts.size > 0 ? Math.max(...Array.from(loadCounts.keys())) : 0;

                    if (event.type === 'start') {
                        loadCounts.set(event.requiredPeople, (loadCounts.get(event.requiredPeople) || 0) + 1);
                    } else {
                        const nextCount = (loadCounts.get(event.requiredPeople) || 0) - 1;
                        if (nextCount <= 0) {
                            loadCounts.delete(event.requiredPeople);
                        } else {
                            loadCounts.set(event.requiredPeople, nextCount);
                        }
                    }

                    if (loadCounts.size === 0) {
                        groupLoads.delete(event.rootId);
                    } else {
                        groupLoads.set(event.rootId, loadCounts);
                    }

                    const nextMax = loadCounts.size > 0 ? Math.max(...Array.from(loadCounts.keys())) : 0;
                    currentTotal += nextMax - previousMax;
                    index += 1;
                }

                if (currentTotal > maxPeople) {
                    maxPeople = currentTotal;
                    peakHour = Math.min(23, Math.max(0, dayjs(currentTime).diff(dayStart, 'hour')));
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

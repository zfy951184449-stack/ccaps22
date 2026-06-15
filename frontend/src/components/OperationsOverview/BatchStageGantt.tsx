/**
 * BatchStageGantt
 *
 * 运营总览看板 · 批次执行阶段甘特（只读、小甘特）。
 * - 部门泳道 → 批次行 → 阶段级时间条（聚合工序到阶段，不展开操作）。
 * - 固定 4 周视窗，今日线在画布 1/4 处（前 1/4 过去、后 3/4 未来）。
 * - 仅渲染落在当前视窗内的部门 / 批次 / 阶段，空行不显示，提高信息密度。
 * - 选中某阶段 → 回调其所属批次，驱动下方人员分配联动。
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import { WxbGanttChart } from '../wxb-ui/GanttChart';
import type { GanttTask, GanttGroup } from '../wxb-ui/GanttChart';
import { WxbChartShell, WxbEmpty, WxbOverlay, WxbButton } from '../wxb-ui';
import type { CalendarOperation } from '../../services/calendarService';

const IconGantt = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6h10M4 12h7M4 18h13" />
    </svg>
);

/** 从 CSS 变量取色（甘特为 canvas 渲染，无法直接吃 var()，故运行时解析为色值）。 */
const cssVar = (name: string, fallback: string): string => {
    if (typeof window === 'undefined') return fallback;
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
};

export interface BatchMeta {
    team_id: number | null;
    team_name: string;
    batch_code: string;
    batch_name: string;
}

interface BatchStageGanttProps {
    operations: CalendarOperation[];
    batchMeta: Map<number, BatchMeta>;
    /** 选中月份：当月→今日线在 1/4 的 4 周视窗；非当月→展示整月。 */
    month: Dayjs;
    loading?: boolean;
    selectedBatchId?: number;
    onSelectBatch?: (batchId: number | undefined) => void;
}

const WINDOW_DAYS = 28;          // 固定 4 周
const PAST_FRACTION = 0.25;      // 今日线落在 1/4 处
const SIDEBAR_WIDTH = 180;
const ROW_PX = 32;               // 甘特行高（组件内部为固定常量 ROW_HEIGHT=32）
const CHART_CHROME = 100;        // 内置工具条(40) + 时间轴表头(48) + 缓冲
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 640;

const BatchStageGantt: React.FC<BatchStageGanttProps> = ({
    operations,
    batchMeta,
    month,
    loading = false,
    selectedBatchId,
    onSelectBatch,
}) => {
    // 测量画布宽度，使 4 周恰好铺满视口（callback ref：画布是条件渲染的）。
    const [chartWidth, setChartWidth] = useState(0);
    const roRef = useRef<ResizeObserver | null>(null);
    const setWrap = React.useCallback((el: HTMLDivElement | null) => {
        if (roRef.current) {
            roRef.current.disconnect();
            roRef.current = null;
        }
        if (el) {
            setChartWidth(el.clientWidth);
            const ro = new ResizeObserver((entries) => {
                setChartWidth(entries[0].contentRect.width);
            });
            ro.observe(el);
            roRef.current = ro;
        }
    }, []);
    useEffect(() => () => { roRef.current?.disconnect(); }, []);

    // 月份联动：当月用「今日线在 1/4」的 4 周视窗；其它月展示整月。
    const monthKey = month.format('YYYY-MM');
    const isCurrentMonth = monthKey === dayjs().format('YYYY-MM');

    // 时间轴原点：当月=今天 0 点；其它月=该月 1 号。
    const originDate = useMemo(
        () => (isCurrentMonth ? dayjs().startOf('day') : dayjs(`${monthKey}-01`).startOf('month')),
        [isCurrentMonth, monthKey]
    );
    const todayHour = useMemo(() => dayjs().diff(originDate, 'hour', true), [originDate]);

    const windowDays = isCurrentMonth ? WINDOW_DAYS : dayjs(`${monthKey}-01`).daysInMonth();

    // 可见范围（相对原点的小时）：当月→今日落在 1/4；其它月→整月。
    const { rangeStart, rangeEnd } = useMemo(() => {
        if (isCurrentMonth) {
            const wH = WINDOW_DAYS * 24;
            return { rangeStart: todayHour - wH * PAST_FRACTION, rangeEnd: todayHour + wH * (1 - PAST_FRACTION) };
        }
        return { rangeStart: 0, rangeEnd: windowDays * 24 };
    }, [isCurrentMonth, todayHour, windowDays]);

    // 每日像素宽：让整段视窗恰好铺满画布。
    const dayWidth = chartWidth > 0
        ? Math.max(4, (chartWidth - SIDEBAR_WIDTH) / windowDays)
        : 24;

    const { tasks, groups, isEmpty, rowCount } = useMemo(() => {
        const PAST = cssVar('--wx-fg-4', '#8898A8');
        const CURRENT = cssVar('--wx-blue-600', '#1A5FC7');
        const FUTURE = cssVar('--wx-blue-300', '#9DC3F0');

        const hoursFrom = (dt: string) => dayjs(dt).diff(originDate, 'hour', true);

        // 1) 工序聚合到「批次 + 阶段」：取每个阶段最早开始、最晚结束。
        type StageAgg = { batchId: number; stageName: string; start: number; end: number };
        const stageMap = new Map<string, StageAgg>();
        operations.forEach((op) => {
            if (!op.planned_start_datetime || !op.planned_end_datetime) return;
            const stageKey = op.stage_id != null ? `s${op.stage_id}` : `op${op.operation_plan_id}`;
            const key = `${op.batch_id}::${stageKey}`;
            const s = hoursFrom(op.planned_start_datetime);
            const e = hoursFrom(op.planned_end_datetime);
            const existing = stageMap.get(key);
            if (existing) {
                existing.start = Math.min(existing.start, s);
                existing.end = Math.max(existing.end, e);
            } else {
                stageMap.set(key, { batchId: op.batch_id, stageName: op.stage_name || '未命名阶段', start: s, end: e });
            }
        });

        // 2) 只保留与当前视窗相交的阶段（空批次/空部门不渲染）。
        const visible = Array.from(stageMap.entries()).filter(
            ([, a]) => a.end >= rangeStart && a.start <= rangeEnd
        );
        if (visible.length === 0) {
            return { tasks: [] as GanttTask[], groups: [] as GanttGroup[], isEmpty: true, rowCount: 0 };
        }

        const visibleBatchIds: number[] = [];
        const seenBatch = new Set<number>();
        visible.forEach(([, a]) => {
            if (!seenBatch.has(a.batchId)) {
                seenBatch.add(a.batchId);
                visibleBatchIds.push(a.batchId);
            }
        });

        // 3) 部门泳道（父） + 批次行（子），仅对有可见阶段的批次。
        const deptGroups = new Map<string, GanttGroup>();
        const batchGroups: GanttGroup[] = [];
        visibleBatchIds.forEach((batchId) => {
            const meta = batchMeta.get(batchId);
            const teamId = meta?.team_id ?? null;
            const deptKey = `dept-${teamId ?? 'none'}`;
            if (!deptGroups.has(deptKey)) {
                deptGroups.set(deptKey, { id: deptKey, label: meta?.team_name || '未分配部门' });
            }
            batchGroups.push({
                id: `batch-${batchId}`,
                label: meta?.batch_code || `批次 ${batchId}`,
                parentId: deptKey,
                type: 'batch',
            });
        });

        // 4) 阶段条：按相对今日的位置着色（过去 / 当前 / 未来）。
        const stageTasks: GanttTask[] = visible.map(([key, agg]) => {
            let color = FUTURE;
            if (agg.end < todayHour) color = PAST;
            else if (agg.start <= todayHour && todayHour <= agg.end) color = CURRENT;
            return {
                id: `stage-${key}`,
                label: agg.stageName,
                start: agg.start,
                end: agg.end,
                groupId: `batch-${agg.batchId}`,
                type: 'stage',
                readOnly: true,
                color,
                data: { batchId: agg.batchId },
            };
        });

        return {
            tasks: stageTasks,
            groups: [...Array.from(deptGroups.values()), ...batchGroups],
            isEmpty: false,
            rowCount: deptGroups.size + batchGroups.length + stageTasks.length,
        };
    }, [operations, batchMeta, originDate, todayHour, rangeStart, rangeEnd]);

    // 今日线固定在 1/4：可见范围 = [今天 - 1/4 窗口, 今天 + 3/4 窗口]。
    const timeRange = useMemo(() => ({ start: rangeStart, end: rangeEnd }), [rangeStart, rangeEnd]);

    // 最小高度按可见行数自适应；卡片被拉伸对齐时画布以 100% 填满（见 .ops-gantt-shell CSS）。
    const ganttMinHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, rowCount * ROW_PX + CHART_CHROME));

    const handleTaskClick = (task: GanttTask) => {
        const batchId = Number(task.data?.batchId);
        if (Number.isFinite(batchId)) {
            onSelectBatch?.(selectedBatchId === batchId ? undefined : batchId);
        }
    };

    return (
        <WxbChartShell
            className="ops-gantt-shell"
            icon={<IconGantt />}
            iconColor="blue"
            title="批次执行 · 阶段甘特"
            subtitle={isCurrentMonth
                ? '部门泳道 · 4 周视窗 · 今日线在 1/4 处 · 点阶段查看人员分配'
                : `部门泳道 · ${monthKey} 整月 · 点阶段查看人员分配`}
            actions={
                selectedBatchId !== undefined ? (
                    <WxbButton size="sm" variant="ghost" onClick={() => onSelectBatch?.(undefined)}>
                        清除选择
                    </WxbButton>
                ) : undefined
            }
        >
            <WxbOverlay loading={loading}>
                {isEmpty ? (
                    !loading && <WxbEmpty description="当前视窗内无在产批次" />
                ) : (
                    <div ref={setWrap} style={{ height: '100%', minHeight: ganttMinHeight }}>
                        <WxbGanttChart
                            key={`${monthKey}-${Math.round(chartWidth / 20)}`}
                            tasks={tasks}
                            groups={groups}
                            timelineOriginDate={originDate.format('YYYY-MM-DD')}
                            timeRange={timeRange}
                            timeUnit="day"
                            sidebarWidth={SIDEBAR_WIDTH}
                            initialDayWidth={dayWidth}
                            zoomRange={[4, 600]}
                            readOnly
                            showToday
                            showSelectionPanel={false}
                            onTaskClick={handleTaskClick}
                            style={{ height: '100%' }}
                        />
                    </div>
                )}
            </WxbOverlay>
        </WxbChartShell>
    );
};

export default BatchStageGantt;

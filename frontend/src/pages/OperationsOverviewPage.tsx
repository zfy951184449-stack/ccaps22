/**
 * OperationsOverviewPage —「运营总览」领导看板
 *
 * 面向领导层的只读监控看板（非操作台）。新建独立路由 /operations-overview，
 * 与原「调度中心」并存，确认无误后再下线调度中心。
 *
 * 顶部「月份 + 部门」筛选统一联动全部面板：
 *  - 甘特：当月→今日线 1/4 的 4 周视窗；其它月→整月；按部门过滤批次。
 *  - 当前/即将开始、操作人员分配：按月份与部门过滤。
 *  - 人力供需 / 工时曲线：按月份取数、部门转 orgPath 过滤。
 *
 * 数据仅来自 排班 + 现有批次管理；不涉及新设计的排产系统。
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import { WxbButton, WxbSelect } from '../components/wxb-ui';
import BatchStageGantt, { BatchMeta } from '../components/OperationsOverview/BatchStageGantt';
import CurrentOperationCard from '../components/OperationsOverview/CurrentOperationCard';
import ManpowerCurveCard from '../components/Dashboard/ManpowerCurveCard';
import WorkHoursCurveCard from '../components/Dashboard/WorkHoursCurveCard';
import OperationAssignmentsPanel from '../components/OperationsOverview/OperationAssignmentsPanel';
import { calendarService, CalendarOperation } from '../services/calendarService';
import { batchPlanApi } from '../services/api';
import './OperationsOverviewPage.css';

const IconChevronLeft = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
);
const IconChevronRight = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
);
const IconRefresh = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></svg>
);

const OperationsOverviewPage: React.FC = () => {
    const [selectedMonth, setSelectedMonth] = useState<Dayjs>(dayjs());
    const [selectedDept, setSelectedDept] = useState<number | undefined>(undefined);
    const [selectedBatchId, setSelectedBatchId] = useState<number | undefined>(undefined);
    const [dayOverride, setDayOverride] = useState<Dayjs | null>(null);

    const [operations, setOperations] = useState<CalendarOperation[]>([]);
    const [batchMeta, setBatchMeta] = useState<Map<number, BatchMeta>>(new Map());
    const [loading, setLoading] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [ops, plans] = await Promise.all([
                calendarService.getActiveOperations('ACTIVATED'),
                batchPlanApi.list().catch(() => []),
            ]);
            const metaMap = new Map<number, BatchMeta>();
            (Array.isArray(plans) ? plans : []).forEach((p: any) => {
                const id = Number(p.id ?? p.batch_id);
                if (!Number.isFinite(id)) return;
                metaMap.set(id, {
                    team_id: p.team_id != null ? Number(p.team_id) : null,
                    team_name: p.team_name || '未分配部门',
                    batch_code: p.batch_code || `批次 ${id}`,
                    batch_name: p.batch_name || '',
                });
            });
            setOperations(Array.isArray(ops) ? ops : []);
            setBatchMeta(metaMap);
            setDayOverride(null);
        } catch (err) {
            console.error('加载运营总览数据失败:', err);
            setOperations([]);
            setBatchMeta(new Map());
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData, reloadKey]);

    const monthKey = selectedMonth.format('YYYY-MM');
    const monthLabel = useMemo(() => selectedMonth.format('YYYY 年 M 月'), [selectedMonth]);

    // 切换月份 / 部门时，重置翻页与甘特选中，避免跨范围的陈旧选择。
    useEffect(() => {
        setDayOverride(null);
        setSelectedBatchId(undefined);
    }, [monthKey, selectedDept]);

    // 部门选项（来自当前有批次的团队）。
    const deptOptions = useMemo(() => {
        const map = new Map<number, string>();
        batchMeta.forEach((m) => { if (m.team_id != null) map.set(m.team_id, m.team_name); });
        return Array.from(map.entries())
            .map(([value, label]) => ({ value, label }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [batchMeta]);

    // 部门过滤后的操作（甘特用：跨月，由甘特按月份开窗）。
    const deptOps = useMemo(() => {
        if (selectedDept == null) return operations;
        return operations.filter((o) => batchMeta.get(o.batch_id)?.team_id === selectedDept);
    }, [operations, selectedDept, batchMeta]);

    // 月份 + 部门过滤后的操作（当前/即将开始用）。
    const monthDeptOps = useMemo(
        () => deptOps.filter((o) => dayjs(o.planned_start_datetime).format('YYYY-MM') === monthKey),
        [deptOps, monthKey]
    );

    // 当前部门下的批次 id（操作人员分配按部门过滤用）。
    const deptBatchIds = useMemo(() => {
        if (selectedDept == null) return undefined;
        const ids: number[] = [];
        batchMeta.forEach((m, id) => { if (m.team_id === selectedDept) ids.push(id); });
        return ids;
    }, [batchMeta, selectedDept]);

    // 曲线的部门过滤：转成 orgPath（末位 = unit_id）。
    const curveOrgPath = useMemo(() => (selectedDept != null ? [selectedDept] : []), [selectedDept]);

    // 本月+本部门「有排产的日子」（去重升序），供默认日与翻页用。
    const opDays = useMemo(() => {
        const map = new Map<string, Dayjs>();
        monthDeptOps.forEach((o) => {
            const d = dayjs(o.planned_start_datetime).startOf('day');
            if (d.isValid()) map.set(d.format('YYYY-MM-DD'), d);
        });
        return Array.from(map.values()).sort((a, b) => a.valueOf() - b.valueOf());
    }, [monthDeptOps]);

    // 人员分配默认日期：当月且今天有操作→今天；否则本月第一个有操作的日子。
    const assignmentDate = useMemo(() => {
        const today = dayjs().startOf('day');
        if (monthKey === dayjs().format('YYYY-MM') && opDays.some((d) => d.isSame(today, 'day'))) return today;
        return opDays[0] ?? selectedMonth.startOf('month');
    }, [opDays, monthKey, selectedMonth]);

    const viewDate = dayOverride ?? assignmentDate;

    // ‹ › 按「有排产的日子」翻页（跳过空日子）。
    const stepDay = useCallback((delta: number) => {
        if (opDays.length === 0) {
            setDayOverride((d) => (d ?? selectedMonth.startOf('month')).add(delta, 'day'));
            return;
        }
        const cur = dayOverride ?? assignmentDate;
        let idx = opDays.findIndex((d) => d.isSame(cur, 'day'));
        if (idx === -1) {
            let best = Infinity;
            opDays.forEach((d, i) => {
                const diff = Math.abs(d.valueOf() - cur.valueOf());
                if (diff < best) { best = diff; idx = i; }
            });
        }
        const next = Math.max(0, Math.min(opDays.length - 1, idx + delta));
        setDayOverride(opDays[next]);
    }, [opDays, dayOverride, assignmentDate, selectedMonth]);

    return (
        <div className="ops-overview-page">
            {/* 上下文条：月份 + 部门 统一联动 */}
            <div className="ops-context-bar">
                <div className="ops-context-title">运营总览</div>
                <div className="ops-context-controls">
                    <div className="ops-month-nav">
                        <WxbButton size="sm" variant="ghost" onClick={() => setSelectedMonth((m) => m.subtract(1, 'month'))} aria-label="上个月">
                            <IconChevronLeft />
                        </WxbButton>
                        <span className="ops-month-label">{monthLabel}</span>
                        <WxbButton size="sm" variant="ghost" onClick={() => setSelectedMonth((m) => m.add(1, 'month'))} aria-label="下个月">
                            <IconChevronRight />
                        </WxbButton>
                    </div>
                    <WxbSelect
                        options={deptOptions}
                        value={selectedDept}
                        onChange={(v: any) => setSelectedDept(v ?? undefined)}
                        placeholder="全部部门"
                        allowClear
                        style={{ width: 160 }}
                    />
                    <WxbButton size="sm" variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconRefresh /> 刷新</span>
                    </WxbButton>
                </div>
            </div>

            {/* 批次执行甘特 ｜ 当前正在进行 */}
            <div className="ops-grid-main">
                <BatchStageGantt
                    operations={deptOps}
                    batchMeta={batchMeta}
                    month={selectedMonth}
                    loading={loading}
                    selectedBatchId={selectedBatchId}
                    onSelectBatch={setSelectedBatchId}
                />
                <CurrentOperationCard operations={monthDeptOps} loading={loading} />
            </div>

            {/* 操作人员分配（wxb-ui；月份/部门联动；‹›按天翻页；跟甘特选中走） */}
            <div className="ops-assignments">
                <OperationAssignmentsPanel
                    date={viewDate}
                    selectedBatchId={selectedBatchId}
                    selectedBatchCode={selectedBatchId !== undefined ? batchMeta.get(selectedBatchId)?.batch_code : undefined}
                    allowedBatchIds={deptBatchIds}
                    onStepDay={stepDay}
                    onPickDate={setDayOverride}
                />
            </div>

            {/* 人力供需曲线（缺口阴影） ｜ 工时需求曲线 —— 均隐藏 KPI 数字卡 */}
            <div className="ops-grid-curves">
                <ManpowerCurveCard date={selectedMonth} orgPath={curveOrgPath} showGapShading hideKpis />
                <WorkHoursCurveCard date={selectedMonth} orgPath={curveOrgPath} hideKpis />
            </div>
        </div>
    );
};

export default OperationsOverviewPage;

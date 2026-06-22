import React, { useEffect, useMemo, useState } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import { WxbCard, WxbCascader, WxbSegmented, WxbRangePicker, WxbSpinner, WxbEmpty, WxbButton } from '../../components/wxb-ui';
import { useRosterCalendar } from '../personnel-scheduling/hooks/useRosterCalendar';
import RosterCalendarPage from '../personnel-scheduling';
import {
    collectVacancies, collectOverloads, buildWorklist, selectKpis, selectDayTotals, TriageItem
} from './triageModel';
import CoverageStrip, { TriageFacet } from './components/CoverageStrip';
import CoverageDayStrip from './components/CoverageDayStrip';
import TriageWorklist, { DrawerTab } from './components/TriageWorklist';
import CoverageHeatmap from './components/CoverageHeatmap';
import ActionDrawer from './components/ActionDrawer';
import '../personnel-scheduling/RosterCalendar.css';
import './RosterTriage.css';

type View = 'worklist' | 'heatmap' | 'gantt' | 'calendar';
const mondayIndex = (d: Dayjs): number => (d.day() + 6) % 7;
const MAX_DAYS = 62;

const UsersIcon = () => (
    <svg className="rt-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>
);
const CheckIcon = () => (
    <svg className="rt-healthy-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
);

/**
 * 排班分诊台 —— 把"看日历"改成"清空缺":健康指标 + 每日缺口 + 按严重度排序的工单流,逐行可指派/报增援。
 * 旧的员工日历完整保留在「日历」tab。
 */
const RosterTriagePage: React.FC = () => {
    const { orgOptions, orgLoading, data, dayTypes, loading, fetchCalendar } = useRosterCalendar();

    const [orgPath, setOrgPath] = useState<number[]>([]);
    const today = dayjs();
    const weekStart = today.subtract(mondayIndex(today), 'day');
    const [range, setRange] = useState<[Dayjs, Dayjs]>([weekStart, weekStart.add(6, 'day')]);
    const [view, setView] = useState<View>('worklist');
    const [facet, setFacet] = useState<TriageFacet | null>(null);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [drawer, setDrawer] = useState<{ item: TriageItem | null; tab: DrawerTab; open: boolean }>({ item: null, tab: 'assign', open: false });

    const unitId = orgPath.length ? orgPath[orgPath.length - 1] : null;
    const [start, end] = range;
    const startStr = start.format('YYYY-MM-DD');
    const endStr = end.format('YYYY-MM-DD');

    useEffect(() => { fetchCalendar(startStr, endStr, unitId); }, [startStr, endStr, unitId, fetchCalendar]);

    const days = useMemo(() => {
        const out: Dayjs[] = [];
        let c = start;
        while (!c.isAfter(end, 'day') && out.length < MAX_DAYS) { out.push(c); c = c.add(1, 'day'); }
        return out;
    }, [start, end]);

    const vacancies = useMemo(() => collectVacancies(data), [data]);
    const overloads = useMemo(() => collectOverloads(data), [data]);
    const worklist = useMemo(() => buildWorklist(vacancies, overloads), [vacancies, overloads]);
    const kpis = useMemo(() => selectKpis(data), [data]);
    const dayTotals = useMemo(() => selectDayTotals(vacancies), [vacancies]);

    const facetMatch = (item: TriageItem): boolean => {
        if (!facet) return true;
        if (facet === 'overload') return item.kind === 'OVERLOAD';
        if (facet === 'night') return item.kind === 'VACANCY' && item.isNight;
        return item.kind === 'VACANCY'; // vacancy / idle 都聚焦缺口
    };
    const filtered = worklist.filter((it) => (!selectedDate || it.date === selectedDate) && facetMatch(it));
    const filterActive = !!facet || !!selectedDate;

    const openDrawer = (item: TriageItem, tab: DrawerTab) => setDrawer({ item, tab, open: true });
    const closeDrawer = () => setDrawer((d) => ({ ...d, open: false }));
    const refetch = () => fetchCalendar(startStr, endStr, unitId);

    const renderWorklist = () => {
        if (loading && !data) return <WxbCard><div className="rt-state"><WxbSpinner size={32} tip="正在加载排班数据..." /></div></WxbCard>;
        if (worklist.length === 0) {
            return (
                <WxbCard>
                    <div className="rt-healthy">
                        <CheckIcon />
                        <span className="rt-healthy-badge">已清零</span>
                        <div className="rt-healthy-tip">本范围内暂无岗位空缺与超载,排班健康。如需查看完整班次,切到「日历」。</div>
                    </div>
                </WxbCard>
            );
        }
        return (
            <WxbCard>
                <div className="rt-worklist-head">
                    <span className="rt-worklist-title">排班工单流 · 按严重度排序</span>
                    <span className="rt-worklist-count">
                        {filtered.length} / {worklist.length} 项
                        {filterActive && <WxbButton variant="ghost" size="sm" style={{ marginLeft: 8 }} onClick={() => { setFacet(null); setSelectedDate(null); }}>清除筛选</WxbButton>}
                    </span>
                </div>
                {filtered.length === 0
                    ? <WxbEmpty description="当前筛选下无匹配工单" />
                    : <TriageWorklist items={filtered} onOpen={openDrawer} />}
            </WxbCard>
        );
    };

    const renderBody = () => {
        if (view === 'calendar') return <RosterCalendarPage />;
        if (view === 'gantt') {
            return (
                <WxbCard>
                    <div className="rt-state">
                        <WxbEmpty description="甘特视图即将上线(操作工时→小时轴换算,接入 WxbGanttChart);当前可用工单流 / 热力图 / 日历。" />
                    </div>
                </WxbCard>
            );
        }
        if (view === 'heatmap') {
            return <CoverageHeatmap days={days} vacancies={vacancies} data={data} dayTypes={dayTypes} onPick={(date) => { setSelectedDate(date); setView('worklist'); }} />;
        }
        return (
            <>
                <CoverageStrip kpis={kpis} activeFacet={facet} onFacet={setFacet} />
                <CoverageDayStrip days={days} dayTotals={dayTotals} dayTypes={dayTypes} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
                {renderWorklist()}
            </>
        );
    };

    return (
        <div className="rt-page">
            <WxbCard className="rt-toolbar">
                <div className="rt-toolbar-left">
                    <div className="rt-filter-group">
                        <span className="rt-filter-label"><UsersIcon /> 组织</span>
                        <WxbCascader
                            options={orgOptions as any}
                            value={orgPath}
                            onChange={(value: any) => setOrgPath((value || []) as number[])}
                            placeholder="全部 · 可选部门 / Team / 组"
                            changeOnSelect
                            allowClear
                            loading={orgLoading}
                            style={{ width: 240 }}
                        />
                    </div>
                    <div className="rt-filter-group">
                        <span className="rt-filter-label">期间</span>
                        <WxbRangePicker
                            value={range as any}
                            allowClear={false}
                            onChange={(vals: any) => { if (vals && vals[0] && vals[1]) { setRange([vals[0], vals[1]]); setSelectedDate(null); } }}
                        />
                    </div>
                </div>
                <div className="rt-toolbar-right">
                    <WxbSegmented
                        value={view}
                        onChange={(v) => setView(v as View)}
                        options={[
                            { label: '工单流', value: 'worklist' },
                            { label: '热力图', value: 'heatmap' },
                            { label: '甘特', value: 'gantt' },
                            { label: '日历', value: 'calendar' }
                        ]}
                    />
                </div>
            </WxbCard>

            {renderBody()}

            <ActionDrawer
                open={drawer.open}
                item={drawer.item}
                initialTab={drawer.tab}
                data={data}
                unitId={unitId}
                onClose={closeDrawer}
                onChanged={refetch}
            />
        </div>
    );
};

export default RosterTriagePage;

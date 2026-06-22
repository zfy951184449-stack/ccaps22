import React, { useMemo } from 'react';
import { Dayjs } from 'dayjs';
import { WxbCard, WxbEmpty, WxbTooltip } from '../../../components/wxb-ui';
import { RosterCalendarResponse, WorkdayMap } from '../../personnel-scheduling/types';
import { TriageVacancy, vacancySeverity, SeverityLevel } from '../triageModel';

const SEV_STYLE: Record<SeverityLevel, { bg: string; fg: string }> = {
    none: { bg: 'transparent', fg: 'var(--wx-fg-4)' },
    s1: { bg: 'var(--wx-amber-100)', fg: 'var(--wx-amber-700)' },
    s2: { bg: 'var(--wx-amber-500)', fg: 'var(--wx-fg-1)' },
    s3: { bg: 'var(--wx-red-100)', fg: 'var(--wx-red-700)' },
    s4: { bg: 'var(--wx-red-500)', fg: 'var(--wx-bg)' }
};

interface Props {
    days: Dayjs[];
    vacancies: TriageVacancy[];
    data: RosterCalendarResponse | null;
    dayTypes: WorkdayMap;
    onPick: (date: string) => void;
}

/** 组 × 日 缺口热力图:格子越红当日该组缺口越大;点格子=跳回工单流并过滤到该天。 */
const CoverageHeatmap: React.FC<Props> = ({ days, vacancies, data, dayTypes, onPick }) => {
    const groups = useMemo(() => {
        const s = new Set<string>();
        (data?.employees || []).forEach((e) => { if (e.groupName) s.add(e.groupName); });
        return Array.from(s);
    }, [data]);

    const cell = useMemo(() => {
        const m = new Map<string, number>();
        vacancies.forEach((v) => {
            const k = `${v.groupName}|${v.date}`;
            m.set(k, (m.get(k) || 0) + v.vacancy);
        });
        return m;
    }, [vacancies]);

    const rowTotal = (g: string) => days.reduce((s, d) => s + (cell.get(`${g}|${d.format('YYYY-MM-DD')}`) || 0), 0);

    if (groups.length === 0) {
        return <WxbCard className="rt-cal-card"><div className="rt-state"><WxbEmpty description="该范围下暂无可显示的组" /></div></WxbCard>;
    }

    return (
        <WxbCard>
            <div className="rt-heat-wrap">
                <table className="rt-heat">
                    <thead>
                        <tr>
                            <th className="rt-heat-unit">组 / 日期</th>
                            {days.map((d) => {
                                const dt = dayTypes[d.format('YYYY-MM-DD')];
                                return (
                                    <th key={d.format('YYYY-MM-DD')} className="rt-heat-dayh" title={dt?.holidayName || undefined}>{d.date()}</th>
                                );
                            })}
                            <th className="rt-heat-dayh">合计</th>
                        </tr>
                    </thead>
                    <tbody>
                        {groups.map((g) => (
                            <tr key={g}>
                                <td className="rt-heat-unit">{g}</td>
                                {days.map((d) => {
                                    const dateStr = d.format('YYYY-MM-DD');
                                    const val = cell.get(`${g}|${dateStr}`) || 0;
                                    const sev = vacancySeverity(val);
                                    return (
                                        <td key={dateStr} className="rt-heat-cell">
                                            {val > 0 ? (
                                                <WxbTooltip title={`${g} · ${d.format('M月D日')} 缺 ${val} 人`}>
                                                    <span
                                                        className="rt-heat-chip"
                                                        role="button"
                                                        tabIndex={0}
                                                        style={{ background: SEV_STYLE[sev].bg, color: SEV_STYLE[sev].fg }}
                                                        onClick={() => onPick(dateStr)}
                                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(dateStr); } }}
                                                    >{val}</span>
                                                </WxbTooltip>
                                            ) : null}
                                        </td>
                                    );
                                })}
                                <td className="rt-heat-total">{rowTotal(g) || ''}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </WxbCard>
    );
};

export default CoverageHeatmap;

import React from 'react';
import dayjs from 'dayjs';
import { WxbCard } from '../../../components/wxb-ui';
import { RosterCalendarDay, RosterCalendarOperation, RosterCalendarTeamMember, DayTypeInfo } from '../types';
import { shiftKindClass, shiftPillLabel, batchColorClass } from '../shiftVisual';
import ShiftIcon from './ShiftIcon';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const ROLE_LABEL: Record<string, string> = {
    OPERATOR: '操作工',
    SUPERVISOR: '主管',
    QC_INSPECTOR: '质检',
    ASSISTANT: '辅助'
};
const roleText = (r: string) => ROLE_LABEL[r] || r;
const initials = (name: string) => (name || '').slice(-2);

interface Props {
    date: string | null;
    day: RosterCalendarDay | null;
    focalEmployeeId: number | null;
    employeeName?: string;
    dayInfo?: DayTypeInfo;
}

/** 一道操作的同岗成员 + 空缺。 */
const TeamBlock: React.FC<{ op: RosterCalendarOperation; focalEmployeeId: number | null }> = ({ op, focalEmployeeId }) => {
    const team = op.team || [];
    const required = op.requiredPeople || team.length;
    const filled = team.length;
    const me = team.find((m) => m.employeeId === focalEmployeeId);
    const myPos = me?.positionNumber ?? op.positionNumber;

    const filledPos = new Set(team.map((m) => m.positionNumber).filter((p) => p != null));
    const vacancyCount = Math.max(0, required - filled);
    const missing: (number | null)[] = [];
    for (let p = 1; p <= required && missing.length < vacancyCount; p++) {
        if (!filledPos.has(p)) missing.push(p);
    }
    while (missing.length < vacancyCount) missing.push(null);

    const renderMember = (m: RosterCalendarTeamMember) => {
        const isMe = m.employeeId === focalEmployeeId;
        return (
            <span key={`m${m.employeeId}-${m.positionNumber}`} className={`rc-member ${isMe ? 'rc-member--me' : ''}`}>
                <span className="rc-member-avatar">
                    {initials(m.name)}
                    {m.positionNumber != null && <span className="rc-member-pos">{m.positionNumber}</span>}
                </span>
                <span className="rc-member-name">
                    {isMe ? '我' : m.name}{m.role ? <span className="rc-member-role"> {roleText(m.role)}</span> : null}
                </span>
            </span>
        );
    };

    return (
        <div className="rc-team">
            <div className="rc-team-label">
                同岗 {filled}/{required} 人{myPos != null ? ` · 我在岗位 ${myPos}` : ''}
                {vacancyCount > 0 && <span className="rc-team-gap"> · 缺 {vacancyCount}</span>}
            </div>
            {team.map(renderMember)}
            {missing.map((p, i) => (
                <span key={`gap${i}`} className="rc-member rc-member--gap">
                    <span className="rc-member-avatar">?{p != null && <span className="rc-member-pos">{p}</span>}</span>
                    <span className="rc-member-name">空缺</span>
                </span>
            ))}
        </div>
    );
};

const DayDetailPanel: React.FC<Props> = ({ date, day, focalEmployeeId, employeeName, dayInfo }) => {
    if (!date) {
        return (
            <WxbCard className="rc-rail">
                <div className="rc-detail-empty">点击日历中的某一天,查看当天班次与工作明细。</div>
            </WxbCard>
        );
    }

    const d = dayjs(date);
    const shift = day?.shift || null;
    const ops = day?.operations || [];
    const restText = shift?.kind === 'leave' ? '当日请假,无排产工作。'
        : shift?.kind === 'rest' || !shift ? '当日休息,无排产工作。'
            : '当日有班次,但暂无排产工作。';

    const dayChip = dayInfo && (dayInfo.dayType === 'holiday' || dayInfo.dayType === 'makeup') ? (
        <span className={`rc-daychip rc-daychip--${dayInfo.dayType}`}>
            {dayInfo.dayType === 'holiday'
                ? `${dayInfo.holidayName ? dayInfo.holidayName + ' · ' : ''}法定节假日`
                : `${dayInfo.holidayName ? dayInfo.holidayName + ' · ' : ''}调休补班`}
            {dayInfo.isTripleSalary ? ' · 3倍工资' : ''}
        </span>
    ) : null;

    return (
        <WxbCard className="rc-rail">
            <div className="rc-detail-head">
                <div className="rc-detail-date">
                    {d.format('M月D日')} · 周{WEEKDAYS[d.day()]}
                    {employeeName ? <span className="rc-id-code">{employeeName}</span> : null}
                </div>
                {shift && <span className={`rc-pill ${shiftKindClass(shift)}`}><ShiftIcon kind={shift.kind} /><span className="rc-pill-tx">{shiftPillLabel(shift)}</span></span>}
            </div>
            {dayChip && <div style={{ marginTop: 6 }}>{dayChip}</div>}
            <div className="rc-detail-sub">
                {shift && shift.type !== 'REST' && shift.startTime
                    ? `班次 ${shift.startTime}–${shift.endTime} · 当日工作 ${ops.length} 项`
                    : `当日工作 ${ops.length} 项`}
            </div>

            {ops.length === 0 ? (
                <div className="rc-detail-empty">{restText}</div>
            ) : (
                <div className="rc-timeline">
                    {ops.map((op) => (
                        <div key={op.operationPlanId} className={`rc-event ${batchColorClass(op.batchCode)}`}>
                            <span className="rc-event-node" />
                            <div className="rc-event-time">{op.startTime} – {op.endTime}</div>
                            <div className="rc-event-name">{op.operationName}</div>
                            <div className="rc-event-meta">
                                {op.batchCode && <span className="rc-batch-tag">{op.batchCode}</span>}
                                {op.stageName && <span>{op.stageName}</span>}
                            </div>
                            <TeamBlock op={op} focalEmployeeId={focalEmployeeId} />
                        </div>
                    ))}
                </div>
            )}

            <div className="rc-legend">
                <span className="rc-legend-item"><span className="rc-legend-swatch rc-shift--day" />白班</span>
                <span className="rc-legend-item"><span className="rc-legend-swatch rc-shift--night" />夜班</span>
                <span className="rc-legend-item"><span className="rc-legend-swatch rc-shift--long" />长白</span>
                <span className="rc-legend-item"><span className="rc-legend-swatch rc-shift--leave" />请假</span>
                <span className="rc-legend-item"><span className="rc-legend-swatch rc-shift--rest" />休息</span>
                <span className="rc-legend-item"><span className="rc-legend-swatch rc-legend-swatch--out" />非本月</span>
                <span className="rc-legend-item"><span className="rc-daytag rc-daytag--holiday">休</span>节假日</span>
                <span className="rc-legend-item"><span className="rc-daytag rc-daytag--makeup">班</span>调休补班</span>
            </div>
        </WxbCard>
    );
};

export default DayDetailPanel;

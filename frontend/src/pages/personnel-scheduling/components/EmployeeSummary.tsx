import React from 'react';
import { WxbCard } from '../../../components/wxb-ui';
import { RosterCalendarEmployee } from '../types';

const ROLE_LABEL: Record<string, string> = {
    FRONTLINE: '一线员工',
    SHIFT_LEADER: '班长',
    GROUP_LEADER: '组长',
    TEAM_LEADER: 'Team 主管',
    DEPT_MANAGER: '部门经理'
};

interface Props {
    employee: RosterCalendarEmployee;
}

/** 单员工视图顶部的概览条:头像 + 身份 + 当期四项汇总。 */
const EmployeeSummary: React.FC<Props> = ({ employee }) => {
    const initials = (employee.name || '').slice(-2) || '员工';
    const metaParts = [
        ROLE_LABEL[employee.role] || employee.role || '',
        employee.groupName,
        employee.teamName
    ].filter(Boolean);

    const stats: Array<{ label: string; value: number }> = [
        { label: '出勤天数', value: employee.summary.attendanceDays },
        { label: '计划工时', value: employee.summary.planHours },
        { label: '夜班次数', value: employee.summary.nightCount },
        { label: '操作项数', value: employee.summary.opCount }
    ];

    return (
        <WxbCard className="rc-summary">
            <div className="rc-id">
                <div className="rc-avatar">{initials}</div>
                <div>
                    <div>
                        <span className="rc-id-name">{employee.name}</span>
                        <span className="rc-id-code">{employee.code}</span>
                    </div>
                    <div className="rc-id-meta">{metaParts.join(' · ')}</div>
                </div>
            </div>
            <div className="rc-statband">
                {stats.map((s, i) => (
                    <React.Fragment key={s.label}>
                        {i > 0 && <span className="rc-stat-sep" />}
                        <div className="rc-stat">
                            <span className="rc-stat-label">{s.label}</span>
                            <span className="rc-stat-num">{s.value}</span>
                        </div>
                    </React.Fragment>
                ))}
            </div>
        </WxbCard>
    );
};

export default EmployeeSummary;

import React from 'react';
import { Tooltip } from 'antd';
import dayjs from 'dayjs';
import { ShiftPlan, selectPrimaryPlan } from './PersonnelSchedulingUtils';

interface RosterCellProps {
    plans: ShiftPlan[];
    allPlans: ShiftPlan[];
}

const RosterCell: React.FC<RosterCellProps> = ({ plans, allPlans }) => {

    const primaryPlan = selectPrimaryPlan(plans);

    if (!primaryPlan) {
        return null;
    }

    const getShiftClass = (plan: ShiftPlan) => {
        const code = (plan.shift_code || '').toUpperCase();
        const name = (plan.shift_name || '').toLowerCase();
        const category = (plan.plan_category || 'BASE').toLowerCase();

        if (name.includes('夜') || code.includes('NIGHT')) return 'shift-night';
        if (name.includes('长白') || code.includes('LONG')) return 'shift-long-day';
        if (plan.operation_name || category === 'production') return 'shift-production';
        if (name.includes('日') || code.includes('DAY') || name.includes('早')) return 'shift-day';
        return `shift-${category}`;
    };

    const label = primaryPlan.shift_name || primaryPlan.shift_code || '未定义班次';
    const shiftClass = getShiftClass(primaryPlan);
    const displayHours =
        primaryPlan.shift_nominal_hours !== undefined && primaryPlan.shift_nominal_hours !== null
            ? primaryPlan.shift_nominal_hours
            : primaryPlan.plan_hours;

    const coworkers = primaryPlan.batch_code && primaryPlan.operation_name
        ? allPlans
            .filter(
                (p) =>
                    p.plan_date === primaryPlan.plan_date &&
                    p.batch_code === primaryPlan.batch_code &&
                    p.operation_name === primaryPlan.operation_name &&
                    p.employee_id !== primaryPlan.employee_id
            )
            .map((p) => p.employee_name)
        : [];

    const tip = (
        <div className="roster-tip">
            {plans.map((plan, index) => {
                const planLabel = plan.shift_name || plan.shift_code || '未定义班次';
                const planCoworkers = plan.batch_code && plan.operation_name
                    ? allPlans
                        .filter(
                            (p) =>
                                p.plan_date === plan.plan_date &&
                                p.batch_code === plan.batch_code &&
                                p.operation_name === plan.operation_name &&
                                p.employee_id !== plan.employee_id
                        )
                        .map((p) => p.employee_name)
                    : [];

                const planDisplayHours =
                    plan.shift_nominal_hours !== undefined && plan.shift_nominal_hours !== null
                        ? plan.shift_nominal_hours
                        : plan.plan_hours;

                return (
                    <div key={index} style={{
                        marginBottom: index < plans.length - 1 ? '12px' : '0',
                        borderBottom: index < plans.length - 1 ? '1px solid rgba(255,255,255,0.2)' : 'none',
                        paddingBottom: index < plans.length - 1 ? '8px' : '0'
                    }}>
                        <div className="roster-tip-title">{planLabel}</div>
                        {plan.shift_start_time && plan.shift_end_time && (
                            <div>班次时间：{plan.shift_start_time} - {plan.shift_end_time}</div>
                        )}

                        {plan.operation_name && (
                            <>
                                <div style={{ marginTop: '8px', fontWeight: 'bold', color: '#d46b08' }}>
                                    📋 工作安排
                                </div>
                                {plan.batch_code && <div>批次：{plan.batch_code}</div>}
                                <div>
                                    操作：{plan.stage_name ? `${plan.stage_name} · ` : ''}{plan.operation_name}
                                </div>
                                {plan.operation_start && plan.operation_end && (
                                    <div>
                                        操作时间：
                                        {dayjs(plan.operation_start).format('HH:mm')} -
                                        {dayjs(plan.operation_end).format('HH:mm')}
                                    </div>
                                )}
                                {planCoworkers.length > 0 && <div>同伴：{planCoworkers.join('、')}</div>}
                            </>
                        )}

                        {planDisplayHours !== undefined && planDisplayHours !== null && (
                            <div style={{ marginTop: '4px' }}>
                                工时（班次折算）：{planDisplayHours}h
                            </div>
                        )}
                        <div style={{ marginTop: '4px', fontSize: '11px', color: '#8a94a6' }}>
                            类型：{plan.plan_category}
                        </div>
                    </div>
                );
            })}
        </div>
    );

    // Get short label for display
    const getShortLabel = (plan: ShiftPlan) => {
        const name = plan.shift_name || '';
        if (name.includes('夜')) return '夜班';
        if (name.includes('长白')) return '长白';
        if (name.includes('日') || name.includes('早')) return '日班';
        if (plan.plan_category === 'REST') return '休息';
        return name.slice(0, 2) || '班';
    };

    // Get time display
    const getTimeDisplay = (plan: ShiftPlan) => {
        if (plan.shift_start_time && plan.shift_end_time) {
            return `${plan.shift_start_time.slice(0, 5)}-${plan.shift_end_time.slice(0, 5)}`;
        }
        return null;
    };

    const shortLabel = getShortLabel(primaryPlan);
    const timeDisplay = getTimeDisplay(primaryPlan);
    const hasProductionTask = !!primaryPlan.operation_name;

    return (
        <div className={`roster-cell-plans ${hasProductionTask ? 'has-production-task' : ''}`}>
            <Tooltip title={tip}>
                <div className={`shift-chip ${shiftClass}`}>
                    <span className="shift-chip-label">{shortLabel}</span>
                    {timeDisplay && (
                        <span className="shift-chip-time">{timeDisplay}</span>
                    )}
                </div>
            </Tooltip>
        </div>
    );
};

export default RosterCell;

import React, { useState, useEffect } from 'react';
import { Dayjs } from 'dayjs';
import { WxbCard, WxbButton, WxbDatePicker, WxbSelect, WxbDivider } from '../wxb-ui';
import { WxbCascader } from '../wxb-ui/Cascader/Cascader';
import { dashboardService } from '../../services/dashboardService';
import { DepartmentOption, ShiftOption } from '../../types/dashboard';

/* ── Inline SVG icons (generic UI glyphs not in bioprocess icon set) ── */
const IconCalendar = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
);
const IconUsers = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
);
const IconClock = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
    </svg>
);
const IconChevronLeft = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
    </svg>
);
const IconChevronRight = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18l6-6-6-6" />
    </svg>
);

const { Option } = require('antd').Select;

interface DashboardFilterBarProps {
    selectedDate: Dayjs;
    onDateChange: (date: Dayjs) => void;
    orgPath: number[];
    onOrgChange: (path: number[]) => void;
    selectedShift: number | undefined;
    onShiftChange: (shiftId: number | undefined) => void;
}

const DashboardFilterBar: React.FC<DashboardFilterBarProps> = ({
    selectedDate,
    onDateChange,
    orgPath,
    onOrgChange,
    selectedShift,
    onShiftChange
}) => {
    const [orgOptions, setOrgOptions] = useState<DepartmentOption[]>([]);
    const [shiftOptions, setShiftOptions] = useState<ShiftOption[]>([]);

    useEffect(() => {
        const loadOptions = async () => {
            try {
                const [orgs, shifts] = await Promise.all([
                    dashboardService.getOrgOptions(),
                    dashboardService.getShiftOptions()
                ]);
                setOrgOptions(Array.isArray(orgs) ? orgs : []);
                setShiftOptions(Array.isArray(shifts) ? shifts : []);
            } catch (error) {
                console.error('Failed to load filter options:', error);
                setOrgOptions([]);
                setShiftOptions([]);
            }
        };
        loadOptions();
    }, []);

    const handlePrevMonth = () => onDateChange(selectedDate.subtract(1, 'month'));
    const handleNextMonth = () => onDateChange(selectedDate.add(1, 'month'));

    return (
        <WxbCard
            className="dashboard-filter-bar"
            style={{
                marginBottom: 24,
                padding: '16px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                zIndex: 10
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                {/* Date Navigation */}
                <div className="filter-group date-nav" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="filter-label" style={{ marginRight: 4, color: 'var(--wx-fg-3, #5A6B7E)', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <IconCalendar /> 日期
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <WxbButton
                            variant="ghost"
                            size="sm"
                            onClick={handlePrevMonth}
                            style={{ padding: '4px 6px', borderRadius: '50%', minWidth: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            <IconChevronLeft />
                        </WxbButton>
                        <WxbDatePicker
                            picker="month"
                            value={selectedDate}
                            onChange={(date: any) => date && onDateChange(date)}
                            allowClear={false}
                            format="YYYY-MM"
                            style={{ width: 140 }}
                        />
                        <WxbButton
                            variant="ghost"
                            size="sm"
                            onClick={handleNextMonth}
                            style={{ padding: '4px 6px', borderRadius: '50%', minWidth: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                            <IconChevronRight />
                        </WxbButton>
                    </div>
                </div>

                <WxbDivider direction="vertical" style={{ height: 24 }} />

                {/* Org Filter */}
                <div className="filter-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="filter-label" style={{ color: 'var(--wx-fg-3, #5A6B7E)', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <IconUsers /> 组织
                    </span>
                    <WxbCascader
                        options={orgOptions}
                        value={orgPath}
                        onChange={(value: any) => onOrgChange((value || []) as number[])}
                        placeholder="全部组织"
                        changeOnSelect
                        style={{ width: 180 }}
                    />
                </div>

                {/* Shift Filter */}
                <div className="filter-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="filter-label" style={{ color: 'var(--wx-fg-3, #5A6B7E)', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <IconClock /> 班次
                    </span>
                    <WxbSelect
                        value={selectedShift}
                        onChange={onShiftChange}
                        placeholder="全部班次"
                        allowClear
                        style={{ width: 140 }}
                    >
                        {shiftOptions.map((s) => (
                            <Option key={s.id} value={s.id}>{s.shift_name}</Option>
                        ))}
                    </WxbSelect>
                </div>
            </div>

            <div style={{ color: 'var(--wx-fg-4, #8898A8)', fontSize: 12 }}>
                {selectedDate.format('YYYY年 M月')}
            </div>
        </WxbCard>
    );
};

export default DashboardFilterBar;

import React, { useState, useEffect } from 'react';
import { DatePicker, Cascader, Select, Button, Space } from 'antd';
import { LeftOutlined, RightOutlined, CalendarOutlined, TeamOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { Dayjs } from 'dayjs';
import GlassCard from '../common/GlassCard';
import { dashboardService } from '../../services/dashboardService';
import { DepartmentOption, ShiftOption } from '../../types/dashboard';

const { Option } = Select;

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
        <GlassCard
            className="dashboard-filter-bar"
            style={{
                marginBottom: 24,
                padding: '16px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderRadius: '20px',
                zIndex: 10
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                {/* Date Navigation */}
                <div className="filter-group date-nav">
                    <span className="filter-label" style={{ marginRight: 12, color: '#8c8c8c', fontSize: 13, fontWeight: 500 }}>
                        <CalendarOutlined /> 日期
                    </span>
                    <Space>
                        <Button
                            type="text"
                            shape="circle"
                            icon={<LeftOutlined />}
                            onClick={handlePrevMonth}
                            style={{ color: '#595959' }}
                        />
                        <DatePicker
                            picker="month"
                            value={selectedDate}
                            onChange={(date) => date && onDateChange(date)}
                            allowClear={false}
                            format="YYYY-MM"
                            style={{
                                width: 140,
                                borderRadius: 8,
                                border: '1px solid rgba(0,0,0,0.06)',
                                background: 'rgba(255,255,255,0.5)'
                            }}
                            bordered={false}
                        />
                        <Button
                            type="text"
                            shape="circle"
                            icon={<RightOutlined />}
                            onClick={handleNextMonth}
                            style={{ color: '#595959' }}
                        />
                    </Space>
                </div>

                <div
                    style={{
                        width: 1,
                        height: 24,
                        background: 'rgba(0,0,0,0.06)',
                        margin: '0 8px'
                    }}
                />

                {/* Org Filter */}
                <div className="filter-group">
                    <span className="filter-label" style={{ marginRight: 12, color: '#8c8c8c', fontSize: 13, fontWeight: 500 }}>
                        <TeamOutlined /> 组织
                    </span>
                    <Cascader
                        options={orgOptions}
                        value={orgPath}
                        onChange={(value) => onOrgChange((value || []) as number[])}
                        placeholder="全部组织"
                        changeOnSelect
                        style={{ width: 180 }}
                        bordered={false}
                        className="glass-input"
                    />
                </div>

                {/* Shift Filter */}
                <div className="filter-group">
                    <span className="filter-label" style={{ marginRight: 12, color: '#8c8c8c', fontSize: 13, fontWeight: 500 }}>
                        <ClockCircleOutlined /> 班次
                    </span>
                    <Select
                        value={selectedShift}
                        onChange={onShiftChange}
                        placeholder="全部班次"
                        allowClear
                        style={{ width: 140 }}
                        bordered={false}
                        className="glass-input"
                    >
                        {shiftOptions.map((s) => (
                            <Option key={s.id} value={s.id}>{s.shift_name}</Option>
                        ))}
                    </Select>
                </div>
            </div>

            <div style={{ color: '#8c8c8c', fontSize: 12 }}>
                {selectedDate.format('YYYY年 M月')}
            </div>
        </GlassCard>
    );
};

export default DashboardFilterBar;

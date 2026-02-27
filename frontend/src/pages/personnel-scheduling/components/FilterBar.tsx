import React from 'react';
import { Select, Button, DatePicker, message } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { DepartmentFilter } from '../types';

interface FilterBarProps {
    currentMonth: Dayjs;
    onMonthChange: (date: Dayjs) => void;
    departments: DepartmentFilter[];
    selectedDeptId?: number | null;
    selectedTeamId?: number | null;
    onFilterChange: (deptId: number | null, teamId: number | null) => void;
}

const FilterBar: React.FC<FilterBarProps> = ({
    currentMonth,
    onMonthChange,
    departments,
    selectedDeptId,
    selectedTeamId,
    onFilterChange
}) => {
    const handlePrevMonth = () => onMonthChange(currentMonth.add(-1, 'month'));
    const handleNextMonth = () => onMonthChange(currentMonth.add(1, 'month'));

    const activeTeams = selectedDeptId
        ? departments.find(d => d.id === selectedDeptId)?.teams || []
        : [];

    return (
        <div className="flex items-center justify-between p-4 bg-white/60 backdrop-blur-md rounded-2xl shadow-sm border border-white/20 mb-4">
            {/* Month Navigator */}
            <div className="flex items-center space-x-4">
                <Button
                    type="text"
                    icon={<LeftOutlined />}
                    onClick={handlePrevMonth}
                    className="hover:bg-gray-100 rounded-full"
                />
                <div className="text-lg font-semibold text-gray-800 tracking-wide">
                    {currentMonth.format('YYYY年 M月')}
                </div>
                <Button
                    type="text"
                    icon={<RightOutlined />}
                    onClick={handleNextMonth}
                    className="hover:bg-gray-100 rounded-full"
                />
            </div>

            {/* Filters */}
            <div className="flex items-center space-x-3">
                <Select
                    placeholder="选择部门"
                    style={{ width: 140 }}
                    bordered={false}
                    className="glass-select"
                    value={selectedDeptId}
                    allowClear
                    onChange={(val) => onFilterChange(val, null)}
                    options={departments.map(d => ({ label: d.name, value: d.id }))}
                />
                <Select
                    placeholder="选择团队"
                    style={{ width: 140 }}
                    bordered={false}
                    className="glass-select"
                    value={selectedTeamId}
                    allowClear
                    disabled={!selectedDeptId}
                    onChange={(val) => onFilterChange(selectedDeptId || null, val)}
                    options={activeTeams.map(t => ({ label: t.name, value: t.id }))}
                />
            </div>

            <style>{`
        .glass-select .ant-select-selector {
          background-color: rgba(255, 255, 255, 0.5) !important;
          border-radius: 12px !important;
          border: 1px solid rgba(0,0,0,0.05) !important;
        }
        .glass-select:hover .ant-select-selector {
          border-color: rgba(0,0,0,0.1) !important;
        }
      `}</style>
        </div>
    );
};

export default FilterBar;

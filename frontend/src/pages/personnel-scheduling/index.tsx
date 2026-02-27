import React, { useState, useMemo } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import { Select, AutoComplete, Empty, Spin } from 'antd';
import { LeftOutlined, RightOutlined, ReloadOutlined } from '@ant-design/icons';
import { useScheduleData } from './hooks/useScheduleData';
import PersonnelScheduleTable from './components/PersonnelScheduleTable';

/**
 * Personnel Scheduling Page - Enhanced
 */
const PersonnelSchedulingPage: React.FC = () => {
    // State
    const [currentMonth, setCurrentMonth] = useState<Dayjs>(dayjs().startOf('month'));
    const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);
    const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
    const [employeeSearch, setEmployeeSearch] = useState('');

    // Data hooks - include filtersLoading and refreshFilters
    const { filters, gridData, fetchGrid, loading, filtersLoading, refreshFilters, styles } = useScheduleData();

    // Fetch data when filters change
    React.useEffect(() => {
        const start = currentMonth.startOf('month').format('YYYY-MM-DD');
        const end = currentMonth.endOf('month').format('YYYY-MM-DD');
        fetchGrid(start, end, selectedDeptId, selectedTeamId);
    }, [currentMonth, selectedDeptId, selectedTeamId, fetchGrid]);

    // Get teams for selected department
    const availableTeams = useMemo(() => {
        if (!selectedDeptId) return [];
        return filters.find(d => d.id === selectedDeptId)?.teams || [];
    }, [filters, selectedDeptId]);

    // Filter employees based on search
    const filteredEmployees = useMemo(() => {
        if (!gridData?.employees) return [];
        if (!employeeSearch) return gridData.employees;

        const searchLower = employeeSearch.toLowerCase();
        return gridData.employees.filter(emp =>
            emp.name.toLowerCase().includes(searchLower) ||
            emp.code.toLowerCase().includes(searchLower)
        );
    }, [gridData?.employees, employeeSearch]);

    // Employee autocomplete options
    const employeeOptions = useMemo(() => {
        return filteredEmployees.slice(0, 10).map(emp => ({
            value: emp.name,
            label: (
                <div className="flex items-center justify-between py-1">
                    <span className="font-medium text-gray-800">{emp.name}</span>
                    <span className="text-xs text-gray-400">{emp.code}</span>
                </div>
            )
        }));
    }, [filteredEmployees]);

    // Handlers
    const handlePrevMonth = () => setCurrentMonth(prev => prev.subtract(1, 'month'));
    const handleNextMonth = () => setCurrentMonth(prev => prev.add(1, 'month'));

    const handleDeptChange = (val: number | null) => {
        setSelectedDeptId(val);
        setSelectedTeamId(null);
    };

    return (
        <div className="h-full flex flex-col p-4 gap-4">
            {/* ===== Toolbar Area ===== */}
            <div className="flex items-center justify-between px-4 py-3 bg-white/60 backdrop-blur-xl rounded-2xl border border-white/30 shadow-sm z-50">

                {/* 1. Month Calendar Picker */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={handlePrevMonth}
                        className="w-8 h-8 flex items-center justify-center rounded-full 
                                   bg-gray-100/80 hover:bg-gray-200/80 
                                   text-gray-600 transition-all duration-200 
                                   hover:scale-105 active:scale-95"
                        aria-label="上一月"
                    >
                        <LeftOutlined className="text-xs" />
                    </button>

                    <div className="px-4 py-1.5 min-w-[120px] text-center select-none">
                        <span className="text-base font-semibold text-gray-800 tracking-wide">
                            {currentMonth.format('YYYY年 M月')}
                        </span>
                    </div>

                    <button
                        onClick={handleNextMonth}
                        className="w-8 h-8 flex items-center justify-center rounded-full 
                                   bg-gray-100/80 hover:bg-gray-200/80 
                                   text-gray-600 transition-all duration-200 
                                   hover:scale-105 active:scale-95"
                        aria-label="下一月"
                    >
                        <RightOutlined className="text-xs" />
                    </button>
                </div>

                {/* 2 & 3. Filters */}
                <div className="flex items-center gap-3">
                    {/* Data Refresher (Optional but helpful API is stuck) */}
                    <button
                        onClick={refreshFilters}
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100/50 text-gray-400 transition-colors"
                        title="刷新数据"
                    >
                        <ReloadOutlined spin={filtersLoading} />
                    </button>

                    {/* Department Filter */}
                    <Select
                        placeholder="选择部门"
                        allowClear
                        value={selectedDeptId}
                        onChange={handleDeptChange}
                        options={filters.map(d => ({ label: d.name, value: d.id }))}
                        loading={filtersLoading}
                        popupMatchSelectWidth={false}
                        className="min-w-[120px] glass-select"
                        style={{ minWidth: 120 }}
                        dropdownStyle={{ borderRadius: 12 }}
                        bordered={false}
                        optionFilterProp="label"
                        notFoundContent={
                            filtersLoading ? <Spin size="small" /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无部门" />
                        }
                    />

                    {/* Team Filter */}
                    <Select
                        placeholder="选择团队"
                        allowClear
                        value={selectedTeamId}
                        onChange={setSelectedTeamId}
                        options={availableTeams.map(t => ({ label: t.name, value: t.id }))}
                        disabled={!selectedDeptId}
                        popupMatchSelectWidth={false}
                        className="min-w-[120px] glass-select"
                        style={{ minWidth: 120 }}
                        dropdownStyle={{ borderRadius: 12 }}
                        bordered={false}
                        optionFilterProp="label"
                        notFoundContent={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无团队" />}
                    />

                    {/* Divider */}
                    <div className="w-px h-6 bg-gray-200/60" />

                    {/* Employee Search */}
                    <AutoComplete
                        placeholder="搜索员工..."
                        value={employeeSearch}
                        onChange={setEmployeeSearch}
                        options={employeeOptions}
                        popupMatchSelectWidth={280}
                        className="min-w-[180px] glass-search"
                        style={{ minWidth: 180 }}
                        allowClear
                        filterOption={false} // Disable internal filtering since we filter in useMemo
                    />
                </div>
            </div>

            {/* ===== Main Table Area ===== */}
            <div className="flex-1 overflow-hidden">
                <PersonnelScheduleTable
                    currentMonth={currentMonth}
                    employees={filteredEmployees}
                    styles={styles}
                    loading={loading}
                />
            </div>

            {/* ===== Custom Styles ===== */}
            <style>{`
                /* Ant Select borderless glassmorphism style */
                .ant-select-borderless .ant-select-selector {
                    background: rgba(243, 244, 246, 0.6) !important;
                    border-radius: 12px !important;
                    padding: 4px 12px !important;
                    transition: all 0.2s ease !important;
                }
                .ant-select-borderless:hover .ant-select-selector {
                    background: rgba(243, 244, 246, 0.9) !important;
                }
                .ant-select-borderless.ant-select-focused .ant-select-selector {
                    background: rgba(255, 255, 255, 0.9) !important;
                    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2) !important;
                }
                
                /* Dropdown styling */
                .ant-select-dropdown {
                    border-radius: 12px !important;
                    overflow: hidden;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1) !important;
                    border: 1px solid rgba(0,0,0,0.05);
                }
                .ant-select-item-option-selected {
                    background-color: rgba(59, 130, 246, 0.1) !important;
                    color: #2563eb !important;
                    font-weight: 500;
                }
                /* AutoComplete glass input */
                .glass-search .ant-select-selector {
                    background: rgba(243, 244, 246, 0.6) !important;
                    border-radius: 12px !important;
                    border: none !important;
                    padding: 4px 12px !important;
                    box-shadow: none !important;
                    transition: all 0.2s ease !important;
                }
                .glass-search:hover .ant-select-selector {
                    background: rgba(243, 244, 246, 0.9) !important;
                }
                .glass-search.ant-select-focused .ant-select-selector {
                    background: rgba(255, 255, 255, 0.9) !important;
                    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2) !important;
                }
                .glass-search input {
                    height: 100% !important;
                }
            `}</style>
        </div>
    );
};

export default PersonnelSchedulingPage;

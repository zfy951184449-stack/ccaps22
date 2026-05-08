import React, { useEffect, useMemo, useState } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import {
    WxbButton,
    WxbDivider,
    WxbEmpty,
    WxbFilterBar,
    WxbSearchInput,
    WxbSelect,
    WxbSpinner,
    WxbTooltip
} from '../../components/wxb-ui';
import { useScheduleData } from './hooks/useScheduleData';
import PersonnelScheduleTable from './components/PersonnelScheduleTable';
import './PersonnelSchedulingPage.css';

const ChevronLeftIcon = () => (
    <svg className="personnel-scheduling-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" />
    </svg>
);

const ChevronRightIcon = () => (
    <svg className="personnel-scheduling-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 18l6-6-6-6" />
    </svg>
);

const RefreshIcon = () => (
    <svg className="personnel-scheduling-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 6v5h-5" />
        <path d="M4 18v-5h5" />
        <path d="M18.5 9a7 7 0 0 0-11.8-2.4L4 9" />
        <path d="M5.5 15a7 7 0 0 0 11.8 2.4L20 15" />
    </svg>
);

/**
 * Personnel Scheduling Page - Enhanced
 */
const PersonnelSchedulingPage: React.FC = () => {
    const [currentMonth, setCurrentMonth] = useState<Dayjs>(dayjs().startOf('month'));
    const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);
    const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
    const [employeeSearch, setEmployeeSearch] = useState('');

    const { filters, gridData, fetchGrid, loading, filtersLoading, refreshFilters, styles } = useScheduleData();

    useEffect(() => {
        const start = currentMonth.startOf('month').format('YYYY-MM-DD');
        const end = currentMonth.endOf('month').format('YYYY-MM-DD');
        fetchGrid(start, end, selectedDeptId, selectedTeamId);
    }, [currentMonth, selectedDeptId, selectedTeamId, fetchGrid]);

    const availableTeams = useMemo(() => {
        if (!selectedDeptId) return [];
        return filters.find(d => d.id === selectedDeptId)?.teams || [];
    }, [filters, selectedDeptId]);

    const filteredEmployees = useMemo(() => {
        if (!gridData?.employees) return [];
        const searchTerm = employeeSearch.trim().toLowerCase();
        if (!searchTerm) return gridData.employees;

        return gridData.employees.filter(emp =>
            emp.name.toLowerCase().includes(searchTerm) ||
            emp.code.toLowerCase().includes(searchTerm)
        );
    }, [gridData?.employees, employeeSearch]);

    const handlePrevMonth = () => setCurrentMonth(prev => prev.subtract(1, 'month'));
    const handleNextMonth = () => setCurrentMonth(prev => prev.add(1, 'month'));

    const handleDeptChange = (val: number | null) => {
        setSelectedDeptId(val);
        setSelectedTeamId(null);
    };

    const departmentNotFoundContent = filtersLoading ? (
        <div className="personnel-scheduling-select-state">
            <WxbSpinner size={16} tip="加载中" />
        </div>
    ) : (
        <WxbEmpty className="personnel-scheduling-select-state" description="暂无部门" />
    );

    const teamNotFoundContent = (
        <WxbEmpty className="personnel-scheduling-select-state" description="暂无团队" />
    );

    return (
        <div className="personnel-scheduling-page">
            <WxbFilterBar
                className="personnel-scheduling-toolbar"
                leading={(
                    <div className="personnel-scheduling-month-nav" aria-label="排班月份">
                        <WxbTooltip title="上一月">
                            <WxbButton
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="personnel-scheduling-icon-button"
                                onClick={handlePrevMonth}
                                aria-label="上一月"
                            >
                                <ChevronLeftIcon />
                            </WxbButton>
                        </WxbTooltip>
                        <span className="personnel-scheduling-month-label">
                            {currentMonth.format('YYYY年 M月')}
                        </span>
                        <WxbTooltip title="下一月">
                            <WxbButton
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="personnel-scheduling-icon-button"
                                onClick={handleNextMonth}
                                aria-label="下一月"
                            >
                                <ChevronRightIcon />
                            </WxbButton>
                        </WxbTooltip>
                    </div>
                )}
                filters={(
                    <div className="personnel-scheduling-controls">
                        <WxbSelect
                            placeholder="选择部门"
                            allowClear
                            showSearch
                            value={selectedDeptId ?? undefined}
                            onChange={(value) => handleDeptChange(typeof value === 'number' ? value : null)}
                            options={filters.map(d => ({ label: d.name, value: d.id }))}
                            loading={filtersLoading}
                            popupMatchSelectWidth={false}
                            className="personnel-scheduling-select personnel-scheduling-dept-select"
                            optionFilterProp="label"
                            notFoundContent={departmentNotFoundContent}
                        />
                        <WxbSelect
                            placeholder="选择团队"
                            allowClear
                            showSearch
                            value={selectedTeamId ?? undefined}
                            onChange={(value) => setSelectedTeamId(typeof value === 'number' ? value : null)}
                            options={availableTeams.map(t => ({ label: t.name, value: t.id }))}
                            disabled={!selectedDeptId}
                            popupMatchSelectWidth={false}
                            className="personnel-scheduling-select personnel-scheduling-team-select"
                            optionFilterProp="label"
                            notFoundContent={teamNotFoundContent}
                        />
                        <WxbDivider direction="vertical" className="personnel-scheduling-toolbar-divider" />
                        <WxbSearchInput
                            className="personnel-scheduling-search"
                            placeholder="搜索员工..."
                            value={employeeSearch}
                            onChange={setEmployeeSearch}
                            allowClear
                        />
                    </div>
                )}
                resultCount={filteredEmployees.length}
                resultLabel="名员工"
                actions={(
                    <WxbTooltip title="刷新部门与团队">
                        <WxbButton
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={`personnel-scheduling-icon-button ${filtersLoading ? 'is-loading' : ''}`}
                            onClick={refreshFilters}
                            aria-label="刷新部门与团队"
                            aria-busy={filtersLoading || undefined}
                            disabled={filtersLoading}
                        >
                            <RefreshIcon />
                        </WxbButton>
                    </WxbTooltip>
                )}
            />

            <div className="personnel-scheduling-content">
                <PersonnelScheduleTable
                    currentMonth={currentMonth}
                    employees={filteredEmployees}
                    styles={styles}
                    loading={loading}
                />
            </div>
        </div>
    );
};

export default PersonnelSchedulingPage;

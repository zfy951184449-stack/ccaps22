import React from 'react';
import {
    WxbCard,
    WxbButton,
    WxbSelect,
    WxbSegmented,
    WxbTooltip,
    WxbCascader
} from '../../../components/wxb-ui';
import { OrgCascadeOption } from '../types';

const ChevronLeft = () => (
    <svg className="rc-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
);
const ChevronRight = () => (
    <svg className="rc-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
);
const UsersIcon = () => (
    <svg className="rc-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
);
const UserIcon = () => (
    <svg className="rc-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
);

interface Props {
    orgOptions: OrgCascadeOption[];
    orgPath: number[];
    onOrgChange: (path: number[]) => void;
    orgLoading: boolean;
    employeeOptions: { label: string; value: number }[];
    selectedEmployeeId: number | null;
    onEmployeeChange: (id: number | null) => void;
    viewMode: 'month' | 'week';
    onViewModeChange: (mode: 'month' | 'week') => void;
    periodLabel: string;
    onPrev: () => void;
    onNext: () => void;
}

const RosterFilterBar: React.FC<Props> = ({
    orgOptions, orgPath, onOrgChange, orgLoading,
    employeeOptions, selectedEmployeeId, onEmployeeChange,
    viewMode, onViewModeChange, periodLabel, onPrev, onNext
}) => (
    <WxbCard className="rc-toolbar">
        <div className="rc-filter-row">
            <div className="rc-filter-group">
                <span className="rc-filter-label"><UsersIcon /> 组织</span>
                <WxbCascader
                    options={orgOptions as any}
                    value={orgPath}
                    onChange={(value: any) => onOrgChange((value || []) as number[])}
                    placeholder="部门 / Team / 组"
                    changeOnSelect
                    allowClear
                    showSearch={{ filter: (input: string, path: any[]) =>
                        path.some((o) => String(o.label).toLowerCase().includes(input.toLowerCase())) } as any}
                    loading={orgLoading}
                    style={{ width: 240 }}
                />
            </div>
            <div className="rc-filter-group">
                <span className="rc-filter-label"><UserIcon /> 员工</span>
                <WxbSelect
                    placeholder="选择员工查看个人详历"
                    allowClear
                    showSearch
                    value={selectedEmployeeId ?? undefined}
                    onChange={(value: any) => onEmployeeChange(typeof value === 'number' ? value : null)}
                    options={employeeOptions}
                    optionFilterProp="label"
                    popupMatchSelectWidth={false}
                    style={{ width: 200 }}
                />
            </div>
        </div>

        <div className="rc-right">
            <div className="rc-period-nav">
                <WxbTooltip title={viewMode === 'month' ? '上一月' : '上一周'}>
                    <WxbButton variant="ghost" size="sm" className="rc-icon-btn" onClick={onPrev} aria-label="上一段">
                        <ChevronLeft />
                    </WxbButton>
                </WxbTooltip>
                <span className="rc-period-label">{periodLabel}</span>
                <WxbTooltip title={viewMode === 'month' ? '下一月' : '下一周'}>
                    <WxbButton variant="ghost" size="sm" className="rc-icon-btn" onClick={onNext} aria-label="下一段">
                        <ChevronRight />
                    </WxbButton>
                </WxbTooltip>
            </div>
            <WxbSegmented
                value={viewMode}
                onChange={(v) => onViewModeChange(v as 'month' | 'week')}
                options={[{ label: '月', value: 'month' }, { label: '周', value: 'week' }]}
            />
        </div>
    </WxbCard>
);

export default RosterFilterBar;

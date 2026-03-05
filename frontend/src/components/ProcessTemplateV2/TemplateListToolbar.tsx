import React from 'react';
import { Input, Segmented, Select } from 'antd';

export type TemplateStatusFilter = 'all' | 'risk' | 'recent';
export type TemplateSortBy = 'updated' | 'cycle' | 'name';
export type TemplateDensity = 'card' | 'compact';

interface TemplateListToolbarProps {
  searchValue: string;
  onSearchValueChange: (value: string) => void;
  statusFilter: TemplateStatusFilter;
  onStatusFilterChange: (value: TemplateStatusFilter) => void;
  sortBy: TemplateSortBy;
  onSortByChange: (value: TemplateSortBy) => void;
  density: TemplateDensity;
  onDensityChange: (value: TemplateDensity) => void;
  resultCount: number;
}

const TemplateListToolbar: React.FC<TemplateListToolbarProps> = ({
  searchValue,
  onSearchValueChange,
  statusFilter,
  onStatusFilterChange,
  sortBy,
  onSortByChange,
  density,
  onDensityChange,
  resultCount,
}) => {
  return (
    <section className="sticky top-2 z-20 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center gap-3">
        <Input.Search
          allowClear
          placeholder="搜索模板名 / 编码"
          value={searchValue}
          onChange={(event) => onSearchValueChange(event.target.value)}
          style={{ width: 260 }}
        />

        <Select
          value={statusFilter}
          onChange={(value) => onStatusFilterChange(value as TemplateStatusFilter)}
          style={{ width: 180 }}
          options={[
            { value: 'all', label: '状态：全部' },
            { value: 'risk', label: '状态：有风险' },
            { value: 'recent', label: '状态：最近更新' },
          ]}
        />

        <Select
          value={sortBy}
          onChange={(value) => onSortByChange(value as TemplateSortBy)}
          style={{ width: 190 }}
          options={[
            { value: 'updated', label: '排序：最近更新' },
            { value: 'cycle', label: '排序：周期最长' },
            { value: 'name', label: '排序：名称' },
          ]}
        />

        <Segmented
          value={density}
          onChange={(value) => onDensityChange(value as TemplateDensity)}
          options={[
            { label: '卡片', value: 'card' },
            { label: '紧凑', value: 'compact' },
          ]}
        />

        <div className="ml-auto text-xs text-slate-500">共 {resultCount} 个模板</div>
      </div>
    </section>
  );
};

export default TemplateListToolbar;

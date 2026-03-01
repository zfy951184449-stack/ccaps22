import React, { useMemo } from 'react';
import { Select, Button, Space } from 'antd';
import { FilterOutlined, CloseCircleOutlined } from '@ant-design/icons';
import type { BatchPlan, ProcessTemplate } from '../../types';

export interface TeamOption {
    team_code: string;
    team_name: string;
}

interface BatchFilterBarProps {
    batches: BatchPlan[];
    templates: ProcessTemplate[];

    // 筛选状态
    selectedBatchIds: number[];
    selectedTemplateIds: number[];
    selectedTeamCodes: string[];

    // 回调
    onBatchChange: (ids: number[]) => void;
    onTemplateChange: (ids: number[]) => void;
    onTeamChange: (codes: string[]) => void;
    onClear: () => void;
}

/**
 * BatchFilterBar - Apple HIG 风格的筛选栏组件
 * 
 * 支持三级联动筛选：Team → 工艺模版 → 批次
 */
const BatchFilterBar: React.FC<BatchFilterBarProps> = ({
    batches,
    templates,
    selectedBatchIds,
    selectedTemplateIds,
    selectedTeamCodes,
    onBatchChange,
    onTemplateChange,
    onTeamChange,
    onClear,
}) => {
    const selectedTemplateIdSet = useMemo(() => new Set(selectedTemplateIds), [selectedTemplateIds]);
    const selectedTeamCodeSet = useMemo(() => new Set(selectedTeamCodes), [selectedTeamCodes]);
    const templateTeamCodeById = useMemo(() => {
        const entries = templates
            .filter((template): template is ProcessTemplate & { id: number } => typeof template.id === 'number')
            .map((template) => [template.id, template.team_code] as const);
        return new Map<number, string | undefined>(entries);
    }, [templates]);

    // 从模版中提取唯一的 Team 列表
    const teams = useMemo<TeamOption[]>(() => {
        const teamMap = new Map<string, string>();
        templates.forEach((t) => {
            if (t.team_code && t.team_name) {
                teamMap.set(t.team_code, t.team_name);
            }
        });
        return Array.from(teamMap.entries()).map(([code, name]) => ({
            team_code: code,
            team_name: name,
        }));
    }, [templates]);

    // 根据选中的 Team 过滤可选的模版
    const filteredTemplates = useMemo(() => {
        if (selectedTeamCodeSet.size === 0) {
            return templates;
        }
        return templates.filter((t) => t.team_code && selectedTeamCodeSet.has(t.team_code));
    }, [selectedTeamCodeSet, templates]);

    // 根据选中的模版过滤可选的批次
    const filteredBatchOptions = useMemo(() => {
        if (selectedTemplateIdSet.size === 0 && selectedTeamCodeSet.size === 0) {
            return batches;
        }
        return batches.filter((b) => {
            // 如果选了模版，批次必须属于选中的模版
            if (selectedTemplateIdSet.size > 0 && !selectedTemplateIdSet.has(b.template_id)) {
                return false;
            }
            // 如果选了 Team（但没选模版），批次的模版必须属于选中的 Team
            if (selectedTeamCodeSet.size > 0 && selectedTemplateIdSet.size === 0) {
                const batchTeamCode = b.team_code ?? templateTeamCodeById.get(b.template_id);
                if (!batchTeamCode || !selectedTeamCodeSet.has(batchTeamCode)) {
                    return false;
                }
            }
            return true;
        });
    }, [batches, selectedTemplateIdSet, selectedTeamCodeSet, templateTeamCodeById]);

    // 是否有任何筛选条件
    const hasFilters = selectedBatchIds.length > 0 || selectedTemplateIds.length > 0 || selectedTeamCodes.length > 0;

    // 样式常量
    const styles = {
        container: {
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            background: 'rgba(255, 255, 255, 0.6)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            boxShadow: '0 2px 12px rgba(0, 0, 0, 0.04)',
            marginBottom: 16,
        },
        label: {
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: '#8E8E93',
            fontSize: 13,
            fontWeight: 500 as const,
            whiteSpace: 'nowrap' as const,
        },
        select: {
            minWidth: 160,
        },
        clearButton: {
            borderRadius: 8,
            border: 'none',
            background: hasFilters ? 'rgba(255, 59, 48, 0.1)' : 'transparent',
            color: hasFilters ? '#FF3B30' : '#8E8E93',
        },
    };

    return (
        <div style={styles.container}>
            <span style={styles.label}>
                <FilterOutlined />
                筛选
            </span>

            <Space size={12} wrap>
                {/* Team 筛选 */}
                <Select
                    mode="multiple"
                    placeholder="所有 Team"
                    value={selectedTeamCodes}
                    onChange={onTeamChange}
                    style={styles.select}
                    allowClear
                    maxTagCount={1}
                    maxTagPlaceholder={(omittedValues) => `+${omittedValues.length}`}
                    options={teams.map((t) => ({
                        label: t.team_name,
                        value: t.team_code,
                    }))}
                />

                {/* 工艺模版筛选 */}
                <Select
                    mode="multiple"
                    placeholder="所有工艺模版"
                    value={selectedTemplateIds}
                    onChange={onTemplateChange}
                    style={{ ...styles.select, minWidth: 180 }}
                    allowClear
                    maxTagCount={1}
                    maxTagPlaceholder={(omittedValues) => `+${omittedValues.length}`}
                    options={filteredTemplates.map((t) => ({
                        label: t.template_name,
                        value: t.id,
                    }))}
                    filterOption={(input, option) =>
                        (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                    }
                    showSearch
                />

                {/* 批次筛选 */}
                <Select
                    mode="multiple"
                    placeholder="所有批次"
                    value={selectedBatchIds}
                    onChange={onBatchChange}
                    style={{ ...styles.select, minWidth: 200 }}
                    allowClear
                    maxTagCount={1}
                    maxTagPlaceholder={(omittedValues) => `+${omittedValues.length}`}
                    options={filteredBatchOptions.map((b) => ({
                        label: `${b.batch_code} - ${b.batch_name}`,
                        value: b.id,
                    }))}
                    filterOption={(input, option) =>
                        (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                    }
                    showSearch
                />
            </Space>

            {/* 清除按钮 */}
            <Button
                type="text"
                icon={<CloseCircleOutlined />}
                onClick={onClear}
                disabled={!hasFilters}
                style={styles.clearButton}
            >
                清除
            </Button>
        </div>
    );
};

export default BatchFilterBar;

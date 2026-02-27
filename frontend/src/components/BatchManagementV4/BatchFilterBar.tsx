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
        if (selectedTeamCodes.length === 0) {
            return templates;
        }
        return templates.filter((t) => t.team_code && selectedTeamCodes.includes(t.team_code));
    }, [templates, selectedTeamCodes]);

    // 根据选中的模版过滤可选的批次
    const filteredBatchOptions = useMemo(() => {
        if (selectedTemplateIds.length === 0 && selectedTeamCodes.length === 0) {
            return batches;
        }
        return batches.filter((b) => {
            // 如果选了模版，批次必须属于选中的模版
            if (selectedTemplateIds.length > 0 && !selectedTemplateIds.includes(b.template_id)) {
                return false;
            }
            // 如果选了 Team（但没选模版），批次的模版必须属于选中的 Team
            if (selectedTeamCodes.length > 0 && selectedTemplateIds.length === 0) {
                const template = templates.find((t) => t.id === b.template_id);
                if (!template || !template.team_code || !selectedTeamCodes.includes(template.team_code)) {
                    return false;
                }
            }
            return true;
        });
    }, [batches, templates, selectedTemplateIds, selectedTeamCodes]);

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

import React, { useMemo } from 'react';
import { WxbButton, WxbFilterBar, WxbIcon, WxbSelect } from '../wxb-ui';
import type { BatchPlan, ProcessTemplate } from '../../types';

export interface TeamOption {
    team_code: string;
    team_name: string;
}

interface BatchFilterBarProps {
    batches: BatchPlan[];
    templates: ProcessTemplate[];
    selectedBatchIds: number[];
    selectedTemplateIds: number[];
    selectedTeamCodes: string[];
    onBatchChange: (ids: number[]) => void;
    onTemplateChange: (ids: number[]) => void;
    onTeamChange: (codes: string[]) => void;
    onClear: () => void;
}

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

    const teams = useMemo<TeamOption[]>(() => {
        const teamMap = new Map<string, string>();
        templates.forEach((template) => {
            if (template.team_code && template.team_name) {
                teamMap.set(template.team_code, template.team_name);
            }
        });
        return Array.from(teamMap.entries()).map(([code, name]) => ({
            team_code: code,
            team_name: name,
        }));
    }, [templates]);

    const filteredTemplates = useMemo(() => {
        if (selectedTeamCodeSet.size === 0) {
            return templates;
        }
        return templates.filter((template) => template.team_code && selectedTeamCodeSet.has(template.team_code));
    }, [selectedTeamCodeSet, templates]);

    const filteredBatchOptions = useMemo(() => {
        if (selectedTemplateIdSet.size === 0 && selectedTeamCodeSet.size === 0) {
            return batches;
        }

        return batches.filter((batch) => {
            if (selectedTemplateIdSet.size > 0 && !selectedTemplateIdSet.has(batch.template_id)) {
                return false;
            }

            if (selectedTeamCodeSet.size > 0 && selectedTemplateIdSet.size === 0) {
                const batchTeamCode = batch.team_code ?? templateTeamCodeById.get(batch.template_id);
                if (!batchTeamCode || !selectedTeamCodeSet.has(batchTeamCode)) {
                    return false;
                }
            }

            return true;
        });
    }, [batches, selectedTemplateIdSet, selectedTeamCodeSet, templateTeamCodeById]);

    const hasFilters = selectedBatchIds.length > 0 || selectedTemplateIds.length > 0 || selectedTeamCodes.length > 0;

    return (
        <WxbFilterBar
            className="batch-filter-v4"
            leading={(
                <span className="batch-filter-v4__label">
                    <WxbIcon name="inspect" size={15} />
                    筛选
                </span>
            )}
            filters={(
                <div className="batch-filter-v4__controls">
                    <WxbSelect
                        mode="multiple"
                        placeholder="所有 Team"
                        value={selectedTeamCodes}
                        onChange={(value) => onTeamChange(value as string[])}
                        allowClear
                        maxTagCount={1}
                        maxTagPlaceholder={(omittedValues) => `+${omittedValues.length}`}
                        options={teams.map((team) => ({
                            label: team.team_name,
                            value: team.team_code,
                        }))}
                    />
                    <WxbSelect
                        mode="multiple"
                        placeholder="所有工艺模版"
                        value={selectedTemplateIds}
                        onChange={(value) => onTemplateChange(value as number[])}
                        allowClear
                        showSearch
                        maxTagCount={1}
                        maxTagPlaceholder={(omittedValues) => `+${omittedValues.length}`}
                        options={filteredTemplates
                            .filter((template): template is ProcessTemplate & { id: number } => typeof template.id === 'number')
                            .map((template) => ({
                                label: template.template_name,
                                value: template.id,
                            }))}
                        filterOption={(input, option) =>
                            String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                        }
                    />
                    <WxbSelect
                        mode="multiple"
                        placeholder="所有批次"
                        value={selectedBatchIds}
                        onChange={(value) => onBatchChange(value as number[])}
                        allowClear
                        showSearch
                        maxTagCount={1}
                        maxTagPlaceholder={(omittedValues) => `+${omittedValues.length}`}
                        options={filteredBatchOptions.map((batch) => ({
                            label: `${batch.batch_code} - ${batch.batch_name}`,
                            value: batch.id,
                        }))}
                        filterOption={(input, option) =>
                            String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                        }
                    />
                </div>
            )}
            actions={(
                <WxbButton
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={!hasFilters}
                    onClick={onClear}
                >
                    <WxbIcon name="rejected" size={14} />
                    清除
                </WxbButton>
            )}
        />
    );
};

export default BatchFilterBar;

import React from 'react';
import axios from 'axios';
import {
    Alert,
    Button,
    Card,
    Empty,
    InputNumber,
    Select,
    Space,
    Spin,
    Switch,
    Tag,
    Typography,
    message,
} from 'antd';
import { DeleteOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { API_BASE_URL } from '../../constants';
import {
    ResourceRequirementRule,
    ResourceRuleSourceScope,
} from '../../types';

const { Text } = Typography;

type ResourceType = ResourceRequirementRule['resource_type'];

type ResourceRecord = {
    id: number;
    resource_code: string;
    resource_name: string;
    resource_type: ResourceType;
    department_code?: string;
};

type TemplateRulesResponse = {
    template_schedule_id: number;
    operation_id: number;
    source_scope: ResourceRuleSourceScope;
    requirements: ResourceRequirementRule[];
};

const RESOURCE_TYPE_OPTIONS: Array<{ value: ResourceType; label: string }> = [
    { value: 'ROOM', label: 'ROOM' },
    { value: 'EQUIPMENT', label: 'EQUIPMENT' },
    { value: 'VESSEL_CONTAINER', label: 'VESSEL_CONTAINER' },
    { value: 'TOOLING', label: 'TOOLING' },
    { value: 'STERILIZATION_RESOURCE', label: 'STERILIZATION_RESOURCE' },
];

const SOURCE_META: Record<ResourceRuleSourceScope, { color: string; label: string }> = {
    TEMPLATE_OVERRIDE: { color: 'blue', label: '模板覆盖' },
    GLOBAL_DEFAULT: { color: 'gold', label: '默认规则' },
    BATCH_OVERRIDE: { color: 'purple', label: '批次覆盖' },
    NONE: { color: 'default', label: '未定义资源' },
};

const createEmptyRequirement = (): ResourceRequirementRule => ({
    id: null,
    resource_type: 'EQUIPMENT',
    required_count: 1,
    is_mandatory: true,
    requires_exclusive_use: true,
    prep_minutes: 0,
    changeover_minutes: 0,
    cleanup_minutes: 0,
    candidate_resource_ids: [],
    candidate_resources: [],
});

const normalizeRequirement = (requirement: any): ResourceRequirementRule => ({
    id: requirement.id ?? null,
    resource_type: requirement.resource_type,
    required_count: Number(requirement.required_count ?? 1),
    is_mandatory: requirement.is_mandatory !== false,
    requires_exclusive_use: requirement.requires_exclusive_use !== false,
    prep_minutes: Number(requirement.prep_minutes ?? 0),
    changeover_minutes: Number(requirement.changeover_minutes ?? 0),
    cleanup_minutes: Number(requirement.cleanup_minutes ?? 0),
    candidate_resource_ids: (requirement.candidate_resource_ids ?? []).map((id: unknown) => Number(id)),
    candidate_resources: (requirement.candidate_resources ?? []).map((resource: any) => ({
        id: Number(resource.id),
        resource_code: String(resource.resource_code ?? ''),
        resource_name: String(resource.resource_name ?? ''),
        resource_type: resource.resource_type,
    })),
});

interface TemplateResourceRulesTabContentProps {
    scheduleId?: number;
    visible: boolean;
    onRulesChanged?: () => Promise<void> | void;
}

export const TemplateResourceRulesTabContent: React.FC<TemplateResourceRulesTabContentProps> = ({
    scheduleId,
    visible,
    onRulesChanged,
}) => {
    const [loading, setLoading] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [rules, setRules] = React.useState<ResourceRequirementRule[]>([]);
    const [sourceScope, setSourceScope] = React.useState<ResourceRuleSourceScope>('NONE');
    const [resources, setResources] = React.useState<ResourceRecord[]>([]);
    const [featureError, setFeatureError] = React.useState<string | null>(null);

    const loadResources = React.useCallback(async () => {
        const response = await axios.get(`${API_BASE_URL}/resources`, {
            params: { is_schedulable: true },
        });
        const payload = Array.isArray(response.data) ? response.data : response.data?.data ?? [];
        setResources(payload.map((item: any) => ({
            id: Number(item.id),
            resource_code: String(item.resource_code ?? ''),
            resource_name: String(item.resource_name ?? ''),
            resource_type: item.resource_type,
            department_code: item.department_code ? String(item.department_code) : undefined,
        })));
    }, []);

    const loadRules = React.useCallback(async () => {
        if (!scheduleId || !visible) {
            return;
        }

        setLoading(true);
        setFeatureError(null);

        try {
            const [rulesResponse] = await Promise.all([
                axios.get<TemplateRulesResponse>(`${API_BASE_URL}/template-stage-operations/${scheduleId}/resources`),
                resources.length ? Promise.resolve() : loadResources(),
            ]);

            setSourceScope(rulesResponse.data.source_scope ?? 'NONE');
            setRules((rulesResponse.data.requirements ?? []).map(normalizeRequirement));
        } catch (error: any) {
            if (error?.response?.status === 404 || error?.response?.status === 409) {
                setFeatureError(error?.response?.data?.error ?? '模板资源规则功能未启用');
                setSourceScope('NONE');
                setRules([]);
                return;
            }

            console.error('Failed to load template resource rules:', error);
            message.error('加载资源规则失败');
        } finally {
            setLoading(false);
        }
    }, [loadResources, resources.length, scheduleId, visible]);

    React.useEffect(() => {
        loadRules();
    }, [loadRules]);

    const handleRequirementChange = React.useCallback((index: number, patch: Partial<ResourceRequirementRule>) => {
        setRules((current) => current.map((item, itemIndex) => {
            if (itemIndex !== index) {
                return item;
            }

            const next = { ...item, ...patch };
            if (patch.resource_type && patch.resource_type !== item.resource_type) {
                next.candidate_resource_ids = [];
                next.candidate_resources = [];
            }
            return next;
        }));
    }, []);

    const handleAddRequirement = React.useCallback(() => {
        setRules((current) => [...current, createEmptyRequirement()]);
        setSourceScope((current) => (current === 'NONE' ? 'TEMPLATE_OVERRIDE' : current));
    }, []);

    const handleDeleteRequirement = React.useCallback((index: number) => {
        setRules((current) => current.filter((_, itemIndex) => itemIndex !== index));
    }, []);

    const handleSave = React.useCallback(async () => {
        if (!scheduleId) {
            return;
        }

        setSaving(true);
        try {
            await axios.put(`${API_BASE_URL}/template-stage-operations/${scheduleId}/resources`, {
                requirements: rules.map((rule) => ({
                    resource_type: rule.resource_type,
                    required_count: rule.required_count,
                    is_mandatory: rule.is_mandatory,
                    requires_exclusive_use: rule.requires_exclusive_use,
                    prep_minutes: rule.prep_minutes,
                    changeover_minutes: rule.changeover_minutes,
                    cleanup_minutes: rule.cleanup_minutes,
                    candidate_resource_ids: rule.candidate_resource_ids,
                })),
            });
            message.success('模板资源规则已保存');
            await loadRules();
            await onRulesChanged?.();
        } catch (error: any) {
            console.error('Failed to save template resource rules:', error);
            message.error(error?.response?.data?.error ?? '保存资源规则失败');
        } finally {
            setSaving(false);
        }
    }, [loadRules, onRulesChanged, rules, scheduleId]);

    const handleDeleteOverride = React.useCallback(async () => {
        if (!scheduleId) {
            return;
        }

        setSaving(true);
        try {
            await axios.delete(`${API_BASE_URL}/template-stage-operations/${scheduleId}/resources`);
            message.success('已删除模板覆盖，已回退默认规则');
            await loadRules();
            await onRulesChanged?.();
        } catch (error: any) {
            console.error('Failed to delete template overrides:', error);
            message.error(error?.response?.data?.error ?? '删除模板覆盖失败');
        } finally {
            setSaving(false);
        }
    }, [loadRules, onRulesChanged, scheduleId]);

    if (!scheduleId) {
        return (
            <Alert
                type="info"
                showIcon
                message="请先保存操作"
                description="新建操作保存后才能绑定模板级资源规则。"
            />
        );
    }

    if (loading) {
        return (
            <div style={{ padding: 24, textAlign: 'center' }}>
                <Spin />
            </div>
        );
    }

    if (featureError) {
        return (
            <Alert
                type="warning"
                showIcon
                message="模板资源规则功能不可用"
                description={featureError}
            />
        );
    }

    return (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Alert
                type={sourceScope === 'TEMPLATE_OVERRIDE' ? 'success' : sourceScope === 'GLOBAL_DEFAULT' ? 'info' : 'warning'}
                showIcon
                message={
                    <Space>
                        <span>资源规则来源</span>
                        <Tag color={SOURCE_META[sourceScope].color}>{SOURCE_META[sourceScope].label}</Tag>
                    </Space>
                }
                description={
                    sourceScope === 'TEMPLATE_OVERRIDE'
                        ? '当前操作已存在模板级覆盖，保存后只影响本模板。'
                        : sourceScope === 'GLOBAL_DEFAULT'
                            ? '当前显示的是 operation 默认规则。保存后会创建模板覆盖，不会改全局默认规则。'
                            : '当前操作尚未定义资源规则。保存后会在当前模板内创建资源规则。'
                }
            />

            <Space wrap>
                <Button icon={<PlusOutlined />} onClick={handleAddRequirement}>
                    新增资源需求
                </Button>
                <Button icon={<ReloadOutlined />} onClick={loadRules}>
                    刷新
                </Button>
                <Button type="primary" loading={saving} onClick={handleSave}>
                    保存模板覆盖
                </Button>
                {sourceScope === 'TEMPLATE_OVERRIDE' && (
                    <Button danger loading={saving} onClick={handleDeleteOverride}>
                        删除覆盖并回退默认
                    </Button>
                )}
            </Space>

            {rules.length === 0 ? (
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="当前没有模板级资源需求，可新增覆盖规则。"
                />
            ) : (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    {rules.map((rule, index) => {
                        const candidateOptions = resources.filter((resource) => resource.resource_type === rule.resource_type);

                        return (
                            <Card
                                key={`${rule.resource_type}-${index}`}
                                size="small"
                                title={
                                    <Space>
                                        <Text strong>资源需求 {index + 1}</Text>
                                        <Tag>{rule.resource_type}</Tag>
                                    </Space>
                                }
                                extra={
                                    <Button
                                        type="text"
                                        danger
                                        icon={<DeleteOutlined />}
                                        onClick={() => handleDeleteRequirement(index)}
                                    />
                                }
                            >
                                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                                    <Select<ResourceType>
                                        value={rule.resource_type}
                                        options={RESOURCE_TYPE_OPTIONS}
                                        onChange={(value) => handleRequirementChange(index, { resource_type: value })}
                                    />
                                    <Space wrap>
                                        <InputNumber
                                            min={1}
                                            value={rule.required_count}
                                            addonBefore="数量"
                                            onChange={(value) => handleRequirementChange(index, { required_count: Number(value ?? 1) })}
                                        />
                                        <InputNumber
                                            min={0}
                                            value={rule.prep_minutes}
                                            addonBefore="Prep"
                                            addonAfter="min"
                                            onChange={(value) => handleRequirementChange(index, { prep_minutes: Number(value ?? 0) })}
                                        />
                                        <InputNumber
                                            min={0}
                                            value={rule.changeover_minutes}
                                            addonBefore="切换"
                                            addonAfter="min"
                                            onChange={(value) => handleRequirementChange(index, { changeover_minutes: Number(value ?? 0) })}
                                        />
                                        <InputNumber
                                            min={0}
                                            value={rule.cleanup_minutes}
                                            addonBefore="清洁"
                                            addonAfter="min"
                                            onChange={(value) => handleRequirementChange(index, { cleanup_minutes: Number(value ?? 0) })}
                                        />
                                    </Space>
                                    <Space wrap>
                                        <Space>
                                            <Switch
                                                checked={rule.is_mandatory}
                                                onChange={(checked) => handleRequirementChange(index, { is_mandatory: checked })}
                                            />
                                            <Text>硬约束</Text>
                                        </Space>
                                        <Space>
                                            <Switch
                                                checked={rule.requires_exclusive_use}
                                                onChange={(checked) => handleRequirementChange(index, { requires_exclusive_use: checked })}
                                            />
                                            <Text>独占资源</Text>
                                        </Space>
                                    </Space>
                                    <Select
                                        mode="multiple"
                                        placeholder="候选资源为空时表示按资源类型匹配"
                                        value={rule.candidate_resource_ids}
                                        onChange={(value) => handleRequirementChange(index, { candidate_resource_ids: (value as Array<string | number>).map(Number) })}
                                        options={candidateOptions.map((resource) => ({
                                            value: resource.id,
                                            label: `${resource.resource_code} / ${resource.resource_name}${resource.department_code ? ` / ${resource.department_code}` : ''}`,
                                        }))}
                                    />
                                </Space>
                            </Card>
                        );
                    })}
                </Space>
            )}
        </Space>
    );
};

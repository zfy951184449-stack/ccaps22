import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import type { WxbDataTableProps } from '../components/wxb-ui/DataTable/DataTable';
import { WxbButton } from '../components/wxb-ui/Button/Button';
import { WxbDataTable } from '../components/wxb-ui/DataTable/DataTable';
import { WxbEmpty } from '../components/wxb-ui/Empty/Empty';
import { WxbFormField } from '../components/wxb-ui/FormField/FormField';
import { WxbInput } from '../components/wxb-ui/Input/Input';
import { WxbInputNumber } from '../components/wxb-ui/InputNumber/InputNumber';
import { WxbModal } from '../components/wxb-ui/Modal/WxbModal';
import {
    WxbPageHeader,
    WxbPageSection,
    WxbPageShell,
} from '../components/wxb-ui/PageLayout/PageLayout';
import { WxbPopconfirm } from '../components/wxb-ui/Popconfirm/Popconfirm';
import { WxbSelect } from '../components/wxb-ui/Select/Select';
import { WxbTabs } from '../components/wxb-ui/Tabs/Tabs';
import { WxbTag, type WxbTagColor } from '../components/wxb-ui/Tag/Tag';
import { WxbTooltip } from '../components/wxb-ui/Tooltip/Tooltip';
import { wxbToast } from '../components/wxb-ui/Toast/Toast';
import './OperationTypesPage.css';

type OperationCategory = 'MONITOR' | 'PROCESS' | 'PREP';
type ColorToken = 'blue' | 'green' | 'amber' | 'red' | 'cyan' | 'neutral';
type FormColorToken = ColorToken | 'legacy';

interface OperationType {
    id: number;
    type_code: string;
    type_name: string;
    team_id: number;
    team_code: string;
    team_name: string;
    color: string;
    category: OperationCategory;
    display_order: number;
    is_active: boolean;
}

interface Team {
    id: number;
    unit_code: string;
    unit_name: string;
}

interface OperationTypeFormState {
    type_code: string;
    type_name: string;
    team_id: number | null;
    category: OperationCategory;
    colorToken: FormColorToken;
    colorValue: string;
    display_order: number;
}

type FormErrors = Partial<Record<keyof OperationTypeFormState, string>>;

interface ColorOption {
    token: ColorToken;
    label: string;
    variableName: string;
}

interface CategoryMeta {
    label: string;
    tagColor: WxbTagColor;
    defaultColorToken: ColorToken;
}

type OperationIconName = 'plus' | 'refresh' | 'edit' | 'delete';

const COLOR_OPTIONS: ColorOption[] = [
    { token: 'blue', label: '蓝色', variableName: '--wx-blue-500' },
    { token: 'green', label: '绿色', variableName: '--wx-green-500' },
    { token: 'amber', label: '琥珀色', variableName: '--wx-amber-500' },
    { token: 'red', label: '红色', variableName: '--wx-red-500' },
    { token: 'cyan', label: '青色', variableName: '--wx-blue-400' },
    { token: 'neutral', label: '中性色', variableName: '--wx-fg-4' },
];

const CATEGORY_META: Record<OperationCategory, CategoryMeta> = {
    PROCESS: { label: '工艺类', tagColor: 'blue', defaultColorToken: 'blue' },
    PREP: { label: '准备/收尾类', tagColor: 'green', defaultColorToken: 'green' },
    MONITOR: { label: '监控类', tagColor: 'amber', defaultColorToken: 'amber' },
};

const DEFAULT_COLOR_TOKEN: ColorToken = 'blue';

const DEFAULT_FORM_STATE: OperationTypeFormState = {
    type_code: '',
    type_name: '',
    team_id: null,
    category: 'PROCESS',
    colorToken: DEFAULT_COLOR_TOKEN,
    colorValue: '',
    display_order: 0,
};

const OPERATION_CODE_PATTERN = /^[A-Za-z_]+$/;

const toUpperOperationCode = (value: string) => value.trimStart().toUpperCase();

const normalizeColorValue = (value?: string | null) =>
    String(value || '').replace(/\s+/g, '').toLowerCase();

const readCssVariable = (variableName: string) => {
    if (typeof window === 'undefined') return `var(${variableName})`;
    const resolved = window.getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
    return resolved || `var(${variableName})`;
};

const resolveColorTokenValue = (token: ColorToken) => {
    const option = COLOR_OPTIONS.find((item) => item.token === token) ?? COLOR_OPTIONS[0];
    return readCssVariable(option.variableName);
};

const getColorTokenLabel = (token: FormColorToken) => {
    if (token === 'legacy') return '沿用当前颜色';
    return COLOR_OPTIONS.find((item) => item.token === token)?.label ?? '蓝色';
};

const inferExactColorToken = (value?: string | null): ColorToken | undefined => {
    const normalizedValue = normalizeColorValue(value);
    if (!normalizedValue) return undefined;

    return COLOR_OPTIONS.find((option) =>
        normalizeColorValue(readCssVariable(option.variableName)) === normalizedValue
    )?.token;
};

const getDisplayColorToken = (record: OperationType): ColorToken =>
    inferExactColorToken(record.color) ?? CATEGORY_META[record.category]?.defaultColorToken ?? 'blue';

const getInitialFormState = (activeTeamId: string): OperationTypeFormState => ({
    ...DEFAULT_FORM_STATE,
    team_id: activeTeamId !== 'all' ? Number.parseInt(activeTeamId, 10) : null,
    colorValue: resolveColorTokenValue(DEFAULT_COLOR_TOKEN),
});

const getFormStateFromRecord = (record: OperationType): OperationTypeFormState => {
    const exactColorToken = inferExactColorToken(record.color);

    return {
        type_code: record.type_code,
        type_name: record.type_name,
        team_id: record.team_id,
        category: record.category,
        colorToken: exactColorToken ?? 'legacy',
        colorValue: record.color || resolveColorTokenValue(CATEGORY_META[record.category].defaultColorToken),
        display_order: record.display_order ?? 0,
    };
};

const validateForm = (formState: OperationTypeFormState): FormErrors => {
    const nextErrors: FormErrors = {};
    const operationCode = formState.type_code.trim();

    if (!operationCode) {
        nextErrors.type_code = '请输入类型代码';
    } else if (!OPERATION_CODE_PATTERN.test(operationCode)) {
        nextErrors.type_code = '仅允许英文字母和下划线';
    }

    if (!formState.type_name.trim()) {
        nextErrors.type_name = '请输入类型名称';
    }

    if (!formState.team_id) {
        nextErrors.team_id = '请选择所属Team';
    }

    if (!formState.category) {
        nextErrors.category = '请选择分类';
    }

    if (!Number.isFinite(formState.display_order) || formState.display_order < 0) {
        nextErrors.display_order = '排序值不能小于 0';
    }

    return nextErrors;
};

const OperationIcon: React.FC<{ name: OperationIconName }> = ({ name }) => {
    const paths: Record<OperationIconName, React.ReactNode> = {
        plus: (
            <>
                <path d="M12 5v14" />
                <path d="M5 12h14" />
            </>
        ),
        refresh: (
            <>
                <path d="M20 12a8 8 0 0 1-13.5 5.8" />
                <path d="M4 12A8 8 0 0 1 17.5 6.2" />
                <path d="M17 3v4h-4" />
                <path d="M7 21v-4h4" />
            </>
        ),
        edit: (
            <>
                <path d="M4 20h16" />
                <path d="M14.5 5.5 18 9 9 18H5.5v-3.5l9-9Z" />
            </>
        ),
        delete: (
            <>
                <path d="M5 7h14" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M8 7l1 12h6l1-12" />
                <path d="M10 7V5h4v2" />
            </>
        ),
    };

    return (
        <svg
            className="operation-types-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
        >
            {paths[name]}
        </svg>
    );
};

const OperationTypesPage: React.FC = () => {
    const [types, setTypes] = useState<OperationType[]>([]);
    const [teams, setTeams] = useState<Team[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingType, setEditingType] = useState<OperationType | null>(null);
    const [activeTeamId, setActiveTeamId] = useState<string>('all');
    const [submitting, setSubmitting] = useState(false);
    const [formState, setFormState] = useState<OperationTypeFormState>(() => getInitialFormState('all'));
    const [formErrors, setFormErrors] = useState<FormErrors>({});

    const fetchData = useCallback(async () => {
        setLoading(true);
        setLoadError(false);
        try {
            const [typesRes, teamsRes] = await Promise.all([
                axios.get<OperationType[]>('/api/operation-types'),
                axios.get<Team[]>('/api/organization/teams'),
            ]);
            setTypes(typesRes.data);
            setTeams(teamsRes.data);
        } catch {
            setLoadError(true);
            wxbToast.error('加载操作类型失败');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const updateFormField = useCallback(
        <K extends keyof OperationTypeFormState>(field: K, value: OperationTypeFormState[K]) => {
            setFormState((current) => ({ ...current, [field]: value }));
            setFormErrors((current) => {
                if (!current[field]) return current;
                const nextErrors = { ...current };
                delete nextErrors[field];
                return nextErrors;
            });
        },
        [],
    );

    const handleAdd = useCallback(() => {
        setEditingType(null);
        setFormState(getInitialFormState(activeTeamId));
        setFormErrors({});
        setModalVisible(true);
    }, [activeTeamId]);

    const handleEdit = useCallback((record: OperationType) => {
        setEditingType(record);
        setFormState(getFormStateFromRecord(record));
        setFormErrors({});
        setModalVisible(true);
    }, []);

    const closeModal = useCallback(() => {
        if (submitting) return;
        setModalVisible(false);
        setEditingType(null);
        setFormErrors({});
    }, [submitting]);

    const handleDelete = useCallback(
        async (id: number) => {
            try {
                await axios.delete(`/api/operation-types/${id}`);
                wxbToast.success('已删除/停用');
                fetchData();
            } catch {
                wxbToast.error('删除失败');
            }
        },
        [fetchData],
    );

    const buildPayload = useCallback(() => ({
        type_code: formState.type_code.trim().toUpperCase(),
        type_name: formState.type_name.trim(),
        team_id: formState.team_id,
        category: formState.category,
        color: formState.colorToken === 'legacy'
            ? formState.colorValue
            : resolveColorTokenValue(formState.colorToken),
        display_order: formState.display_order,
    }), [formState]);

    const handleSubmit = useCallback(async () => {
        const nextErrors = validateForm(formState);
        setFormErrors(nextErrors);

        if (Object.keys(nextErrors).length > 0) {
            wxbToast.warning('请先修正表单内容');
            return;
        }

        setSubmitting(true);
        try {
            const payload = buildPayload();
            if (editingType) {
                await axios.put(`/api/operation-types/${editingType.id}`, payload);
                wxbToast.success('更新成功');
            } else {
                await axios.post('/api/operation-types', payload);
                wxbToast.success('创建成功');
            }

            setModalVisible(false);
            setEditingType(null);
            setFormErrors({});
            fetchData();
        } catch (err: any) {
            if (err.response?.status === 409) {
                wxbToast.error('类型代码已存在');
                setFormErrors((current) => ({ ...current, type_code: '类型代码已存在' }));
            } else {
                wxbToast.error('保存失败');
            }
        } finally {
            setSubmitting(false);
        }
    }, [buildPayload, editingType, fetchData, formState]);

    const filteredTypes = useMemo(() => {
        if (activeTeamId === 'all') return types;
        const parsedTeamId = Number.parseInt(activeTeamId, 10);
        return types.filter((type) => type.team_id === parsedTeamId);
    }, [types, activeTeamId]);

    const tabItems = useMemo(() => [
        { key: 'all', label: `全部 (${types.length})` },
        ...teams.map((team) => {
            const count = types.filter((type) => type.team_id === team.id).length;
            return { key: team.id.toString(), label: `${team.unit_name} (${count})` };
        }),
    ], [teams, types]);

    const colorSelectOptions = useMemo(() => {
        const options = COLOR_OPTIONS.map((option) => ({
            value: option.token,
            label: (
                <span className="operation-color-option">
                    <span className={`operation-color-swatch is-${option.token}`} aria-hidden="true" />
                    <span>{option.label}</span>
                </span>
            ),
        }));

        if (formState.colorToken === 'legacy') {
            return [
                {
                    value: 'legacy',
                    label: (
                        <span className="operation-color-option">
                            <span className={`operation-color-swatch is-${CATEGORY_META[formState.category].defaultColorToken}`} aria-hidden="true" />
                            <span>沿用当前颜色</span>
                        </span>
                    ),
                },
                ...options,
            ];
        }

        return options;
    }, [formState.category, formState.colorToken]);

    const categorySelectOptions = useMemo(() =>
        (Object.entries(CATEGORY_META) as Array<[OperationCategory, CategoryMeta]>).map(([value, meta]) => ({
            value,
            label: <WxbTag color={meta.tagColor}>{meta.label}</WxbTag>,
        })),
    []);

    const columns: WxbDataTableProps<OperationType>['columns'] = useMemo(() => [
        {
            title: '类型代码',
            dataIndex: 'type_code',
            width: 160,
            sorter: (a, b) => a.type_code.localeCompare(b.type_code),
            render: (value: string) => <WxbTag color="blue">{value}</WxbTag>,
        },
        {
            title: '类型名称',
            dataIndex: 'type_name',
            width: 170,
            sorter: (a, b) => a.type_name.localeCompare(b.type_name),
        },
        {
            title: '所属 Team',
            dataIndex: 'team_name',
            width: 140,
            render: (_value: string, record) => (
                <WxbTag color="neutral">{record.team_code} - {record.team_name}</WxbTag>
            ),
        },
        {
            title: '显示色',
            dataIndex: 'color',
            width: 140,
            render: (_value: string, record) => {
                const token = getDisplayColorToken(record);
                return (
                    <span className="operation-color-cell">
                        <span className={`operation-color-swatch is-${token}`} aria-hidden="true" />
                        <span>{getColorTokenLabel(token)}</span>
                    </span>
                );
            },
        },
        {
            title: '分类',
            dataIndex: 'category',
            width: 130,
            filters: (Object.entries(CATEGORY_META) as Array<[OperationCategory, CategoryMeta]>)
                .map(([value, meta]) => ({ text: meta.label, value })),
            onFilter: (value, record) => record.category === value,
            render: (category: OperationCategory) => {
                const meta = CATEGORY_META[category] ?? CATEGORY_META.PROCESS;
                return <WxbTag color={meta.tagColor}>{meta.label}</WxbTag>;
            },
        },
        {
            title: '排序',
            dataIndex: 'display_order',
            width: 90,
            sorter: (a, b) => a.display_order - b.display_order,
            render: (value: number) => <span className="operation-order-value">{value}</span>,
        },
        {
            title: '操作',
            width: 120,
            render: (_value, record) => (
                <span className="operation-table-actions">
                    <WxbTooltip title="编辑">
                        <WxbButton
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`编辑 ${record.type_name}`}
                            onClick={() => handleEdit(record)}
                        >
                            <OperationIcon name="edit" />
                        </WxbButton>
                    </WxbTooltip>
                    <WxbPopconfirm
                        title="确定要删除/停用此操作类型？"
                        description="如果该类型已被操作使用，将变为停用状态。"
                        okText="删除/停用"
                        cancelText="取消"
                        onConfirm={() => handleDelete(record.id)}
                    >
                        <WxbButton
                            type="button"
                            variant="danger"
                            size="sm"
                            aria-label={`删除 ${record.type_name}`}
                        >
                            <OperationIcon name="delete" />
                        </WxbButton>
                    </WxbPopconfirm>
                </span>
            ),
        },
    ], [handleDelete, handleEdit]);

    return (
        <WxbPageShell size="full" gap="lg" className="operation-types-page">
            <WxbPageHeader
                eyebrow="Master Data"
                title="操作类型管理"
                description="维护 USP、DSP、Buffer 等团队的标准操作类型，供工艺模板、排班求解和资源需求复用。"
                meta={(
                    <>
                        <WxbTag color="blue">共 {types.length} 项</WxbTag>
                        <WxbTag color="green">{teams.length} 个 Team</WxbTag>
                    </>
                )}
                actions={(
                    <>
                        <WxbButton
                            type="button"
                            variant="secondary"
                            onClick={fetchData}
                            disabled={loading}
                        >
                            <OperationIcon name="refresh" />
                            {loading ? '刷新中...' : '刷新'}
                        </WxbButton>
                        <WxbButton type="button" variant="primary" onClick={handleAdd}>
                            <OperationIcon name="plus" />
                            新增类型
                        </WxbButton>
                    </>
                )}
            />

            <WxbPageSection variant="framed" density="compact" className="operation-types-section">
                <WxbTabs
                    activeKey={activeTeamId}
                    onChange={setActiveTeamId}
                    items={tabItems}
                    className="operation-types-tabs"
                />

                <WxbDataTable<OperationType>
                    columns={columns}
                    dataSource={filteredTypes}
                    rowKey="id"
                    loading={loading}
                    density="compact"
                    emptyState={{
                        description: activeTeamId === 'all' ? '暂无操作类型' : '当前 Team 暂无操作类型',
                        action: <WxbButton type="button" variant="secondary" onClick={handleAdd}>新增类型</WxbButton>,
                    }}
                    errorState={loadError ? {
                        title: '操作类型加载失败',
                        description: '请检查后端服务或稍后重试。',
                        action: <WxbButton type="button" variant="secondary" onClick={fetchData}>重新加载</WxbButton>,
                    } : undefined}
                    pagination={{
                        pageSize: 20,
                        showSizeChanger: true,
                        showTotal: (total) => `共 ${total} 条`,
                    }}
                />
            </WxbPageSection>

            <WxbModal
                title={editingType ? '编辑操作类型' : '新增操作类型'}
                open={modalVisible}
                onCancel={closeModal}
                onOk={handleSubmit}
                confirmLoading={submitting}
                okText={editingType ? '保存修改' : '创建类型'}
                cancelText="取消"
                width={560}
                destroyOnClose
            >
                <form
                    className="operation-type-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        handleSubmit();
                    }}
                >
                    <div className="operation-type-form-grid">
                        <WxbInput
                            label="类型代码"
                            value={formState.type_code}
                            placeholder="如 CELL_CULTURE"
                            disabled={Boolean(editingType)}
                            error={formErrors.type_code}
                            helpText="仅允许英文字母和下划线，保存时会转换为大写。"
                            onChange={(event) => updateFormField('type_code', toUpperOperationCode(event.target.value))}
                        />
                        <WxbInput
                            label="类型名称"
                            value={formState.type_name}
                            placeholder="如 细胞培养"
                            error={formErrors.type_name}
                            onChange={(event) => updateFormField('type_name', event.target.value)}
                        />
                    </div>

                    <WxbSelect
                        label="所属 Team"
                        value={formState.team_id ?? undefined}
                        placeholder="请选择 Team"
                        error={formErrors.team_id}
                        options={teams.map((team) => ({
                            value: team.id,
                            label: `${team.unit_code} - ${team.unit_name}`,
                        }))}
                        onChange={(value) => updateFormField('team_id', Number(value))}
                    />

                    <WxbSelect
                        label="分类"
                        value={formState.category}
                        placeholder="请选择分类"
                        error={formErrors.category}
                        options={categorySelectOptions}
                        onChange={(value) => {
                            const nextCategory = value as OperationCategory;
                            updateFormField('category', nextCategory);
                            if (formState.colorToken !== 'legacy') {
                                updateFormField('colorToken', CATEGORY_META[nextCategory].defaultColorToken);
                            }
                        }}
                    />

                    <div className="operation-type-form-grid">
                        <WxbSelect
                            label="显示颜色"
                            value={formState.colorToken}
                            placeholder="选择颜色"
                            options={colorSelectOptions}
                            optionLabelProp="label"
                            onChange={(value) => updateFormField('colorToken', value as FormColorToken)}
                        />
                        <WxbInputNumber
                            label="排序值"
                            min={0}
                            precision={0}
                            value={formState.display_order}
                            error={formErrors.display_order}
                            onChange={(value) => updateFormField('display_order', Number(value ?? 0))}
                        />
                    </div>

                    <WxbFormField helpText="分类影响求解器排班优先级；显示颜色用于操作类型在模板与排班视图中的识别。">
                        <WxbEmpty
                            className="operation-form-hint"
                            image={<span className={`operation-color-preview is-${formState.colorToken === 'legacy' ? CATEGORY_META[formState.category].defaultColorToken : formState.colorToken}`} />}
                            description={`${CATEGORY_META[formState.category].label} · ${getColorTokenLabel(formState.colorToken)}`}
                        />
                    </WxbFormField>
                </form>
            </WxbModal>
        </WxbPageShell>
    );
};

export default OperationTypesPage;

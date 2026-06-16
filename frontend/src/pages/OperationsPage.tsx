import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import type { WxbDataTableProps } from '../components/wxb-ui/DataTable/DataTable';
import { WxbBadge } from '../components/wxb-ui/Badge/Badge';
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
    WxbPageToolbar,
} from '../components/wxb-ui/PageLayout/PageLayout';
import { WxbPopconfirm } from '../components/wxb-ui/Popconfirm/Popconfirm';
import { WxbSearchInput } from '../components/wxb-ui/SearchInput/SearchInput';
import { WxbSelect } from '../components/wxb-ui/Select/Select';
import { WxbTabs } from '../components/wxb-ui/Tabs/Tabs';
import { WxbTag } from '../components/wxb-ui/Tag/Tag';
import { WxbTextarea } from '../components/wxb-ui/Textarea/Textarea';
import { WxbTooltip } from '../components/wxb-ui/Tooltip/Tooltip';
import { wxbToast } from '../components/wxb-ui/Toast/Toast';
import OperationQualificationModal from '../components/OperationQualificationModal';
import './OperationsPage.css';

type OperationIconName = 'plus' | 'refresh' | 'edit' | 'delete' | 'clock' | 'people' | 'shield';

interface Operation {
    id: number;
    operation_code: string;
    operation_name: string;
    standard_time: number;
    required_people?: number;
    description?: string | null;
    qualification_count?: number;
    operation_type_id?: number | null;
    operation_type_code?: string | null;
    operation_type_name?: string | null;
    operation_type_color?: string | null;
}

interface OperationType {
    id: number;
    type_code: string;
    type_name: string;
    team_id: number;
    team_code: string;
    team_name: string;
    color: string;
}

interface Team {
    id: number;
    unit_code: string;
    unit_name: string;
}

interface OperationFormState {
    operation_name: string;
    standard_time: number | null;
    required_people: number;
    operation_type_id: number | null;
    description: string;
}

type FormErrors = Partial<Record<keyof OperationFormState, string>>;

const DEFAULT_FORM_STATE: OperationFormState = {
    operation_name: '',
    standard_time: null,
    required_people: 1,
    operation_type_id: null,
    description: '',
};

const ALL_KEY = 'all';
const UNASSIGNED_TYPE_KEY = 'unassigned';

const toFiniteNumber = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeOperation = (operation: Operation): Operation => ({
    ...operation,
    standard_time: toFiniteNumber(operation.standard_time),
    required_people: toFiniteNumber(operation.required_people, 1),
    qualification_count: toFiniteNumber(operation.qualification_count),
});

const validateForm = (formState: OperationFormState): FormErrors => {
    const nextErrors: FormErrors = {};

    if (!formState.operation_name.trim()) {
        nextErrors.operation_name = '请输入操作名称';
    }

    if (!formState.standard_time || formState.standard_time <= 0) {
        nextErrors.standard_time = '标准耗时必须大于 0';
    }

    if (!Number.isFinite(formState.required_people) || formState.required_people < 1) {
        nextErrors.required_people = '所需人数必须至少为 1';
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
        clock: (
            <>
                <circle cx="12" cy="12" r="8" />
                <path d="M12 8v5l3 2" />
            </>
        ),
        people: (
            <>
                <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" />
                <circle cx="10" cy="8" r="3" />
                <path d="M20 19v-1.2a3 3 0 0 0-2.2-2.9" />
                <path d="M15.5 5.2a3 3 0 0 1 0 5.6" />
            </>
        ),
        shield: (
            <>
                <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
                <path d="M9 12l2 2 4-4" />
            </>
        ),
    };

    return (
        <svg className="operations-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            {paths[name]}
        </svg>
    );
};

const OperationsPage: React.FC = () => {
    const [operations, setOperations] = useState<Operation[]>([]);
    const [operationTypes, setOperationTypes] = useState<OperationType[]>([]);
    const [teams, setTeams] = useState<Team[]>([]);
    const [qualifiedPersonnelMap, setQualifiedPersonnelMap] = useState<Record<number, number[]>>({});
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [activeTeamId, setActiveTeamId] = useState(ALL_KEY);
    const [searchText, setSearchText] = useState('');
    const [peopleFilter, setPeopleFilter] = useState(ALL_KEY);
    const [typeFilter, setTypeFilter] = useState(ALL_KEY);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingOperation, setEditingOperation] = useState<Operation | null>(null);
    const [formState, setFormState] = useState<OperationFormState>(DEFAULT_FORM_STATE);
    const [formErrors, setFormErrors] = useState<FormErrors>({});
    const [nextCode, setNextCode] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [qualificationOperation, setQualificationOperation] = useState<Operation | null>(null);

    const operationTypeById = useMemo(() => {
        const map = new Map<number, OperationType>();
        operationTypes.forEach((type) => map.set(type.id, type));
        return map;
    }, [operationTypes]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setLoadError(false);

        try {
            const [operationsRes, typesRes, teamsRes, qualifiedRes] = await Promise.all([
                axios.get<Operation[]>('/api/operations'),
                axios.get<OperationType[]>('/api/operation-types'),
                axios.get<Team[]>('/api/organization/teams'),
                axios.get<Record<number, number[]>>('/api/operations/qualified-personnel'),
            ]);

            setOperations((operationsRes.data || []).map(normalizeOperation));
            setOperationTypes(typesRes.data || []);
            setTeams(teamsRes.data || []);
            setQualifiedPersonnelMap(qualifiedRes.data || {});
        } catch {
            setLoadError(true);
            wxbToast.error('加载操作管理数据失败');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const tabItems = useMemo(() => [
        { key: ALL_KEY, label: `全部 (${operations.length})` },
        ...teams.map((team) => {
            const count = operations.filter((operation) =>
                operation.operation_type_id
                && operationTypeById.get(operation.operation_type_id)?.team_id === team.id
            ).length;
            return { key: team.id.toString(), label: `${team.unit_name} (${count})` };
        }),
    ], [operationTypeById, operations, teams]);

    const peopleOptions = useMemo(() => {
        const peopleValues = Array.from(
            new Set(operations.map((operation) => toFiniteNumber(operation.required_people, 1))),
        ).sort((left, right) => left - right);

        return [
            { value: ALL_KEY, label: '全部人数' },
            ...peopleValues.map((value) => ({ value: value.toString(), label: `${value} 人` })),
        ];
    }, [operations]);

    const typeOptions = useMemo(() => [
        { value: ALL_KEY, label: '全部类型' },
        { value: UNASSIGNED_TYPE_KEY, label: '未分配类型' },
        ...operationTypes.map((type) => ({
            value: type.id.toString(),
            label: `${type.type_name} (${type.team_code})`,
        })),
    ], [operationTypes]);

    const formTypeOptions = useMemo(() => [
        { value: 'none', label: '不关联操作类型' },
        ...operationTypes.map((type) => ({
            value: type.id.toString(),
            label: `${type.type_name} (${type.team_code})`,
        })),
    ], [operationTypes]);

    const filteredOperations = useMemo(() => {
        const normalizedSearchText = searchText.trim().toLowerCase();

        return operations.filter((operation) => {
            const operationType = operation.operation_type_id
                ? operationTypeById.get(operation.operation_type_id)
                : undefined;

            const matchesSearch = !normalizedSearchText
                || operation.operation_code.toLowerCase().includes(normalizedSearchText)
                || operation.operation_name.toLowerCase().includes(normalizedSearchText)
                || (operation.operation_type_name || '').toLowerCase().includes(normalizedSearchText);

            const matchesTeam = activeTeamId === ALL_KEY
                || (operationType && operationType.team_id === Number(activeTeamId));

            const matchesPeople = peopleFilter === ALL_KEY
                || toFiniteNumber(operation.required_people, 1) === Number(peopleFilter);

            const matchesType = typeFilter === ALL_KEY
                || (typeFilter === UNASSIGNED_TYPE_KEY && !operation.operation_type_id)
                || operation.operation_type_id === Number(typeFilter);

            return matchesSearch && matchesTeam && matchesPeople && matchesType;
        });
    }, [activeTeamId, operationTypeById, operations, peopleFilter, searchText, typeFilter]);

    const updateFormField = useCallback(
        <K extends keyof OperationFormState>(field: K, value: OperationFormState[K]) => {
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

    const fetchNextCode = useCallback(async () => {
        try {
            const response = await axios.get<{ nextCode: string }>('/api/operations/next-code');
            setNextCode(response.data.nextCode);
        } catch {
            setNextCode('');
        }
    }, []);

    const openCreateModal = useCallback(() => {
        setEditingOperation(null);
        setFormState(DEFAULT_FORM_STATE);
        setFormErrors({});
        setModalVisible(true);
        fetchNextCode();
    }, [fetchNextCode]);

    const openEditModal = useCallback((operation: Operation) => {
        setEditingOperation(operation);
        setNextCode('');
        setFormState({
            operation_name: operation.operation_name,
            standard_time: toFiniteNumber(operation.standard_time),
            required_people: toFiniteNumber(operation.required_people, 1),
            operation_type_id: operation.operation_type_id ?? null,
            description: operation.description || '',
        });
        setFormErrors({});
        setModalVisible(true);
    }, []);

    const closeModal = useCallback(() => {
        if (submitting) return;
        setModalVisible(false);
        setEditingOperation(null);
        setFormErrors({});
    }, [submitting]);

    const openQualificationModal = useCallback((operation: Operation) => {
        setQualificationOperation(operation);
    }, []);

    const closeQualificationModal = useCallback(() => {
        setQualificationOperation(null);
    }, []);

    const handleSubmit = useCallback(async () => {
        const nextErrors = validateForm(formState);
        setFormErrors(nextErrors);

        if (Object.keys(nextErrors).length > 0) {
            wxbToast.warning('请先修正表单内容');
            return;
        }

        const payload = {
            operation_name: formState.operation_name.trim(),
            standard_time: Number(formState.standard_time),
            required_people: Number(formState.required_people),
            operation_type_id: formState.operation_type_id,
            description: formState.description.trim() || null,
        };

        setSubmitting(true);
        try {
            if (editingOperation) {
                await axios.put(`/api/operations/${editingOperation.id}`, payload);
                wxbToast.success('操作更新成功');
            } else {
                await axios.post('/api/operations', payload);
                wxbToast.success('操作创建成功');
            }

            setModalVisible(false);
            setEditingOperation(null);
            fetchData();
        } catch {
            wxbToast.error('保存操作失败');
        } finally {
            setSubmitting(false);
        }
    }, [editingOperation, fetchData, formState]);

    const handleDelete = useCallback(async (operation: Operation) => {
        try {
            await axios.delete(`/api/operations/${operation.id}`);
            wxbToast.success('操作已删除');
            fetchData();
        } catch (err: any) {
            wxbToast.error(err.response?.data?.error || '删除操作失败');
        }
    }, [fetchData]);

    const columns: WxbDataTableProps<Operation>['columns'] = useMemo(() => [
        {
            title: '操作编码',
            dataIndex: 'operation_code',
            width: 130,
            sorter: (left, right) => left.operation_code.localeCompare(right.operation_code),
            render: (value: string) => <WxbTag color="blue">{value}</WxbTag>,
        },
        {
            title: '操作名称',
            dataIndex: 'operation_name',
            width: 160,
            sorter: (left, right) => left.operation_name.localeCompare(right.operation_name),
        },
        {
            title: '标准耗时',
            dataIndex: 'standard_time',
            width: 110,
            sorter: (left, right) => toFiniteNumber(left.standard_time) - toFiniteNumber(right.standard_time),
            render: (value: number) => (
                <span className="operations-inline-metric">
                    <OperationIcon name="clock" />
                    {toFiniteNumber(value).toFixed(1)} 小时
                </span>
            ),
        },
        {
            title: '所需人数',
            dataIndex: 'required_people',
            width: 100,
            sorter: (left, right) => toFiniteNumber(left.required_people, 1) - toFiniteNumber(right.required_people, 1),
            render: (value: number) => (
                <span className="operations-inline-metric">
                    <OperationIcon name="people" />
                    {toFiniteNumber(value, 1)} 人
                </span>
            ),
        },
        {
            title: '操作类型',
            dataIndex: 'operation_type_name',
            width: 145,
            filters: operationTypes.map((type) => ({ text: type.type_name, value: type.id })),
            onFilter: (value, record) => record.operation_type_id === value,
            render: (_value: string, record) => {
                const operationType = record.operation_type_id
                    ? operationTypeById.get(record.operation_type_id)
                    : undefined;

                if (!operationType) {
                    return <WxbBadge status="neutral" variant="code" label="未分配" />;
                }

                return (
                    <span className="operations-type-cell">
                        <WxbTag color="blue">{operationType.type_name}</WxbTag>
                        <span className="operations-type-team">{operationType.team_code}</span>
                    </span>
                );
            },
        },
        {
            title: '描述',
            dataIndex: 'description',
            width: 150,
            ellipsis: true,
            render: (value: string | null) => (
                <WxbTooltip title={value || '无描述'}>
                    <span className="operations-description">{value || '-'}</span>
                </WxbTooltip>
            ),
        },
        {
            title: '资质要求',
            dataIndex: 'qualification_count',
            width: 95,
            sorter: (left, right) => toFiniteNumber(left.qualification_count) - toFiniteNumber(right.qualification_count),
            render: (value: number) => (
                <WxbBadge
                    status={toFiniteNumber(value) > 0 ? 'info' : 'neutral'}
                    variant={toFiniteNumber(value) > 0 ? 'outline' : 'code'}
                    label={`${toFiniteNumber(value)} 项`}
                />
            ),
        },
        {
            title: '合格人数',
            width: 130,
            render: (_value, record) => {
                const counts = qualifiedPersonnelMap[record.id] || [];
                if (counts.length === 0) return <span className="operations-muted">-</span>;

                return (
                    <span className="operations-position-list">
                        {counts.map((count, index) => (
                            <WxbTooltip key={`${record.id}-${index}`} title={`位置 ${index + 1}: ${count} 人合格`}>
                                <span>
                                    <WxbBadge
                                        status={count > 0 ? 'success' : 'error'}
                                        variant="outline"
                                        code={`P${index + 1}`}
                                        label={String(count)}
                                    />
                                </span>
                            </WxbTooltip>
                        ))}
                    </span>
                );
            },
        },
        {
            title: '操作',
            width: 140,
            render: (_value, record) => {
                const deleteDisabled = toFiniteNumber(record.qualification_count) > 0;
                const deleteButton = (
                    <WxbButton
                        type="button"
                        variant="danger"
                        size="sm"
                        aria-label={`删除 ${record.operation_name}`}
                        disabled={deleteDisabled}
                    >
                        <OperationIcon name="delete" />
                    </WxbButton>
                );

                return (
                    <span className="operations-table-actions">
                        <WxbTooltip title="编辑">
                            <WxbButton
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label={`编辑 ${record.operation_name}`}
                                onClick={() => openEditModal(record)}
                            >
                                <OperationIcon name="edit" />
                            </WxbButton>
                        </WxbTooltip>
                        <WxbTooltip title="编辑资质要求">
                            <WxbButton
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label={`编辑 ${record.operation_name} 的资质要求`}
                                onClick={() => openQualificationModal(record)}
                            >
                                <OperationIcon name="shield" />
                            </WxbButton>
                        </WxbTooltip>
                        {deleteDisabled ? (
                            <WxbTooltip title="已有资质要求，不能直接删除">
                                <span>{deleteButton}</span>
                            </WxbTooltip>
                        ) : (
                            <WxbPopconfirm
                                title="确定删除此操作？"
                                description="删除后无法恢复，且不能删除已经被工艺阶段引用的操作。"
                                okText="删除"
                                cancelText="取消"
                                onConfirm={() => handleDelete(record)}
                            >
                                {deleteButton}
                            </WxbPopconfirm>
                        )}
                    </span>
                );
            },
        },
    ], [handleDelete, openEditModal, openQualificationModal, operationTypeById, operationTypes, qualifiedPersonnelMap]);

    return (
        <WxbPageShell size="full" gap="lg" className="operations-page">
            <WxbPageHeader
                eyebrow="Master Data"
                title="操作管理"
                description="维护可复用的标准操作、标准耗时、所需人数和操作类型映射，供工艺模板与排班求解复用。"
                meta={(
                    <>
                        <WxbTag color="blue">共 {operations.length} 项</WxbTag>
                        <WxbTag color="green">{operationTypes.length} 个类型</WxbTag>
                    </>
                )}
                actions={(
                    <>
                        <WxbButton type="button" variant="secondary" onClick={fetchData} disabled={loading}>
                            <OperationIcon name="refresh" />
                            {loading ? '刷新中...' : '刷新'}
                        </WxbButton>
                        <WxbButton type="button" variant="primary" onClick={openCreateModal}>
                            <OperationIcon name="plus" />
                            新增操作
                        </WxbButton>
                    </>
                )}
            />

            <WxbPageSection variant="framed" density="compact" className="operations-section">
                <WxbTabs activeKey={activeTeamId} onChange={setActiveTeamId} items={tabItems} className="operations-tabs" />

                <WxbPageToolbar
                    className="operations-toolbar"
                    leading={(
                        <WxbSearchInput
                            value={searchText}
                            placeholder="搜索操作名称、编码或类型"
                            onChange={setSearchText}
                            onSearch={setSearchText}
                        />
                    )}
                    filters={(
                        <>
                            <WxbSelect
                                value={peopleFilter}
                                options={peopleOptions}
                                onChange={(value) => setPeopleFilter(String(value))}
                                className="operations-filter"
                            />
                            <WxbSelect
                                value={typeFilter}
                                options={typeOptions}
                                onChange={(value) => setTypeFilter(String(value))}
                                className="operations-filter"
                                showSearch
                                optionFilterProp="label"
                            />
                        </>
                    )}
                    summary={`当前显示 ${filteredOperations.length} 项`}
                />

                <WxbDataTable<Operation>
                    columns={columns}
                    dataSource={filteredOperations}
                    rowKey="id"
                    loading={loading}
                    density="compact"
                    emptyState={{
                        description: '暂无匹配操作',
                        action: <WxbButton type="button" variant="secondary" onClick={openCreateModal}>新增操作</WxbButton>,
                    }}
                    errorState={loadError ? {
                        title: '操作数据加载失败',
                        description: '请检查后端服务或稍后重试。',
                        action: <WxbButton type="button" variant="secondary" onClick={fetchData}>重新加载</WxbButton>,
                    } : undefined}
                    scroll={{ x: 1160 }}
                    pagination={{
                        pageSize: 20,
                        showSizeChanger: true,
                        showTotal: (total) => `共 ${total} 条`,
                    }}
                />
            </WxbPageSection>

            <WxbModal
                title={editingOperation ? '编辑操作' : '新增操作'}
                open={modalVisible}
                onCancel={closeModal}
                onOk={handleSubmit}
                confirmLoading={submitting}
                okText={editingOperation ? '保存修改' : '创建操作'}
                cancelText="取消"
                width={560}
                destroyOnClose
            >
                <form
                    className="operations-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        handleSubmit();
                    }}
                >
                    {editingOperation ? (
                        <WxbInput label="操作编码" value={editingOperation.operation_code} disabled />
                    ) : (
                        <WxbFormField helpText="操作编码由系统自动生成，保存后不可手动编辑。">
                            <WxbEmpty
                                className="operations-code-preview"
                                image={<WxbTag color="blue">{nextCode || 'OP-00000'}</WxbTag>}
                                description="即将生成的操作编码"
                            />
                        </WxbFormField>
                    )}

                    <WxbInput
                        label="操作名称"
                        value={formState.operation_name}
                        placeholder="如 反应袋安装"
                        error={formErrors.operation_name}
                        onChange={(event) => updateFormField('operation_name', event.target.value)}
                    />

                    <div className="operations-form-grid">
                        <WxbInputNumber
                            label="标准耗时（小时）"
                            min={0.1}
                            step={0.5}
                            precision={1}
                            value={formState.standard_time ?? undefined}
                            placeholder="请输入标准耗时"
                            error={formErrors.standard_time}
                            onChange={(value) => updateFormField('standard_time', value === null ? null : Number(value))}
                        />
                        <WxbInputNumber
                            label="所需人数"
                            min={1}
                            max={20}
                            precision={0}
                            value={formState.required_people}
                            error={formErrors.required_people}
                            onChange={(value) => updateFormField('required_people', Number(value ?? 1))}
                        />
                    </div>

                    <WxbSelect
                        label="操作类型"
                        value={formState.operation_type_id?.toString() ?? 'none'}
                        placeholder="请选择操作类型"
                        options={formTypeOptions}
                        showSearch
                        optionFilterProp="label"
                        onChange={(value) => {
                            const nextValue = String(value);
                            updateFormField(
                                'operation_type_id',
                                nextValue === 'none' ? null : Number(nextValue),
                            );
                        }}
                    />

                    <WxbTextarea
                        label="描述"
                        rows={3}
                        value={formState.description}
                        placeholder="请输入操作描述（可选）"
                        onChange={(event) => updateFormField('description', event.target.value)}
                    />
                </form>
            </WxbModal>

            <OperationQualificationModal
                visible={qualificationOperation !== null}
                operationId={qualificationOperation?.id ?? null}
                operationName={qualificationOperation?.operation_name ?? ''}
                onClose={closeQualificationModal}
                onUpdate={fetchData}
            />
        </WxbPageShell>
    );
};

export default OperationsPage;

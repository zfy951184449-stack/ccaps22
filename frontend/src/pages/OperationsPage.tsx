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
import { WxbSegmented } from '../components/wxb-ui/Segmented/Segmented';
import { WxbSelect } from '../components/wxb-ui/Select/Select';
import { WxbSpinner } from '../components/wxb-ui/Spinner/Spinner';
import { WxbTabs } from '../components/wxb-ui/Tabs/Tabs';
import { WxbTag, type WxbTagColor } from '../components/wxb-ui/Tag/Tag';
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

interface QualifiedRequirement {
    qualification_id: number;
    qualification_name: string;
    min_level: number;
    is_mandatory: boolean;
}

interface QualifiedPersonnelQualification {
    id?: number | null;
    qualification_id: number;
    qualification_name: string;
    qualification_level: number;
}

interface QualifiedPersonnel {
    employee_id: number;
    employee_code: string;
    employee_name: string;
    department_name?: string | null;
    team_name?: string | null;
    unit_name?: string | null;
    position_name?: string | null;
    qualifications: QualifiedPersonnelQualification[];
}

interface QualifiedPersonnelPosition {
    position_number: number;
    qualified_count: number;
    requirements: QualifiedRequirement[];
    personnel: QualifiedPersonnel[];
}

interface QualifiedPersonnelDetails {
    operation_id: number;
    operation_code: string;
    operation_name: string;
    required_people: number;
    positions: QualifiedPersonnelPosition[];
}

interface QualificationOption {
    id: number;
    qualification_name: string;
}

interface EmployeeQualificationDraft {
    draftKey: string;
    id: number | null;
    qualification_id: number;
    qualification_name: string;
    qualification_level: number;
}

interface OperationFormState {
    operation_name: string;
    standard_time: number | null;
    required_people: number;
    operation_type_id: number | null;
    description: string;
}

type FormErrors = Partial<Record<keyof OperationFormState, string>>;

type QualifiedModalSize = 'standard' | 'wide' | 'large';

const DEFAULT_FORM_STATE: OperationFormState = {
    operation_name: '',
    standard_time: null,
    required_people: 1,
    operation_type_id: null,
    description: '',
};

const ALL_KEY = 'all';
const UNASSIGNED_TYPE_KEY = 'unassigned';
const QUALIFICATION_LEVEL_MIN = 1;
const QUALIFICATION_LEVEL_MAX = 5;
const QUALIFIED_MODAL_WIDTH: Record<QualifiedModalSize, number> = {
    standard: 860,
    wide: 1060,
    large: 1240,
};
const QUALIFIED_TABLE_SCROLL_Y: Record<QualifiedModalSize, number> = {
    standard: 360,
    wide: 460,
    large: 560,
};
const QUALIFIED_MODAL_SIZE_OPTIONS = [
    { value: 'standard', label: '标准' },
    { value: 'wide', label: '宽屏' },
    { value: 'large', label: '大屏' },
];

const toFiniteNumber = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeQualificationLevel = (value: unknown, fallback = QUALIFICATION_LEVEL_MIN) => {
    const parsed = toFiniteNumber(value, fallback);
    return Math.min(QUALIFICATION_LEVEL_MAX, Math.max(QUALIFICATION_LEVEL_MIN, Math.round(parsed)));
};

const normalizeOperation = (operation: Operation): Operation => ({
    ...operation,
    standard_time: toFiniteNumber(operation.standard_time),
    required_people: toFiniteNumber(operation.required_people, 1),
    qualification_count: toFiniteNumber(operation.qualification_count),
});

const getPositionKey = (positionNumber: number) => positionNumber.toString();

const getRequirementLabel = (requirement: QualifiedRequirement) =>
    `${requirement.qualification_name} ≥${toFiniteNumber(requirement.min_level, 1)}级${requirement.is_mandatory ? '' : ' · 可选'}`;

const isActivationKey = (event: React.KeyboardEvent) => event.key === 'Enter' || event.key === ' ';

const getQualificationLevelColor = (level: number): WxbTagColor => {
    const normalizedLevel = normalizeQualificationLevel(level);
    if (normalizedLevel >= 5) return 'red';
    if (normalizedLevel === 4) return 'amber';
    if (normalizedLevel === 3) return 'blue';
    if (normalizedLevel === 2) return 'green';
    return 'neutral';
};

const sortRequirementsByLevel = (requirements: QualifiedRequirement[]) =>
    [...requirements].sort((left, right) => {
        const levelDiff = normalizeQualificationLevel(right.min_level) - normalizeQualificationLevel(left.min_level);
        if (levelDiff !== 0) return levelDiff;

        const mandatoryDiff = Number(right.is_mandatory) - Number(left.is_mandatory);
        if (mandatoryDiff !== 0) return mandatoryDiff;

        return left.qualification_name.localeCompare(right.qualification_name, 'zh-Hans-CN');
    });

const sortPersonnelQualifications = <T extends { qualification_name: string; qualification_level: number }>(qualifications: T[]) =>
    [...qualifications].sort((left, right) => {
        const levelDiff = normalizeQualificationLevel(right.qualification_level) - normalizeQualificationLevel(left.qualification_level);
        if (levelDiff !== 0) return levelDiff;
        return left.qualification_name.localeCompare(right.qualification_name, 'zh-Hans-CN');
    });

const getPreferredPositionKey = (details: QualifiedPersonnelDetails, preferredKey?: string | null) => {
    const positions = details.positions || [];
    if (preferredKey && positions.some((position) => getPositionKey(position.position_number) === preferredKey)) {
        return preferredKey;
    }

    const firstPopulatedPosition = positions.find((position) => position.qualified_count > 0);
    return getPositionKey(firstPopulatedPosition?.position_number ?? positions[0]?.position_number ?? 1);
};

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
    const [qualifiedDetailsOperation, setQualifiedDetailsOperation] = useState<Operation | null>(null);
    const [qualifiedDetails, setQualifiedDetails] = useState<QualifiedPersonnelDetails | null>(null);
    const [qualifiedDetailsLoading, setQualifiedDetailsLoading] = useState(false);
    const [qualifiedDetailsError, setQualifiedDetailsError] = useState(false);
    const [qualifiedDetailsActivePosition, setQualifiedDetailsActivePosition] = useState('1');
    const [qualificationOptions, setQualificationOptions] = useState<QualificationOption[]>([]);
    const [qualifiedModalSize, setQualifiedModalSize] = useState<QualifiedModalSize>('standard');
    const [editingPersonnelId, setEditingPersonnelId] = useState<number | null>(null);
    const [qualificationDrafts, setQualificationDrafts] = useState<Record<number, EmployeeQualificationDraft[]>>({});
    const [draftAddQualificationId, setDraftAddQualificationId] = useState<string | null>(null);
    const [draftAddLevel, setDraftAddLevel] = useState(3);
    const [savingQualificationEmployeeId, setSavingQualificationEmployeeId] = useState<number | null>(null);

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

    const loadQualifiedPersonnelDetails = useCallback(async (
        operation: Operation,
        preferredPositionKey?: string | null,
    ) => {
        const [detailsResponse, qualificationsResponse] = await Promise.all([
            axios.get<QualifiedPersonnelDetails>(`/api/operations/${operation.id}/qualified-personnel-details`),
            axios.get<QualificationOption[]>('/api/qualifications'),
        ]);
        const details = detailsResponse.data;
        const options = (qualificationsResponse.data || [])
            .map((qualification) => ({
                id: Number(qualification.id),
                qualification_name: qualification.qualification_name,
            }))
            .filter((qualification) => Number.isFinite(qualification.id) && qualification.qualification_name)
            .sort((left, right) => left.qualification_name.localeCompare(right.qualification_name, 'zh-Hans-CN'));

        setQualifiedDetails(details);
        setQualificationOptions(options);
        setQualifiedDetailsActivePosition(getPreferredPositionKey(details, preferredPositionKey));
    }, []);

    const openQualifiedPersonnelDetails = useCallback(async (operation: Operation) => {
        setQualifiedDetailsOperation(operation);
        setQualifiedDetails(null);
        setQualifiedDetailsError(false);
        setQualifiedDetailsLoading(true);
        setQualifiedDetailsActivePosition('1');
        setEditingPersonnelId(null);
        setQualificationDrafts({});
        setDraftAddQualificationId(null);

        try {
            await loadQualifiedPersonnelDetails(operation);
        } catch {
            setQualifiedDetailsError(true);
            wxbToast.error('加载合格人员明细失败');
        } finally {
            setQualifiedDetailsLoading(false);
        }
    }, [loadQualifiedPersonnelDetails]);

    const closeQualifiedPersonnelDetails = useCallback(() => {
        setQualifiedDetailsOperation(null);
        setQualifiedDetails(null);
        setQualifiedDetailsError(false);
        setQualifiedDetailsLoading(false);
        setQualifiedDetailsActivePosition('1');
        setQualificationOptions([]);
        setEditingPersonnelId(null);
        setQualificationDrafts({});
        setDraftAddQualificationId(null);
        setSavingQualificationEmployeeId(null);
    }, []);

    const qualificationSelectOptions = useMemo(
        () => qualificationOptions.map((qualification) => ({
            value: qualification.id.toString(),
            label: qualification.qualification_name,
        })),
        [qualificationOptions],
    );

    const buildPersonnelQualificationDrafts = useCallback((personnel: QualifiedPersonnel) =>
        sortPersonnelQualifications(personnel.qualifications).map((qualification) => ({
            draftKey: qualification.id
                ? `existing-${qualification.id}`
                : `existing-${personnel.employee_id}-${qualification.qualification_id}`,
            id: qualification.id ?? null,
            qualification_id: qualification.qualification_id,
            qualification_name: qualification.qualification_name,
            qualification_level: normalizeQualificationLevel(qualification.qualification_level),
        })), []);

    const beginEditPersonnelQualifications = useCallback((personnel: QualifiedPersonnel) => {
        if (editingPersonnelId === personnel.employee_id) {
            setDraftAddQualificationId(null);
            setEditingPersonnelId(null);
            return;
        }

        setQualificationDrafts((drafts) => ({
            ...drafts,
            [personnel.employee_id]: buildPersonnelQualificationDrafts(personnel),
        }));
        setDraftAddQualificationId(null);
        setDraftAddLevel(3);
        setEditingPersonnelId(personnel.employee_id);
    }, [buildPersonnelQualificationDrafts, editingPersonnelId]);

    const cancelEditPersonnelQualifications = useCallback(() => {
        setEditingPersonnelId(null);
        setDraftAddQualificationId(null);
    }, []);

    const updateQualificationDraft = useCallback((
        employeeId: number,
        draftKey: string,
        patch: Partial<EmployeeQualificationDraft>,
    ) => {
        setQualificationDrafts((current) => ({
            ...current,
            [employeeId]: (current[employeeId] || []).map((draft) =>
                draft.draftKey === draftKey ? { ...draft, ...patch } : draft,
            ),
        }));
    }, []);

    const removeQualificationDraft = useCallback((employeeId: number, draftKey: string) => {
        setQualificationDrafts((current) => ({
            ...current,
            [employeeId]: (current[employeeId] || []).filter((draft) => draft.draftKey !== draftKey),
        }));
    }, []);

    const addQualificationDraft = useCallback((personnel: QualifiedPersonnel) => {
        const qualificationId = Number(draftAddQualificationId);
        const option = qualificationOptions.find((qualification) => qualification.id === qualificationId);

        if (!Number.isFinite(qualificationId) || !option) {
            wxbToast.warning('请选择要添加的资质');
            return;
        }

        const currentDrafts = qualificationDrafts[personnel.employee_id] || [];
        if (currentDrafts.some((draft) => draft.qualification_id === qualificationId)) {
            wxbToast.warning('该人员已包含此资质');
            return;
        }

        setQualificationDrafts((current) => {
            const nextDrafts = sortPersonnelQualifications([
                ...(current[personnel.employee_id] || []),
                {
                    draftKey: `new-${personnel.employee_id}-${qualificationId}-${Date.now()}`,
                    id: null,
                    qualification_id: qualificationId,
                    qualification_name: option.qualification_name,
                    qualification_level: normalizeQualificationLevel(draftAddLevel, 3),
                },
            ]);

            return {
                ...current,
                [personnel.employee_id]: nextDrafts,
            };
        });
        setDraftAddQualificationId(null);
        setDraftAddLevel(3);
    }, [draftAddLevel, draftAddQualificationId, qualificationDrafts, qualificationOptions]);

    const savePersonnelQualifications = useCallback(async (personnel: QualifiedPersonnel) => {
        const drafts = qualificationDrafts[personnel.employee_id] || [];
        const seenQualificationIds = new Set<number>();

        for (const draft of drafts) {
            if (!Number.isFinite(draft.qualification_id)) {
                wxbToast.warning('请先补全资质');
                return;
            }

            if (seenQualificationIds.has(draft.qualification_id)) {
                wxbToast.warning('同一人员不能重复配置相同资质');
                return;
            }

            seenQualificationIds.add(draft.qualification_id);
        }

        const originalByRecordId = new Map<number, QualifiedPersonnelQualification>();
        personnel.qualifications.forEach((qualification) => {
            if (qualification.id !== null && qualification.id !== undefined) {
                originalByRecordId.set(Number(qualification.id), qualification);
            }
        });

        const draftRecordIds = new Set<number>();
        const requests: Promise<unknown>[] = [];

        drafts.forEach((draft) => {
            const payload = {
                employee_id: personnel.employee_id,
                qualification_id: draft.qualification_id,
                qualification_level: normalizeQualificationLevel(draft.qualification_level),
            };

            if (draft.id !== null && draft.id !== undefined) {
                const recordId = Number(draft.id);
                draftRecordIds.add(recordId);
                const original = originalByRecordId.get(recordId);
                const changed = !original
                    || original.qualification_id !== payload.qualification_id
                    || normalizeQualificationLevel(original.qualification_level) !== payload.qualification_level;

                if (changed) {
                    requests.push(axios.put(`/api/employee-qualifications/${recordId}`, payload));
                }
                return;
            }

            requests.push(axios.post('/api/employee-qualifications', payload));
        });

        originalByRecordId.forEach((_qualification, recordId) => {
            if (!draftRecordIds.has(recordId)) {
                requests.push(axios.delete(`/api/employee-qualifications/${recordId}`));
            }
        });

        if (requests.length === 0) {
            wxbToast.info('资质未发生变化');
            setEditingPersonnelId(null);
            return;
        }

        setSavingQualificationEmployeeId(personnel.employee_id);
        try {
            await Promise.all(requests);
            wxbToast.success('人员资质已更新');
            setEditingPersonnelId(null);
            setDraftAddQualificationId(null);

            if (qualifiedDetailsOperation) {
                await loadQualifiedPersonnelDetails(qualifiedDetailsOperation, qualifiedDetailsActivePosition);
            }
            await fetchData();
        } catch (error: any) {
            wxbToast.error(error?.response?.data?.error || '保存人员资质失败');
        } finally {
            setSavingQualificationEmployeeId(null);
        }
    }, [
        fetchData,
        loadQualifiedPersonnelDetails,
        qualificationDrafts,
        qualifiedDetailsActivePosition,
        qualifiedDetailsOperation,
    ]);

    const renderPersonnelQualificationEditor = useCallback((personnel: QualifiedPersonnel) => {
        const drafts = qualificationDrafts[personnel.employee_id] || [];
        const selectedQualificationIds = new Set(drafts.map((draft) => draft.qualification_id));
        const addOptions = qualificationSelectOptions.map((option) => ({
            ...option,
            disabled: selectedQualificationIds.has(Number(option.value)),
        }));
        const saving = savingQualificationEmployeeId === personnel.employee_id;

        return (
            <div className="operations-qualification-editor">
                <div className="operations-qualification-editor-head">
                    <span className="operations-qualification-editor-title">{personnel.employee_name} 的资质</span>
                    <span className="operations-muted">{personnel.employee_code}</span>
                </div>

                <div className="operations-qualification-editor-list">
                    {drafts.length > 0 ? drafts.map((draft) => {
                        const options = qualificationSelectOptions.map((option) => ({
                            ...option,
                            disabled: selectedQualificationIds.has(Number(option.value))
                                && Number(option.value) !== draft.qualification_id,
                        }));

                        return (
                            <div key={draft.draftKey} className="operations-qualification-editor-row">
                                <WxbSelect
                                    value={draft.qualification_id.toString()}
                                    options={options}
                                    showSearch
                                    optionFilterProp="label"
                                    className="operations-qualification-editor-select"
                                    onChange={(value) => {
                                        const qualificationId = Number(value);
                                        const option = qualificationOptions.find((qualification) => qualification.id === qualificationId);
                                        updateQualificationDraft(personnel.employee_id, draft.draftKey, {
                                            qualification_id: qualificationId,
                                            qualification_name: option?.qualification_name || draft.qualification_name,
                                        });
                                    }}
                                />
                                <WxbInputNumber
                                    min={QUALIFICATION_LEVEL_MIN}
                                    max={QUALIFICATION_LEVEL_MAX}
                                    precision={0}
                                    value={draft.qualification_level}
                                    className="operations-qualification-editor-level"
                                    onChange={(value) => updateQualificationDraft(personnel.employee_id, draft.draftKey, {
                                        qualification_level: normalizeQualificationLevel(value, draft.qualification_level),
                                    })}
                                />
                                <WxbTag color={getQualificationLevelColor(draft.qualification_level)}>
                                    L{normalizeQualificationLevel(draft.qualification_level)}
                                </WxbTag>
                                <WxbButton
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeQualificationDraft(personnel.employee_id, draft.draftKey)}
                                >
                                    移除
                                </WxbButton>
                            </div>
                        );
                    }) : (
                        <span className="operations-muted">暂无资质</span>
                    )}
                </div>

                <div className="operations-qualification-editor-add">
                    <WxbSelect
                        value={draftAddQualificationId ?? undefined}
                        placeholder="添加资质"
                        options={addOptions}
                        showSearch
                        optionFilterProp="label"
                        className="operations-qualification-editor-add-select"
                        onChange={(value) => setDraftAddQualificationId(String(value))}
                    />
                    <WxbInputNumber
                        min={QUALIFICATION_LEVEL_MIN}
                        max={QUALIFICATION_LEVEL_MAX}
                        precision={0}
                        value={draftAddLevel}
                        className="operations-qualification-editor-level"
                        onChange={(value) => setDraftAddLevel(normalizeQualificationLevel(value, 3))}
                    />
                    <WxbButton
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => addQualificationDraft(personnel)}
                    >
                        添加
                    </WxbButton>
                </div>

                <div className="operations-qualification-editor-actions">
                    <WxbButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={saving}
                        onClick={cancelEditPersonnelQualifications}
                    >
                        取消
                    </WxbButton>
                    <WxbButton
                        type="button"
                        variant="primary"
                        size="sm"
                        disabled={saving}
                        onClick={() => savePersonnelQualifications(personnel)}
                    >
                        {saving ? '保存中...' : '保存资质'}
                    </WxbButton>
                </div>
            </div>
        );
    }, [
        addQualificationDraft,
        cancelEditPersonnelQualifications,
        draftAddLevel,
        draftAddQualificationId,
        qualificationDrafts,
        qualificationOptions,
        qualificationSelectOptions,
        removeQualificationDraft,
        savePersonnelQualifications,
        savingQualificationEmployeeId,
        updateQualificationDraft,
    ]);

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

    const qualifiedDetailsTabs = useMemo(
        () => (qualifiedDetails?.positions ?? []).map((position) => ({
            key: getPositionKey(position.position_number),
            label: `P${position.position_number} (${position.qualified_count})`,
        })),
        [qualifiedDetails],
    );

    const activeQualifiedPosition = useMemo(
        () => (qualifiedDetails?.positions ?? []).find(
            (position) => getPositionKey(position.position_number) === qualifiedDetailsActivePosition,
        ) ?? qualifiedDetails?.positions[0] ?? null,
        [qualifiedDetails, qualifiedDetailsActivePosition],
    );

    const qualifiedPersonnelColumns: WxbDataTableProps<QualifiedPersonnel>['columns'] = useMemo(() => [
        {
            title: '人员',
            dataIndex: 'employee_name',
            width: 180,
            render: (_value: string, record) => (
                <span className="operations-person-cell">
                    <span className="operations-person-name">{record.employee_name}</span>
                    <span className="operations-person-code">{record.employee_code}</span>
                </span>
            ),
        },
        {
            title: '组织',
            width: 180,
            render: (_value, record) => {
                const primaryUnit = record.team_name || record.department_name || record.unit_name || '-';
                const secondaryUnit = record.team_name && record.department_name
                    ? record.department_name
                    : record.unit_name && record.unit_name !== primaryUnit
                        ? record.unit_name
                        : null;

                return (
                    <span className="operations-person-cell">
                        <span className="operations-person-name">{primaryUnit}</span>
                        {secondaryUnit && <span className="operations-person-code">{secondaryUnit}</span>}
                    </span>
                );
            },
        },
        {
            title: '岗位',
            dataIndex: 'position_name',
            width: 120,
            render: (value: string | null) => value || '-',
        },
        {
            title: '匹配资质',
            render: (_value, record) => {
                const requirements = sortRequirementsByLevel(activeQualifiedPosition?.requirements ?? []);
                const matchedQualifications = requirements
                    .map((requirement) => {
                        const employeeQualification = record.qualifications.find(
                            (qualification) => qualification.qualification_id === requirement.qualification_id,
                        );

                        if (!employeeQualification) return null;

                        return {
                            ...requirement,
                            qualification_level: employeeQualification.qualification_level,
                        };
                    })
                    .filter((item): item is QualifiedRequirement & { qualification_level: number } => item !== null);

                if (matchedQualifications.length === 0) {
                    return <span className="operations-muted">无必需资质</span>;
                }

                return (
                    <span className="operations-qualified-tags">
                        {matchedQualifications.map((qualification) => (
                            <WxbTag
                                key={qualification.qualification_id}
                                color={getQualificationLevelColor(qualification.qualification_level)}
                            >
                                {qualification.qualification_name} L{qualification.qualification_level}
                            </WxbTag>
                        ))}
                    </span>
                );
            },
        },
        {
            title: '操作',
            width: 100,
            render: (_value, record) => (
                <WxbButton
                    type="button"
                    variant={editingPersonnelId === record.employee_id ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => beginEditPersonnelQualifications(record)}
                >
                    {editingPersonnelId === record.employee_id ? '收起' : '调整资质'}
                </WxbButton>
            ),
        },
    ], [activeQualifiedPosition, beginEditPersonnelQualifications, editingPersonnelId]);

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
                // 合格人数只反映 1..所需人数 的有效位置。qualified-personnel 接口按 oqr 里出现的
                // 最大 position_number 返回数组，可能含超出所需人数的残留位置（历史孤儿数据：所需
                // 人数曾被调小，旧资质行未随之清理）。有效位置正常展示；残留位置不混入计数，而是
                // 单独用告警徽标显式标出，提示该操作存在脏数据、重新编辑保存即可由后端自动收口。
                const requiredPeople = toFiniteNumber(record.required_people, 1);
                const allCounts = qualifiedPersonnelMap[record.id] || [];
                const counts = allCounts.slice(0, requiredPeople);
                const orphanCount = Math.max(0, allCounts.length - requiredPeople);

                if (counts.length === 0 && orphanCount === 0) {
                    return <span className="operations-muted">-</span>;
                }

                return (
                    <span
                        className="operations-position-list operations-position-list--interactive"
                        role="button"
                        tabIndex={0}
                        aria-label={`查看 ${record.operation_name} 的合格人员明细`}
                        onDoubleClick={() => openQualifiedPersonnelDetails(record)}
                        onKeyDown={(event) => {
                            if (!isActivationKey(event)) return;
                            event.preventDefault();
                            openQualifiedPersonnelDetails(record);
                        }}
                    >
                        {counts.map((count, index) => (
                            <WxbTooltip key={`${record.id}-${index}`} title={`位置 ${index + 1}: ${count} 人合格，双击查看名单`}>
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
                        {orphanCount > 0 && (
                            <WxbTooltip
                                title={`存在超出所需人数（${requiredPeople} 人）的残留资质要求，最高至位置 ${allCounts.length}。这是历史遗留的脏数据，重新编辑并保存该操作即可自动清理。`}
                            >
                                <span>
                                    <WxbBadge
                                        status="warning"
                                        variant="outline"
                                        code="残留"
                                        label={String(orphanCount)}
                                    />
                                </span>
                            </WxbTooltip>
                        )}
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
    ], [handleDelete, openEditModal, openQualificationModal, openQualifiedPersonnelDetails, operationTypeById, operationTypes, qualifiedPersonnelMap]);

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
                    <span className="operations-header-action-group">
                        <WxbTooltip title={loading ? '刷新中' : '刷新数据'}>
                            <WxbButton
                                type="button"
                                variant="secondary"
                                className="operations-header-refresh"
                                onClick={fetchData}
                                disabled={loading}
                                aria-label={loading ? '刷新中' : '刷新数据'}
                            >
                                <OperationIcon name="refresh" />
                            </WxbButton>
                        </WxbTooltip>
                        <WxbButton type="button" variant="primary" onClick={openCreateModal}>
                            <OperationIcon name="plus" />
                            新增操作
                        </WxbButton>
                    </span>
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

            <WxbModal
                title={qualifiedDetailsOperation ? `合格人员 - ${qualifiedDetailsOperation.operation_name}` : '合格人员'}
                open={qualifiedDetailsOperation !== null}
                onCancel={closeQualifiedPersonnelDetails}
                width={QUALIFIED_MODAL_WIDTH[qualifiedModalSize]}
                className={`operations-qualified-modal operations-qualified-modal--${qualifiedModalSize}`}
                destroyOnClose
                footer={(
                    <div className="operations-qualified-footer">
                        <WxbButton type="button" variant="secondary" onClick={closeQualifiedPersonnelDetails}>
                            关闭
                        </WxbButton>
                    </div>
                )}
            >
                {qualifiedDetailsLoading ? (
                    <div className="operations-qualified-loading">
                        <WxbSpinner tip="正在加载合格人员" />
                    </div>
                ) : qualifiedDetailsError ? (
                    <WxbEmpty
                        description="合格人员明细加载失败"
                        action={(
                            <WxbButton
                                type="button"
                                variant="secondary"
                                onClick={() => qualifiedDetailsOperation && openQualifiedPersonnelDetails(qualifiedDetailsOperation)}
                            >
                                重新加载
                            </WxbButton>
                        )}
                    />
                ) : qualifiedDetails ? (
                    <div className="operations-qualified-detail">
                        <div className="operations-qualified-summary">
                            <span className="operations-qualified-summary-main">
                                <WxbTag color="blue">{qualifiedDetails.operation_code}</WxbTag>
                                <WxbBadge
                                    status="info"
                                    variant="outline"
                                    code="位置"
                                    label={`${qualifiedDetails.required_people}`}
                                />
                                <span className="operations-muted">{qualifiedDetails.operation_name}</span>
                            </span>
                            <WxbSegmented
                                size="sm"
                                value={qualifiedModalSize}
                                options={QUALIFIED_MODAL_SIZE_OPTIONS}
                                onChange={(value) => setQualifiedModalSize(value as QualifiedModalSize)}
                                className="operations-qualified-size"
                            />
                        </div>

                        <WxbTabs
                            activeKey={qualifiedDetailsActivePosition}
                            onChange={setQualifiedDetailsActivePosition}
                            items={qualifiedDetailsTabs}
                            className="operations-qualified-tabs"
                        />

                        {activeQualifiedPosition && (
                            <div className="operations-qualified-panel">
                                <div className="operations-qualified-position-card">
                                    <div className="operations-qualified-position-meta">
                                        <WxbBadge
                                            status={activeQualifiedPosition.qualified_count > 0 ? 'success' : 'error'}
                                            variant="outline"
                                            code={`P${activeQualifiedPosition.position_number}`}
                                            label={`${activeQualifiedPosition.qualified_count} 人`}
                                        />
                                    </div>
                                    <div className="operations-qualified-requirement-block">
                                        <span className="operations-qualified-requirement-title">资质需求</span>
                                        <span className="operations-qualified-requirement-list">
                                            {activeQualifiedPosition.requirements.length > 0 ? (
                                                sortRequirementsByLevel(activeQualifiedPosition.requirements).map((requirement) => (
                                                    <WxbTooltip
                                                        key={`${requirement.qualification_id}-${requirement.min_level}-${String(requirement.is_mandatory)}`}
                                                        title={getRequirementLabel(requirement)}
                                                    >
                                                        <WxbTag
                                                            color={getQualificationLevelColor(requirement.min_level)}
                                                            className="operations-qualified-requirement-tag"
                                                        >
                                                            {getRequirementLabel(requirement)}
                                                        </WxbTag>
                                                    </WxbTooltip>
                                                ))
                                            ) : (
                                                <span className="operations-muted">暂无资质要求</span>
                                            )}
                                        </span>
                                    </div>
                                </div>

                                <WxbDataTable<QualifiedPersonnel>
                                    key={`qualified-personnel-${qualifiedDetails.operation_id}-${qualifiedDetailsActivePosition}-${editingPersonnelId ?? 'closed'}`}
                                    columns={qualifiedPersonnelColumns}
                                    dataSource={activeQualifiedPosition.personnel}
                                    rowKey="employee_id"
                                    density="compact"
                                    pagination={false}
                                    emptyState={{ description: '暂无合格人员' }}
                                    scroll={{ x: 860, y: QUALIFIED_TABLE_SCROLL_Y[qualifiedModalSize] }}
                                    expandable={{
                                        expandedRowKeys: editingPersonnelId ? [editingPersonnelId] : [],
                                        expandedRowRender: (record) =>
                                            editingPersonnelId === record.employee_id
                                                ? renderPersonnelQualificationEditor(record)
                                                : null,
                                        rowExpandable: () => true,
                                        showExpandColumn: false,
                                    }}
                                />
                            </div>
                        )}
                    </div>
                ) : null}
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

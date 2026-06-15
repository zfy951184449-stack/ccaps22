import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
    WxbBadge,
    WxbButton,
    WxbIcon,
    WxbInputNumber,
    WxbModal,
    WxbPopconfirm,
    WxbSearchInput,
    WxbSegmented,
    WxbSelect,
    WxbSwitch,
    WxbTooltip,
} from '../wxb-ui';

export type LeaderOpsPolicy = 'allow' | 'soft' | 'ban';

export interface SolverConfig {
    enable_share_group: boolean;
    enable_unique_employee: boolean;
    enable_one_position: boolean;
    enable_locked_operations: boolean;
    enable_locked_shifts: boolean;
    strict_locked_shifts: boolean;
    enable_shift_assignment: boolean;
    enable_max_consecutive_work_days: boolean;
    enable_max_consecutive_rest_days: boolean;
    enable_standard_hours: boolean;
    enable_night_rest: boolean;
    enable_no_isolated_night_shift: boolean;
    enable_night_shift_interval: boolean;
    enable_balance_night_shifts: boolean;
    enable_prefer_standard_shift: boolean;

    // 上班/休息节奏约束（高级配置）
    enable_consecutive_work_rest_pattern: boolean;
    min_consecutive_work_days_pattern: number;
    max_consecutive_work_days_pattern: number;
    min_consecutive_rest_days_pattern: number;
    max_consecutive_rest_days_pattern: number;

    // Parameters
    max_consecutive_rest_days: number;
    min_night_shift_interval: number;
    min_rest_after_night_block: number;

    // Night Rest Extension (soft)
    enable_prefer_extended_night_rest: boolean;
    preferred_night_rest_days: number;
    objective_weight_night_rest_extend: number;

    team_ids?: number[]; // Optional list of team IDs to filter by

    // Objectives
    enable_minimize_deviation: boolean;
    enable_minimize_special_shifts: boolean;
    objective_weight_deviation: number;
    objective_weight_special_shifts: number;
    objective_weight_night_balance: number;
    enable_balance_weekend_work: boolean;
    objective_weight_weekend_balance: number;
    enable_minimize_triple_salary: boolean;
    objective_weight_triple_salary: number;

    // Vacancy
    allow_position_vacancy: boolean;
    objective_weight_vacancy: number;
    off_hours_multiplier: number;

    // Standalone Tasks
    enable_standalone_tasks: boolean;
    allow_standalone_vacancy: boolean;
    objective_weight_standalone_vacancy: number;

    // Leadership Coverage
    enable_leadership_coverage: boolean;
    enable_leader_production_coverage: boolean;
    leader_ops_policy_group_leader: LeaderOpsPolicy;
    leader_ops_policy_team_leader: LeaderOpsPolicy;
    leader_ops_policy_dept_manager: LeaderOpsPolicy;
    leader_weekend_policy_group_leader: LeaderOpsPolicy;
    leader_weekend_policy_team_leader: LeaderOpsPolicy;
    leader_weekend_policy_dept_manager: LeaderOpsPolicy;
    objective_weight_leader_nonworkday: number;
    objective_weight_leader_workday_rest: number;
    objective_weight_leader_ops: number;
    objective_weight_leader_special: number;

    // Solver Time Control
    max_time_seconds: number;
    stagnation_limit: number;
}

export const DEFAULT_SOLVER_CONFIG: SolverConfig = {
    enable_share_group: true,
    enable_unique_employee: true,
    enable_one_position: true,
    enable_locked_operations: true,
    enable_locked_shifts: true,
    strict_locked_shifts: false,
    enable_shift_assignment: true,
    enable_max_consecutive_work_days: true,
    enable_max_consecutive_rest_days: true,
    enable_standard_hours: true,
    enable_night_rest: true,
    enable_no_isolated_night_shift: true,
    enable_night_shift_interval: true,
    enable_balance_night_shifts: true,
    enable_prefer_standard_shift: false,

    // 上班/休息节奏约束默认值（默认关闭）
    enable_consecutive_work_rest_pattern: false,
    min_consecutive_work_days_pattern: 2,
    max_consecutive_work_days_pattern: 3,
    min_consecutive_rest_days_pattern: 2,
    max_consecutive_rest_days_pattern: 3,

    // Parameter Defaults
    max_consecutive_rest_days: 4,
    min_night_shift_interval: 7,
    min_rest_after_night_block: 2,

    // Night Rest Extension Defaults
    enable_prefer_extended_night_rest: true,
    preferred_night_rest_days: 2,
    objective_weight_night_rest_extend: 15,

    team_ids: [], // Default to empty (all teams)

    // Objectives Defaults
    enable_minimize_deviation: true,
    enable_minimize_special_shifts: true,
    objective_weight_deviation: 1,
    objective_weight_special_shifts: 100,
    objective_weight_night_balance: 5,
    enable_balance_weekend_work: true,
    objective_weight_weekend_balance: 5,
    enable_minimize_triple_salary: true,
    objective_weight_triple_salary: 10,

    // Vacancy Defaults
    allow_position_vacancy: false,
    objective_weight_vacancy: 10000,
    off_hours_multiplier: 1.5,

    // Standalone Task Defaults
    enable_standalone_tasks: true,
    allow_standalone_vacancy: true,
    objective_weight_standalone_vacancy: 5000,

    // Leadership Coverage Defaults
    enable_leadership_coverage: true,
    enable_leader_production_coverage: true,
    leader_ops_policy_group_leader: 'soft',
    leader_ops_policy_team_leader: 'ban',
    leader_ops_policy_dept_manager: 'ban',
    leader_weekend_policy_group_leader: 'soft',
    leader_weekend_policy_team_leader: 'ban',
    leader_weekend_policy_dept_manager: 'soft',
    objective_weight_leader_nonworkday: 20,
    objective_weight_leader_workday_rest: 10,
    objective_weight_leader_ops: 30,
    objective_weight_leader_special: 50,

    // Solver Time Control Defaults
    max_time_seconds: 300,
    stagnation_limit: 300,
};

const LEADER_OPS_POLICY_OPTIONS = [
    { label: '允许参与', value: 'allow' },
    { label: '软性减少', value: 'soft' },
    { label: '禁止参与', value: 'ban' },
];

const LEADER_WEEKEND_POLICY_OPTIONS = [
    { label: '允许排班', value: 'allow' },
    { label: '软性减少', value: 'soft' },
    { label: '禁止排班', value: 'ban' },
];

interface SolverConfigurationModalProps {
    visible: boolean;
    config: SolverConfig;
    onConfigChange: (newConfig: SolverConfig) => void;
    onClose: () => void;
    /** 高亮指定 config_keys 对应的开关（来自无解诊断「跳到配置」）*/
    highlightKeys?: string[];
}

interface Team {
    id: number;
    teamName: string;
    teamCode: string;
}

type ViewMode = 'all' | 'changed' | 'affected';

/** 每个分类声明它「拥有」哪些 config 键 —— 用于 diff 计数、深链定位、搜索过滤、硬约束统计 */
interface CategoryMeta {
    key: string;
    label: string;
    /** 该分类下所有可见 config 键（含子面板键），用于逐键 diff 计数与命中判定 */
    configKeys: string[];
    /** 该分类下属于「硬约束」的键（被关闭时计入 danger 提示条）*/
    hardConstraintKeys?: string[];
    /** 左栏分类导航图标（复用已有领域图标）*/
    icon: React.ReactNode;
}

const SolverConfigurationModal: React.FC<SolverConfigurationModalProps> = ({
    visible,
    config,
    onConfigChange,
    onClose,
    highlightKeys,
}) => {
    const [teams, setTeams] = useState<Team[]>([]);
    const [loadingTeams, setLoadingTeams] = useState(false);

    const [activeCategoryKey, setActiveCategoryKey] = useState<string>('scope');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<ViewMode>('all');
    const bodyRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (visible) {
            fetchTeams();
        }
    }, [visible]);

    const fetchTeams = async () => {
        setLoadingTeams(true);
        try {
            const response = await fetch('/api/organization/solver-teams');
            const data = await response.json();
            if (Array.isArray(data)) {
                setTeams(data);
            }
        } catch (error) {
            console.error('Failed to fetch teams:', error);
        } finally {
            setLoadingTeams(false);
        }
    };

    const handleToggle = (key: keyof SolverConfig) => {
        onConfigChange({
            ...config,
            [key]: !config[key],
        });
    };

    const handleTeamChange = (values: number[]) => {
        onConfigChange({
            ...config,
            team_ids: values,
        });
    };

    const handleWeightChange = (key: keyof SolverConfig, value: number | null) => {
        if (value !== null) {
            onConfigChange({
                ...config,
                [key]: value,
            });
        }
    };

    const handleReset = () => {
        onConfigChange({ ...DEFAULT_SOLVER_CONFIG });
    };

    /** 单项撤销：把某个键回到 DEFAULT，照常即时 onConfigChange 写回父级 */
    const handleResetKey = (key: keyof SolverConfig) => {
        onConfigChange({
            ...config,
            [key]: DEFAULT_SOLVER_CONFIG[key],
        } as SolverConfig);
    };

    const isHighlighted = (key: string) => !!(highlightKeys && highlightKeys.includes(key));

    /** 行级是否偏离默认（浅比较；team_ids 数组按内容比较）*/
    const isDirtyKey = useCallback((key: string): boolean => {
        const cur = (config as unknown as Record<string, unknown>)[key];
        const def = (DEFAULT_SOLVER_CONFIG as unknown as Record<string, unknown>)[key];
        if (Array.isArray(cur) || Array.isArray(def)) {
            const a = (Array.isArray(cur) ? cur : []) as unknown[];
            const b = (Array.isArray(def) ? def : []) as unknown[];
            if (a.length !== b.length) return true;
            return a.some((v, i) => v !== b[i]);
        }
        return cur !== def;
    }, [config]);

    const constraints = [
        { key: 'enable_share_group', title: '共享组约束', description: '同一共享组内人员的排班互斥/共存规则' },
        { key: 'enable_unique_employee', title: '人员唯一性', description: '同一时段内每人仅能分配一个岗位' },
        { key: 'enable_one_position', title: '一人一岗', description: '同一操作内禁止多岗位分配' },
        { key: 'enable_locked_operations', title: '保留锁定操作', description: '手工锁定的操作人员分配将作为硬约束保留' },
        { key: 'enable_locked_shifts', title: '保留锁定班次', description: '手工锁定的员工班次将作为硬约束保留' },
        { key: 'strict_locked_shifts', title: '└ 严格模式', description: '锁定数据异常时直接报错（关闭则跳过异常条目）', indent: true },
        { key: 'enable_shift_assignment', title: '班次分配规则', description: '根据任务需求自动关联班次' },
        { key: 'enable_standard_hours', title: '标准工时合规', description: '确保排班符合法定工时要求' },
        { key: 'enable_prefer_standard_shift', title: '优先标准班次', description: '无操作需求时优先安排标准班（白班）' },
        { key: 'enable_leadership_coverage', title: '领导层排班约束', description: '生产日必须有管理岗在岗；TEAM_LEADER/DEPT_MANAGER 不参与操作；TEAM_LEADER 周末禁排、GROUP_LEADER 周末少排（可在下方按职级调整）' },
        { key: 'enable_leader_production_coverage', title: '└ 生产日需领导在岗', description: '每个有生产操作的日期至少 1 名管理岗上班（硬约束）。领导太少、覆盖不过来导致无解时可关闭', indent: true },
    ];

    const consecutiveDaysConstraints = [
        { key: 'enable_max_consecutive_work_days', title: '最大连续工作天数', description: '限制连续工作天数上限' },
        { key: 'enable_max_consecutive_rest_days', title: '最大连续休息天数', description: '限制连续休息天数，防止长期缺勤' },
        {
            key: 'enable_consecutive_work_rest_pattern',
            title: '上班/休息节奏约束',
            description: '有操作安排时：连续上班 [最少–最多] 天，连续休息 [最少–最多] 天',
        },
    ];

    const nightShiftConstraints = [
        { key: 'enable_night_rest', title: '夜班后休息', description: '夜班后强制安排休息日' },
        { key: 'enable_prefer_extended_night_rest', title: '└ 优先延长休息', description: '夜班后尽可能休息更多天（软约束）', indent: true },
        { key: 'enable_no_isolated_night_shift', title: '禁止孤立夜班', description: '夜班前一天必须是白班，禁止休息后直接上夜班' },
        { key: 'enable_night_shift_interval', title: '夜班间隔', description: '两次夜班之间的最小间隔天数' },
        { key: 'enable_balance_night_shifts', title: '夜班均衡', description: '团队内夜班数量均匀分配' },
    ];

    const objectiveControls = [
        {
            key: 'enable_minimize_deviation',
            weightKey: 'objective_weight_deviation',
            title: '最小化工时偏差',
            description: '减少实际工时与标准工时的偏差',
        },
        {
            key: 'enable_minimize_special_shifts',
            weightKey: 'objective_weight_special_shifts',
            title: '最小化特殊班次',
            description: '减少非标准班次的使用数量',
        },
        {
            key: 'enable_balance_night_shifts',
            weightKey: 'objective_weight_night_balance',
            title: '夜班均衡分配',
            description: '惩罚夜班分配不均匀（方差 x 权重）',
        },
        {
            key: 'enable_balance_weekend_work',
            weightKey: 'objective_weight_weekend_balance',
            title: '周末工作均衡',
            description: '惩罚周末/节假日工作分配不均匀',
        },
        {
            key: 'enable_minimize_triple_salary',
            weightKey: 'objective_weight_triple_salary',
            title: '三倍薪日成本优化',
            description: '尽量避免在法定节假日安排排班',
        },
        {
            key: 'allow_position_vacancy',
            weightKey: 'objective_weight_vacancy',
            title: '允许岗位空缺',
            description: '允许无人接手时留空（高惩罚权重）',
        },
    ];

    const isToggleDisabled = (key: keyof SolverConfig) =>
        (key === 'strict_locked_shifts' && !config.enable_locked_shifts) ||
        (key === 'enable_prefer_extended_night_rest' && !config.enable_night_rest) ||
        (key === 'enable_leader_production_coverage' && !config.enable_leadership_coverage);

    const onNumberChange = (key: keyof SolverConfig, value: number | string | null) => {
        handleWeightChange(key, typeof value === 'number' ? value : value === null ? null : Number(value));
    };

    /** 行级偏离默认的小圆点 +「↺ 恢复此项」按钮（disabled 行不显，避免误改不可改键） */
    const renderRowResetAffordance = (key: string, disabled?: boolean) => {
        if (disabled || !isDirtyKey(key)) return null;
        return (
            <div className="solver-v4-config-row-reset">
                <span className="solver-v4-config-dirty-dot" aria-hidden="true" />
                <button
                    type="button"
                    className="solver-v4-config-reset-btn"
                    onClick={() => handleResetKey(key as keyof SolverConfig)}
                >
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M3.5 8a4.5 4.5 0 1 1 1.32 3.18" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
                        <path d="M3.5 5.2V8h2.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                    恢复此项
                </button>
            </div>
        );
    };

    const renderToggleRows = (items: { key: string; title: string; description: string; indent?: boolean }[]) => (
        <div className="solver-v4-config-list">
            {items.map((item) => {
                const key = item.key as keyof SolverConfig;
                const highlighted = isHighlighted(item.key);
                const disabled = isToggleDisabled(key);
                return (
                    <div
                        key={item.key}
                        data-config-key={item.key}
                        className={`solver-v4-config-row ${item.indent ? 'solver-v4-config-row-indent' : ''} ${highlighted ? 'solver-v4-config-row-highlight' : ''} ${isDirtyKey(item.key) ? 'solver-v4-config-row-dirty' : ''}`}
                    >
                        <div className="solver-v4-config-copy">
                            <strong>{item.title}</strong>
                            <span>{item.description}</span>
                        </div>
                        <div className="solver-v4-config-row-tail">
                            {renderRowResetAffordance(item.key, disabled)}
                            <WxbSwitch
                                checked={config[key] as boolean}
                                onChange={() => handleToggle(key)}
                                disabled={disabled}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );

    const renderNumberField = (
        key: keyof SolverConfig,
        label: string,
        options?: { min?: number; max?: number; step?: number; addonAfter?: string; disabled?: boolean },
    ) => (
        <label className={`solver-v4-number-field ${isHighlighted(key as string) ? 'solver-v4-config-row-highlight' : ''}`} data-config-key={key}>
            <span className="solver-v4-number-field-label">
                {label}
                {renderRowResetAffordance(key as string, options?.disabled)}
            </span>
            <WxbInputNumber
                size="small"
                min={options?.min}
                max={options?.max}
                step={options?.step}
                value={config[key] as number}
                onChange={(val) => onNumberChange(key, val)}
                addonAfter={options?.addonAfter}
                disabled={options?.disabled}
            />
        </label>
    );

    const renderLeaderPolicyRow = (
        key: keyof SolverConfig,
        roleCode: string,
        hint: string,
        options = LEADER_OPS_POLICY_OPTIONS,
    ) => (
        <div
            className={`solver-v4-config-row ${isHighlighted(key as string) ? 'solver-v4-config-row-highlight' : ''} ${isDirtyKey(key as string) ? 'solver-v4-config-row-dirty' : ''}`}
            data-config-key={key}
        >
            <div className="solver-v4-config-copy">
                {/* 职级保持英文字段码，严禁翻译 */}
                <strong>{roleCode}</strong>
                <span>{hint}</span>
            </div>
            <div className="solver-v4-config-row-tail">
                {renderRowResetAffordance(key as string)}
                <WxbSegmented
                    size="sm"
                    options={options}
                    value={config[key] as string}
                    onChange={(v) => onConfigChange({ ...config, [key]: v as LeaderOpsPolicy })}
                />
            </div>
        </div>
    );

    /** 条件子面板包装：紧贴触发开关就地下挂，用 max-height+opacity 过渡平滑展开 */
    const renderConditionalSubpanel = (open: boolean, children: React.ReactNode, key: string) => (
        <div
            key={key}
            className={`solver-v4-config-subpanel-collapse ${open ? 'is-open' : ''}`}
            aria-hidden={!open}
        >
            <div className="solver-v4-config-subpanel-inner">
                <section className="solver-v4-config-subpanel">{children}</section>
            </div>
        </div>
    );

    // ── 分类元数据 ───────────────────────────────────────────────────────────────
    const teamScopeIcon = <WxbIcon name="upstream-suite" size={16} />;
    const hardConstraintIcon = <WxbIcon name="released" size={16} />;
    const consecutiveIcon = <WxbIcon name="hold-time" size={16} />;
    const nightIcon = <WxbIcon name="thermo-probe" size={16} />;
    const standaloneIcon = <WxbIcon name="kanban" size={16} />;
    const objectiveIcon = <WxbIcon name="review-ok" size={16} />;

    const categories: CategoryMeta[] = useMemo(() => [
        {
            key: 'scope',
            label: '求解范围与参数',
            icon: teamScopeIcon,
            configKeys: ['team_ids', 'max_time_seconds', 'stagnation_limit'],
        },
        {
            key: 'hard',
            label: '硬约束',
            icon: hardConstraintIcon,
            configKeys: [
                ...constraints.map((c) => c.key),
                'leader_ops_policy_dept_manager',
                'leader_ops_policy_team_leader',
                'leader_ops_policy_group_leader',
                'leader_weekend_policy_dept_manager',
                'leader_weekend_policy_team_leader',
                'leader_weekend_policy_group_leader',
                'objective_weight_leader_nonworkday',
                'objective_weight_leader_workday_rest',
                'objective_weight_leader_ops',
                'objective_weight_leader_special',
            ],
            // 硬约束开关键（关闭即计入 danger 提示）。子开关 strict_locked_shifts 是模式细化，不计。
            hardConstraintKeys: [
                'enable_share_group',
                'enable_unique_employee',
                'enable_one_position',
                'enable_locked_operations',
                'enable_locked_shifts',
                'enable_shift_assignment',
                'enable_standard_hours',
                'enable_leadership_coverage',
                'enable_leader_production_coverage',
            ],
        },
        {
            key: 'consecutive',
            label: '连续天数约束',
            icon: consecutiveIcon,
            configKeys: [
                ...consecutiveDaysConstraints.map((c) => c.key),
                'min_consecutive_work_days_pattern',
                'max_consecutive_work_days_pattern',
                'min_consecutive_rest_days_pattern',
                'max_consecutive_rest_days_pattern',
            ],
        },
        {
            key: 'night',
            label: '夜班约束',
            icon: nightIcon,
            configKeys: [
                ...nightShiftConstraints.map((c) => c.key),
                'min_night_shift_interval',
                'preferred_night_rest_days',
                'objective_weight_night_rest_extend',
            ],
        },
        {
            key: 'standalone',
            label: '独立任务',
            icon: standaloneIcon,
            configKeys: ['enable_standalone_tasks', 'allow_standalone_vacancy', 'objective_weight_standalone_vacancy'],
        },
        {
            key: 'objective',
            label: '优化目标',
            icon: objectiveIcon,
            configKeys: objectiveControls.flatMap((o) => [o.key, o.weightKey]),
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ], []);

    // ── 全局 / 每类 diff 计数 ─────────────────────────────────────────────────────
    const globalDirtyCount = useMemo(() => {
        const allKeys = new Set<string>();
        categories.forEach((cat) => cat.configKeys.forEach((k) => allKeys.add(k)));
        let n = 0;
        allKeys.forEach((k) => {
            if (isDirtyKey(k)) n += 1;
        });
        return n;
    }, [categories, isDirtyKey]);

    const categoryDirtyCount = useCallback(
        (cat: CategoryMeta) => cat.configKeys.reduce((acc, k) => acc + (isDirtyKey(k) ? 1 : 0), 0),
        [isDirtyKey],
    );

    const categoryHasHighlight = useCallback(
        (cat: CategoryMeta) => cat.configKeys.some((k) => isHighlighted(k)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [highlightKeys],
    );

    const hasAnyHighlight = !!(highlightKeys && highlightKeys.length > 0);

    // ── 深链：highlightKeys 变化时跳到对应分类并滚动到该控件 ─────────────────────
    useEffect(() => {
        if (!visible) return;
        if (!highlightKeys || highlightKeys.length === 0) return;
        const firstKey = highlightKeys[0];
        const targetCat = categories.find((cat) => cat.configKeys.includes(firstKey));
        if (targetCat) {
            setActiveCategoryKey(targetCat.key);
        }
        setViewMode('affected');
        const timer = setTimeout(() => {
            const root = bodyRef.current;
            if (!root) return;
            const el = root.querySelector(`[data-config-key="${firstKey}"]`);
            (el as HTMLElement | null)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 120);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [highlightKeys, visible]);

    // ── 搜索过滤：title/description/别名 ──────────────────────────────────────────
    const normalizedQuery = searchQuery.trim().toLowerCase();

    /** 行别名表（中文术语 → 工程键/同义词），让搜索能命中口语化关键词 */
    const ROW_ALIASES: Record<string, string> = {
        team_ids: '团队 范围 团队范围',
        max_time_seconds: '时间 求解时间 timeout',
        stagnation_limit: '停滞 超时 提前停止 无改进',
        enable_leadership_coverage: '领导 管理岗 leader',
        enable_night_shift_interval: '夜班 间隔',
        allow_position_vacancy: '空缺 vacancy',
    };

    const rowMatchesQuery = useCallback(
        (configKey: string, title?: string, description?: string) => {
            if (!normalizedQuery) return true;
            const haystack = [
                configKey,
                title || '',
                description || '',
                ROW_ALIASES[configKey] || '',
            ]
                .join(' ')
                .toLowerCase();
            return haystack.includes(normalizedQuery);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [normalizedQuery],
    );

    /** 视图过滤 + 搜索：一行是否应渲染 */
    const shouldRenderRow = useCallback(
        (configKey: string, title?: string, description?: string) => {
            if (!rowMatchesQuery(configKey, title, description)) return false;
            if (viewMode === 'changed' && !isDirtyKey(configKey)) return false;
            if (viewMode === 'affected' && !isHighlighted(configKey)) return false;
            return true;
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [rowMatchesQuery, viewMode, isDirtyKey, highlightKeys],
    );

    /** 过滤后的 toggle 列表 */
    const filterToggleItems = (items: { key: string; title: string; description: string; indent?: boolean }[]) =>
        items.filter((i) => shouldRenderRow(i.key, i.title, i.description));

    /** 当前搜索下，哪些分类应显示在左栏（搜索时只留有命中行的分类）*/
    const categoryVisibleInSearch = useCallback(
        (cat: CategoryMeta) => {
            if (!normalizedQuery) return true;
            return cat.configKeys.some((k) => rowMatchesQuery(k, undefined, undefined)) ||
                cat.label.toLowerCase().includes(normalizedQuery) ||
                // 也允许通过行 title/description 命中：用各分类已知行做近似匹配
                rowTitleHit(cat, normalizedQuery);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [normalizedQuery, rowMatchesQuery],
    );

    /** 用各分类静态行 title/description 做命中（搜索导航过滤）*/
    function rowTitleHit(cat: CategoryMeta, q: string): boolean {
        const pools: { key: string; title: string; description: string }[] = [];
        if (cat.key === 'hard') pools.push(...constraints);
        if (cat.key === 'consecutive') pools.push(...consecutiveDaysConstraints);
        if (cat.key === 'night') pools.push(...nightShiftConstraints);
        if (cat.key === 'objective') pools.push(...objectiveControls.map((o) => ({ key: o.key, title: o.title, description: o.description })));
        return pools.some((r) => `${r.title} ${r.description}`.toLowerCase().includes(q));
    }

    // ── 右栏各分类渲染 ────────────────────────────────────────────────────────────

    const renderScopePanel = () => {
        const showTeam = shouldRenderRow('team_ids', '团队范围', '限定求解范围至指定团队');
        const showMaxTime = shouldRenderRow('max_time_seconds', '最大求解时间', '时间越长结果越优');
        const showStagnation = shouldRenderRow('stagnation_limit', '停滞超时', '无改进则提前停止');
        return (
            <>
                {showTeam && (
                    <section className="solver-v4-config-panel">
                        <div className="solver-v4-config-panel-title">
                            {teamScopeIcon}
                            <strong>团队范围</strong>
                        </div>
                        <p>限定求解范围至指定团队。留空则包含所有员工。</p>
                        <div data-config-key="team_ids" className={isDirtyKey('team_ids') ? 'solver-v4-config-field-dirty' : ''}>
                            <WxbSelect
                                mode="multiple"
                                placeholder="选择团队（默认：全部）"
                                value={config.team_ids}
                                onChange={(values) => handleTeamChange(values as number[])}
                                loading={loadingTeams}
                                optionFilterProp="label"
                                allowClear
                                options={teams.map(team => ({
                                    value: team.id,
                                    label: `${team.teamName} (${team.teamCode})`,
                                }))}
                            />
                            {renderRowResetAffordance('team_ids')}
                        </div>
                    </section>
                )}

                {(showMaxTime || showStagnation) && (
                    <section className="solver-v4-config-panel solver-v4-config-panel-info">
                        <div className="solver-v4-config-panel-title">
                            <WxbIcon name="hold-time" size={16} />
                            <strong>求解参数</strong>
                        </div>
                        <p>时间越长结果越优，但响应更慢。建议范围 60 到 600 秒。</p>
                        <div className="solver-v4-config-grid">
                            {showMaxTime && renderNumberField('max_time_seconds', '最大求解时间', { min: 30, max: 3600, step: 30, addonAfter: '秒' })}
                            {showStagnation && (
                                <WxbTooltip title="求解一段时间内目标无改进则提前停止，节省时间">
                                    <div className="solver-v4-field-with-hint">
                                        {renderNumberField('stagnation_limit', '停滞超时', { min: 30, max: 3600, step: 30, addonAfter: '秒' })}
                                        <span className="solver-v4-field-subhint">无改进则提前停止</span>
                                    </div>
                                </WxbTooltip>
                            )}
                        </div>
                    </section>
                )}
            </>
        );
    };

    const renderHardConstraintPanel = () => {
        const visibleConstraints = filterToggleItems(constraints);
        const leaderRows = [
            { key: 'leader_ops_policy_dept_manager', title: 'DEPT_MANAGER 操作策略', desc: '默认：禁止参与生产' },
            { key: 'leader_ops_policy_team_leader', title: 'TEAM_LEADER 操作策略', desc: '默认：禁止参与生产' },
            { key: 'leader_ops_policy_group_leader', title: 'GROUP_LEADER 操作策略', desc: '默认：软性减少' },
            { key: 'leader_weekend_policy_dept_manager', title: 'DEPT_MANAGER 周末策略', desc: '默认：软性减少' },
            { key: 'leader_weekend_policy_team_leader', title: 'TEAM_LEADER 周末策略', desc: '默认：禁止排班' },
            { key: 'leader_weekend_policy_group_leader', title: 'GROUP_LEADER 周末策略', desc: '默认：软性减少' },
            { key: 'objective_weight_leader_nonworkday', title: '非工作日出勤惩罚', desc: '权重' },
            { key: 'objective_weight_leader_workday_rest', title: '工作日休息惩罚', desc: '权重' },
            { key: 'objective_weight_leader_ops', title: '操作分配惩罚', desc: '权重' },
            { key: 'objective_weight_leader_special', title: '特殊班次惩罚', desc: '权重' },
        ];
        const leaderVisible = config.enable_leadership_coverage &&
            leaderRows.some((r) => shouldRenderRow(r.key, r.title, r.desc));

        return (
            <>
                {visibleConstraints.length > 0 && renderToggleRows(visibleConstraints)}

                {leaderVisible && (
                    <section className="solver-v4-config-subpanel">
                        <p>各管理职级参与生产操作的策略（SHIFT_LEADER 视为一线，不在此列）。</p>
                        <div className="solver-v4-config-list">
                            {shouldRenderRow('leader_ops_policy_dept_manager', 'DEPT_MANAGER 操作策略', '默认：禁止参与生产') &&
                                renderLeaderPolicyRow('leader_ops_policy_dept_manager', 'DEPT_MANAGER', '默认：禁止参与生产')}
                            {shouldRenderRow('leader_ops_policy_team_leader', 'TEAM_LEADER 操作策略', '默认：禁止参与生产') &&
                                renderLeaderPolicyRow('leader_ops_policy_team_leader', 'TEAM_LEADER', '默认：禁止参与生产')}
                            {shouldRenderRow('leader_ops_policy_group_leader', 'GROUP_LEADER 操作策略', '默认：软性减少') &&
                                renderLeaderPolicyRow('leader_ops_policy_group_leader', 'GROUP_LEADER', '默认：软性减少')}
                        </div>
                        <p>各管理职级在周末/非工作日的排班策略（按排班日历判定为非工作日（周末/节假日），含节假日）。</p>
                        <div className="solver-v4-config-list">
                            {shouldRenderRow('leader_weekend_policy_dept_manager', 'DEPT_MANAGER 周末策略', '默认：软性减少') &&
                                renderLeaderPolicyRow('leader_weekend_policy_dept_manager', 'DEPT_MANAGER', '默认：软性减少', LEADER_WEEKEND_POLICY_OPTIONS)}
                            {shouldRenderRow('leader_weekend_policy_team_leader', 'TEAM_LEADER 周末策略', '默认：禁止排班') &&
                                renderLeaderPolicyRow('leader_weekend_policy_team_leader', 'TEAM_LEADER', '默认：禁止排班', LEADER_WEEKEND_POLICY_OPTIONS)}
                            {shouldRenderRow('leader_weekend_policy_group_leader', 'GROUP_LEADER 周末策略', '默认：软性减少') &&
                                renderLeaderPolicyRow('leader_weekend_policy_group_leader', 'GROUP_LEADER', '默认：软性减少', LEADER_WEEKEND_POLICY_OPTIONS)}
                        </div>
                        <p>管理岗偏好权重配置。数值越大，优化压力越高。</p>
                        <div className="solver-v4-config-grid">
                            {shouldRenderRow('objective_weight_leader_nonworkday', '非工作日出勤惩罚', '权重') &&
                                renderNumberField('objective_weight_leader_nonworkday', '非工作日出勤惩罚', { min: 0, max: 1000 })}
                            {shouldRenderRow('objective_weight_leader_workday_rest', '工作日休息惩罚', '权重') &&
                                renderNumberField('objective_weight_leader_workday_rest', '工作日休息惩罚', { min: 0, max: 1000 })}
                            {shouldRenderRow('objective_weight_leader_ops', '操作分配惩罚', '权重') &&
                                renderNumberField('objective_weight_leader_ops', '操作分配惩罚', { min: 0, max: 1000 })}
                            {shouldRenderRow('objective_weight_leader_special', '特殊班次惩罚', '权重') &&
                                renderNumberField('objective_weight_leader_special', '特殊班次惩罚', { min: 0, max: 1000 })}
                        </div>
                    </section>
                )}
            </>
        );
    };

    const renderConsecutivePanel = () => {
        const visible = filterToggleItems(consecutiveDaysConstraints);
        const patternRows = [
            { key: 'min_consecutive_work_days_pattern', title: '最少连续上班' },
            { key: 'max_consecutive_work_days_pattern', title: '最多连续上班' },
            { key: 'min_consecutive_rest_days_pattern', title: '最少连续休息' },
            { key: 'max_consecutive_rest_days_pattern', title: '最多连续休息' },
        ];
        const patternVisible = config.enable_consecutive_work_rest_pattern &&
            patternRows.some((r) => shouldRenderRow(r.key, r.title, '上班/休息节奏'));
        return (
            <>
                {visible.length > 0 && renderToggleRows(visible)}
                {renderConditionalSubpanel(
                    patternVisible,
                    <>
                        <p>启用后若存在锁定班次，请确认不与该约束冲突。</p>
                        <div className="solver-v4-config-grid">
                            {renderNumberField('min_consecutive_work_days_pattern', '最少连续上班', { min: 1, max: config.max_consecutive_work_days_pattern, addonAfter: '天' })}
                            {renderNumberField('max_consecutive_work_days_pattern', '最多连续上班', { min: config.min_consecutive_work_days_pattern, max: 7, addonAfter: '天' })}
                            {renderNumberField('min_consecutive_rest_days_pattern', '最少连续休息', { min: 1, max: config.max_consecutive_rest_days_pattern, addonAfter: '天' })}
                            {renderNumberField('max_consecutive_rest_days_pattern', '最多连续休息', { min: config.min_consecutive_rest_days_pattern, max: 7, addonAfter: '天' })}
                        </div>
                    </>,
                    'consecutive-pattern',
                )}
            </>
        );
    };

    const renderNightPanel = () => {
        const visible = filterToggleItems(nightShiftConstraints);
        const intervalVisible = config.enable_night_shift_interval &&
            shouldRenderRow('min_night_shift_interval', '夜班最小间隔天数', '夜班间隔');
        const extendVisible = config.enable_prefer_extended_night_rest && config.enable_night_rest &&
            (shouldRenderRow('preferred_night_rest_days', '期望休息天数', '延长休息') ||
                shouldRenderRow('objective_weight_night_rest_extend', '惩罚权重', '延长休息'));
        return (
            <>
                {visible.length > 0 && renderToggleRows(visible)}
                {renderConditionalSubpanel(
                    intervalVisible,
                    <>
                        {renderNumberField('min_night_shift_interval', '夜班最小间隔天数', { min: 2, max: 30, addonAfter: '天' })}
                        <p>
                            当前设置：两次夜班之间至少间隔 {(config.min_night_shift_interval || 7) - 1} 天
                        </p>
                    </>,
                    'night-interval',
                )}
                {renderConditionalSubpanel(
                    extendVisible,
                    <>
                        <div className="solver-v4-config-grid">
                            {renderNumberField('preferred_night_rest_days', '期望休息天数', { min: 2, max: 4, addonAfter: '天' })}
                            {renderNumberField('objective_weight_night_rest_extend', '惩罚权重', { min: 0, max: 500 })}
                        </div>
                        <p>
                            强制休息 1 天 + 尽量多休 {(config.preferred_night_rest_days || 2) - 1} 天
                        </p>
                    </>,
                    'night-extend',
                )}
            </>
        );
    };

    const renderStandalonePanel = () => {
        const showMain = shouldRenderRow('enable_standalone_tasks', '纳入独立任务', '启用后当月有效的独立任务将参与自动排班');
        const showVacancy = config.enable_standalone_tasks &&
            shouldRenderRow('allow_standalone_vacancy', '允许独立任务空缺', '无合适候选人时允许岗位留空');
        const showWeight = config.enable_standalone_tasks && config.allow_standalone_vacancy &&
            shouldRenderRow('objective_weight_standalone_vacancy', '空缺惩罚权重', '独立任务');
        if (!showMain && !showVacancy && !showWeight) return null;
        return (
            <section className="solver-v4-config-panel">
                <div className="solver-v4-config-panel-title">
                    {standaloneIcon}
                    <strong>独立任务配置</strong>
                </div>
                <p>控制值班任务（周期/弹性/临时）是否参与自动排班及其空缺策略。</p>
                <div className="solver-v4-config-list">
                    {showMain && (
                        <div
                            className={`solver-v4-config-row ${isDirtyKey('enable_standalone_tasks') ? 'solver-v4-config-row-dirty' : ''}`}
                            data-config-key="enable_standalone_tasks"
                        >
                            <div className="solver-v4-config-copy">
                                <strong>纳入独立任务</strong>
                                <span>启用后，当月有效的独立任务将参与自动排班</span>
                            </div>
                            <div className="solver-v4-config-row-tail">
                                {renderRowResetAffordance('enable_standalone_tasks')}
                                <WxbSwitch checked={config.enable_standalone_tasks} onChange={() => handleToggle('enable_standalone_tasks')} />
                            </div>
                        </div>
                    )}
                    {showVacancy && (
                        <div
                            className={`solver-v4-config-row solver-v4-config-row-indent ${isDirtyKey('allow_standalone_vacancy') ? 'solver-v4-config-row-dirty' : ''}`}
                            data-config-key="allow_standalone_vacancy"
                        >
                            <div className="solver-v4-config-copy">
                                <strong>允许独立任务空缺</strong>
                                <span>无合适候选人时允许岗位留空</span>
                            </div>
                            <div className="solver-v4-config-row-tail">
                                {renderRowResetAffordance('allow_standalone_vacancy')}
                                <WxbSwitch checked={config.allow_standalone_vacancy} onChange={() => handleToggle('allow_standalone_vacancy')} />
                            </div>
                        </div>
                    )}
                    {showWeight && (
                        <div className="solver-v4-config-row solver-v4-config-row-indent">
                            {renderNumberField('objective_weight_standalone_vacancy', '空缺惩罚权重', { min: 100, max: 100000, step: 1000 })}
                        </div>
                    )}
                </div>
            </section>
        );
    };

    const renderObjectivePanel = () => {
        const visible = objectiveControls.filter((item) => shouldRenderRow(item.key, item.title, item.description));
        if (visible.length === 0) return null;
        return (
            <div className="solver-v4-config-list">
                {visible.map((item) => {
                    const key = item.key as keyof SolverConfig;
                    const weightKey = item.weightKey as keyof SolverConfig;
                    return (
                        <div
                            key={item.key}
                            className={`solver-v4-config-row solver-v4-config-row-objective ${isDirtyKey(item.key) || isDirtyKey(item.weightKey) ? 'solver-v4-config-row-dirty' : ''}`}
                            data-config-key={item.key}
                        >
                            <div className="solver-v4-config-copy">
                                <strong>{item.title}</strong>
                                <span>{item.description}</span>
                                {/* 6 个优化目标统一方向说明 */}
                                <span className="solver-v4-objective-direction">数值越大，越强地避免此情况</span>
                            </div>
                            <div className="solver-v4-objective-controls">
                                {renderNumberField(weightKey, '权重', { min: 0, disabled: !(config[key] as boolean) })}
                                <WxbSwitch
                                    checked={config[key] as boolean}
                                    onChange={() => handleToggle(key)}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderActivePanel = () => {
        switch (activeCategoryKey) {
            case 'scope':
                return renderScopePanel();
            case 'hard':
                return renderHardConstraintPanel();
            case 'consecutive':
                return renderConsecutivePanel();
            case 'night':
                return renderNightPanel();
            case 'standalone':
                return renderStandalonePanel();
            case 'objective':
                return renderObjectivePanel();
            default:
                return null;
        }
    };

    const activeCategory = categories.find((c) => c.key === activeCategoryKey) || categories[0];
    const activeDirty = categoryDirtyCount(activeCategory);
    const activeKeyCount = activeCategory.configKeys.length;

    /** 当前分类下被关闭的硬约束数（用于 danger 提示条）*/
    const activeDisabledHardCount = (activeCategory.hardConstraintKeys || []).reduce(
        (acc, k) => acc + ((config as unknown as Record<string, unknown>)[k] === false ? 1 : 0),
        0,
    );

    return (
        <WxbModal
            open={visible}
            onCancel={onClose}
            footer={(
                <div className="solver-v4-modal-footer">
                    <WxbPopconfirm
                        title="将重置全部为默认，确定？"
                        okText="重置"
                        cancelText="取消"
                        onConfirm={handleReset}
                    >
                        <WxbButton type="button" variant="ghost">
                            <WxbIcon name="flow-divert" size={15} />
                            恢复默认
                        </WxbButton>
                    </WxbPopconfirm>
                    <div className="solver-v4-modal-footer-right">
                        <WxbButton type="button" variant="ghost" onClick={onClose}>
                            取消
                        </WxbButton>
                        <WxbButton type="button" variant="primary" onClick={onClose}>
                            <WxbIcon name="released" size={15} />
                            应用配置{globalDirtyCount > 0 ? ` · ${globalDirtyCount}` : ''}
                        </WxbButton>
                    </div>
                </div>
            )}
            width={920}
            className="solver-v4-config-modal solver-v4-config-modal-split"
        >
            <div className="solver-v4-config-topbar">
                <span className="solver-v4-config-topbar-title">求解器配置</span>
                {globalDirtyCount > 0 && (
                    <WxbBadge status="info" label={`已改 ${globalDirtyCount} 项`} />
                )}
                <div className="solver-v4-config-title-spacer" />
                <WxbSegmented
                    size="sm"
                    options={[
                        { label: '全部', value: 'all' },
                        { label: `仅已改动 ${globalDirtyCount}`, value: 'changed' },
                        { label: '仅受影响', value: 'affected', disabled: !hasAnyHighlight },
                    ]}
                    value={viewMode}
                    onChange={(v) => setViewMode(v as ViewMode)}
                />
            </div>
            <div className="solver-v4-config-split">
                {/* ── 左栏：搜索 + 分类导航 ── */}
                <aside className="solver-v4-config-nav">
                    <div className="solver-v4-config-nav-search">
                        <WxbSearchInput
                            placeholder="搜配置项 / 术语"
                            value={searchQuery}
                            onChange={(v) => setSearchQuery(v)}
                        />
                    </div>
                    <nav className="solver-v4-config-nav-list">
                        {categories.map((cat) => {
                            if (!categoryVisibleInSearch(cat)) return null;
                            const dirty = categoryDirtyCount(cat);
                            const hit = categoryHasHighlight(cat);
                            const isActive = cat.key === activeCategoryKey;
                            return (
                                <button
                                    type="button"
                                    key={cat.key}
                                    className={`solver-v4-config-nav-item ${isActive ? 'is-active' : ''}`}
                                    onClick={() => setActiveCategoryKey(cat.key)}
                                >
                                    <span className="solver-v4-config-nav-icon">{cat.icon}</span>
                                    <span className="solver-v4-config-nav-label">{cat.label}</span>
                                    {hit && <span className="solver-v4-config-nav-amber-dot" aria-label="含受影响项" />}
                                    {dirty > 0 && (
                                        <WxbBadge status="info" label={String(dirty)} className="solver-v4-config-nav-badge" />
                                    )}
                                </button>
                            );
                        })}
                    </nav>
                </aside>

                {/* ── 右栏：当前分类控件 ── */}
                <div className="solver-v4-config-detail" ref={bodyRef}>
                    <div className="solver-v4-config-detail-head">
                        <h3 className="solver-v4-config-detail-title">{activeCategory.label}</h3>
                        <span className="solver-v4-config-detail-meta">
                            {activeKeyCount} 项 · 已改 {activeDirty}
                        </span>
                    </div>

                    {activeDisabledHardCount > 0 && (
                        <div className="solver-v4-config-danger-bar">
                            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                <path d="M8 1.8L14.5 13.2H1.5L8 1.8Z" stroke="var(--wx-red-700)" strokeWidth="1.3" strokeLinejoin="round" fill="none" />
                                <path d="M8 6V9" stroke="var(--wx-red-700)" strokeWidth="1.3" strokeLinecap="round" />
                                <circle cx="8" cy="11" r="0.8" fill="var(--wx-red-700)" />
                            </svg>
                            <span>已关闭 {activeDisabledHardCount} 项硬约束，发起求解前请确认。</span>
                        </div>
                    )}

                    <div className="solver-v4-config-detail-body">
                        {renderActivePanel()}
                    </div>
                </div>
            </div>
        </WxbModal>
    );
};

export default SolverConfigurationModal;

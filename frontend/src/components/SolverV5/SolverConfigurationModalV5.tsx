import React, { useState, useEffect } from 'react';
import {
    WxbButton,
    WxbDivider,
    WxbIcon,
    WxbInputNumber,
    WxbModal,
    WxbSegmented,
    WxbSelect,
    WxbSwitch,
    WxbTag,
    WxbTooltip,
} from '../wxb-ui';
import { SolverConfig, DEFAULT_SOLVER_CONFIG_V5 } from '../../types/solverV5';

export type { SolverConfig };

// 管理职级中文名（班组长 SHIFT_LEADER 不视为领导，不在此列）
const LEADER_ROLE_LABELS: Record<string, string> = {
    GROUP_LEADER: '组长',
    TEAM_LEADER: '主管',
    DEPT_MANAGER: '经理',
};

const LEADER_OPS_POLICY_OPTIONS = [
    { label: '允许参与', value: 'allow' },
    { label: '软性减少', value: 'soft' },
    { label: '禁止参与', value: 'ban' },
];

interface SolverConfigurationModalV5Props {
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

const SolverConfigurationModalV5: React.FC<SolverConfigurationModalV5Props> = ({
    visible,
    config,
    onConfigChange,
    onClose,
    highlightKeys,
}) => {
    const [teams, setTeams] = useState<Team[]>([]);
    const [loadingTeams, setLoadingTeams] = useState(false);

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
        onConfigChange({ ...DEFAULT_SOLVER_CONFIG_V5 });
    };

    const isHighlighted = (key: string) => !!(highlightKeys && highlightKeys.includes(key));

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
        { key: 'enable_leadership_coverage', title: '领导层排班约束', description: '生产日必须有管理岗在岗；主管/经理不参与操作；管理人员优先工作日出勤' },
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

    const renderToggleRows = (items: { key: string; title: string; description: string; indent?: boolean }[]) => (
        <div className="solver-v5-config-list">
            {items.map((item) => {
                const key = item.key as keyof SolverConfig;
                const highlighted = isHighlighted(item.key);
                return (
                    <div
                        key={item.key}
                        data-config-key={item.key}
                        className={`solver-v5-config-row ${item.indent ? 'solver-v5-config-row-indent' : ''} ${highlighted ? 'solver-v5-config-row-highlight' : ''}`}
                    >
                        <div className="solver-v5-config-copy">
                            <strong>{item.title}</strong>
                            <span>{item.description}</span>
                        </div>
                        <WxbSwitch
                            checked={config[key] as boolean}
                            onChange={() => handleToggle(key)}
                            disabled={isToggleDisabled(key)}
                        />
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
        <label className={`solver-v5-number-field ${isHighlighted(key as string) ? 'solver-v5-config-row-highlight' : ''}`} data-config-key={key}>
            <span>{label}</span>
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

    const renderLeaderOpsPolicyRow = (key: keyof SolverConfig, roleCode: string, hint: string) => (
        <div className="solver-v5-config-row">
            <div className="solver-v5-config-copy">
                <strong>{LEADER_ROLE_LABELS[roleCode] || roleCode}</strong>
                <span>{hint}</span>
            </div>
            <WxbSegmented
                size="sm"
                options={LEADER_OPS_POLICY_OPTIONS}
                value={config[key] as string}
                onChange={(v) => onConfigChange({ ...config, [key]: v as 'allow' | 'soft' | 'ban' })}
            />
        </div>
    );

    // ── V5 增强分区渲染 ──────────────────────────────────────────────────────────

    const renderV5EnhancementSection = () => (
        <section className="solver-v5-config-panel solver-v5-enhancement-panel">
            <div className="solver-v5-config-panel-title">
                {/* 内联 SVG 图标：火箭/增强 */}
                <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                    style={{ flexShrink: 0 }}
                >
                    <path
                        d="M8 1.5C8 1.5 11.5 3 11.5 7C11.5 9.5 10 11.5 8 12.5C6 11.5 4.5 9.5 4.5 7C4.5 3 8 1.5 8 1.5Z"
                        stroke="var(--wx-blue-600)"
                        strokeWidth="1.2"
                        fill="var(--wx-blue-50)"
                    />
                    <circle cx="8" cy="7" r="1.5" fill="var(--wx-blue-600)" />
                    <path
                        d="M6.5 12L5.5 14.5M9.5 12L10.5 14.5"
                        stroke="var(--wx-blue-400)"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                    />
                </svg>
                <strong>V5 求解增强</strong>
            </div>
            <p className="solver-v5-enhancement-desc">
                以下选项为 V5 新增能力，默认值已保证与 V4 等价；调整前请阅读各项说明。
            </p>

            <div className="solver-v5-config-list">
                {/* enable_solution_hint */}
                <div
                    className={`solver-v5-config-row ${isHighlighted('enable_solution_hint') ? 'solver-v5-config-row-highlight' : ''}`}
                    data-config-key="enable_solution_hint"
                >
                    <div className="solver-v5-config-copy">
                        <strong>解加速提示（Hint）</strong>
                        <span>用上一次解加速收敛（不影响最优结果）</span>
                    </div>
                    <WxbSwitch
                        checked={config.enable_solution_hint}
                        onChange={() => handleToggle('enable_solution_hint')}
                    />
                </div>

                {/* enable_objective_breakdown */}
                <div
                    className={`solver-v5-config-row ${isHighlighted('enable_objective_breakdown') ? 'solver-v5-config-row-highlight' : ''}`}
                    data-config-key="enable_objective_breakdown"
                >
                    <div className="solver-v5-config-copy">
                        <strong>目标分量可视化</strong>
                        <span>上报各目标分量数据供监视器图表展示（不影响求解方向）</span>
                    </div>
                    <WxbSwitch
                        checked={config.enable_objective_breakdown}
                        onChange={() => handleToggle('enable_objective_breakdown')}
                    />
                </div>

                {/* enable_lexicographic_l4 */}
                <div
                    className={`solver-v5-config-row ${isHighlighted('enable_lexicographic_l4') ? 'solver-v5-config-row-highlight' : ''}`}
                    data-config-key="enable_lexicographic_l4"
                >
                    <div className="solver-v5-config-copy">
                        <div className="solver-v5-lex-title">
                            <strong>字典序 L4 优化</strong>
                            {config.enable_lexicographic_l4 && (
                                <WxbTooltip title="仅在等价最优解中挑分量更优者，不劣于 V4">
                                    <WxbTag color="amber" style={{ cursor: 'default', marginLeft: 6 }}>
                                        实验
                                    </WxbTag>
                                </WxbTooltip>
                            )}
                        </div>
                        <span>
                            开启后在 L0–L3 目标相等的前提下进行第二阶段优化（L4），优先改善目标分量分布。
                            {!config.enable_lexicographic_l4 && (
                                <span className="solver-v5-lex-hint"> 关闭时与 V4 逐字节等价。</span>
                            )}
                        </span>
                    </div>
                    <WxbSwitch
                        checked={config.enable_lexicographic_l4}
                        onChange={() => handleToggle('enable_lexicographic_l4')}
                    />
                </div>
            </div>
        </section>
    );

    return (
        <WxbModal
            title="求解器配置"
            open={visible}
            onCancel={onClose}
            footer={(
                <div className="solver-v5-modal-footer">
                    <WxbButton type="button" variant="ghost" onClick={handleReset}>
                        <WxbIcon name="flow-divert" size={15} />
                        恢复默认
                    </WxbButton>
                    <WxbButton type="button" variant="primary" onClick={onClose}>
                        <WxbIcon name="released" size={15} />
                        保存配置
                    </WxbButton>
                </div>
            )}
            width={640}
            className="solver-v5-config-modal"
        >
            <div className="solver-v5-config-body">
                {/* ── V5 增强分区（放最前面，突出新能力）── */}
                {renderV5EnhancementSection()}

                <section className="solver-v5-config-panel">
                    <div className="solver-v5-config-panel-title">
                        <WxbIcon name="upstream-suite" size={16} />
                        <strong>团队范围</strong>
                    </div>
                    <p>限定求解范围至指定团队。留空则包含所有员工。</p>
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
                </section>

                <section className="solver-v5-config-panel solver-v5-config-panel-info">
                    <div className="solver-v5-config-panel-title">
                        <WxbIcon name="hold-time" size={16} />
                        <strong>求解参数</strong>
                    </div>
                    <p>时间越长结果越优，但响应更慢。建议范围 60 到 600 秒。</p>
                    <div className="solver-v5-config-grid">
                        {renderNumberField('max_time_seconds', '最大求解时间', { min: 30, max: 3600, step: 30, addonAfter: '秒' })}
                        {renderNumberField('stagnation_limit', '停滞超时', { min: 30, max: 3600, step: 30, addonAfter: '秒' })}
                    </div>
                </section>

                <WxbDivider label="硬约束" />
                {renderToggleRows(constraints)}

                {config.enable_leadership_coverage && (
                    <section className="solver-v5-config-subpanel">
                        <p>各管理职级参与生产操作的策略（班组长视为一线，不在此列）。</p>
                        <div className="solver-v5-config-list">
                            {renderLeaderOpsPolicyRow('leader_ops_policy_dept_manager', 'DEPT_MANAGER', '默认：禁止参与生产')}
                            {renderLeaderOpsPolicyRow('leader_ops_policy_team_leader', 'TEAM_LEADER', '默认：禁止参与生产')}
                            {renderLeaderOpsPolicyRow('leader_ops_policy_group_leader', 'GROUP_LEADER', '默认：软性减少')}
                        </div>
                        <p>管理岗偏好权重配置。数值越大，优化压力越高。</p>
                        <div className="solver-v5-config-grid">
                            {renderNumberField('objective_weight_leader_nonworkday', '非工作日出勤惩罚', { min: 0, max: 1000 })}
                            {renderNumberField('objective_weight_leader_workday_rest', '工作日休息惩罚', { min: 0, max: 1000 })}
                            {renderNumberField('objective_weight_leader_ops', '操作分配惩罚', { min: 0, max: 1000 })}
                            {renderNumberField('objective_weight_leader_special', '特殊班次惩罚', { min: 0, max: 1000 })}
                        </div>
                    </section>
                )}

                <WxbDivider label="连续天数约束" />
                {renderToggleRows(consecutiveDaysConstraints)}

                <WxbDivider label="夜班约束" />
                {renderToggleRows(nightShiftConstraints)}

                {config.enable_night_shift_interval && (
                    <section className="solver-v5-config-subpanel">
                        {renderNumberField('min_night_shift_interval', '夜班最小间隔天数', { min: 2, max: 30, addonAfter: '天' })}
                        <p>
                            当前设置：两次夜班之间至少间隔 {(config.min_night_shift_interval || 7) - 1} 天
                        </p>
                    </section>
                )}

                {config.enable_prefer_extended_night_rest && config.enable_night_rest && (
                    <section className="solver-v5-config-subpanel">
                        <div className="solver-v5-config-grid">
                            {renderNumberField('preferred_night_rest_days', '期望休息天数', { min: 2, max: 4, addonAfter: '天' })}
                            {renderNumberField('objective_weight_night_rest_extend', '惩罚权重', { min: 0, max: 500 })}
                        </div>
                        <p>
                            强制休息 1 天 + 尽量多休 {(config.preferred_night_rest_days || 2) - 1} 天
                        </p>
                    </section>
                )}

                {config.enable_consecutive_work_rest_pattern && (
                    <section className="solver-v5-config-subpanel">
                        <p>启用后若存在锁定班次，请确认不与该约束冲突。</p>
                        <div className="solver-v5-config-grid">
                            {renderNumberField('min_consecutive_work_days_pattern', '最少连续上班', { min: 1, max: config.max_consecutive_work_days_pattern, addonAfter: '天' })}
                            {renderNumberField('max_consecutive_work_days_pattern', '最多连续上班', { min: config.min_consecutive_work_days_pattern, max: 7, addonAfter: '天' })}
                            {renderNumberField('min_consecutive_rest_days_pattern', '最少连续休息', { min: 1, max: config.max_consecutive_rest_days_pattern, addonAfter: '天' })}
                            {renderNumberField('max_consecutive_rest_days_pattern', '最多连续休息', { min: config.min_consecutive_rest_days_pattern, max: 7, addonAfter: '天' })}
                        </div>
                    </section>
                )}

                <WxbDivider label="独立任务" />
                <section className="solver-v5-config-panel">
                    <div className="solver-v5-config-panel-title">
                        <WxbIcon name="kanban" size={16} />
                        <strong>独立任务配置</strong>
                    </div>
                    <p>控制值班任务（周期/弹性/临时）是否参与自动排班及其空缺策略。</p>
                    <div className="solver-v5-config-list">
                        <div className="solver-v5-config-row">
                            <div className="solver-v5-config-copy">
                                <strong>纳入独立任务</strong>
                                <span>启用后，当月有效的独立任务将参与自动排班</span>
                            </div>
                            <WxbSwitch checked={config.enable_standalone_tasks} onChange={() => handleToggle('enable_standalone_tasks')} />
                        </div>
                        {config.enable_standalone_tasks && (
                            <div className="solver-v5-config-row solver-v5-config-row-indent">
                                <div className="solver-v5-config-copy">
                                    <strong>允许独立任务空缺</strong>
                                    <span>无合适候选人时允许岗位留空</span>
                                </div>
                                <WxbSwitch checked={config.allow_standalone_vacancy} onChange={() => handleToggle('allow_standalone_vacancy')} />
                            </div>
                        )}
                        {config.enable_standalone_tasks && config.allow_standalone_vacancy && (
                            <div className="solver-v5-config-row solver-v5-config-row-indent">
                                {renderNumberField('objective_weight_standalone_vacancy', '空缺惩罚权重', { min: 100, max: 100000, step: 1000 })}
                            </div>
                        )}
                    </div>
                </section>

                <WxbDivider label="优化目标" />
                <div className="solver-v5-config-list">
                    {objectiveControls.map((item) => {
                        const key = item.key as keyof SolverConfig;
                        const weightKey = item.weightKey as keyof SolverConfig;
                        return (
                            <div key={item.key} className="solver-v5-config-row solver-v5-config-row-objective">
                                <div className="solver-v5-config-copy">
                                    <strong>{item.title}</strong>
                                    <span>{item.description}</span>
                                </div>
                                <div className="solver-v5-objective-controls">
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
            </div>
        </WxbModal>
    );
};

export default SolverConfigurationModalV5;

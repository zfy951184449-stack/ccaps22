import React, { useState, useEffect } from 'react';
import { Modal, Switch, List, Typography, Button, Space, Select, Form, Divider, InputNumber } from 'antd';
import { SettingOutlined, UndoOutlined, SaveOutlined, TeamOutlined } from '@ant-design/icons';

const { Text } = Typography;
const { Option } = Select;

export interface SolverConfig {
    enable_share_group: boolean;
    enable_unique_employee: boolean;
    enable_one_position: boolean;
    enable_shift_assignment: boolean;
    enable_max_consecutive_work_days: boolean;
    enable_max_consecutive_rest_days: boolean; // NEW
    enable_standard_hours: boolean;
    enable_night_rest: boolean;
    enable_night_shift_interval: boolean;
    enable_balance_night_shifts: boolean;
    enable_prefer_standard_shift: boolean; // NEW

    // Parameters
    max_consecutive_rest_days: number; // NEW
    min_night_shift_interval: number; // NEW
    min_rest_after_night_block: number; // NEW

    team_ids?: number[]; // Optional list of team IDs to filter by

    // Objectives
    enable_minimize_deviation: boolean;
    enable_minimize_special_shifts: boolean;
    objective_weight_deviation: number;
    objective_weight_special_shifts: number;
    objective_weight_night_balance: number; // NEW

    // Vacancy
    allow_position_vacancy: boolean;
    objective_weight_vacancy: number;
    off_hours_multiplier: number;
}

export const DEFAULT_SOLVER_CONFIG: SolverConfig = {
    enable_share_group: true,
    enable_unique_employee: true,
    enable_one_position: true,
    enable_shift_assignment: true,
    enable_max_consecutive_work_days: true,
    enable_max_consecutive_rest_days: true,
    enable_standard_hours: true,
    enable_night_rest: true,
    enable_night_shift_interval: true,
    enable_balance_night_shifts: true,
    enable_prefer_standard_shift: true,

    // Parameter Defaults
    max_consecutive_rest_days: 4,
    min_night_shift_interval: 7,
    min_rest_after_night_block: 2,

    team_ids: [], // Default to empty (all teams)

    // Objectives Defaults
    enable_minimize_deviation: true,
    enable_minimize_special_shifts: true,
    objective_weight_deviation: 1,
    objective_weight_special_shifts: 100,
    objective_weight_night_balance: 5,

    // Vacancy Defaults
    allow_position_vacancy: false,
    objective_weight_vacancy: 10000,
    off_hours_multiplier: 1.5,
};

interface SolverConfigurationModalProps {
    visible: boolean;
    config: SolverConfig;
    onConfigChange: (newConfig: SolverConfig) => void;
    onClose: () => void;
}

interface Team {
    id: number;
    teamName: string;
    teamCode: string;
}

const SolverConfigurationModal: React.FC<SolverConfigurationModalProps> = ({
    visible,
    config,
    onConfigChange,
    onClose,
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
        onConfigChange({ ...DEFAULT_SOLVER_CONFIG });
    };

    const constraints = [
        { key: 'enable_share_group', title: '共享组约束', description: '同一共享组内人员的排班互斥/共存规则' },
        { key: 'enable_unique_employee', title: '人员唯一性', description: '同一时段内每人仅能分配一个岗位' },
        { key: 'enable_one_position', title: '一人一岗', description: '同一操作内禁止多岗位分配' },
        { key: 'enable_shift_assignment', title: '班次分配规则', description: '根据任务需求自动关联班次' },
        { key: 'enable_max_consecutive_work_days', title: '最大连续工作天数', description: '限制连续工作天数上限' },
        { key: 'enable_max_consecutive_rest_days', title: '最大连续休息天数', description: '限制连续休息天数，防止长期缺勤' },
        { key: 'enable_standard_hours', title: '标准工时合规', description: '确保排班符合法定工时要求' },
        { key: 'enable_night_rest', title: '夜班后休息', description: '夜班后强制安排休息日' },
        { key: 'enable_night_shift_interval', title: '夜班间隔', description: '两次夜班之间的最小间隔天数' },
        { key: 'enable_balance_night_shifts', title: '夜班均衡', description: '团队内夜班数量均匀分配' },
        { key: 'enable_prefer_standard_shift', title: '优先标准班次', description: '当标准班次能覆盖任务时，禁止使用特殊班次' },
    ];

    return (
        <Modal
            title={
                <Space>
                    <SettingOutlined />
                    <span>求解器配置</span>
                </Space>
            }
            open={visible}
            onCancel={onClose}
            footer={[
                <Button key="reset" icon={<UndoOutlined />} onClick={handleReset}>
                    恢复默认
                </Button>,
                <Button key="save" type="primary" icon={<SaveOutlined />} onClick={onClose}>
                    保存配置
                </Button>,
            ]}
            width={500}
            className="glassmorphism-modal"
        >
            <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 8 }}>

                {/* Team Selection Section */}
                <div style={{ marginBottom: 24, background: '#fafafa', padding: 16, borderRadius: 8, border: '1px solid #f0f0f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                        <TeamOutlined style={{ marginRight: 8, color: '#1890ff' }} />
                        <Text strong>团队范围</Text>
                    </div>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
                        限定求解范围至指定团队。留空则包含所有员工。
                    </Text>
                    <Select
                        mode="multiple"
                        style={{ width: '100%' }}
                        placeholder="选择团队（默认：全部）"
                        value={config.team_ids}
                        onChange={handleTeamChange}
                        loading={loadingTeams}
                        optionFilterProp="children"
                        allowClear
                    >
                        {teams.map(team => (
                            <Option key={team.id} value={team.id}>
                                {team.teamName} ({team.teamCode})
                            </Option>
                        ))}
                    </Select>
                </div>

                <Divider orientation="left" style={{ margin: '12px 0' }}>硬约束</Divider>

                <List
                    itemLayout="horizontal"
                    dataSource={constraints}
                    renderItem={(item) => (
                        <List.Item
                            actions={[
                                <Switch
                                    checked={config[item.key as keyof SolverConfig] as boolean}
                                    onChange={() => handleToggle(item.key as keyof SolverConfig)}
                                />
                            ]}
                        >
                            <List.Item.Meta
                                title={<Text strong>{item.title}</Text>}
                                description={item.description}
                            />
                        </List.Item>
                    )}
                />

                {/* Night Shift Interval Parameter */}
                {config.enable_night_shift_interval && (
                    <div style={{ padding: '8px 16px', background: '#f6f8fa', borderRadius: 8, marginTop: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text type="secondary" style={{ fontSize: 13 }}>夜班最小间隔天数</Text>
                            <InputNumber
                                size="small"
                                min={2}
                                max={30}
                                value={config.min_night_shift_interval}
                                onChange={(val) => handleWeightChange('min_night_shift_interval', val)}
                                style={{ width: 70 }}
                                addonAfter="天"
                            />
                        </div>
                        <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                            当前设置：两次夜班之间至少间隔 {(config.min_night_shift_interval || 7) - 1} 天
                        </Text>
                    </div>
                )}

                <Divider orientation="left" style={{ margin: '12px 0' }}>优化目标</Divider>
                <List
                    itemLayout="horizontal"
                    dataSource={[
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
                            description: '惩罚夜班分配不均匀（方差 × 权重）',
                        },
                        {
                            key: 'allow_position_vacancy',
                            weightKey: 'objective_weight_vacancy',
                            title: '允许岗位空缺',
                            description: '允许无人接手时留空（高惩罚权重）',
                        },
                    ]}
                    renderItem={(item) => (
                        <List.Item
                            actions={[
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 12, color: '#999' }}>权重:</span>
                                    <InputNumber
                                        size="small"
                                        min={0}
                                        value={config[item.weightKey as keyof SolverConfig] as number}
                                        onChange={(val) => handleWeightChange(item.weightKey as keyof SolverConfig, val)}
                                        disabled={!config[item.key as keyof SolverConfig]}
                                        style={{ width: 70 }}
                                    />
                                    <Switch
                                        checked={config[item.key as keyof SolverConfig] as boolean}
                                        onChange={() => handleToggle(item.key as keyof SolverConfig)}
                                    />
                                </div>
                            ]}
                        >
                            <List.Item.Meta
                                title={<Text strong>{item.title}</Text>}
                                description={item.description}
                            />
                        </List.Item>
                    )}
                />
            </div>
        </Modal>
    );
};

export default SolverConfigurationModal;

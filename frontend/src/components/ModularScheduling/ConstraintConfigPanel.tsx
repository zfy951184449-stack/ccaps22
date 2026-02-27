/**
 * 约束配置面板组件
 * 
 * 用于配置求解器约束的开关和权重
 */

import React, { useState } from 'react';
import {
    Card,
    Switch,
    Slider,
    Collapse,
    Typography,
    Space,
    Tooltip,
    Tag,
    Button,
} from 'antd';
import {
    SettingOutlined,
    LockOutlined,
    UnlockOutlined,
    InfoCircleOutlined,
    ReloadOutlined,
} from '@ant-design/icons';

const { Panel } = Collapse;
const { Text, Title } = Typography;

// 约束配置类型
export interface ConstraintConfig {
    // 硬约束开关
    hardConstraints: {
        H1_qualification: boolean;  // 资质匹配
        H2_position: boolean;       // 一位一人
        H3_mutex: boolean;          // 同操作互斥
        H4_timeConflict: boolean;   // 时间冲突
        H5_consecutive: boolean;    // 连续工作限制
        H6_shiftCoverage: boolean;  // 班次覆盖
        H7_nightRest: boolean;      // 夜班强制休息
        H8_monthlyMax: boolean;     // 月度工时上限
        H9_monthlyMin: boolean;     // 月度工时下限
        H10_sharing: boolean;       // 共享组一致性
        H11_availability: boolean;  // 不可用时间段
    };
    // 软约束权重 (0-100)
    softWeights: {
        S1_skipPenalty: number;     // 最小化缺员
        S5_crossDay: number;        // 共享组跨日
        S6_nonWorkday: number;      // 非工作日惩罚
        S7_supervisorOp: number;    // 主管少干活
        S8_consecutiveRest: number; // 连续休息补偿
        S9_supervisorNight: number; // 主管夜班
    };
    // 公平性权重
    fairnessWeights: {
        F1_nightFairness: number;   // 夜班公平
        F2_dayFairness: number;     // 白班公平
        F3_hoursFairness: number;   // 工时公平
        F4_rangePenalty: number;    // 极差惩罚
    };
}

// 默认配置
const DEFAULT_CONFIG: ConstraintConfig = {
    hardConstraints: {
        H1_qualification: true,
        H2_position: true,
        H3_mutex: true,
        H4_timeConflict: true,
        H5_consecutive: true,
        H6_shiftCoverage: true,
        H7_nightRest: true,
        H8_monthlyMax: true,
        H9_monthlyMin: true,
        H10_sharing: true,
        H11_availability: true,
    },
    softWeights: {
        S1_skipPenalty: 100,
        S5_crossDay: 50,
        S6_nonWorkday: 80,
        S7_supervisorOp: 40,
        S8_consecutiveRest: 50,
        S9_supervisorNight: 70,
    },
    fairnessWeights: {
        F1_nightFairness: 80,
        F2_dayFairness: 60,
        F3_hoursFairness: 50,
        F4_rangePenalty: 70,
    },
};

// 约束描述
const CONSTRAINT_LABELS: Record<string, { name: string; desc: string }> = {
    // 硬约束
    H1_qualification: { name: 'H1 资质匹配', desc: '员工必须持有操作所需资质' },
    H2_position: { name: 'H2 一位一人', desc: '同一岗位只能分配一人' },
    H3_mutex: { name: 'H3 同操作互斥', desc: '员工不能占据同操作多个位置' },
    H4_timeConflict: { name: 'H4 时间冲突', desc: '不能同时处理重叠操作' },
    H5_consecutive: { name: 'H5 连续工作', desc: '连续工作不超过N天' },
    H6_shiftCoverage: { name: 'H6 班次覆盖', desc: '操作必须被班次覆盖' },
    H7_nightRest: { name: 'H7 夜班休息', desc: '夜班后强制休息' },
    H8_monthlyMax: { name: 'H8 月度上限', desc: '月工时不超过上限' },
    H9_monthlyMin: { name: 'H9 月度下限', desc: '月工时不低于下限' },
    H10_sharing: { name: 'H10 共享组', desc: '共享组人员一致性' },
    H11_availability: { name: 'H11 可用性', desc: '不可用时间段不分配' },
    // 软约束
    S1_skipPenalty: { name: 'S1 最小缺员', desc: '尽量填满岗位需求' },
    S5_crossDay: { name: 'S5 跨日一致', desc: '共享组跨日人员一致' },
    S6_nonWorkday: { name: 'S6 非工作日', desc: '避免非工作日上班' },
    S7_supervisorOp: { name: 'S7 主管少活', desc: '少安排主管干一线活' },
    S8_consecutiveRest: { name: 'S8 连续休息', desc: '连续工作后补偿休息' },
    S9_supervisorNight: { name: 'S9 主管夜班', desc: '避免主管上夜班' },
    // 公平性
    F1_nightFairness: { name: 'F1 夜班公平', desc: '夜班次数均匀分布' },
    F2_dayFairness: { name: 'F2 白班公平', desc: '白班次数均匀分布' },
    F3_hoursFairness: { name: 'F3 工时公平', desc: '总工时均匀分布' },
    F4_rangePenalty: { name: 'F4 极差惩罚', desc: '限制工时极差' },
};

interface ConstraintConfigPanelProps {
    config: ConstraintConfig;
    onChange: (config: ConstraintConfig) => void;
    disabled?: boolean;
}

const ConstraintConfigPanel: React.FC<ConstraintConfigPanelProps> = ({
    config,
    onChange,
    disabled = false,
}) => {
    // 硬约束开关变更
    const handleHardConstraintChange = (key: keyof ConstraintConfig['hardConstraints'], value: boolean) => {
        onChange({
            ...config,
            hardConstraints: {
                ...config.hardConstraints,
                [key]: value,
            },
        });
    };

    // 软约束权重变更
    const handleSoftWeightChange = (key: keyof ConstraintConfig['softWeights'], value: number) => {
        onChange({
            ...config,
            softWeights: {
                ...config.softWeights,
                [key]: value,
            },
        });
    };

    // 公平性权重变更
    const handleFairnessWeightChange = (key: keyof ConstraintConfig['fairnessWeights'], value: number) => {
        onChange({
            ...config,
            fairnessWeights: {
                ...config.fairnessWeights,
                [key]: value,
            },
        });
    };

    // 重置配置
    const handleReset = () => {
        onChange(DEFAULT_CONFIG);
    };

    // 渲染硬约束开关
    const renderHardConstraint = (key: keyof ConstraintConfig['hardConstraints']) => {
        const label = CONSTRAINT_LABELS[key];
        const enabled = config.hardConstraints[key];

        return (
            <div key={key} className="constraint-item">
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Tooltip title={label.desc}>
                        <Space>
                            {enabled ? <LockOutlined style={{ color: '#1890ff' }} /> : <UnlockOutlined style={{ color: '#999' }} />}
                            <Text style={{ fontSize: 12 }}>{label.name}</Text>
                        </Space>
                    </Tooltip>
                    <Switch
                        size="small"
                        checked={enabled}
                        onChange={(v) => handleHardConstraintChange(key, v)}
                        disabled={disabled}
                    />
                </Space>
            </div>
        );
    };

    // 渲染软约束滑块
    const renderSoftWeight = (
        key: keyof ConstraintConfig['softWeights'] | keyof ConstraintConfig['fairnessWeights'],
        type: 'soft' | 'fairness'
    ) => {
        const label = CONSTRAINT_LABELS[key];
        const value = type === 'soft'
            ? config.softWeights[key as keyof ConstraintConfig['softWeights']]
            : config.fairnessWeights[key as keyof ConstraintConfig['fairnessWeights']];

        return (
            <div key={key} className="constraint-item" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Tooltip title={label.desc}>
                        <Text style={{ fontSize: 12 }}>{label.name}</Text>
                    </Tooltip>
                    <Tag color={value > 70 ? 'red' : value > 40 ? 'orange' : 'green'} style={{ fontSize: 10 }}>
                        {value}%
                    </Tag>
                </div>
                <Slider
                    min={0}
                    max={100}
                    value={value}
                    onChange={(v) => type === 'soft'
                        ? handleSoftWeightChange(key as keyof ConstraintConfig['softWeights'], v)
                        : handleFairnessWeightChange(key as keyof ConstraintConfig['fairnessWeights'], v)
                    }
                    disabled={disabled}
                    style={{ margin: '4px 0' }}
                />
            </div>
        );
    };

    return (
        <Card
            size="small"
            title={
                <Space>
                    <SettingOutlined />
                    <span>约束配置</span>
                </Space>
            }
            extra={
                <Button
                    type="text"
                    size="small"
                    icon={<ReloadOutlined />}
                    onClick={handleReset}
                    disabled={disabled}
                >
                    重置
                </Button>
            }
            style={{ marginBottom: 16 }}
        >
            <Collapse
                size="small"
                defaultActiveKey={['hard']}
                ghost
                items={[
                    {
                        key: 'hard',
                        label: (
                            <Space>
                                <LockOutlined />
                                <span>硬约束 (必须满足)</span>
                                <Tag color="blue" style={{ fontSize: 10 }}>
                                    {Object.values(config.hardConstraints).filter(v => v).length}/11
                                </Tag>
                            </Space>
                        ),
                        children: (
                            <div style={{ maxHeight: 200, overflow: 'auto' }}>
                                {Object.keys(config.hardConstraints).map((key) =>
                                    renderHardConstraint(key as keyof ConstraintConfig['hardConstraints'])
                                )}
                            </div>
                        ),
                    },
                    {
                        key: 'soft',
                        label: (
                            <Space>
                                <UnlockOutlined />
                                <span>软约束 (尽量满足)</span>
                            </Space>
                        ),
                        children: (
                            <div>
                                {Object.keys(config.softWeights).map((key) =>
                                    renderSoftWeight(key as keyof ConstraintConfig['softWeights'], 'soft')
                                )}
                            </div>
                        ),
                    },
                    {
                        key: 'fairness',
                        label: (
                            <Space>
                                <InfoCircleOutlined />
                                <span>公平性约束</span>
                            </Space>
                        ),
                        children: (
                            <div>
                                {Object.keys(config.fairnessWeights).map((key) =>
                                    renderSoftWeight(key as keyof ConstraintConfig['fairnessWeights'], 'fairness')
                                )}
                            </div>
                        ),
                    },
                ]}
            />
        </Card>
    );
};

export default ConstraintConfigPanel;
export { DEFAULT_CONFIG };

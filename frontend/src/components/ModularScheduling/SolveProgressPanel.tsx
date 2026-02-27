/**
 * 求解进度监控面板 (增强版)
 * 
 * 按照线稿设计实现:
 * - 当前阶段 (Round X/Y)
 * - 耗时统计
 * - 已找到解数量
 * - 当前最佳分
 * - 总体进度条
 * - 实时指标 (硬约束满足率、缺员操作数、共享组一致性、公平性偏差)
 * - 中止求解按钮
 */

import React, { useEffect, useState, useRef } from 'react';
import { Card, Progress, Space, Typography, Button, Tag, Statistic, Row, Col, Alert } from 'antd';
import {
    SyncOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    StopOutlined,
    RocketOutlined,
    ClockCircleOutlined,
    TrophyOutlined,
    TeamOutlined,
    WarningOutlined,
    SafetyCertificateOutlined,
} from '@ant-design/icons';

const { Text, Title } = Typography;

interface SolveMetrics {
    hard_constraint_satisfaction?: number;  // 硬约束满足率 (0-100)
    understaffed_operations?: number;       // 缺员操作数
    share_group_consistency?: number;       // 共享组一致性 (0-100)
    fairness_deviation?: number;            // 公平性偏差
    solutions_found?: number;               // 已找到解数量
}

interface SolveProgressPanelProps {
    runId: number | null;
    status: string;
    stage?: string;
    progress: number;
    message?: string;
    metrics?: SolveMetrics;
    bestObjective?: number;
    onStop?: () => void;
    startTime?: number;  // Unix timestamp ms
}

const STAGE_LABELS: Record<string, { label: string; round?: string }> = {
    'INIT': { label: '初始化' },
    'ASSEMBLING': { label: '数据装配' },
    'SOLVING': { label: '求解中' },
    'SOLVING_P0': { label: '优先级 P0 优化', round: '1/3' },
    'SOLVING_P1': { label: '优先级 P1 优化 (共享组)', round: '2/3' },
    'SOLVING_P2': { label: '优先级 P2 优化 (公平性)', round: '3/3' },
    'PERSISTING': { label: '保存结果' },
    'DONE': { label: '完成' },
};

const SolveProgressPanel: React.FC<SolveProgressPanelProps> = ({
    runId,
    status,
    stage,
    progress,
    message,
    metrics = {},
    bestObjective,
    onStop,
    startTime,
}) => {
    const [elapsedTime, setElapsedTime] = useState(0);
    const timerRef = useRef<number | null>(null);

    // 计时器
    useEffect(() => {
        if (status === 'RUNNING' && startTime) {
            timerRef.current = window.setInterval(() => {
                setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
            }, 1000);
        } else {
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [status, startTime]);

    const formatTime = (seconds: number) => {
        if (seconds < 60) return `${seconds}s`;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}m ${secs}s`;
    };

    const stageInfo = STAGE_LABELS[stage || ''] || { label: stage || '未知' };

    const getStatusColor = () => {
        switch (status) {
            case 'RUNNING': return '#1890ff';
            case 'COMPLETED': return '#52c41a';
            case 'FAILED': return '#ff4d4f';
            default: return '#8c8c8c';
        }
    };

    const getProgressStatus = () => {
        if (status === 'FAILED') return 'exception';
        if (status === 'COMPLETED') return 'success';
        return 'active';
    };

    return (
        <Card
            className="solve-progress-panel"
            style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: 12,
                color: '#fff',
            }}
            bodyStyle={{ padding: 24 }}
        >
            {/* 顶部: 状态 + 耗时 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Space>
                    {status === 'RUNNING' ? (
                        <SyncOutlined spin style={{ fontSize: 20, color: '#fff' }} />
                    ) : status === 'COMPLETED' ? (
                        <CheckCircleOutlined style={{ fontSize: 20, color: '#52c41a' }} />
                    ) : status === 'FAILED' ? (
                        <CloseCircleOutlined style={{ fontSize: 20, color: '#ff4d4f' }} />
                    ) : (
                        <RocketOutlined style={{ fontSize: 20, color: '#fff' }} />
                    )}
                    <Title level={4} style={{ color: '#fff', margin: 0 }}>
                        {status === 'RUNNING' ? '求解进行中...' :
                            status === 'COMPLETED' ? '求解完成' :
                                status === 'FAILED' ? '求解失败' : '等待中'}
                    </Title>
                    <Tag color="rgba(255,255,255,0.2)">任务 #{runId}</Tag>
                </Space>
                <Space>
                    <ClockCircleOutlined style={{ color: 'rgba(255,255,255,0.8)' }} />
                    <Text style={{ color: 'rgba(255,255,255,0.8)' }}>耗时: {formatTime(elapsedTime)}</Text>
                </Space>
            </div>

            {/* 当前阶段 */}
            <div style={{ marginBottom: 16 }}>
                <Text style={{ color: 'rgba(255,255,255,0.9)' }}>
                    当前阶段: <Text strong style={{ color: '#fff' }}>{stageInfo.label}</Text>
                    {stageInfo.round && (
                        <Tag color="cyan" style={{ marginLeft: 8 }}>Round {stageInfo.round}</Tag>
                    )}
                </Text>
            </div>

            {/* 核心指标行 */}
            <Row gutter={16} style={{ marginBottom: 20 }}>
                <Col span={6}>
                    <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(255,255,255,0.1)', borderRadius: 8 }}>
                        <div style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>
                            {metrics.solutions_found ?? '—'}
                        </div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>已找到解</div>
                    </div>
                </Col>
                <Col span={6}>
                    <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(255,255,255,0.1)', borderRadius: 8 }}>
                        <div style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>
                            {bestObjective !== undefined ? bestObjective.toLocaleString() : '—'}
                        </div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>当前最佳分</div>
                    </div>
                </Col>
                <Col span={6}>
                    <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(255,255,255,0.1)', borderRadius: 8 }}>
                        <div style={{ fontSize: 24, fontWeight: 700, color: metrics.hard_constraint_satisfaction === 100 ? '#52c41a' : '#faad14' }}>
                            {metrics.hard_constraint_satisfaction ?? '—'}%
                        </div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>硬约束满足</div>
                    </div>
                </Col>
                <Col span={6}>
                    <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(255,255,255,0.1)', borderRadius: 8 }}>
                        <div style={{ fontSize: 24, fontWeight: 700, color: (metrics.understaffed_operations ?? 0) === 0 ? '#52c41a' : '#faad14' }}>
                            {metrics.understaffed_operations ?? '—'}
                        </div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>缺员操作</div>
                    </div>
                </Col>
            </Row>

            {/* 总体进度条 */}
            <div style={{ marginBottom: 16 }}>
                <Text style={{ color: 'rgba(255,255,255,0.8)', marginBottom: 8, display: 'block' }}>总体进度:</Text>
                <Progress
                    percent={progress}
                    status={getProgressStatus()}
                    strokeColor={{
                        '0%': '#87d068',
                        '100%': '#52c41a',
                    }}
                    trailColor="rgba(255,255,255,0.2)"
                />
            </div>

            {/* 实时指标面板 */}
            <div style={{
                background: 'rgba(255,255,255,0.1)',
                borderRadius: 8,
                padding: 12,
                marginBottom: 16
            }}>
                <Text style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600, marginBottom: 8, display: 'block' }}>
                    实时指标:
                </Text>
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <SafetyCertificateOutlined style={{ color: '#52c41a' }} />
                        <Text style={{ color: 'rgba(255,255,255,0.85)' }}>
                            硬约束满足: {metrics.hard_constraint_satisfaction ?? '—'}%
                            {metrics.hard_constraint_satisfaction === 100 && <Tag color="green" style={{ marginLeft: 8 }}>无冲突</Tag>}
                        </Text>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <WarningOutlined style={{ color: (metrics.understaffed_operations ?? 0) > 0 ? '#faad14' : '#52c41a' }} />
                        <Text style={{ color: 'rgba(255,255,255,0.85)' }}>
                            缺员操作数: {metrics.understaffed_operations ?? '—'} 个
                        </Text>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <TeamOutlined style={{ color: '#1890ff' }} />
                        <Text style={{ color: 'rgba(255,255,255,0.85)' }}>
                            共享组一致: {metrics.share_group_consistency ?? '—'}%
                        </Text>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <TrophyOutlined style={{ color: '#722ed1' }} />
                        <Text style={{ color: 'rgba(255,255,255,0.85)' }}>
                            公平性偏差: {metrics.fairness_deviation ?? '—'}
                        </Text>
                    </div>
                </Space>
            </div>

            {/* 错误消息 */}
            {status === 'FAILED' && message && (
                <Alert
                    type="error"
                    message={message}
                    style={{ marginBottom: 16 }}
                />
            )}

            {/* 中止按钮 */}
            {status === 'RUNNING' && onStop && (
                <Button
                    icon={<StopOutlined />}
                    onClick={onStop}
                    danger
                    style={{ width: '100%' }}
                >
                    中止求解
                </Button>
            )}
        </Card>
    );
};

export default SolveProgressPanel;

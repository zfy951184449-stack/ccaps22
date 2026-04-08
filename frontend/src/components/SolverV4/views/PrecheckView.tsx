import React from 'react';
import { CheckCircleOutlined, ExclamationCircleOutlined, CloseCircleOutlined, InfoCircleOutlined } from '@ant-design/icons';
import '../SolverV4.css';

interface PrecheckResult {
    status: 'PASS' | 'WARNING' | 'ERROR';
    checks: {
        name: string;
        status: 'PASS' | 'WARNING' | 'ERROR';
        message: string;
        details?: any[];
    }[];
}

interface PrecheckViewProps {
    results?: PrecheckResult;
}

const STATUS_CONFIG = {
    PASS: {
        icon: <CheckCircleOutlined />,
        color: 'var(--v4-color-success)',
        bg: 'var(--v4-color-success-bg)',
        label: '通过'
    },
    WARNING: {
        icon: <ExclamationCircleOutlined />,
        color: 'var(--v4-color-warning)',
        bg: 'var(--v4-color-warning-bg)',
        label: '警告'
    },
    ERROR: {
        icon: <CloseCircleOutlined />,
        color: 'var(--v4-color-error)',
        bg: 'var(--v4-color-error-bg)',
        label: '错误'
    }
};

const PrecheckView: React.FC<PrecheckViewProps> = ({ results }) => {
    if (!results) {
        return (
            <div className="v4-content-card" style={{ textAlign: 'center', padding: 'var(--v4-space-2xl)' }}>
                <InfoCircleOutlined style={{ fontSize: 48, color: 'var(--v4-text-tertiary)', marginBottom: 12 }} />
                <div style={{ color: 'var(--v4-text-secondary)', fontSize: 'var(--v4-font-size-md)' }}>
                    暂无预检数据
                </div>
                <div style={{ color: 'var(--v4-text-tertiary)', fontSize: 'var(--v4-font-size-sm)', marginTop: 4 }}>
                    预检在求解启动前自动执行，结果将随求解结果一并返回
                </div>
            </div>
        );
    }

    const overallCfg = STATUS_CONFIG[results.status];
    const passCount = results.checks.filter(c => c.status === 'PASS').length;
    const warnCount = results.checks.filter(c => c.status === 'WARNING').length;
    const errCount = results.checks.filter(c => c.status === 'ERROR').length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--v4-space-lg)' }}>
            {/* Overall Status Banner */}
            <div className="v4-content-card" style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--v4-space-lg)',
                background: overallCfg.bg,
                border: `1px solid ${overallCfg.color}20`
            }}>
                <div style={{ fontSize: 32, color: overallCfg.color }}>{overallCfg.icon}</div>
                <div>
                    <div style={{ fontWeight: 600, fontSize: 'var(--v4-font-size-lg)', color: overallCfg.color }}>
                        预检{overallCfg.label}
                    </div>
                    <div style={{ fontSize: 'var(--v4-font-size-sm)', color: 'var(--v4-text-secondary)', marginTop: 2 }}>
                        共 {results.checks.length} 项检查 · 通过 {passCount} · 警告 {warnCount} · 错误 {errCount}
                    </div>
                </div>
            </div>

            {/* Individual Checks */}
            <div className="v4-content-card" style={{ padding: 0 }}>
                <div className="v4-section-header">检查详情</div>
                {results.checks.map((check, idx) => {
                    const cfg = STATUS_CONFIG[check.status];
                    return (
                        <div key={idx} style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 'var(--v4-space-md)',
                            padding: 'var(--v4-space-lg)',
                            borderBottom: idx < results.checks.length - 1 ? '1px solid var(--v4-border-color)' : 'none'
                        }}>
                            <div style={{ fontSize: 18, color: cfg.color, flexShrink: 0, marginTop: 2 }}>{cfg.icon}</div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 500, fontSize: 'var(--v4-font-size-md)' }}>
                                    {check.name}
                                    <span style={{
                                        marginLeft: 8,
                                        fontSize: 'var(--v4-font-size-xs)',
                                        padding: '2px 8px',
                                        borderRadius: 'var(--v4-radius-full)',
                                        background: cfg.bg,
                                        color: cfg.color,
                                        fontWeight: 500
                                    }}>
                                        {cfg.label}
                                    </span>
                                </div>
                                <div style={{
                                    fontSize: 'var(--v4-font-size-sm)',
                                    color: 'var(--v4-text-secondary)',
                                    marginTop: 4
                                }}>
                                    {check.message}
                                </div>
                                {check.details && check.details.length > 0 && (
                                    <div style={{
                                        marginTop: 8,
                                        padding: 'var(--v4-space-md)',
                                        background: 'var(--v4-bg-section)',
                                        borderRadius: 'var(--v4-radius-sm)',
                                        fontSize: 'var(--v4-font-size-xs)',
                                        fontFamily: 'monospace'
                                    }}>
                                        {check.details.map((detail, dIdx) => (
                                            <div key={dIdx} style={{ marginBottom: 4 }}>
                                                {typeof detail === 'string' ? detail : JSON.stringify(detail)}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default PrecheckView;

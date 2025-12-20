/**
 * 校验 Tab 内容组件
 * 显示约束校验功能，运行校验并展示结果
 * 
 * Apple HIG 风格设计
 */

import React from 'react';
import { Button, Alert, Typography, Spin } from 'antd';
import { CheckCircleOutlined, ExclamationCircleOutlined, SearchOutlined } from '@ant-design/icons';
import { ConstraintValidationResult } from '../../types';

const { Text } = Typography;

// 设计 tokens
const TOKENS = {
    successBg: '#e8f5e9',
    successColor: '#388e3c',
    errorBg: '#ffebee',
    errorColor: '#c62828',
    cardRadius: 10,
};

interface ValidationTabContentProps {
    loading: boolean;
    result: ConstraintValidationResult | null;
    onValidate: () => void;
    onConflictClick?: (conflict: any) => void;
}

// 校验成功状态
const SuccessState: React.FC = () => (
    <div style={{
        background: TOKENS.successBg,
        borderRadius: TOKENS.cardRadius,
        padding: 24,
        textAlign: 'center',
    }}>
        <CheckCircleOutlined style={{ fontSize: 48, color: TOKENS.successColor, marginBottom: 12 }} />
        <div style={{ fontWeight: 600, color: TOKENS.successColor, fontSize: 16 }}>无冲突</div>
        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>所有约束均已满足</div>
    </div>
);

// 校验失败状态
const ErrorState: React.FC<{
    conflicts: any[];
    onConflictClick?: (conflict: any) => void;
}> = ({ conflicts, onConflictClick }) => (
    <div>
        <Alert
            message={`发现 ${conflicts.length} 个冲突`}
            type="error"
            showIcon
            style={{ marginBottom: 16, borderRadius: TOKENS.cardRadius }}
        />
        <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {conflicts.map((conflict, idx) => (
                <div
                    key={idx}
                    onClick={() => onConflictClick?.(conflict)}
                    style={{
                        padding: 12,
                        border: '1px solid #ffcdd2',
                        borderRadius: TOKENS.cardRadius,
                        marginBottom: 8,
                        cursor: onConflictClick ? 'pointer' : 'default',
                        transition: 'all 0.2s',
                        background: 'white',
                    }}
                    onMouseEnter={(e) => {
                        if (onConflictClick) {
                            e.currentTarget.style.background = '#fff5f5';
                            e.currentTarget.style.borderColor = '#ef9a9a';
                        }
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'white';
                        e.currentTarget.style.borderColor = '#ffcdd2';
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <ExclamationCircleOutlined style={{ color: TOKENS.errorColor, marginTop: 2 }} />
                        <div>
                            <Text strong style={{ fontSize: 13 }}>{conflict.type}</Text>
                            <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                                {conflict.message}
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    </div>
);

// 初始状态
const EmptyState: React.FC = () => (
    <div style={{
        background: '#f5f5f5',
        borderRadius: TOKENS.cardRadius,
        padding: 24,
        textAlign: 'center',
        color: '#999',
    }}>
        <SearchOutlined style={{ fontSize: 32, marginBottom: 8 }} />
        <div style={{ fontSize: 12 }}>点击上方按钮运行校验</div>
    </div>
);

export const ValidationTabContent: React.FC<ValidationTabContentProps> = ({
    loading,
    result,
    onValidate,
    onConflictClick,
}) => {
    return (
        <div style={{ padding: 16 }}>
            <Button
                type="primary"
                icon={<SearchOutlined />}
                loading={loading}
                onClick={onValidate}
                block
                size="large"
                style={{
                    marginBottom: 20,
                    borderRadius: 8,
                    height: 44,
                    fontWeight: 500,
                }}
            >
                {loading ? '校验中...' : '运行校验'}
            </Button>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 32 }}>
                    <Spin size="large" />
                    <div style={{ marginTop: 12, color: '#999' }}>正在检查约束关系...</div>
                </div>
            ) : result ? (
                result.hasConflicts && result.conflicts ? (
                    <ErrorState conflicts={result.conflicts} onConflictClick={onConflictClick} />
                ) : (
                    <SuccessState />
                )
            ) : (
                <EmptyState />
            )}
        </div>
    );
};

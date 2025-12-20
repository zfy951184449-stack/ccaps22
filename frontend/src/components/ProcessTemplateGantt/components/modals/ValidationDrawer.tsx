/**
 * 约束校验结果抽屉
 * 从 GanttModals.tsx 提取
 */

import React from 'react';
import { Drawer, Alert } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { ConstraintValidationResult } from '../../types';

interface ValidationDrawerProps {
    visible: boolean;
    onClose: () => void;
    loading: boolean;
    result: ConstraintValidationResult | null;
    onConflictClick: (conflict: any) => void;
}

export const ValidationDrawer: React.FC<ValidationDrawerProps> = ({
    visible,
    onClose,
    loading,
    result,
    onConflictClick
}) => {
    return (
        <Drawer
            title="约束校验结果"
            placement="right"
            width={500}
            open={visible}
            onClose={onClose}
        >
            {loading && <div style={{ textAlign: 'center' }}>加载中...</div>}
            {result && !loading && (
                <div>
                    <Alert
                        message={result.hasConflicts ? `发现 ${result.conflicts?.length || 0} 个冲突` : '无冲突'}
                        type={result.hasConflicts ? 'error' : 'success'}
                        showIcon
                        style={{ marginBottom: 16 }}
                    />
                    {result.conflicts?.map((conflict, idx) => (
                        <div
                            key={idx}
                            style={{
                                padding: 12,
                                border: '1px solid #ffccc7',
                                borderRadius: 4,
                                marginBottom: 8,
                                cursor: 'pointer'
                            }}
                            onClick={() => onConflictClick(conflict)}
                        >
                            <div>
                                <ExclamationCircleOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
                                {conflict.type}
                            </div>
                            <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                                {conflict.message}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Drawer>
    );
};

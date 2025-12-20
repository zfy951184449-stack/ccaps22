/**
 * BatchOperationDrawer - 批次操作侧边抽屉
 * 包含约束、共享组、校验三个Tab
 * 
 * B+ 设计 - Apple HIG 风格
 */

import React, { useState } from 'react';
import { Badge } from 'antd';
import { LinkOutlined, TeamOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { ConstraintTabContent } from '../ProcessTemplateGantt/components/modals/ConstraintTabContent';
import { ValidationTabContent } from '../ProcessTemplateGantt/components/modals/ValidationTabContent';
import { BatchShareGroupSection } from './BatchShareGroupSection';
import { Constraint, ConstraintValidationResult } from '../ProcessTemplateGantt/types';

type DrawerTab = 'constraints' | 'sharegroup' | 'validate';

interface BatchOperationDrawerProps {
    // 约束相关
    predecessors: Constraint[];
    successors: Constraint[];
    onAddPredecessor: () => void;
    onAddSuccessor: () => void;
    onDeleteConstraint: (constraintId: number) => void;
    onEditConstraint?: (constraintId: number, updates: Partial<Constraint>) => Promise<void>;

    // 共享组相关
    operationPlanId: number;
    batchId: number;
    onShareGroupRefresh?: () => void;

    // 校验相关
    validationLoading: boolean;
    validationResult: ConstraintValidationResult | null;
    onValidate: () => void;
    onConflictClick?: (conflict: any) => void;
}

// 设计 tokens
const TOKENS = {
    drawerBg: '#f5f5f7',
    tabBg: '#ffffff',
    tabBorder: '#e5e5e5',
    activeColor: '#1890ff',
    inactiveColor: '#8c8c8c',
};

// Tab 按钮组件
const TabButton: React.FC<{
    icon: React.ReactNode;
    label: string;
    count?: number;
    active: boolean;
    onClick: () => void;
}> = ({ icon, label, count, active, onClick }) => (
    <button
        onClick={onClick}
        style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '10px 0',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: active ? TOKENS.activeColor : TOKENS.inactiveColor,
            transition: 'all 0.15s ease',
            position: 'relative',
        }}
    >
        <div style={{ fontSize: 18, marginBottom: 4 }}>
            {count !== undefined ? (
                <Badge count={count} size="small" offset={[8, 0]}>
                    {icon}
                </Badge>
            ) : icon}
        </div>
        <div style={{ fontSize: 11, fontWeight: active ? 600 : 400 }}>{label}</div>
        {active && (
            <div style={{
                position: 'absolute',
                bottom: 0,
                left: '20%',
                right: '20%',
                height: 2,
                background: TOKENS.activeColor,
                borderRadius: 1,
            }} />
        )}
    </button>
);

export const BatchOperationDrawer: React.FC<BatchOperationDrawerProps> = ({
    predecessors,
    successors,
    onAddPredecessor,
    onAddSuccessor,
    onDeleteConstraint,
    onEditConstraint,
    operationPlanId,
    batchId,
    onShareGroupRefresh,
    validationLoading,
    validationResult,
    onValidate,
    onConflictClick,
}) => {
    const [activeTab, setActiveTab] = useState<DrawerTab>('constraints');

    const constraintCount = predecessors.length + successors.length;

    return (
        <div style={{
            width: 320,
            background: TOKENS.drawerBg,
            display: 'flex',
            flexDirection: 'column',
            borderLeft: `1px solid ${TOKENS.tabBorder}`,
            height: '100%',
        }}>
            {/* Tab 头部 */}
            <div style={{
                display: 'flex',
                borderBottom: `1px solid ${TOKENS.tabBorder}`,
                background: TOKENS.tabBg,
            }}>
                <TabButton
                    icon={<LinkOutlined />}
                    label="约束"
                    count={constraintCount}
                    active={activeTab === 'constraints'}
                    onClick={() => setActiveTab('constraints')}
                />
                <TabButton
                    icon={<TeamOutlined />}
                    label="共享组"
                    active={activeTab === 'sharegroup'}
                    onClick={() => setActiveTab('sharegroup')}
                />
                <TabButton
                    icon={<CheckCircleOutlined />}
                    label="校验"
                    active={activeTab === 'validate'}
                    onClick={() => setActiveTab('validate')}
                />
            </div>

            {/* Tab 内容 */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {activeTab === 'constraints' && (
                    <ConstraintTabContent
                        predecessors={predecessors}
                        successors={successors}
                        onAddPredecessor={onAddPredecessor}
                        onAddSuccessor={onAddSuccessor}
                        onDelete={onDeleteConstraint}
                        onEdit={onEditConstraint}
                    />
                )}

                {activeTab === 'sharegroup' && (
                    <div style={{ padding: 16 }}>
                        <BatchShareGroupSection
                            operationPlanId={operationPlanId}
                            batchId={batchId}
                            onRefresh={onShareGroupRefresh}
                        />
                    </div>
                )}

                {activeTab === 'validate' && (
                    <ValidationTabContent
                        loading={validationLoading}
                        result={validationResult}
                        onValidate={onValidate}
                        onConflictClick={onConflictClick}
                    />
                )}
            </div>
        </div>
    );
};

export default BatchOperationDrawer;

/**
 * 操作编辑侧边抽屉组件
 * 包含三个 Tab: 约束 / 共享组 / 校验
 */

import React, { useState } from 'react';
import { Badge } from 'antd';
import { LinkOutlined, TeamOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { ConstraintTabContent } from './ConstraintTabContent';
import { ShareGroupTabContent } from './ShareGroupTabContent';
import { ValidationTabContent } from './ValidationTabContent';
import { Constraint, ShareGroup, ConstraintValidationResult } from '../../types';

// Tab 类型
type DrawerTab = 'constraints' | 'sharegroup' | 'validate';

interface OperationDrawerProps {
    predecessors: Constraint[];
    successors: Constraint[];
    onAddPredecessor: () => void;
    onAddSuccessor: () => void;
    onDeleteConstraint: (constraintId: number) => void;
    onEditConstraint?: (constraintId: number, updates: Partial<Constraint>) => Promise<void>;
    operationShareGroups: ShareGroup[];
    onEditShareGroup: (group: ShareGroup) => void;
    onRemoveShareGroup: (groupId: number) => void;
    onAddOrCreateShareGroup: () => void;
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
            padding: '10px 8px',
            textAlign: 'center',
            background: 'transparent',
            border: 'none',
            borderBottom: `2px solid ${active ? TOKENS.activeColor : 'transparent'}`,
            color: active ? TOKENS.activeColor : TOKENS.inactiveColor,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            fontWeight: active ? 500 : 400,
        }}
    >
        <span style={{ fontSize: 16, display: 'block', marginBottom: 2 }}>{icon}</span>
        <span style={{ fontSize: 12 }}>
            {label}
            {count !== undefined && count > 0 && (
                <Badge
                    count={count}
                    size="small"
                    style={{
                        marginLeft: 4,
                        backgroundColor: TOKENS.activeColor,
                    }}
                />
            )}
        </span>
    </button>
);

export const OperationDrawer: React.FC<OperationDrawerProps> = ({
    predecessors,
    successors,
    onAddPredecessor,
    onAddSuccessor,
    onDeleteConstraint,
    onEditConstraint,
    operationShareGroups,
    onEditShareGroup,
    onRemoveShareGroup,
    onAddOrCreateShareGroup,
    validationLoading,
    validationResult,
    onValidate,
    onConflictClick,
}) => {
    const [activeTab, setActiveTab] = useState<DrawerTab>('constraints');

    const constraintCount = predecessors.length + successors.length;
    const shareGroupCount = operationShareGroups.length;

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
                    count={shareGroupCount}
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
                    <ShareGroupTabContent
                        operationShareGroups={operationShareGroups}
                        onEdit={onEditShareGroup}
                        onRemove={onRemoveShareGroup}
                        onAddOrCreate={onAddOrCreateShareGroup}
                    />
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

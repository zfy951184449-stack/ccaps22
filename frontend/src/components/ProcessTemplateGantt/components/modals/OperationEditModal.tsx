/**
 * 操作编辑弹窗 - B+ 增强版
 * 主面板 + 多功能侧边抽屉布局
 * 
 * Apple HIG 风格设计
 */

import React, { useState, useEffect } from 'react';
import { Modal, Form, Button } from 'antd';
import type { FormInstance } from 'antd';
import { GanttNode, Operation, Constraint, ShareGroup, ConstraintValidationResult } from '../../types';
import { OperationBasicForm } from './OperationBasicForm';
import { OperationDrawer } from './OperationDrawer';
import { StageEditForm } from './StageEditForm';

interface OperationEditModalProps {
    visible: boolean;
    editingNode: GanttNode | null;
    form: FormInstance;
    onSave: (values: any) => void;
    onCancel: () => void;

    // 操作相关
    availableOperations: Operation[];
    onOpenOperationModal: () => void;

    // 约束相关
    operationConstraints: { predecessors: Constraint[]; successors: Constraint[] };
    onAddPredecessor: () => void;
    onAddSuccessor: () => void;
    onDeleteConstraint: (constraintId: number) => Promise<void>;
    onEditConstraint?: (constraintId: number, updates: Partial<Constraint>) => Promise<void>;

    // 共享组相关
    operationShareGroups: ShareGroup[];
    onEditShareGroup: (group: ShareGroup) => void;
    onRemoveShareGroup: (groupId: number) => void;
    onAddOrCreateShareGroup: () => void;

    // 校验相关
    validationLoading: boolean;
    validationResult: ConstraintValidationResult | null;
    onValidate: () => void;
    onConflictClick?: (conflict: any) => void;
}

export const OperationEditModal: React.FC<OperationEditModalProps> = ({
    visible,
    editingNode,
    form,
    onSave,
    onCancel,
    availableOperations,
    onOpenOperationModal,
    operationConstraints,
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
    const [isDirty, setIsDirty] = useState(false);

    // 判断是阶段还是操作
    const isStage = editingNode?.type === 'stage';
    const isOperation = editingNode?.type === 'operation';
    const isEditMode = !!editingNode?.data;

    // 获取标题
    const getTitle = () => {
        if (isStage) return '编辑阶段';
        if (isOperation && editingNode?.data) {
            return `编辑操作 - ${(editingNode.data as any).operation_code || ''}`;
        }
        return '添加操作';
    };

    // 重置脏状态
    useEffect(() => {
        if (visible) {
            setIsDirty(false);
        }
    }, [visible]);

    // 处理关闭
    const handleCancel = () => {
        if (isDirty) {
            Modal.confirm({
                title: '确认关闭',
                content: '您有未保存的修改，确定要关闭吗？',
                okText: '关闭',
                cancelText: '继续编辑',
                onOk: onCancel,
            });
        } else {
            onCancel();
        }
    };

    // Modal 宽度根据类型调整
    const modalWidth = isOperation ? 820 : 500;

    return (
        <Modal
            title={getTitle()}
            open={visible}
            onCancel={handleCancel}
            width={modalWidth}
            centered
            maskClosable={false}
            destroyOnClose
            footer={[
                <Button key="cancel" onClick={handleCancel}>
                    取消
                </Button>,
                <Button key="save" type="primary" onClick={() => form.submit()}>
                    保存
                </Button>,
            ]}
            bodyStyle={{ padding: 0, display: 'flex', height: isOperation ? 500 : 'auto' }}
        >
            {isStage ? (
                // 阶段编辑
                <div style={{ padding: 24, width: '100%' }}>
                    <Form
                        form={form}
                        layout="vertical"
                        onFinish={onSave}
                        onValuesChange={() => setIsDirty(true)}
                    >
                        <StageEditForm />
                    </Form>
                </div>
            ) : isOperation ? (
                // 操作编辑 - 主面板 + 抽屉布局
                <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                    {/* 左侧主面板 */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <div style={{
                            padding: '16px 20px',
                            borderBottom: '1px solid #e5e5e5',
                            background: '#fafafa',
                            fontWeight: 500,
                            fontSize: 14,
                        }}>
                            基本信息
                        </div>
                        <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
                            <Form
                                form={form}
                                layout="vertical"
                                onFinish={onSave}
                                onValuesChange={() => setIsDirty(true)}
                            >
                                <OperationBasicForm
                                    form={form}
                                    availableOperations={availableOperations}
                                    isEditMode={isEditMode}
                                    onOpenOperationModal={onOpenOperationModal}
                                />
                            </Form>
                        </div>
                    </div>

                    {/* 右侧抽屉 */}
                    <OperationDrawer
                        predecessors={operationConstraints.predecessors}
                        successors={operationConstraints.successors}
                        onAddPredecessor={onAddPredecessor}
                        onAddSuccessor={onAddSuccessor}
                        onDeleteConstraint={onDeleteConstraint}
                        onEditConstraint={onEditConstraint}
                        operationShareGroups={operationShareGroups}
                        onEditShareGroup={onEditShareGroup}
                        onRemoveShareGroup={onRemoveShareGroup}
                        onAddOrCreateShareGroup={onAddOrCreateShareGroup}
                        validationLoading={validationLoading}
                        validationResult={validationResult}
                        onValidate={onValidate}
                        onConflictClick={onConflictClick}
                    />
                </div>
            ) : null}
        </Modal>
    );
};

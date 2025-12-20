/**
 * GanttModals - B+ 增强版
 * 使用新的 OperationEditModal 替换原有的操作编辑逻辑
 */

import React from 'react';
import type { FormInstance } from 'antd';
import { GanttNode, Operation, Constraint, ShareGroup, ConstraintValidationResult } from '../types';
import { OperationSelectionModal } from '../../OperationSelectionModal';
import ShareGroupModal from './ShareGroupModal';
import {
    ValidationDrawer,
    CreateOperationModal,
    OperationEditModal,
    AddConstraintModal
} from './modals';

interface GanttModalsProps {
    // Edit Node Modal
    editModalVisible: boolean;
    setEditModalVisible: (visible: boolean) => void;
    editingNode: GanttNode | null;
    setEditingNode: (node: GanttNode | null) => void;
    form: FormInstance;
    handleSaveNode: (values: any) => void;
    availableOperations: Operation[];
    openOperationModal: () => void;

    // Constraints
    operationConstraints: { predecessors: Constraint[]; successors: Constraint[] };
    constraintForm: FormInstance;
    availableOperationsForConstraints: any[];
    handleSaveConstraint: (values: any, relation: 'predecessor' | 'successor') => Promise<void>;
    handleDeleteConstraint: (constraintId: number) => Promise<void>;
    handleEditConstraint?: (constraintId: number, updates: Partial<Constraint>) => Promise<void>;

    // Share Groups
    shareGroups: ShareGroup[];
    operationShareGroups: ShareGroup[];
    assignGroupForm: FormInstance;
    shareGroupForm: FormInstance;
    shareGroupModalVisible: boolean;
    setShareGroupModalVisible: (visible: boolean) => void;
    handleAssignShareGroup: (values: any) => void;
    handleRemoveShareGroup: (groupId: number) => void;
    handleCreateShareGroup: (values: any) => void;
    assigningGroup: boolean;
    creatingGroup: boolean;

    // Validation
    validationDrawerVisible: boolean;
    setValidationDrawerVisible: (visible: boolean) => void;
    handleValidateConstraints: () => void;
    validationLoading: boolean;
    validationResult: ConstraintValidationResult | null;
    handleConflictHighlight: (conflict: any) => void;
    clearActiveHighlight: () => void;

    // Create Operation Modal
    operationModalVisible: boolean;
    setOperationModalVisible: (visible: boolean) => void;
    operationForm: FormInstance;
    handleOperationSubmit: () => Promise<void>;
    operationSubmitting: boolean;
    templateId: number;
    loadShareGroups: () => Promise<void>;
}

export const GanttModals: React.FC<GanttModalsProps> = ({
    editModalVisible,
    setEditModalVisible,
    editingNode,
    setEditingNode,
    form,
    handleSaveNode,
    availableOperations,
    openOperationModal,
    operationConstraints,
    constraintForm,
    availableOperationsForConstraints,
    handleSaveConstraint,
    handleDeleteConstraint,
    handleEditConstraint,
    shareGroups,
    operationShareGroups,
    assignGroupForm,
    shareGroupForm,
    shareGroupModalVisible,
    setShareGroupModalVisible,
    handleAssignShareGroup,
    handleRemoveShareGroup,
    handleCreateShareGroup,
    assigningGroup,
    creatingGroup,
    validationDrawerVisible,
    setValidationDrawerVisible,
    handleValidateConstraints,
    validationLoading,
    validationResult,
    handleConflictHighlight,
    clearActiveHighlight,
    operationModalVisible,
    setOperationModalVisible,
    operationForm,
    handleOperationSubmit,
    operationSubmitting,
    templateId,
    loadShareGroups
}) => {
    // State for operation selection modals
    const [predecessorSelectVisible, setPredecessorSelectVisible] = React.useState(false);
    const [successorSelectVisible, setSuccessorSelectVisible] = React.useState(false);

    // State for constraint configuration modal
    const [addConstraintVisible, setAddConstraintVisible] = React.useState(false);
    const [constraintType, setConstraintType] = React.useState<'predecessor' | 'successor'>('predecessor');
    const [selectedOperationId, setSelectedOperationId] = React.useState<number | null>(null);
    const [constraintSaving, setConstraintSaving] = React.useState(false);

    // State for share group editing
    const [editingShareGroup, setEditingShareGroup] = React.useState<ShareGroup | null>(null);

    // Get selected operation name for display
    const selectedOperationName = React.useMemo(() => {
        if (!selectedOperationId) return null;
        const op = availableOperationsForConstraints.find(o => o.id === selectedOperationId);
        return op ? `${op.operation_code} - ${op.operation_name}` : null;
    }, [selectedOperationId, availableOperationsForConstraints]);

    // Handle closing edit modal
    const handleCloseEditModal = () => {
        setEditModalVisible(false);
        setEditingNode(null);
        form.resetFields();
    };

    // Handle operation selected for constraint
    const handleOperationSelected = (scheduleId: number, type: 'predecessor' | 'successor') => {
        setSelectedOperationId(scheduleId);
        setConstraintType(type);
        setAddConstraintVisible(true);
        // Close selection modal
        if (type === 'predecessor') {
            setPredecessorSelectVisible(false);
        } else {
            setSuccessorSelectVisible(false);
        }
    };

    // Handle constraint configuration submitted
    const handleConstraintSubmit = async () => {
        if (!selectedOperationId) return;
        setConstraintSaving(true);
        try {
            const values = constraintForm.getFieldsValue();
            await handleSaveConstraint(
                { ...values, related_schedule_id: selectedOperationId },
                constraintType
            );
            setAddConstraintVisible(false);
            setSelectedOperationId(null);
            constraintForm.resetFields();
        } finally {
            setConstraintSaving(false);
        }
    };

    return (
        <>
            {/* B+ Edit Modal - New Design */}
            <OperationEditModal
                visible={editModalVisible}
                editingNode={editingNode}
                form={form}
                onSave={handleSaveNode}
                onCancel={handleCloseEditModal}
                availableOperations={availableOperations}
                onOpenOperationModal={openOperationModal}
                operationConstraints={operationConstraints}
                onAddPredecessor={() => setPredecessorSelectVisible(true)}
                onAddSuccessor={() => setSuccessorSelectVisible(true)}
                onDeleteConstraint={handleDeleteConstraint}
                onEditConstraint={handleEditConstraint}
                operationShareGroups={operationShareGroups}
                onEditShareGroup={(group) => {
                    setEditingShareGroup(group);
                    setShareGroupModalVisible(true);
                }}
                onRemoveShareGroup={handleRemoveShareGroup}
                onAddOrCreateShareGroup={() => {
                    setEditingShareGroup(null);
                    setShareGroupModalVisible(true);
                }}
                validationLoading={validationLoading}
                validationResult={validationResult}
                onValidate={handleValidateConstraints}
                onConflictClick={handleConflictHighlight}
            />

            {/* Create Operation Modal */}
            <CreateOperationModal
                visible={operationModalVisible}
                onCancel={() => setOperationModalVisible(false)}
                onOk={handleOperationSubmit}
                form={operationForm}
                loading={operationSubmitting}
            />

            {/* Share Group Modal */}
            <ShareGroupModal
                visible={shareGroupModalVisible}
                templateId={templateId}
                group={editingShareGroup}
                operations={
                    availableOperationsForConstraints.map(op => ({
                        scheduleId: op.id,
                        operationName: op.operation_name,
                        stageName: op.stage_name,
                        requiredPeople: op.required_people
                    }))
                }
                onCancel={() => {
                    setShareGroupModalVisible(false);
                    setEditingShareGroup(null);
                }}
                onSave={() => {
                    setShareGroupModalVisible(false);
                    setEditingShareGroup(null);
                    loadShareGroups();
                }}
                initialSelectedOperations={editingNode?.data?.id ? [Number(editingNode.data.id)] : []}
            />

            {/* Validation Drawer */}
            <ValidationDrawer
                visible={validationDrawerVisible}
                onClose={() => {
                    setValidationDrawerVisible(false);
                    clearActiveHighlight();
                }}
                loading={validationLoading}
                result={validationResult}
                onConflictClick={handleConflictHighlight}
            />

            {/* Step 1: Operation Selection - Predecessor */}
            <OperationSelectionModal
                visible={predecessorSelectVisible}
                onClose={() => setPredecessorSelectVisible(false)}
                onSelect={(scheduleId) => handleOperationSelected(scheduleId, 'predecessor')}
                operations={availableOperationsForConstraints}
                currentOperationId={editingNode?.data?.id}
                title="选择前置操作"
            />

            {/* Step 1: Operation Selection - Successor */}
            <OperationSelectionModal
                visible={successorSelectVisible}
                onClose={() => setSuccessorSelectVisible(false)}
                onSelect={(scheduleId) => handleOperationSelected(scheduleId, 'successor')}
                operations={availableOperationsForConstraints}
                currentOperationId={editingNode?.data?.id}
                title="选择后续操作"
            />

            {/* Step 2: Constraint Configuration */}
            <AddConstraintModal
                visible={addConstraintVisible}
                type={constraintType}
                selectedOperationName={selectedOperationName}
                form={constraintForm}
                onCancel={() => {
                    setAddConstraintVisible(false);
                    setSelectedOperationId(null);
                }}
                onSubmit={handleConstraintSubmit}
                loading={constraintSaving}
            />
        </>
    );
};

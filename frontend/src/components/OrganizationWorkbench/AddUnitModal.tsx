import React, { useState, useEffect, useMemo } from 'react';
import { Form } from 'antd';
import axios from 'axios';
import {
    WxbButton,
    WxbInput,
    WxbInputNumber,
    WxbModal,
    WxbSelect,
    WxbTreeSelect,
    wxbToast,
} from '../wxb-ui';
import { OrganizationUnitNode } from '../../types/organizationWorkbench';
import { FolderIcon, GroupIcon, ShiftIcon, TeamIcon } from './OrgWorkbenchIcons';

interface AddUnitModalProps {
    visible: boolean;
    onCancel: () => void;
    onSuccess: () => void;
    parentUnitId: number | null;
    allUnits: OrganizationUnitNode[]; // Processed tree for selection
}

const AddUnitModal: React.FC<AddUnitModalProps> = ({
    visible,
    onCancel,
    onSuccess,
    parentUnitId,
    allUnits
}) => {
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (visible) {
            form.resetFields();
            form.setFieldsValue({
                parent_id: parentUnitId || null, // null for Root
                sort_order: 0,
                unit_type: 'TEAM' // Default nice to have
            });
        }
    }, [visible, parentUnitId, form]);

    const handleFinish = async (values: any) => {
        setSubmitting(true);
        try {
            await axios.post('/api/org-structure/units', values);
            wxbToast.success('Organization unit created successfully');
            onSuccess();
        } catch (err) {
            console.error(err);
            wxbToast.error('Failed to create unit');
        } finally {
            setSubmitting(false);
        }
    };

    // Convert OrgNode to TreeSelect Data
    const treeData = useMemo(() => {
        const mapNode = (node: OrganizationUnitNode): any => ({
            title: node.unitName,
            value: node.id,
            key: node.id,
            children: node.children ? node.children.map(mapNode) : []
        });

        const nodes = allUnits.map(mapNode);

        // Add Root Option manually if needed, or allow clearing selection to mean Root
        // For UX, explicit "Roots" might be better if `parent_id` is nullable.
        // Antd TreeSelect 'allowClear' results in undefined/null which maps to root execution.
        return nodes;
    }, [allUnits]);

    const unitTypeOptions = [
        {
            value: 'DEPARTMENT',
            label: <span className="orgwb-select-option"><FolderIcon className="orgwb-tree-icon--department" /> Department</span>,
        },
        {
            value: 'TEAM',
            label: <span className="orgwb-select-option"><TeamIcon className="orgwb-tree-icon--team" /> Team</span>,
        },
        {
            value: 'GROUP',
            label: <span className="orgwb-select-option"><GroupIcon className="orgwb-tree-icon--group" /> Group</span>,
        },
        {
            value: 'SHIFT',
            label: <span className="orgwb-select-option"><ShiftIcon className="orgwb-tree-icon--shift" /> Shift</span>,
        },
    ];

    return (
        <WxbModal
            title="Add Unit"
            open={visible}
            onCancel={onCancel}
            footer={null}
            centered
            width={480}
            className="orgwb-form-modal"
            forceRender
        >
            <Form
                form={form}
                layout="vertical"
                onFinish={handleFinish}
                className="orgwb-form"
                requiredMark="optional"
            >
                <Form.Item
                    name="unit_name"
                    label="Unit Name"
                    rules={[{ required: true, message: 'Please enter a unit name' }]}
                >
                    <WxbInput
                        placeholder="Enter unit name..."
                    />
                </Form.Item>

                <Form.Item
                    name="unit_type"
                    label="Unit Type"
                    rules={[{ required: true, message: 'Please select a type' }]}
                >
                    <WxbSelect
                        placeholder="Select type..."
                        options={unitTypeOptions}
                    />
                </Form.Item>

                <Form.Item
                    name="parent_id"
                    label="Parent Unit"
                    tooltip="Leave empty to create a root level unit"
                >
                    <WxbTreeSelect
                        treeData={treeData}
                        placeholder="Select parent (optional)..."
                        allowClear
                        treeDefaultExpandAll
                        treeLine
                        showSearch
                        treeNodeFilterProp="title"
                    />
                </Form.Item>

                <div className="orgwb-form-grid">
                    <Form.Item
                        name="unit_code"
                        label="Unit Code (Optional)"
                    >
                        <WxbInput placeholder="e.g. DEPT-01" />
                    </Form.Item>

                    <Form.Item
                        name="sort_order"
                        label="Sort Order"
                    >
                        <WxbInputNumber min={0} />
                    </Form.Item>
                </div>

                <div className="orgwb-form-actions">
                    <WxbButton
                        type="button"
                        onClick={onCancel}
                        variant="ghost"
                    >
                        Cancel
                    </WxbButton>
                    <WxbButton
                        type="submit"
                        disabled={submitting}
                        variant="primary"
                    >
                        {submitting ? 'Creating...' : 'Create'}
                    </WxbButton>
                </div>

            </Form>
        </WxbModal>
    );
};

export default AddUnitModal;

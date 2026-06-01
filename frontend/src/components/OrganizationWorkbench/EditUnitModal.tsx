import React, { useState, useEffect, useMemo } from 'react';
import { Form } from 'antd';
import axios from 'axios';
import {
    WxbButton,
    WxbInput,
    WxbInputNumber,
    WxbModal,
    WxbSelect,
    WxbSwitch,
    WxbTreeSelect,
    wxbToast,
} from '../wxb-ui';
import { OrganizationUnitNode } from '../../types/organizationWorkbench';
import { FolderIcon, GroupIcon, ShiftIcon, TeamIcon } from './OrgWorkbenchIcons';

interface EditUnitModalProps {
    visible: boolean;
    onCancel: () => void;
    onSuccess: () => void;
    unit: OrganizationUnitNode | null;
    allUnits: OrganizationUnitNode[];
}

const EditUnitModal: React.FC<EditUnitModalProps> = ({
    visible,
    onCancel,
    onSuccess,
    unit,
    allUnits
}) => {
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (visible && unit) {
            form.setFieldsValue({
                unit_name: unit.unitName,
                unit_type: unit.unitType,
                unit_code: unit.unitCode || '',
                parent_id: unit.parentId || null,
                default_shift_code: unit.defaultShiftCode || '',
                sort_order: unit.sortOrder || 0,
                is_active: unit.isActive,
            });
        }
    }, [visible, unit, form]);

    const handleFinish = async (values: any) => {
        if (!unit) return;
        setSubmitting(true);
        try {
            const payload: Record<string, any> = {};

            // Only send changed fields
            if (values.unit_name !== unit.unitName) payload.unit_name = values.unit_name;
            if (values.unit_type !== unit.unitType) payload.unit_type = values.unit_type;
            if ((values.unit_code || '') !== (unit.unitCode || '')) payload.unit_code = values.unit_code || null;
            if ((values.parent_id || null) !== (unit.parentId || null)) payload.parent_id = values.parent_id || null;
            if ((values.default_shift_code || '') !== (unit.defaultShiftCode || ''))
                payload.default_shift_code = values.default_shift_code || null;
            if (values.sort_order !== unit.sortOrder) payload.sort_order = values.sort_order;
            if (values.is_active !== unit.isActive) payload.is_active = values.is_active;

            if (Object.keys(payload).length === 0) {
                wxbToast.info('No changes detected');
                onCancel();
                return;
            }

            await axios.put(`/api/org-structure/units/${unit.id}`, payload);
            wxbToast.success('Unit updated successfully');
            onSuccess();
        } catch (err: any) {
            console.error(err);
            const serverMsg = err?.response?.data?.message;
            wxbToast.error(serverMsg || 'Failed to update unit');
        } finally {
            setSubmitting(false);
        }
    };

    // Convert OrgNode to TreeSelect Data, excluding self and descendants to prevent circular refs
    const treeData = useMemo(() => {
        if (!unit) return [];

        const getDescendantIds = (node: OrganizationUnitNode): number[] => {
            const ids = [node.id];
            if (node.children) {
                node.children.forEach(child => {
                    ids.push(...getDescendantIds(child));
                });
            }
            return ids;
        };

        const excludeIds = new Set(getDescendantIds(unit));

        const mapNode = (node: OrganizationUnitNode): any => {
            if (excludeIds.has(node.id)) return null;
            const children = node.children
                ? node.children.map(mapNode).filter(Boolean)
                : [];
            return {
                title: node.unitName,
                value: node.id,
                key: node.id,
                children,
            };
        };

        return allUnits.map(mapNode).filter(Boolean);
    }, [allUnits, unit]);

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
            title="Edit Unit"
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
                    tooltip="Leave empty for root level. Self and descendants are excluded."
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

                <div className="orgwb-form-grid">
                    <Form.Item
                        name="default_shift_code"
                        label="Default Shift Code"
                    >
                        <WxbInput placeholder="e.g. DAY" />
                    </Form.Item>

                    <Form.Item
                        name="is_active"
                        label="Active"
                        valuePropName="checked"
                    >
                        <WxbSwitch checkedChildren="On" unCheckedChildren="Off" />
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
                        {submitting ? 'Saving...' : 'Save Changes'}
                    </WxbButton>
                </div>
            </Form>
        </WxbModal>
    );
};

export default EditUnitModal;

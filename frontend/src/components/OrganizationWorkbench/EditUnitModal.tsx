import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Form, Input, Select, Button, TreeSelect, message, InputNumber, Switch } from 'antd';
import { FolderOutlined, TeamOutlined, ClusterOutlined, DeploymentUnitOutlined } from '@ant-design/icons';
import axios from 'axios';
import { OrganizationUnitNode } from '../../types/organizationWorkbench';

interface EditUnitModalProps {
    visible: boolean;
    onCancel: () => void;
    onSuccess: () => void;
    unit: OrganizationUnitNode | null;
    allUnits: OrganizationUnitNode[];
}

const { Option } = Select;

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
                message.info('No changes detected');
                onCancel();
                return;
            }

            await axios.put(`/api/org-structure/units/${unit.id}`, payload);
            message.success('Unit updated successfully');
            onSuccess();
        } catch (err: any) {
            console.error(err);
            const serverMsg = err?.response?.data?.message;
            message.error(serverMsg || 'Failed to update unit');
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

    return (
        <Modal
            title={<span className="text-xl font-semibold text-gray-900">Edit Unit</span>}
            open={visible}
            onCancel={onCancel}
            footer={null}
            centered
            width={480}
            className="mac-modal rounded-2xl overflow-hidden"
            styles={{
                content: {
                    borderRadius: '16px',
                    padding: '24px',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                    border: '1px solid rgba(255,255,255,0.6)',
                    background: 'rgba(255, 255, 255, 0.9)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                }
            }}
            maskStyle={{
                backdropFilter: 'blur(4px)',
                background: 'rgba(0, 0, 0, 0.2)'
            }}
        >
            <Form
                form={form}
                layout="vertical"
                onFinish={handleFinish}
                className="mt-4"
                requiredMark="optional"
            >
                <Form.Item
                    name="unit_name"
                    label={<span className="font-medium text-gray-700">Unit Name</span>}
                    rules={[{ required: true, message: 'Please enter a unit name' }]}
                >
                    <Input
                        placeholder="Enter unit name..."
                        className="rounded-lg py-2 bg-white/60 border-gray-200 focus:bg-white transition-all"
                    />
                </Form.Item>

                <Form.Item
                    name="unit_type"
                    label={<span className="font-medium text-gray-700">Unit Type</span>}
                    rules={[{ required: true, message: 'Please select a type' }]}
                >
                    <Select
                        placeholder="Select type..."
                        className="h-10 rounded-lg"
                        popupClassName="rounded-xl"
                    >
                        <Option value="DEPARTMENT">
                            <div className="flex items-center gap-2">
                                <FolderOutlined className="text-blue-500" /> Department
                            </div>
                        </Option>
                        <Option value="TEAM">
                            <div className="flex items-center gap-2">
                                <TeamOutlined className="text-indigo-500" /> Team
                            </div>
                        </Option>
                        <Option value="GROUP">
                            <div className="flex items-center gap-2">
                                <ClusterOutlined className="text-purple-500" /> Group
                            </div>
                        </Option>
                        <Option value="SHIFT">
                            <div className="flex items-center gap-2">
                                <DeploymentUnitOutlined className="text-gray-500" /> Shift
                            </div>
                        </Option>
                    </Select>
                </Form.Item>

                <Form.Item
                    name="parent_id"
                    label={<span className="font-medium text-gray-700">Parent Unit</span>}
                    tooltip="Leave empty for root level. Self and descendants are excluded."
                >
                    <TreeSelect
                        treeData={treeData}
                        placeholder="Select parent (optional)..."
                        allowClear
                        treeDefaultExpandAll
                        className="h-10 rounded-lg"
                        popupClassName="rounded-xl"
                        treeLine
                        showSearch
                        treeNodeFilterProp="title"
                    />
                </Form.Item>

                <div className="grid grid-cols-2 gap-4">
                    <Form.Item
                        name="unit_code"
                        label={<span className="font-medium text-gray-700 text-xs">Unit Code (Optional)</span>}
                    >
                        <Input placeholder="e.g. DEPT-01" className="rounded-lg bg-white/60 border-gray-200" />
                    </Form.Item>

                    <Form.Item
                        name="sort_order"
                        label={<span className="font-medium text-gray-700 text-xs">Sort Order</span>}
                    >
                        <InputNumber className="w-full rounded-lg bg-white/60 border-gray-200" min={0} />
                    </Form.Item>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <Form.Item
                        name="default_shift_code"
                        label={<span className="font-medium text-gray-700 text-xs">Default Shift Code</span>}
                    >
                        <Input placeholder="e.g. DAY" className="rounded-lg bg-white/60 border-gray-200" />
                    </Form.Item>

                    <Form.Item
                        name="is_active"
                        label={<span className="font-medium text-gray-700 text-xs">Active</span>}
                        valuePropName="checked"
                    >
                        <Switch checkedChildren="On" unCheckedChildren="Off" />
                    </Form.Item>
                </div>

                <div className="flex items-center justify-end gap-3 mt-8 pt-4 border-t border-gray-100">
                    <Button
                        onClick={onCancel}
                        className="rounded-full px-6 border-gray-300 text-gray-600 hover:text-gray-800 hover:border-gray-400 font-medium"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="primary"
                        htmlType="submit"
                        loading={submitting}
                        className="rounded-full px-8 bg-blue-600 hover:bg-blue-500 border-none shadow-md shadow-blue-500/20 font-medium"
                    >
                        Save Changes
                    </Button>
                </div>
            </Form>
        </Modal>
    );
};

export default EditUnitModal;

import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Form, Input, Select, Button, TreeSelect, message, InputNumber } from 'antd';
import { FolderOutlined, TeamOutlined, ClusterOutlined, DeploymentUnitOutlined } from '@ant-design/icons';
import axios from 'axios';
import { OrganizationUnitNode } from '../../types/organizationWorkbench';

interface AddUnitModalProps {
    visible: boolean;
    onCancel: () => void;
    onSuccess: () => void;
    parentUnitId: number | null;
    allUnits: OrganizationUnitNode[]; // Processed tree for selection
}

const { Option } = Select;

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
            message.success('Organization unit created successfully');
            onSuccess();
        } catch (err) {
            console.error(err);
            message.error('Failed to create unit');
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

    return (
        <Modal
            title={<span className="text-xl font-semibold text-gray-900">Add Unit</span>}
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
                    tooltip="Leave empty to create a root level unit"
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
                        Create
                    </Button>
                </div>

            </Form>
        </Modal>
    );
};

export default AddUnitModal;

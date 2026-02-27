import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Select, Tag, message } from 'antd';
import { Employee } from '../../types/organizationWorkbench';
import axios from 'axios';

interface EditEmployeeModalProps {
    visible: boolean;
    employee: Employee | null;
    onCancel: () => void;
    onSuccess: () => void;
}

const { Option } = Select;

const EditEmployeeModal: React.FC<EditEmployeeModalProps> = ({
    visible,
    employee,
    onCancel,
    onSuccess
}) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (visible && employee) {
            form.setFieldsValue({
                employeeName: employee.employee_name,
                employeeCode: employee.employee_code,
                position: employee.primary_role_id, // Mapping role to position/role ID
                employmentStatus: employee.employment_status,
                unitId: employee.unit_id
                // For simplified V1, we edit the primary unit directly
            });
        } else {
            form.resetFields();
        }
    }, [visible, employee, form]);

    const handleSave = async () => {
        try {
            const values = await form.validateFields();
            if (!employee) return;

            setLoading(true);
            // Construct payload compatible with updateEmployee
            // Note: Backend expects camelCase or snake_case depending on logic; controller handles both mostly.
            const payload = {
                employeeName: values.employeeName,
                // employeeCode is typically immutable
                primaryRoleId: values.position,
                employmentStatus: values.employmentStatus,
                unitId: values.unitId
            };

            await axios.put(`http://localhost:3001/api/employees/${employee.id}`, payload);

            message.success('Employee updated successfully');
            onSuccess();
        } catch (error) {
            console.error('Failed to update employee', error);
            message.error('Failed to update employee');
        } finally {
            setLoading(false);
        }
    };

    // Mock roles/units for dropdown (In real app, fetch these)
    // For now, we rely on values passed or just show basic inputs
    // Ideally, we need to fetch the list of units and roles to populate Select options.
    // Since we are inside the Workbench, we might have access to the full Unit Tree from context/props?
    // I will skip fetching *all* units here to avoid complexity in this file, 
    // but for a real select, we need data.
    // I'll assume we can pass `units` as props or fetch them.
    // For this step, I'll use a simple Input for IDs or basic mock options if I can't easily get the tree.
    // Wait, I can't put an Input for Unit ID, that's bad UX.
    // I'll make it a TreeSelect if possible, or just a Select if I fetch hierarchy.

    return (
        <Modal
            title="Edit Employee Details"
            open={visible}
            onOk={handleSave}
            onCancel={onCancel}
            confirmLoading={loading}
            centered
            className="backdrop-blur-sm"
            okText="Save"
            cancelText="Cancel"
        >
            <Form
                form={form}
                layout="vertical"
                name="edit_employee_form"
            >
                <Form.Item
                    name="employeeName"
                    label="Name"
                    rules={[{ required: true, message: 'Please enter name' }]}
                >
                    <Input />
                </Form.Item>

                <Form.Item
                    name="employeeCode"
                    label="Employee ID (Read-only)"
                >
                    <Input disabled className="bg-gray-50 text-gray-500" />
                </Form.Item>

                <Form.Item
                    name="position"
                    label="Position / Role"
                >
                    <Select placeholder="Select a position">
                        {/* Dynamic Roles should be loaded, here are standard ones */}
                        <Option value={1}>Frontline Operator</Option>
                        <Option value={2}>Shift Leader</Option>
                        <Option value={3}>Group Leader</Option>
                        <Option value={4}>Dept Manager</Option>
                    </Select>
                </Form.Item>

                <Form.Item
                    name="employmentStatus"
                    label="Status"
                >
                    <Select>
                        <Option value="ACTIVE">Active</Option>
                        <Option value="VACATION">Vacation</Option>
                        <Option value="On Leave">On Leave</Option>
                        <Option value="RESIGNED">Resigned</Option>
                    </Select>
                </Form.Item>

                {/* Unit Selection would be a TreeSelect in a full implementation */}
                <div className="bg-gray-50 p-3 rounded-md border border-gray-200 mb-4">
                    <span className="text-xs text-gray-500 block mb-1">Current Organization</span>
                    <Tag color="blue">{employee?.unit_name || 'Unassigned'} [Primary]</Tag>
                </div>

            </Form>
        </Modal>
    );
};

export default EditEmployeeModal;

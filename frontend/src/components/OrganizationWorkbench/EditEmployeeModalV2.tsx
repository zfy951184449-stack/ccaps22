import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Select, DatePicker, Tag, Button, Divider, message } from 'antd';
import { CloseOutlined, PlusOutlined, UserOutlined, IdcardOutlined, ClusterOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { Employee } from '../../types/organizationWorkbench';
import axios from 'axios';
import OrgUnitSelectorModal from './OrgUnitSelectorModal';

interface EditEmployeeModalV2Props {
    visible: boolean;
    employee: Employee | null;
    onCancel: () => void;
    onSuccess: () => void;
}

interface EmployeeAssignment {
    id: number;
    employeeId: number;
    teamId: number; // This is unit_id
    roleId: number;
    isPrimary: number; // 0 or 1
    teamName: string;
    roleName: string;
}

const { Option } = Select;

const EditEmployeeModalV2: React.FC<EditEmployeeModalV2Props> = ({
    visible,
    employee,
    onCancel,
    onSuccess
}) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [availableRoles, setAvailableRoles] = useState<{ id: number; role_code: string; role_name: string }[]>([]);
    const [assignments, setAssignments] = useState<EmployeeAssignment[]>([]);
    const [currentUnitId, setCurrentUnitId] = useState<number | null>(null);

    // Sync currentUnitId when employee prop changes
    useEffect(() => {
        if (employee) {
            setCurrentUnitId(employee.unit_id ?? null);
        }
    }, [employee]);

    const [selectorVisible, setSelectorVisible] = useState(false);

    // Fetch Roles
    useEffect(() => {
        const fetchRoles = async () => {
            try {
                const res = await axios.get('/api/employees/roles');
                setAvailableRoles(res.data);
            } catch (err) {
                console.error('Failed to fetch roles', err);
            }
        };
        if (visible) {
            fetchRoles();
        }
    }, [visible]);

    // Fetch Assignments
    const fetchAssignments = async () => {
        if (!employee) return;
        try {
            const res = await axios.get(`/api/employees/${employee.id}/assignments`);
            setAssignments(res.data);
        } catch (err) {
            console.error('Failed to fetch assignments', err);
        }
    };

    useEffect(() => {
        if (visible && employee) {
            fetchAssignments();
        } else {
            setAssignments([]);
        }
    }, [visible, employee]);

    // Initialize form
    useEffect(() => {
        if (visible && employee) {
            const initialValues = {
                employeeName: employee.employee_name,
                employeeCode: employee.employee_code,
                position: employee.primary_role_id, // Use ID
                employmentStatus: employee.employment_status,
                hireDate: employee.hire_date ? dayjs(employee.hire_date) : null,
            };
            form.setFieldsValue(initialValues);
        } else {
            form.resetFields();
        }
    }, [visible, employee, form]);

    const handleSave = async () => {
        try {
            const values = await form.validateFields();
            if (!employee) return;

            setLoading(true);

            const payload = {
                employeeName: values.employeeName,
                primaryRoleId: values.position, // Send ID
                employmentStatus: values.employmentStatus,
                hireDate: values.hireDate ? values.hireDate.format('YYYY-MM-DD') : null,
                unitId: currentUnitId // Use local state which reflects recent changes
            };

            await axios.put(`/api/employees/${employee.id}`, payload);

            message.success('Employee updated successfully');
            onSuccess();
        } catch (error) {
            console.error('Failed to update employee', error);
            message.error('Failed to update employee');
        } finally {
            if (loading) setLoading(false);
        }
    };

    const handleUnitSelection = async (unitId: number) => {
        if (!employee) return;

        try {
            // Direct update to employee unit_id as per single-unit architecture
            // We use the same update endpoint as the main form save
            await axios.put(`/api/employees/${employee.id}`, {
                unitId: unitId
            });
            // Update local state so future saves respect this change
            setCurrentUnitId(unitId);

            message.success('Organization unit updated');

            // Await refresh to ensure UI displays new value
            await fetchAssignments();
        } catch (err) {
            console.error(err);
            message.error('Failed to update organization unit');
        } finally {
            setSelectorVisible(false);
        }
    };

    const handleEditClick = (assignmentId: number) => {
        // In single-unit mode, we don't need to track which assignment ID we are editing
        // because there is only one unit. We just open the selector to change it.
        setSelectorVisible(true);
    };

    const handleAddClick = () => {
        setSelectorVisible(true);
    };

    const handleRemoveAssignment = async (assignmentId: number) => {
        if (!employee) return;
        try {
            await axios.delete(`/api/employees/${employee.id}/assignments/${assignmentId}`);
            message.success('Assignment removed');
            fetchAssignments();
        } catch (err) {
            message.error('Failed to remove assignment');
        }
    };

    // handleSetPrimary removed - single-unit architecture means there's always one primary unit

    // macOS-style Status Dot renderer
    const renderStatusOption = (status: string, color: string) => (
        <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${color}`}></span>
            <span>{status}</span>
        </div>
    );

    return (
        <Modal
            open={visible}
            footer={null}
            closable={false}
            centered
            width={600}
            className="mac-modal"
            maskStyle={{ backdropFilter: 'blur(4px)', backgroundColor: 'rgba(0,0,0,0.2)' }}
            // Make the default AntD content box transparent so our custom design takes over
            styles={{
                content: {
                    backgroundColor: 'transparent',
                    boxShadow: 'none',
                    padding: 0
                }
            }}
        >
            <div className="overflow-hidden rounded-2xl shadow-2xl bg-white/80 backdrop-blur-xl border border-white/40">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200/50 bg-white/40">
                    <h3 className="text-lg font-semibold text-gray-800 m-0 tracking-tight">Edit Employee</h3>
                    <Button
                        type="text"
                        icon={<CloseOutlined className="text-gray-500" />}
                        onClick={onCancel}
                        className="hover:bg-gray-200/50 rounded-full w-8 h-8 flex items-center justify-center p-0"
                    />
                </div>

                {/* Body */}
                <div className="p-8">
                    <Form
                        form={form}
                        layout="vertical"
                        requiredMark={false}
                        className="space-y-6"
                    >
                        {/* Section: Basic Info */}
                        <div>
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Basic Info</h4>
                            <div className="grid grid-cols-2 gap-5">
                                <Form.Item label="Name" name="employeeName" rules={[{ required: true }]}>
                                    <Input prefix={<UserOutlined className="text-gray-400" />} className="rounded-lg py-1.5" />
                                </Form.Item>
                                <Form.Item label="Employee ID" name="employeeCode">
                                    <Input prefix={<IdcardOutlined className="text-gray-400" />} disabled className="rounded-lg py-1.5 bg-gray-50/50" />
                                </Form.Item>
                            </div>
                        </div>

                        {/* Section: Professional */}
                        <div>
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 mt-2">Professional</h4>
                            <Form.Item label="Position" name="position">
                                <Select className="rounded-lg" size="large" placeholder="Select Role">
                                    {availableRoles.map(role => (
                                        <Option key={role.id} value={role.id}>{role.role_name}</Option>
                                    ))}
                                </Select>
                            </Form.Item>

                            <Form.Item label="Organization">
                                <div className="flex flex-wrap gap-2 p-3 bg-gray-50/50 rounded-xl border border-gray-200/50 min-h-[50px]">
                                    {assignments.map(assign => (
                                        <Tag
                                            key={assign.id}
                                            closable
                                            onClose={(e) => {
                                                e.preventDefault();
                                                handleRemoveAssignment(assign.id);
                                            }}
                                            onClick={() => handleEditClick(assign.id)}
                                            className="flex items-center gap-1.5 px-3 py-1 rounded-full m-0 text-sm font-medium cursor-pointer transition-all border bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:border-blue-300"
                                        >
                                            <ClusterOutlined /> {assign.teamName}
                                        </Tag>
                                    ))}

                                    {assignments.length === 0 && (
                                        <Button
                                            type="dashed"
                                            size="small"
                                            shape="circle"
                                            icon={<PlusOutlined className="text-xs" />}
                                            className="bg-transparent"
                                            onClick={handleAddClick}
                                        />
                                    )}
                                </div>
                            </Form.Item>
                        </div>

                        {/* Section: Personal */}
                        <div>
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 mt-2">Personal</h4>
                            <div className="grid grid-cols-2 gap-5">
                                <Form.Item label="Status" name="employmentStatus">
                                    <Select size="middle" bordered={false} className="bg-gray-100 rounded-lg px-1">
                                        <Option value="ACTIVE">{renderStatusOption('Active', 'bg-green-500')}</Option>
                                        <Option value="VACATION">{renderStatusOption('Vacation', 'bg-yellow-500')}</Option>
                                        <Option value="ON LEAVE">{renderStatusOption('On Leave', 'bg-orange-500')}</Option>
                                        <Option value="RESIGNED">{renderStatusOption('Resigned', 'bg-red-500')}</Option>
                                    </Select>
                                </Form.Item>
                                <Form.Item label="Hire Date" name="hireDate">
                                    <DatePicker className="w-full rounded-lg bg-gray-50 border-gray-200" />
                                </Form.Item>
                            </div>
                        </div>

                    </Form>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-200/50 flex justification-end items-center gap-3">
                    <div className="flex-1"></div>
                    <Button onClick={onCancel} className="rounded-lg border-0 bg-transparent hover:bg-gray-200/50 text-gray-600 font-medium">
                        Cancel
                    </Button>
                    <Button
                        type="primary"
                        onClick={handleSave}
                        loading={loading}
                        className="rounded-lg px-6 bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-500/20 border-0 h-9 font-medium"
                    >
                        Save Changes
                    </Button>
                </div>
            </div>

            <OrgUnitSelectorModal
                visible={selectorVisible}
                onCancel={() => setSelectorVisible(false)}
                onSelect={(unitId) => handleUnitSelection(unitId)}
            />
        </Modal>
    );
};

export default EditEmployeeModalV2;

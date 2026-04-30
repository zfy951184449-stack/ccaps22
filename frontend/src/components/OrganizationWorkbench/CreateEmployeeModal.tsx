import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Select, DatePicker, Button, message, Divider } from 'antd';
import { CloseOutlined, UserOutlined, IdcardOutlined, ClusterOutlined, PlusOutlined } from '@ant-design/icons';
import axios from 'axios';
import OrgUnitSelectorModal from './OrgUnitSelectorModal';

interface CreateEmployeeModalProps {
    visible: boolean;
    onCancel: () => void;
    onSuccess: () => void;
    defaultUnitId?: number | null;
    defaultUnitName?: string | null;
}

const { Option } = Select;

const ORG_ROLE_OPTIONS = [
    { value: 'FRONTLINE', label: 'Frontline' },
    { value: 'SHIFT_LEADER', label: 'Shift Leader' },
    { value: 'GROUP_LEADER', label: 'Group Leader' },
    { value: 'TEAM_LEADER', label: 'Team Leader' },
    { value: 'DEPT_MANAGER', label: 'Dept Manager' },
];

const CreateEmployeeModal: React.FC<CreateEmployeeModalProps> = ({
    visible,
    onCancel,
    onSuccess,
    defaultUnitId = null,
    defaultUnitName = null,
}) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [availableRoles, setAvailableRoles] = useState<{ id: number; role_code: string; role_name: string }[]>([]);
    const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
    const [selectedUnitName, setSelectedUnitName] = useState<string | null>(null);
    const [selectorVisible, setSelectorVisible] = useState(false);

    // Set default unit when modal opens
    useEffect(() => {
        if (visible) {
            setSelectedUnitId(defaultUnitId ?? null);
            setSelectedUnitName(defaultUnitName ?? null);
            form.resetFields();
            form.setFieldsValue({
                employmentStatus: 'ACTIVE',
                orgRole: 'FRONTLINE',
            });
        }
    }, [visible, defaultUnitId, defaultUnitName, form]);

    // Fetch available roles
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

    const handleSave = async () => {
        try {
            const values = await form.validateFields();
            setLoading(true);

            const payload = {
                employeeCode: values.employeeCode,
                employeeName: values.employeeName,
                primaryRoleId: values.position || null,
                employmentStatus: values.employmentStatus || 'ACTIVE',
                hireDate: values.hireDate ? values.hireDate.format('YYYY-MM-DD') : null,
                orgRole: values.orgRole || 'FRONTLINE',
                unitId: selectedUnitId,
            };

            await axios.post('/api/employees', payload);
            message.success('Employee created successfully');
            onSuccess();
        } catch (error: any) {
            console.error('Failed to create employee', error);
            if (error?.response?.status === 409) {
                message.error('Employee code already exists');
            } else {
                message.error('Failed to create employee');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleUnitSelect = (unitId: number, unitName: string) => {
        setSelectedUnitId(unitId);
        setSelectedUnitName(unitName);
        setSelectorVisible(false);
    };

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
                    <h3 className="text-lg font-semibold text-gray-800 m-0 tracking-tight">Add Employee</h3>
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
                                <Form.Item label="Employee ID" name="employeeCode" rules={[{ required: true, message: 'Required' }]}>
                                    <Input prefix={<IdcardOutlined className="text-gray-400" />} placeholder="e.g. EMP001" className="rounded-lg py-1.5" />
                                </Form.Item>
                                <Form.Item label="Name" name="employeeName" rules={[{ required: true, message: 'Required' }]}>
                                    <Input prefix={<UserOutlined className="text-gray-400" />} placeholder="Full name" className="rounded-lg py-1.5" />
                                </Form.Item>
                            </div>
                        </div>

                        {/* Section: Professional */}
                        <div>
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 mt-2">Professional</h4>
                            <div className="grid grid-cols-2 gap-5">
                                <Form.Item label="Position" name="position">
                                    <Select className="rounded-lg" size="large" placeholder="Select Role" allowClear>
                                        {availableRoles.map(role => (
                                            <Option key={role.id} value={role.id}>{role.role_name}</Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                                <Form.Item label="Org Role" name="orgRole">
                                    <Select className="rounded-lg" size="large" placeholder="Select Org Role">
                                        {ORG_ROLE_OPTIONS.map(opt => (
                                            <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            </div>

                            <Form.Item label="Organization">
                                <div
                                    className="flex items-center gap-2 p-3 bg-gray-50/50 rounded-xl border border-gray-200/50 min-h-[50px] cursor-pointer hover:border-blue-300 transition-colors"
                                    onClick={() => setSelectorVisible(true)}
                                >
                                    {selectedUnitName ? (
                                        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                            <ClusterOutlined /> {selectedUnitName}
                                        </span>
                                    ) : (
                                        <Button
                                            type="dashed"
                                            size="small"
                                            icon={<PlusOutlined className="text-xs" />}
                                            className="bg-transparent"
                                        >
                                            Select Unit
                                        </Button>
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
                <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-200/50 flex items-center gap-3">
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
                        Create Employee
                    </Button>
                </div>
            </div>

            <OrgUnitSelectorModal
                visible={selectorVisible}
                onCancel={() => setSelectorVisible(false)}
                onSelect={handleUnitSelect}
                title="Select Organization Unit"
            />
        </Modal>
    );
};

export default CreateEmployeeModal;

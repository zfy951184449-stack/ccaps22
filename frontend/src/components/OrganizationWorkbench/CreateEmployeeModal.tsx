import React, { useEffect, useState } from 'react';
import { Form } from 'antd';
import axios from 'axios';
import {
    WxbButton,
    WxbDatePicker,
    WxbInput,
    WxbModal,
    WxbSelect,
    WxbTag,
    wxbToast,
} from '../wxb-ui';
import OrgUnitSelectorModal from './OrgUnitSelectorModal';
import { GroupIcon, IdCardIcon, PlusIcon, UserIcon } from './OrgWorkbenchIcons';

interface CreateEmployeeModalProps {
    visible: boolean;
    onCancel: () => void;
    onSuccess: () => void;
    defaultUnitId?: number | null;
    defaultUnitName?: string | null;
}

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
            wxbToast.success('Employee created successfully');
            onSuccess();
        } catch (error: any) {
            console.error('Failed to create employee', error);
            if (error?.response?.status === 409) {
                wxbToast.error('Employee code already exists');
            } else {
                wxbToast.error('Failed to create employee');
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

    const renderStatusOption = (status: string, tone: string) => (
        <span className="orgwb-status-option">
            <span className={`orgwb-status-dot orgwb-status-dot--${tone}`} />
            <span>{status}</span>
        </span>
    );

    const roleOptions = availableRoles.map(role => ({ value: role.id, label: role.role_name }));
    const orgRoleOptions = ORG_ROLE_OPTIONS;
    const statusOptions = [
        { value: 'ACTIVE', label: renderStatusOption('Active', 'success') },
        { value: 'VACATION', label: renderStatusOption('Vacation', 'warning') },
        { value: 'ON LEAVE', label: renderStatusOption('On Leave', 'amber') },
        { value: 'RESIGNED', label: renderStatusOption('Resigned', 'danger') },
    ];

    return (
        <WxbModal
            title="Add Employee"
            open={visible}
            footer={null}
            onCancel={onCancel}
            centered
            width={600}
            className="orgwb-employee-modal"
            forceRender
        >
            <Form
                form={form}
                layout="vertical"
                requiredMark={false}
                className="orgwb-form orgwb-employee-form"
            >
                <section className="orgwb-form-section">
                    <h4 className="orgwb-form-section-title">Basic Info</h4>
                    <div className="orgwb-form-grid">
                        <Form.Item label="Employee ID" name="employeeCode" rules={[{ required: true, message: 'Required' }]}>
                            <WxbInput prefix={<IdCardIcon />} placeholder="e.g. EMP001" />
                        </Form.Item>
                        <Form.Item label="Name" name="employeeName" rules={[{ required: true, message: 'Required' }]}>
                            <WxbInput prefix={<UserIcon />} placeholder="Full name" />
                        </Form.Item>
                    </div>
                </section>

                <section className="orgwb-form-section">
                    <h4 className="orgwb-form-section-title">Professional</h4>
                    <div className="orgwb-form-grid">
                        <Form.Item label="Position" name="position">
                            <WxbSelect placeholder="Select Role" allowClear options={roleOptions} />
                        </Form.Item>
                        <Form.Item label="Org Role" name="orgRole">
                            <WxbSelect placeholder="Select Org Role" options={orgRoleOptions} />
                        </Form.Item>
                    </div>

                    <Form.Item label="Organization">
                        <WxbButton
                            type="button"
                            variant="secondary"
                            className="orgwb-unit-picker"
                            onClick={() => setSelectorVisible(true)}
                        >
                            {selectedUnitName ? (
                                <WxbTag color="blue" icon={<GroupIcon />}>{selectedUnitName}</WxbTag>
                            ) : (
                                <>
                                    <PlusIcon />
                                    Select Unit
                                </>
                            )}
                        </WxbButton>
                    </Form.Item>
                </section>

                <section className="orgwb-form-section">
                    <h4 className="orgwb-form-section-title">Personal</h4>
                    <div className="orgwb-form-grid">
                        <Form.Item label="Status" name="employmentStatus">
                            <WxbSelect options={statusOptions} />
                        </Form.Item>
                        <Form.Item label="Hire Date" name="hireDate">
                            <WxbDatePicker />
                        </Form.Item>
                    </div>
                </section>

                <div className="orgwb-form-actions">
                    <WxbButton type="button" onClick={onCancel} variant="ghost">
                        Cancel
                    </WxbButton>
                    <WxbButton
                        type="button"
                        onClick={handleSave}
                        disabled={loading}
                        variant="primary"
                    >
                        {loading ? 'Creating...' : 'Create Employee'}
                    </WxbButton>
                </div>
            </Form>

            <OrgUnitSelectorModal
                visible={selectorVisible}
                onCancel={() => setSelectorVisible(false)}
                onSelect={handleUnitSelect}
                title="Select Organization Unit"
            />
        </WxbModal>
    );
};

export default CreateEmployeeModal;

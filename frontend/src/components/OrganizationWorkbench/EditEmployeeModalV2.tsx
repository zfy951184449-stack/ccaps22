import React, { useCallback, useEffect, useState } from 'react';
import { Form } from 'antd';
import dayjs from 'dayjs';
import { Employee } from '../../types/organizationWorkbench';
import axios from 'axios';
import {
    WxbButton,
    WxbCollapse,
    WxbDatePicker,
    WxbInput,
    WxbInputNumber,
    WxbModal,
    WxbSelect,
    WxbTag,
    wxbToast,
} from '../wxb-ui';
import OrgUnitSelectorModal from './OrgUnitSelectorModal';
import { GroupIcon, IdCardIcon, PlusIcon, SettingsIcon, UserIcon } from './OrgWorkbenchIcons';

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

const ORG_ROLE_OPTIONS = [
    { value: 'FRONTLINE', label: 'Frontline' },
    { value: 'SHIFT_LEADER', label: 'Shift Leader' },
    { value: 'GROUP_LEADER', label: 'Group Leader' },
    { value: 'TEAM_LEADER', label: 'Team Leader' },
    { value: 'DEPT_MANAGER', label: 'Dept Manager' },
];

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
    const fetchAssignments = useCallback(async () => {
        if (!employee) return;
        try {
            const res = await axios.get(`/api/employees/${employee.id}/assignments`);
            setAssignments(res.data);
        } catch (err) {
            console.error('Failed to fetch assignments', err);
        }
    }, [employee]);

    useEffect(() => {
        if (visible && employee) {
            fetchAssignments();
        } else {
            setAssignments([]);
        }
    }, [visible, employee, fetchAssignments]);

    // Initialize form
    useEffect(() => {
        if (visible && employee) {
            const initialValues = {
                employeeName: employee.employee_name,
                employeeCode: employee.employee_code,
                position: employee.primary_role_id, // Use ID
                employmentStatus: employee.employment_status,
                hireDate: employee.hire_date ? dayjs(employee.hire_date) : null,
                orgRole: employee.org_role || 'FRONTLINE',
                shopfloorBaselinePct: employee.shopfloor_baseline_pct != null ? Math.round(employee.shopfloor_baseline_pct * 100) : null,
                shopfloorUpperPct: employee.shopfloor_upper_pct != null ? Math.round(employee.shopfloor_upper_pct * 100) : null,
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

            const payload: Record<string, any> = {
                employeeCode: values.employeeCode,
                employeeName: values.employeeName,
                primaryRoleId: values.position, // Send ID
                employmentStatus: values.employmentStatus,
                hireDate: values.hireDate ? values.hireDate.format('YYYY-MM-DD') : null,
                unitId: currentUnitId, // Use local state which reflects recent changes
                orgRole: values.orgRole || undefined,
            };

            // Workload profile — send as 0-1 decimal if changed
            if (values.shopfloorBaselinePct != null) {
                payload.shopfloorBaselinePct = values.shopfloorBaselinePct / 100;
            }
            if (values.shopfloorUpperPct != null) {
                payload.shopfloorUpperPct = values.shopfloorUpperPct / 100;
            }

            await axios.put(`/api/employees/${employee.id}`, payload);

            wxbToast.success('Employee updated successfully');
            onSuccess();
        } catch (error: any) {
            console.error('Failed to update employee', error);
            if (error?.response?.status === 409) {
                wxbToast.error('Employee code already exists');
            } else {
                wxbToast.error('Failed to update employee');
            }
        } finally {
            setLoading(false);
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

            wxbToast.success('Organization unit updated');

            // Await refresh to ensure UI displays new value
            await fetchAssignments();
        } catch (err) {
            console.error(err);
            wxbToast.error('Failed to update organization unit');
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
            wxbToast.success('Assignment removed');
            fetchAssignments();
        } catch (err) {
            wxbToast.error('Failed to remove assignment');
        }
    };

    // handleSetPrimary removed - single-unit architecture means there's always one primary unit

    const renderStatusOption = (status: string, tone: string) => (
        <div className="orgwb-status-option">
            <span className={`orgwb-status-dot orgwb-status-dot--${tone}`}></span>
            <span>{status}</span>
        </div>
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
            title="Edit Employee"
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
                        <Form.Item label="Name" name="employeeName" rules={[{ required: true }]}>
                            <WxbInput prefix={<UserIcon />} />
                        </Form.Item>
                        <Form.Item label="Employee ID" name="employeeCode" rules={[{ required: true, message: 'Required' }]}>
                            <WxbInput prefix={<IdCardIcon />} placeholder="e.g. EMP001" />
                        </Form.Item>
                    </div>
                </section>

                <section className="orgwb-form-section">
                    <h4 className="orgwb-form-section-title">Professional</h4>
                    <Form.Item label="Position" name="position">
                        <WxbSelect placeholder="Select Role" options={roleOptions} />
                    </Form.Item>

                    <Form.Item label="Org Role" name="orgRole">
                        <WxbSelect placeholder="Select Org Role" options={orgRoleOptions} />
                    </Form.Item>

                    <Form.Item label="Organization">
                        <div className="orgwb-assignment-box">
                            {assignments.map(assign => (
                                <WxbTag
                                    key={assign.id}
                                    color="blue"
                                    icon={<GroupIcon />}
                                    closable
                                    onClose={(e) => {
                                        e.preventDefault();
                                        handleRemoveAssignment(assign.id);
                                    }}
                                    onClick={() => handleEditClick(assign.id)}
                                    className="orgwb-assignment-tag"
                                >
                                    {assign.teamName}
                                </WxbTag>
                            ))}

                            {assignments.length === 0 && (
                                <WxbButton
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={handleAddClick}
                                >
                                    <PlusIcon />
                                    Select Unit
                                </WxbButton>
                            )}
                        </div>
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

                <WxbCollapse
                    items={[{
                        key: 'workload',
                        label: (
                            <span className="orgwb-collapse-label">
                                <SettingsIcon /> Workload Profile
                            </span>
                        ),
                        children: (
                            <div className="orgwb-form-grid">
                                <Form.Item label="Baseline %" name="shopfloorBaselinePct" tooltip="Target shopfloor time percentage (0-100)">
                                    <WxbInputNumber
                                        min={0}
                                        max={100}
                                        addonAfter="%"
                                        placeholder="e.g. 80"
                                    />
                                </Form.Item>
                                <Form.Item label="Upper Limit %" name="shopfloorUpperPct" tooltip="Maximum shopfloor time percentage (0-100)">
                                    <WxbInputNumber
                                        min={0}
                                        max={100}
                                        addonAfter="%"
                                        placeholder="e.g. 100"
                                    />
                                </Form.Item>
                            </div>
                        ),
                    }]}
                />

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
                        {loading ? 'Saving...' : 'Save Changes'}
                    </WxbButton>
                </div>
            </Form>

            <OrgUnitSelectorModal
                visible={selectorVisible}
                onCancel={() => setSelectorVisible(false)}
                onSelect={(unitId) => handleUnitSelection(unitId)}
            />
        </WxbModal>
    );
};

export default EditEmployeeModalV2;

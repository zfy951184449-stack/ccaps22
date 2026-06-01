import React, { useEffect } from 'react';
import { Form } from 'antd';
import dayjs from 'dayjs';
import {
    WxbModal,
    WxbRangePicker,
    WxbSelect,
    WxbTextarea,
    wxbToast,
} from './wxb-ui';
import { Employee } from '../types/organizationWorkbench';

export interface UnavailabilityRecord {
    id: number;
    employeeId: number;
    employeeName: string;
    startDate: string;
    endDate: string;
    reasonCode: string;
    reasonLabel: string;
    notes: string;
    createdAt: string;
}

interface UnavailabilityModalProps {
    visible: boolean;
    onCancel: () => void;
    onSuccess: () => void;
    editingRecord?: UnavailabilityRecord | null;
    employees: Employee[];
}

const reasonOptions = [
    { value: 'AL', label: 'Annual Leave (年假)' },
    { value: 'SL', label: 'Sick Leave (病假)' },
    { value: 'PL', label: 'Personal Leave (事假)' },
    { value: 'OT', label: 'Other (其他)' },
];

const UnavailabilityModal: React.FC<UnavailabilityModalProps> = ({
    visible,
    onCancel,
    onSuccess,
    editingRecord,
    employees
}) => {
    const [form] = Form.useForm();

    useEffect(() => {
        if (visible) {
            if (editingRecord) {
                form.setFieldsValue({
                    employeeId: editingRecord.employeeId,
                    dateRange: [dayjs(editingRecord.startDate), dayjs(editingRecord.endDate)],
                    reasonCode: editingRecord.reasonCode,
                    notes: editingRecord.notes
                });
            } else {
                form.resetFields();
            }
        }
    }, [visible, editingRecord, form]);

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            const [start, end] = values.dateRange;

            const payload = {
                employeeId: values.employeeId,
                startDatetime: start.startOf('day').toISOString(),
                endDatetime: end.endOf('day').toISOString(),
                reasonCode: values.reasonCode,
                notes: values.notes
            };

            const url = editingRecord
                ? `/api/unavailability/${editingRecord.id}`
                : '/api/unavailability';

            const method = editingRecord ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Operation failed');
            }

            wxbToast.success(editingRecord ? 'Record updated' : 'Record created');
            onSuccess();
        } catch (error) {
            console.error(error);
            wxbToast.error(error instanceof Error ? error.message : 'Operation failed');
        }
    };

    return (
        <WxbModal
            open={visible}
            title={editingRecord ? "Edit Unavailability" : "Add Unavailability"}
            onCancel={onCancel}
            onOk={handleSubmit}
            destroyOnClose
            forceRender
            okText="Save"
            cancelText="Cancel"
            maskClosable={false}
            className="orgwb-unavailability-modal"
            width={500}
        >
            <Form form={form} layout="vertical" preserve={false} className="orgwb-form orgwb-unavailability-form">
                <Form.Item
                    name="employeeId"
                    label="Employee"
                    rules={[{ required: true, message: 'Please select an employee' }]}
                >
                    <WxbSelect
                        placeholder="Select employee"
                        showSearch
                        optionFilterProp="label"
                        disabled={Boolean(editingRecord)}
                        options={employees.map(emp => ({
                            value: emp.id,
                            label: `${emp.employee_name} (${emp.employee_code})`,
                        }))}
                    />
                </Form.Item>

                <Form.Item
                    name="dateRange"
                    label="Period"
                    rules={[{ required: true, message: 'Please select dates' }]}
                >
                    <WxbRangePicker format="YYYY-MM-DD" />
                </Form.Item>

                <Form.Item
                    name="reasonCode"
                    label="Reason"
                    rules={[{ required: true, message: 'Please select a reason' }]}
                >
                    <WxbSelect placeholder="Select reason" options={reasonOptions} />
                </Form.Item>

                <Form.Item
                    name="notes"
                    label="Notes"
                >
                    <WxbTextarea rows={3} placeholder="Optional notes" />
                </Form.Item>
            </Form>
        </WxbModal>
    );
};

export default UnavailabilityModal;

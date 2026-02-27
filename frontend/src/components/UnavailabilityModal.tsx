import React, { useEffect } from 'react';
import { Modal, Form, DatePicker, Select, Input, message } from 'antd';
import dayjs from 'dayjs';
import { Employee } from '../types/organizationWorkbench'; // Ensure this type exists or adjust import

interface UnavailabilityModalProps {
    visible: boolean;
    onCancel: () => void;
    onSuccess: () => void;
    editingRecord?: any; // Define a proper type if possible
    employees: Employee[];
}

const { Option } = Select;
const { TextArea } = Input;
const { RangePicker } = DatePicker;

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
                startDatetime: start.startOf('day').toISOString(), // Depending on requirement, might need time
                endDatetime: end.endOf('day').toISOString(),
                reasonCode: values.reasonCode,
                notes: values.notes
            };

            const url = editingRecord
                ? `http://localhost:3001/api/unavailability/${editingRecord.id}`
                : 'http://localhost:3001/api/unavailability';

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

            message.success(editingRecord ? 'Record updated' : 'Record created');
            onSuccess();
        } catch (error: any) {
            console.error(error);
            message.error(error.message);
        }
    };

    return (
        <Modal
            open={visible}
            title={editingRecord ? "Edit Unavailability" : "Add Unavailability"}
            onCancel={onCancel}
            onOk={handleSubmit}
            destroyOnClose
            okText="Save"
            cancelText="Cancel"
            maskClosable={false}
            className="rounded-2xl overflow-hidden" // Try to apply rounded corners if css allows
            width={500}
        >
            <Form form={form} layout="vertical" preserve={false}>
                <Form.Item
                    name="employeeId"
                    label="Employee"
                    rules={[{ required: true, message: 'Please select an employee' }]}
                >
                    <Select
                        placeholder="Select employee"
                        showSearch
                        optionFilterProp="children"
                        disabled={!!editingRecord} // Usually can't change employee on edit
                    >
                        {employees.map(emp => (
                            <Option key={emp.id} value={emp.id}>{emp.employee_name} ({emp.employee_code})</Option>
                        ))}
                    </Select>
                </Form.Item>

                <Form.Item
                    name="dateRange"
                    label="Period"
                    rules={[{ required: true, message: 'Please select dates' }]}
                >
                    <RangePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
                </Form.Item>

                <Form.Item
                    name="reasonCode"
                    label="Reason"
                    rules={[{ required: true, message: 'Please select a reason' }]}
                >
                    <Select placeholder="Select reason">
                        <Option value="AL">Annual Leave (年假)</Option>
                        <Option value="SL">Sick Leave (病假)</Option>
                        <Option value="PL">Personal Leave (事假)</Option>
                        <Option value="OT">Other (其他)</Option>
                    </Select>
                </Form.Item>

                <Form.Item
                    name="notes"
                    label="Notes"
                >
                    <TextArea rows={3} placeholder="Optional notes" />
                </Form.Item>
            </Form>
        </Modal>
    );
};

export default UnavailabilityModal;

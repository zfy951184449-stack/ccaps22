import React, { useState, useEffect, useMemo } from 'react';
import { Drawer, Select, Button, message, Tag, Alert } from 'antd';
import {
    EditOutlined,
    SwapOutlined,
    CheckCircleOutlined,
    WarningOutlined,
    CloseCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { validateShiftChange, ValidationResult } from '../../../utils/scheduleValidation';
import '../SolverV4.css';

interface ShiftAssignment {
    employee_id: number;
    employee_name?: string;
    employee_code?: string;
    date: string;
    shift_id: number;
    shift_name: string;
    shift_code: string;
    start_time?: string;
    end_time?: string;
    nominal_hours?: number;
}

interface ShiftOption {
    shift_id: number;
    shift_name: string;
    shift_code: string;
    nominal_hours: number;
}

interface ManualEditDrawerProps {
    visible: boolean;
    shiftAssignment: ShiftAssignment | null;
    allShiftAssignments: ShiftAssignment[];
    shiftOptions: ShiftOption[];
    onClose: () => void;
    onApplyEdit: (employeeId: number, date: string, newShiftId: number) => void;
}

const ManualEditDrawer: React.FC<ManualEditDrawerProps> = ({
    visible,
    shiftAssignment,
    allShiftAssignments,
    shiftOptions,
    onClose,
    onApplyEdit,
}) => {
    const [selectedShiftId, setSelectedShiftId] = useState<number | null>(null);
    const [validation, setValidation] = useState<ValidationResult | null>(null);

    useEffect(() => {
        if (shiftAssignment) {
            setSelectedShiftId(shiftAssignment.shift_id);
            setValidation(null);
        }
    }, [shiftAssignment]);

    useEffect(() => {
        if (!shiftAssignment || selectedShiftId === null) return;
        if (selectedShiftId === shiftAssignment.shift_id) {
            setValidation(null);
            return;
        }

        const empShifts = allShiftAssignments.filter(
            s => s.employee_id === shiftAssignment.employee_id
        );

        const result = validateShiftChange(
            {
                employee_id: shiftAssignment.employee_id,
                date: shiftAssignment.date,
                shift_id: selectedShiftId,
            },
            empShifts,
            { restShiftIds: shiftOptions.filter(s => s.nominal_hours <= 0.01).map(s => s.shift_id) }
        );

        setValidation(result);
    }, [selectedShiftId, shiftAssignment, allShiftAssignments, shiftOptions]);

    const selectedShift = useMemo(() => {
        return shiftOptions.find(s => s.shift_id === selectedShiftId);
    }, [selectedShiftId, shiftOptions]);

    const isChanged = shiftAssignment && selectedShiftId !== shiftAssignment.shift_id;

    const handleApply = () => {
        if (!shiftAssignment || selectedShiftId === null || !isChanged) return;
        if (validation && !validation.valid) {
            message.error('存在校验错误，无法应用');
            return;
        }
        onApplyEdit(shiftAssignment.employee_id, shiftAssignment.date, selectedShiftId);
        message.success(`已修改 ${shiftAssignment.employee_name} 在 ${shiftAssignment.date} 的班次`);
        onClose();
    };

    if (!shiftAssignment) return null;

    return (
        <Drawer
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <EditOutlined />
                    <span>手动调整班次</span>
                </div>
            }
            open={visible}
            onClose={onClose}
            width={400}
            footer={
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <Button onClick={onClose}>取消</Button>
                    <Button
                        type="primary"
                        disabled={!isChanged || (validation ? !validation.valid : false)}
                        onClick={handleApply}
                    >
                        应用修改
                    </Button>
                </div>
            }
        >
            {/* Employee Info */}
            <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                    {shiftAssignment.employee_name}
                </div>
                <div style={{ color: 'var(--v4-text-secondary)', fontSize: 13 }}>
                    {shiftAssignment.employee_code} · {dayjs(shiftAssignment.date).format('YYYY-MM-DD (ddd)')}
                </div>
            </div>

            {/* Current Shift */}
            <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12, color: 'var(--v4-text-secondary)', marginBottom: 8 }}>当前班次</div>
                <Tag color="blue" style={{ fontSize: 14, padding: '4px 12px' }}>
                    {shiftAssignment.shift_name} ({shiftAssignment.shift_code})
                    {shiftAssignment.start_time && ` ${shiftAssignment.start_time}-${shiftAssignment.end_time}`}
                </Tag>
            </div>

            {/* Arrow */}
            {isChanged && (
                <div style={{ textAlign: 'center', margin: '8px 0' }}>
                    <SwapOutlined style={{ fontSize: 24, color: 'var(--v4-accent-blue)' }} />
                </div>
            )}

            {/* New Shift Selector */}
            <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12, color: 'var(--v4-text-secondary)', marginBottom: 8 }}>
                    {isChanged ? '修改为' : '选择新班次'}
                </div>
                <Select
                    value={selectedShiftId}
                    onChange={setSelectedShiftId}
                    style={{ width: '100%' }}
                    options={shiftOptions.map(s => ({
                        value: s.shift_id,
                        label: `${s.shift_name} (${s.shift_code}) - ${s.nominal_hours}h`,
                    }))}
                />
                {selectedShift && isChanged && (
                    <div style={{ marginTop: 8, fontSize: 13, color: 'var(--v4-text-secondary)' }}>
                        工时变化: {shiftAssignment.nominal_hours || 0}h → {selectedShift.nominal_hours}h
                        ({selectedShift.nominal_hours - (shiftAssignment.nominal_hours || 0) >= 0 ? '+' : ''}
                        {(selectedShift.nominal_hours - (shiftAssignment.nominal_hours || 0)).toFixed(1)}h)
                    </div>
                )}
            </div>

            {/* Validation Results */}
            {validation && (
                <div style={{ marginBottom: 16 }}>
                    {validation.errors.map((err, i) => (
                        <Alert
                            key={`err-${i}`}
                            type="error"
                            message={err.message}
                            icon={<CloseCircleOutlined />}
                            showIcon
                            style={{ marginBottom: 8 }}
                        />
                    ))}
                    {validation.warnings.map((warn, i) => (
                        <Alert
                            key={`warn-${i}`}
                            type="warning"
                            message={warn.message}
                            icon={<WarningOutlined />}
                            showIcon
                            style={{ marginBottom: 8 }}
                        />
                    ))}
                    {validation.valid && validation.errors.length === 0 && (
                        <Alert
                            type="success"
                            message="校验通过"
                            icon={<CheckCircleOutlined />}
                            showIcon
                        />
                    )}
                </div>
            )}
        </Drawer>
    );
};

export default ManualEditDrawer;

/**
 * 操作基本信息表单组件
 * 显示在主面板，包含操作选择、时间位置、时间窗口
 */

import React from 'react';
import { Form, Input, InputNumber, Select, Button, Typography, Row, Col } from 'antd';
import { PlusOutlined, InfoCircleOutlined } from '@ant-design/icons';
import type { FormInstance } from 'antd';
import { Operation } from '../../types';
import { fuzzyMatch } from '../../utils';

const { Option } = Select;

// 设计 tokens
const TOKENS = {
    infoBoxBg: '#fafafa',
    infoBoxBorder: '#e5e5e5',
    infoBoxTitle: '#595959',
    cardRadius: 8,
    dividerColor: '#e5e5e5',
    primaryColor: '#1890ff',
};

interface OperationBasicFormProps {
    form: FormInstance;
    availableOperations: Operation[];
    isEditMode: boolean; // true if editing existing, false if adding new
    onOpenOperationModal: () => void;
}

// 信息提示框
const InfoBox: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div style={{
        background: TOKENS.infoBoxBg,
        border: `1px solid ${TOKENS.infoBoxBorder}`,
        borderRadius: TOKENS.cardRadius,
        padding: 12,
        marginTop: 16,
    }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500, color: TOKENS.infoBoxTitle, marginBottom: 4, fontSize: 12 }}>
            <InfoCircleOutlined />
            {title}
        </div>
        <div style={{ fontSize: 12, color: '#666', lineHeight: 1.5 }}>
            {children}
        </div>
    </div>
);

// 分割线
const SectionDivider: React.FC<{ title: string }> = ({ title }) => (
    <div style={{
        display: 'flex',
        alignItems: 'center',
        margin: '20px 0 16px',
        color: '#999',
        fontSize: 11,
        fontWeight: 500,
    }}>
        <div style={{ flex: 1, height: 1, background: TOKENS.dividerColor }} />
        <span style={{ padding: '0 12px' }}>{title}</span>
        <div style={{ flex: 1, height: 1, background: TOKENS.dividerColor }} />
    </div>
);

export const OperationBasicForm: React.FC<OperationBasicFormProps> = ({
    form,
    availableOperations,
    isEditMode,
    onOpenOperationModal,
}) => {
    // Build search index for operations
    const operationSearchIndex = React.useMemo(() => {
        const map = new Map<number, string>();
        availableOperations.forEach(op => {
            map.set(op.id, `${op.operation_code} ${op.operation_name}`.toLowerCase());
        });
        return map;
    }, [availableOperations]);

    return (
        <>
            {/* 操作选择 */}
            <Form.Item
                name="operation_id"
                label="操作"
                rules={[{ required: true, message: '请选择操作' }]}
            >
                <Select
                    placeholder="请选择操作"
                    disabled={isEditMode}
                    showSearch
                    filterOption={(input, option) => {
                        if (!input) return true;
                        const rawValue = option?.value;
                        const optionValue = typeof rawValue === 'number' ? rawValue : Number(rawValue);
                        if (Number.isNaN(optionValue)) return false;
                        const searchTarget = operationSearchIndex.get(optionValue);
                        if (!searchTarget) return false;
                        return fuzzyMatch(input, searchTarget);
                    }}
                    dropdownRender={(menu) => (
                        <>
                            {menu}
                            {!isEditMode && (
                                <div style={{ padding: 8, borderTop: '1px solid #e5e5e5' }}>
                                    <Button
                                        type="link"
                                        icon={<PlusOutlined />}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onOpenOperationModal();
                                        }}
                                        block
                                    >
                                        新建操作
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                    style={{ borderRadius: 8 }}
                >
                    {availableOperations.map(op => (
                        <Option key={op.id} value={op.id}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>{op.operation_code} - {op.operation_name}</span>
                                <span style={{ color: '#8c8c8c' }}>({op.standard_time}h)</span>
                            </div>
                        </Option>
                    ))}
                </Select>
            </Form.Item>

            {/* 时间位置 */}
            <Row gutter={12}>
                <Col span={12}>
                    <Form.Item
                        name="operation_day"
                        label="操作位置"
                        tooltip="相对于阶段原点的天数"
                        rules={[
                            { required: true, message: '请输入' },
                            { type: 'number', min: -30, max: 30, message: '-30到30' }
                        ]}
                    >
                        <InputNumber
                            min={-30}
                            max={30}
                            style={{ width: '100%' }}
                            placeholder="Day 0"
                            addonBefore="阶段Day"
                        />
                    </Form.Item>
                </Col>
                <Col span={12}>
                    <Form.Item
                        name="recommended_time"
                        label="推荐时间"
                        tooltip="推荐的开始时间"
                        initialValue={9}
                        rules={[{ required: true, message: '请输入' }]}
                    >
                        <InputNumber
                            min={0}
                            max={23.9}
                            step={0.5}
                            style={{ width: '100%' }}
                            addonAfter="时"
                        />
                    </Form.Item>
                </Col>
            </Row>

            <SectionDivider title="时间窗口" />

            <Row gutter={12}>
                <Col span={12}>
                    <Form.Item
                        name="window_start_time"
                        label="开始时间"
                        initialValue={9}
                    >
                        <InputNumber
                            min={0}
                            max={23.9}
                            step={0.5}
                            style={{ width: '100%' }}
                            addonAfter="时"
                        />
                    </Form.Item>
                </Col>
                <Col span={12}>
                    <Form.Item
                        name="window_start_day_offset"
                        label="开始偏移"
                        initialValue={0}
                    >
                        <InputNumber
                            min={-7}
                            max={7}
                            style={{ width: '100%' }}
                            addonAfter="天"
                        />
                    </Form.Item>
                </Col>
            </Row>

            <Row gutter={12}>
                <Col span={12}>
                    <Form.Item
                        name="window_end_time"
                        label="结束时间"
                        initialValue={17}
                    >
                        <InputNumber
                            min={0}
                            max={23.9}
                            step={0.5}
                            style={{ width: '100%' }}
                            addonAfter="时"
                        />
                    </Form.Item>
                </Col>
                <Col span={12}>
                    <Form.Item
                        name="window_end_day_offset"
                        label="结束偏移"
                        initialValue={0}
                    >
                        <InputNumber
                            min={-7}
                            max={7}
                            style={{ width: '100%' }}
                            addonAfter="天"
                        />
                    </Form.Item>
                </Col>
            </Row>

            <InfoBox title="时间窗口">
                操作的可执行时间范围。超出窗口将在校验时产生警告。
            </InfoBox>
        </>
    );
};

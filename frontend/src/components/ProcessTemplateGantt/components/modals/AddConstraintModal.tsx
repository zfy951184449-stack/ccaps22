/**
 * 约束添加表单弹窗
 * 选择操作后显示约束类型和延迟设置
 * 
 * Apple HIG 风格设计
 */

import React, { useEffect } from 'react';
import { Modal, Form, Select, InputNumber, Tag, Typography } from 'antd';
import type { FormInstance } from 'antd';
import { CONSTRAINT_TYPE_OPTIONS, LAG_TYPE_OPTIONS } from './constraintConstants';

const { Option } = Select;
const { Text } = Typography;

interface AddConstraintModalProps {
    visible: boolean;
    type: 'predecessor' | 'successor';
    selectedOperationName: string | null;
    form: FormInstance;
    onCancel: () => void;
    onSubmit: () => void;
    loading?: boolean;
}

export const AddConstraintModal: React.FC<AddConstraintModalProps> = ({
    visible,
    type,
    selectedOperationName,
    form,
    onCancel,
    onSubmit,
    loading = false,
}) => {
    const title = type === 'predecessor' ? '添加前置约束' : '添加后续约束';
    const relationLabel = type === 'predecessor' ? '前置操作' : '后续操作';

    // Reset form when modal opens
    useEffect(() => {
        if (visible) {
            form.setFieldsValue({
                constraint_type: 1, // FS default
                lag_type: 'ASAP',
                lag_min: 0,
                lag_max: null,
            });
        }
    }, [visible, form]);

    const lagType = Form.useWatch('lag_type', form);
    const showLagMin = ['FIXED', 'WINDOW', 'COOLING'].includes(lagType);
    const showLagMax = lagType === 'WINDOW';

    return (
        <Modal
            title={title}
            open={visible}
            onCancel={onCancel}
            onOk={onSubmit}
            okText="添加"
            cancelText="取消"
            confirmLoading={loading}
            centered
            width={420}
            maskClosable={false}
        >
            {/* Selected Operation Display */}
            <div style={{
                background: '#f5f5f5',
                padding: 12,
                borderRadius: 8,
                marginBottom: 20,
            }}>
                <Text type="secondary" style={{ fontSize: 12 }}>{relationLabel}</Text>
                <div style={{ fontWeight: 500, marginTop: 4 }}>
                    {selectedOperationName || '未选择'}
                </div>
            </div>

            <Form form={form} layout="vertical">
                <Form.Item
                    name="constraint_type"
                    label="约束类型"
                    tooltip="定义两个操作之间的时序关系"
                >
                    <Select>
                        {CONSTRAINT_TYPE_OPTIONS.map(opt => (
                            <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                        ))}
                    </Select>
                </Form.Item>

                <Form.Item
                    name="lag_type"
                    label="延迟类型"
                    tooltip="定义操作之间的时间间隔规则"
                >
                    <Select>
                        {LAG_TYPE_OPTIONS.map(opt => (
                            <Option key={opt.value} value={opt.value}>
                                <Tag color={opt.color} style={{ marginRight: 8 }}>{opt.label}</Tag>
                            </Option>
                        ))}
                    </Select>
                </Form.Item>

                {showLagMin && (
                    <Form.Item
                        name="lag_min"
                        label={lagType === 'WINDOW' ? '最小延迟 (小时)' : '延迟时间 (小时)'}
                    >
                        <InputNumber
                            min={0}
                            style={{ width: '100%' }}
                            placeholder="0"
                        />
                    </Form.Item>
                )}

                {showLagMax && (
                    <Form.Item
                        name="lag_max"
                        label="最大延迟 (小时)"
                    >
                        <InputNumber
                            min={0}
                            style={{ width: '100%' }}
                            placeholder="可选，留空表示无上限"
                        />
                    </Form.Item>
                )}
            </Form>
        </Modal>
    );
};

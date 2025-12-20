/**
 * 阶段编辑表单
 * 从 GanttModals.tsx 提取
 */

import React from 'react';
import { Form, Input, InputNumber, Typography } from 'antd';

const { TextArea } = Input;
const { Text } = Typography;

interface StageEditFormProps {
    // No additional props needed, uses parent form context
}

export const StageEditForm: React.FC<StageEditFormProps> = () => {
    return (
        <>
            <Form.Item
                name="stage_name"
                label="阶段名称"
                rules={[{ required: true, message: '请输入阶段名称' }]}
            >
                <Input placeholder="请输入阶段名称" />
            </Form.Item>

            <Form.Item
                name="stage_code"
                label="阶段代码"
                rules={[{ required: true, message: '请输入阶段代码' }]}
            >
                <Input placeholder="如：STAGE1, STAGE2" />
            </Form.Item>

            <Form.Item
                name="start_day"
                label="阶段原点位置（Day0在总轴上的位置）"
                tooltip="定义此阶段的Day0在模板总轴上的位置，支持负值"
                rules={[
                    { required: true, message: '请输入阶段原点位置' },
                    { type: 'number', min: -50, max: 200, message: '必须在-50到200之间' }
                ]}
            >
                <InputNumber
                    min={-50}
                    max={200}
                    style={{ width: '100%' }}
                    placeholder="阶段Day0在总轴的位置"
                    addonBefore="Day"
                />
            </Form.Item>

            <Form.Item name="description" label="阶段描述">
                <TextArea rows={3} placeholder="请输入阶段描述（可选）" />
            </Form.Item>

            <div style={{
                background: '#f0f7ff',
                padding: '12px',
                borderRadius: '6px',
                border: '1px solid #d6e4ff',
                marginBottom: '16px'
            }}>
                <Text strong style={{ color: '#1890ff' }}>💡 时间锚定说明：</Text>
                <div style={{ marginTop: '8px', color: '#1f1f1f', fontSize: '12px' }}>
                    • 阶段原点：定义该阶段Day0在模板总轴上的位置<br />
                    • 操作定位：阶段内操作相对于阶段Day0进行定位<br />
                    • 绝对位置：操作绝对位置 = 阶段原点 + 操作相对位置
                </div>
            </div>
        </>
    );
};

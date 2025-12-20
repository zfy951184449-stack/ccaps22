/**
 * 新建操作弹窗
 * 从 GanttModals.tsx 提取
 */

import React from 'react';
import { Modal, Form, Input, InputNumber } from 'antd';
import type { FormInstance } from 'antd';

const { TextArea } = Input;

interface CreateOperationModalProps {
    visible: boolean;
    onCancel: () => void;
    onOk: () => Promise<void>;
    form: FormInstance;
    loading: boolean;
}

export const CreateOperationModal: React.FC<CreateOperationModalProps> = ({
    visible,
    onCancel,
    onOk,
    form,
    loading
}) => {
    return (
        <Modal
            title="新建操作"
            open={visible}
            onCancel={onCancel}
            onOk={onOk}
            confirmLoading={loading}
            okText="保存"
            cancelText="取消"
            centered
            maskClosable={false}
        >
            <Form form={form} layout="vertical">
                <Form.Item
                    label="操作编码"
                    name="operation_code"
                    rules={[{ required: true, message: '请输入操作编码' }]}
                >
                    <Input placeholder="自动生成" maxLength={50} disabled />
                </Form.Item>
                <Form.Item
                    label="操作名称"
                    name="operation_name"
                    rules={[{ required: true, message: '请输入操作名称' }]}
                >
                    <Input placeholder="请输入操作名称" maxLength={100} />
                </Form.Item>
                <Form.Item
                    label="标准时长 (小时)"
                    name="standard_time"
                    rules={[{ required: true, message: '请输入标准时长' }]}
                >
                    <InputNumber min={0.1} max={72} step={0.1} style={{ width: '100%' }} placeholder="例如 2.5" />
                </Form.Item>
                <Form.Item
                    label="需要人数"
                    name="required_people"
                    rules={[{ required: true, message: '请输入需要人数' }]}
                >
                    <InputNumber min={1} max={50} step={1} style={{ width: '100%' }} placeholder="例如 3" />
                </Form.Item>
                <Form.Item label="操作描述" name="description">
                    <TextArea rows={3} placeholder="可选，补充说明" />
                </Form.Item>
            </Form>
        </Modal>
    );
};

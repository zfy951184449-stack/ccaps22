/**
 * 共享组编辑模态框
 * 
 * 用于创建和编辑人员共享组
 */

import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Radio, Transfer, message, Alert } from 'antd';
import { TeamOutlined, SwapOutlined } from '@ant-design/icons';
import axios from 'axios';
import type { ShareGroup, ShareGroupMember } from './ShareGroupPanel';
import type { TransferItem, TransferDirection } from 'antd/es/transfer';
import type { Key } from 'react';

interface ShareGroupModalProps {
    visible: boolean;
    templateId: number;
    group: ShareGroup | null; // null = 创建模式，非null = 编辑模式
    operations: Array<{ scheduleId: number; operationName: string; stageName: string; requiredPeople: number }>;
    onCancel: () => void;
    onSave: () => void;
}

const ShareGroupModal: React.FC<ShareGroupModalProps> = ({
    visible,
    templateId,
    group,
    operations,
    onCancel,
    onSave
}) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [selectedKeys, setSelectedKeys] = useState<Key[]>([]);
    const [targetKeys, setTargetKeys] = useState<Key[]>([]);

    const isEditMode = !!group;

    // 初始化表单数据
    useEffect(() => {
        if (visible) {
            if (group) {
                // 编辑模式：加载现有数据
                form.setFieldsValue({
                    group_name: group.group_name,
                    share_mode: group.share_mode
                });
                setTargetKeys(group.members?.map(m => String(m.schedule_id)) as Key[] || []);
            } else {
                // 创建模式：重置表单
                form.resetFields();
                form.setFieldsValue({ share_mode: 'SAME_TEAM' });
                setTargetKeys([]);
            }
            setSelectedKeys([]);
        }
    }, [visible, group, form]);

    // 转换操作列表为 Transfer 数据源
    const transferDataSource: TransferItem[] = operations.map(op => ({
        key: String(op.scheduleId),
        title: op.operationName,
        description: `${op.stageName} · ${op.requiredPeople}人`,
        disabled: false
    }));

    // 处理提交
    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();

            if (targetKeys.length < 2) {
                message.warning('共享组至少需要2个操作');
                return;
            }

            setLoading(true);

            const payload = {
                group_name: values.group_name,
                share_mode: values.share_mode,
                member_ids: targetKeys.map(k => Number(k))
            };

            if (isEditMode) {
                // 更新
                await axios.put(`/api/share-groups/${group!.id}`, payload);
                message.success('共享组已更新');
            } else {
                // 创建
                await axios.post(`/api/share-groups/template/${templateId}`, payload);
                message.success('共享组已创建');
            }

            onSave();
        } catch (error: any) {
            if (error.errorFields) {
                // 表单验证错误
                return;
            }
            message.error('保存失败');
        } finally {
            setLoading(false);
        }
    };

    // Transfer 变化处理
    const handleTransferChange = (nextTargetKeys: Key[], direction: TransferDirection, moveKeys: Key[]) => {
        setTargetKeys(nextTargetKeys);
    };

    const handleSelectChange = (sourceSelectedKeys: Key[], targetSelectedKeys: Key[]) => {
        setSelectedKeys([...sourceSelectedKeys, ...targetSelectedKeys]);
    };

    return (
        <Modal
            title={isEditMode ? '编辑共享组' : '新建共享组'}
            open={visible}
            onCancel={onCancel}
            onOk={handleSubmit}
            confirmLoading={loading}
            width={700}
            destroyOnClose
        >
            <Form
                form={form}
                layout="vertical"
                initialValues={{ share_mode: 'SAME_TEAM' }}
            >
                <Form.Item
                    name="group_name"
                    label="共享组名称"
                    rules={[{ required: true, message: '请输入共享组名称' }]}
                >
                    <Input placeholder="例如：接种共享组" maxLength={50} />
                </Form.Item>

                <Form.Item
                    name="share_mode"
                    label="共享模式"
                    rules={[{ required: true }]}
                >
                    <Radio.Group>
                        <Radio.Button value="SAME_TEAM">
                            <TeamOutlined /> 同组执行
                        </Radio.Button>
                        <Radio.Button value="DIFFERENT">
                            <SwapOutlined /> 不同人员
                        </Radio.Button>
                    </Radio.Group>
                </Form.Item>

                <Form.Item noStyle shouldUpdate={(prev, curr) => prev.share_mode !== curr.share_mode}>
                    {({ getFieldValue }) => {
                        const mode = getFieldValue('share_mode');
                        return (
                            <Alert
                                message={mode === 'SAME_TEAM'
                                    ? '同组执行：选中的操作将由同一组人员执行（团队槽位模式）'
                                    : '不同人员：选中的操作必须由不同人员执行（互斥模式）'
                                }
                                type={mode === 'SAME_TEAM' ? 'info' : 'warning'}
                                showIcon
                                style={{ marginBottom: 16 }}
                            />
                        );
                    }}
                </Form.Item>

                <Form.Item label="选择共享操作" required>
                    <Transfer
                        dataSource={transferDataSource}
                        titles={['可选操作', '已选操作']}
                        targetKeys={targetKeys}
                        selectedKeys={selectedKeys}
                        onChange={handleTransferChange}
                        onSelectChange={handleSelectChange}
                        render={item => (
                            <span title={item.description as string}>
                                {item.title}
                                <span style={{ color: '#999', marginLeft: 8, fontSize: 12 }}>
                                    ({item.description})
                                </span>
                            </span>
                        )}
                        listStyle={{
                            width: 280,
                            height: 300
                        }}
                        showSearch
                        filterOption={(inputValue, item) =>
                            item.title?.toLowerCase().includes(inputValue.toLowerCase()) ||
                            (item.description as string)?.toLowerCase().includes(inputValue.toLowerCase())
                        }
                    />
                </Form.Item>
            </Form>
        </Modal>
    );
};

export default ShareGroupModal;

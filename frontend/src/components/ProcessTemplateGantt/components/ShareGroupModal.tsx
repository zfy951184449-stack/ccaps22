/**
 * 共享组编辑模态框 (Redesigned)
 * 
 * 采用双栏布局 + 阶段分组，提供更清晰的操作选择体验
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Form, Input, Button, Card, Space, Tag, Empty, Divider, Tooltip, message, Typography } from 'antd';
import {
    TeamOutlined,
    SwapOutlined,
    SearchOutlined,
    PlusOutlined,
    DeleteOutlined,
    RightOutlined,
    CheckCircleFilled
} from '@ant-design/icons';
import axios from 'axios';
import type { ShareGroup } from './ShareGroupPanel';
import './ShareGroupModal.less'; // We assume this exists or we'll create it inline styles if simple

const { Text } = Typography;

interface ShareGroupModalProps {
    visible: boolean;
    templateId: number;
    group: ShareGroup | null; // null = 创建模式，非null = 编辑模式
    operations: Array<{ scheduleId: number; operationName: string; stageName: string; requiredPeople: number }>;
    onCancel: () => void;
    onSave: () => void;
    initialSelectedOperations?: number[]; // [New] Support pre-selection
}

// 模式选择卡片组件
const ModeCard = ({
    mode,
    selected,
    onClick
}: {
    mode: 'SAME_TEAM' | 'DIFFERENT',
    selected: boolean,
    onClick: () => void
}) => {
    const isSame = mode === 'SAME_TEAM';
    return (
        <div
            className={`share-mode-card ${selected ? 'selected' : ''}`}
            onClick={onClick}
            style={{
                border: `1px solid ${selected ? (isSame ? '#1890ff' : '#faad14') : '#d9d9d9'}`,
                borderRadius: '8px',
                padding: '12px',
                cursor: 'pointer',
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: selected ? (isSame ? '#e6f7ff' : '#fffbe6') : '#fff',
                transition: 'all 0.3s'
            }}
        >
            <div
                className="icon-wrapper"
                style={{
                    fontSize: '24px',
                    color: selected ? (isSame ? '#1890ff' : '#faad14') : '#8c8c8c'
                }}
            >
                {isSame ? <TeamOutlined /> : <SwapOutlined />}
            </div>
            <div className="content">
                <div style={{ fontWeight: 500, color: '#262626' }}>
                    {isSame ? '同组执行 (Same Team)' : '不同人员 (Different)'}
                </div>
                <div style={{ fontSize: '12px', color: '#8c8c8c', marginTop: '4px' }}>
                    {isSame ? '组内操作由同一批人员完成' : '组内操作必须由不同人员完成'}
                </div>
            </div>
            {selected && <CheckCircleFilled style={{ color: isSame ? '#1890ff' : '#faad14', marginLeft: 'auto' }} />}
        </div>
    );
};

const ShareGroupModal: React.FC<ShareGroupModalProps> = ({
    visible,
    templateId,
    group,
    operations,
    onCancel,
    onSave,
    initialSelectedOperations = []
}) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);

    // 状态管理
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [searchKeyword, setSearchKeyword] = useState('');
    const [shareMode, setShareMode] = useState<'SAME_TEAM' | 'DIFFERENT'>('SAME_TEAM');

    const isEditMode = !!group;

    // 初始化表单
    useEffect(() => {
        if (visible) {
            if (group) {
                // 编辑模式
                form.setFieldsValue({
                    group_name: group.group_name
                });
                setShareMode(group.share_mode);
                setSelectedIds(group.members?.map(m => m.schedule_id) || []);
            } else {
                // 创建模式
                form.resetFields();
                setShareMode('SAME_TEAM');
                // Use initialSelectedOperations for selectedIds in Create Mode
                setSelectedIds(initialSelectedOperations);

                // [Auto-Generate Name] Pre-fill group name to simplify user operation
                let defaultName = '新建共享组';
                if (initialSelectedOperations && initialSelectedOperations.length > 0) {
                    const firstOpId = initialSelectedOperations[0];
                    const firstOp = operations.find(op => op.scheduleId === firstOpId);
                    if (firstOp) {
                        defaultName = `${firstOp.operationName}-共享组`;
                    }
                }
                form.setFieldValue('group_name', defaultName);
            }
            setSearchKeyword('');
        }
    }, [visible, group, form, initialSelectedOperations, operations]);

    // 处理数据源：按阶段分组
    const groupedOperations = useMemo(() => {
        const groups: Record<string, typeof operations> = {};
        operations.forEach(op => {
            // 过滤已选的操作，不在左侧显示 (或者显示为禁用/已选状态)
            // 这里选择不显示已选的，让左侧纯粹作为“待选池”
            if (selectedIds.includes(op.scheduleId)) return;

            // 关键词过滤
            if (searchKeyword && !op.operationName.toLowerCase().includes(searchKeyword.toLowerCase())) {
                return;
            }

            if (!groups[op.stageName]) {
                groups[op.stageName] = [];
            }
            groups[op.stageName].push(op);
        });
        return groups;
    }, [operations, selectedIds, searchKeyword]);

    // 获取已选操作的详情对象
    const selectedOperations = useMemo(() => {
        return selectedIds
            .map(id => operations.find(op => op.scheduleId === id))
            .filter(Boolean) as typeof operations;
    }, [selectedIds, operations]);

    // 操作处理
    const handleAdd = (id: number) => {
        setSelectedIds(prev => [...prev, id]);
    };

    const handleRemove = (id: number) => {
        setSelectedIds(prev => prev.filter(currentId => currentId !== id));
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();

            if (selectedIds.length < 2) {
                message.warning('共享组至少需要包含2个操作');
                return;
            }

            setLoading(true);

            const payload = {
                group_name: values.group_name,
                share_mode: shareMode,
                member_ids: selectedIds
            };

            if (isEditMode) {
                await axios.put(`/api/share-groups/${group!.id}`, payload);
                message.success('共享组已更新');
            } else {
                await axios.post(`/api/share-groups/template/${templateId}`, payload);
                message.success('共享组已创建');
            }

            onSave();
        } catch (error: any) {
            if (!error.errorFields) {
                message.error('保存失败');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            title={isEditMode ? '编辑共享组' : '新建共享组'}
            open={visible}
            onCancel={onCancel}
            onOk={handleSubmit}
            confirmLoading={loading}
            width={800}
            destroyOnClose
            maskClosable={false}
            className="share-group-modal"
        >
            <Form form={form} layout="vertical">
                {/* 1. 基本信息区域 */}
                <div style={{ marginBottom: '24px' }}>
                    <Form.Item
                        name="group_name"
                        label="共享组名称"
                        rules={[{ required: true, message: '请输入共享组名称' }]}
                        style={{ marginBottom: '16px' }}
                    >
                        <Input placeholder="例如：接种-培养连续作业" maxLength={50} />
                    </Form.Item>

                    <div style={{ display: 'flex', gap: '16px' }}>
                        <ModeCard
                            mode="SAME_TEAM"
                            selected={shareMode === 'SAME_TEAM'}
                            onClick={() => setShareMode('SAME_TEAM')}
                        />
                        <ModeCard
                            mode="DIFFERENT"
                            selected={shareMode === 'DIFFERENT'}
                            onClick={() => setShareMode('DIFFERENT')}
                        />
                    </div>
                </div>

                <Divider style={{ margin: '16px 0' }} />

                {/* 2. 双栏选择区域 */}
                <div style={{ display: 'flex', height: '400px', gap: '16px' }}>

                    {/* 左栏：待选操作 */}
                    <Card
                        title="待选操作"
                        size="small"
                        style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                        bodyStyle={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '0' }}
                        extra={
                            <Input
                                prefix={<SearchOutlined />}
                                placeholder="搜索操作"
                                size="small"
                                style={{ width: 120 }}
                                value={searchKeyword}
                                onChange={e => setSearchKeyword(e.target.value)}
                                allowClear
                            />
                        }
                    >
                        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                            {Object.keys(groupedOperations).length === 0 ? (
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无待选操作" />
                            ) : (
                                Object.entries(groupedOperations).map(([stageName, ops]) => (
                                    <div key={stageName} style={{ marginBottom: '12px' }}>
                                        <div style={{
                                            background: '#f5f5f5',
                                            padding: '4px 8px',
                                            borderRadius: '4px',
                                            fontSize: '12px',
                                            color: '#595959',
                                            marginBottom: '4px',
                                            fontWeight: 500
                                        }}>
                                            {stageName}
                                        </div>
                                        {ops.map(op => (
                                            <div
                                                key={op.scheduleId}
                                                className="operation-item"
                                                onClick={() => handleAdd(op.scheduleId)}
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    padding: '8px',
                                                    borderBottom: '1px solid #f0f0f0',
                                                    cursor: 'pointer',
                                                    transition: 'background 0.2s',
                                                }}
                                            >
                                                <div>
                                                    <div style={{ fontWeight: 500 }}>{op.operationName}</div>
                                                    <div style={{ fontSize: '12px', color: '#8c8c8c' }}>
                                                        {op.requiredPeople} 人
                                                    </div>
                                                </div>
                                                <Button size="small" type="text" icon={<PlusOutlined />} />
                                            </div>
                                        ))}
                                    </div>
                                ))
                            )}
                        </div>
                    </Card>

                    {/* 中间：箭头 */}
                    <div style={{ display: 'flex', alignItems: 'center', color: '#bfbfbf' }}>
                        <RightOutlined />
                    </div>

                    {/* 右栏：已选成员 */}
                    <Card
                        title={
                            <Space>
                                <span>已选成员</span>
                                <Tag color="blue">{selectedIds.length}</Tag>
                            </Space>
                        }
                        size="small"
                        style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                        bodyStyle={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '0' }}
                        extra={
                            selectedIds.length > 0 && (
                                <Button type="text" danger size="small" onClick={() => setSelectedIds([])}>
                                    清空
                                </Button>
                            )
                        }
                    >
                        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                            {selectedOperations.length === 0 ? (
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请从左侧选择操作" />
                            ) : (
                                selectedOperations.map((op, index) => (
                                    <div
                                        key={op.scheduleId}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            padding: '8px',
                                            background: '#f6ffed',
                                            border: '1px solid #b7eb8f',
                                            borderRadius: '4px',
                                            marginBottom: '8px'
                                        }}
                                    >
                                        <div style={{ marginRight: '8px', fontWeight: 'bold', color: '#52c41a' }}>
                                            {index + 1}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 500 }}>{op.operationName}</div>
                                            <div style={{ fontSize: '12px', color: '#8c8c8c' }}>
                                                {op.stageName} · {op.requiredPeople} 人
                                            </div>
                                        </div>
                                        <Button
                                            size="small"
                                            type="text"
                                            danger
                                            icon={<DeleteOutlined />}
                                            onClick={() => handleRemove(op.scheduleId)}
                                        />
                                    </div>
                                ))
                            )}
                        </div>
                    </Card>

                </div>
            </Form>
        </Modal>
    );
};

export default ShareGroupModal;

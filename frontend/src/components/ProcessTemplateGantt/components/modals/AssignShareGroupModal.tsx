/**
 * 共享组选择器弹窗
 * 选择现有共享组或创建新组
 * 
 * Apple HIG 风格设计
 */

import React, { useState } from 'react';
import { Modal, Select, Button, Typography, Tag, Space, Divider } from 'antd';
import { PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { ShareGroup } from '../../types';

const { Option } = Select;
const { Text } = Typography;

interface AssignShareGroupModalProps {
    visible: boolean;
    availableGroups: ShareGroup[];
    currentGroups: ShareGroup[];
    onCancel: () => void;
    onAssign: (groupId: number) => void;
    onCreate: () => void;
    loading?: boolean;
}

export const AssignShareGroupModal: React.FC<AssignShareGroupModalProps> = ({
    visible,
    availableGroups,
    currentGroups,
    onCancel,
    onAssign,
    onCreate,
    loading = false,
}) => {
    const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);

    // Filter out groups already assigned
    const unassignedGroups = availableGroups.filter(
        g => !currentGroups.some(cg => cg.id === g.id)
    );

    const handleAssign = () => {
        if (selectedGroupId) {
            onAssign(selectedGroupId);
            setSelectedGroupId(null);
        }
    };

    return (
        <Modal
            title="加入共享组"
            open={visible}
            onCancel={onCancel}
            footer={[
                <Button key="cancel" onClick={onCancel}>取消</Button>,
                <Button
                    key="assign"
                    type="primary"
                    onClick={handleAssign}
                    disabled={!selectedGroupId}
                    loading={loading}
                >
                    加入
                </Button>,
            ]}
            centered
            width={420}
        >
            {unassignedGroups.length > 0 ? (
                <>
                    <div style={{ marginBottom: 16 }}>
                        <Text type="secondary">选择要加入的共享组：</Text>
                    </div>
                    <Select
                        placeholder="选择共享组"
                        style={{ width: '100%' }}
                        value={selectedGroupId}
                        onChange={setSelectedGroupId}
                        showSearch
                        optionFilterProp="children"
                        filterOption={(input, option) =>
                            (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                        }
                    >
                        {unassignedGroups.map(g => (
                            <Option key={g.id} value={g.id} label={g.group_name}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Space>
                                        <TeamOutlined />
                                        <span>{g.group_name}</span>
                                    </Space>
                                    <Tag color={(g as any).share_mode === 'SAME_TEAM' ? 'blue' : 'orange'}>
                                        {(g as any).share_mode === 'SAME_TEAM' ? '同组' : '不同'}
                                    </Tag>
                                </div>
                            </Option>
                        ))}
                    </Select>
                </>
            ) : (
                <div style={{ textAlign: 'center', padding: 24, color: '#999' }}>
                    <TeamOutlined style={{ fontSize: 32, marginBottom: 8, display: 'block' }} />
                    <div>暂无可加入的共享组</div>
                </div>
            )}

            <Divider style={{ margin: '20px 0' }}>或</Divider>

            <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={onCreate}
                block
            >
                创建新共享组
            </Button>
        </Modal>
    );
};

/**
 * 共享组面板组件
 * 
 * 显示和管理模板的人员共享组配置
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, List, Tag, Button, Empty, Tooltip, Space, Dropdown, Menu, message } from 'antd';
import {
    TeamOutlined,
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    SwapOutlined,
    MoreOutlined
} from '@ant-design/icons';
import ShareGroupModal from './ShareGroupModal';
import axios from 'axios';
import './ShareGroupPanel.less';

// 共享组数据类型
export interface ShareGroupMember {
    id: number;
    schedule_id: number;
    operation_name: string;
    required_people: number;
    stage_name: string;
}

export interface ShareGroup {
    id: number;
    template_id: number;
    group_code: string;
    group_name: string;
    share_mode: 'SAME_TEAM' | 'DIFFERENT';
    members: ShareGroupMember[];
    member_count?: number;
}

interface ShareGroupPanelProps {
    templateId: number;
    operations: Array<{ scheduleId: number; operationName: string; stageName: string; requiredPeople: number }>;
    onGroupChange?: () => void;
}

const ShareGroupPanel: React.FC<ShareGroupPanelProps> = ({
    templateId,
    operations,
    onGroupChange
}) => {
    const [shareGroups, setShareGroups] = useState<ShareGroup[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingGroup, setEditingGroup] = useState<ShareGroup | null>(null);

    // 加载共享组数据
    const fetchShareGroups = useCallback(async () => {
        if (!templateId) return;

        setLoading(true);
        try {
            const { data } = await axios.get(`/api/share-groups/template/${templateId}`);
            setShareGroups(data || []);
        } catch (error) {
            console.error('Failed to fetch share groups:', error);
        } finally {
            setLoading(false);
        }
    }, [templateId]);

    useEffect(() => {
        fetchShareGroups();
    }, [fetchShareGroups]);

    // 创建共享组
    const handleCreateGroup = () => {
        setEditingGroup(null);
        setModalVisible(true);
    };

    // 编辑共享组
    const handleEditGroup = (group: ShareGroup) => {
        setEditingGroup(group);
        setModalVisible(true);
    };

    // 删除共享组
    const handleDeleteGroup = async (groupId: number) => {
        try {
            await axios.delete(`/api/share-groups/${groupId}`);
            message.success('共享组已删除');
            fetchShareGroups();
            onGroupChange?.();
        } catch (error) {
            message.error('删除失败');
        }
    };

    // 模态框保存后刷新
    const handleModalSave = () => {
        setModalVisible(false);
        fetchShareGroups();
        onGroupChange?.();
    };

    // 渲染共享模式标签
    const renderModeTag = (mode: 'SAME_TEAM' | 'DIFFERENT') => {
        if (mode === 'SAME_TEAM') {
            return <Tag color="blue" icon={<TeamOutlined />}>同组执行</Tag>;
        }
        return <Tag color="orange" icon={<SwapOutlined />}>不同人员</Tag>;
    };

    // 渲染操作菜单
    const renderActionMenu = (group: ShareGroup) => (
        <Menu>
            <Menu.Item key="edit" icon={<EditOutlined />} onClick={() => handleEditGroup(group)}>
                编辑
            </Menu.Item>
            <Menu.Item
                key="delete"
                icon={<DeleteOutlined />}
                danger
                onClick={() => handleDeleteGroup(group.id)}
            >
                删除
            </Menu.Item>
        </Menu>
    );

    return (
        <Card
            className="share-group-panel"
            title={
                <Space>
                    <TeamOutlined />
                    <span>人员共享组</span>
                    <Tag>{shareGroups.length}</Tag>
                </Space>
            }
            extra={
                <Button
                    type="primary"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={handleCreateGroup}
                >
                    新建共享组
                </Button>
            }
            size="small"
        >
            {shareGroups.length === 0 ? (
                <Empty
                    description="暂无共享组"
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
            ) : (
                <List
                    loading={loading}
                    dataSource={shareGroups}
                    renderItem={(group) => (
                        <List.Item
                            className="share-group-item"
                            actions={[
                                <Dropdown overlay={renderActionMenu(group)} trigger={['click']} key="actions">
                                    <Button type="text" size="small" icon={<MoreOutlined />} />
                                </Dropdown>
                            ]}
                        >
                            <List.Item.Meta
                                title={
                                    <Space>
                                        <span className="group-name">{group.group_name}</span>
                                        {renderModeTag(group.share_mode)}
                                    </Space>
                                }
                                description={
                                    <div className="group-members">
                                        {group.members?.map((member, idx) => (
                                            <Tooltip
                                                key={member.schedule_id}
                                                title={`${member.stage_name} · ${member.required_people}人`}
                                            >
                                                <Tag className="member-tag">
                                                    {member.operation_name}
                                                    {idx < group.members.length - 1 && <span className="separator">→</span>}
                                                </Tag>
                                            </Tooltip>
                                        ))}
                                    </div>
                                }
                            />
                        </List.Item>
                    )}
                />
            )}

            <ShareGroupModal
                visible={modalVisible}
                templateId={templateId}
                group={editingGroup}
                operations={operations}
                onCancel={() => setModalVisible(false)}
                onSave={handleModalSave}
            />
        </Card>
    );
};

export default ShareGroupPanel;

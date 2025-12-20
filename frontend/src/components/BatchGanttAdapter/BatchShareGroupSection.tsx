/**
 * BatchShareGroupSection - 批次操作共享组管理
 * 显示当前操作所属的共享组，支持加入/退出
 */

import React, { useState, useEffect } from 'react';
import { Typography, Tag, Button, Select, Tooltip, Space, Spin, message, Modal } from 'antd';
import { TeamOutlined, PlusOutlined, CloseOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Text } = Typography;
const { Option } = Select;

interface ShareGroupMember {
    operation_plan_id: number;
    operation_name: string;
    stage_name?: string;
}

interface BatchShareGroup {
    id: number;
    group_name: string;
    share_mode: 'SAME_TEAM' | 'DIFFERENT_PEOPLE';
    members?: ShareGroupMember[];
}

interface BatchShareGroupSectionProps {
    operationPlanId: number;
    batchId: number;
    onRefresh?: () => void;
}

export const BatchShareGroupSection: React.FC<BatchShareGroupSectionProps> = ({
    operationPlanId,
    batchId,
    onRefresh,
}) => {
    const [loading, setLoading] = useState(true);
    const [myGroups, setMyGroups] = useState<BatchShareGroup[]>([]);
    const [allGroups, setAllGroups] = useState<BatchShareGroup[]>([]);
    const [joining, setJoining] = useState(false);
    const [leavingId, setLeavingId] = useState<number | null>(null);
    const [selectVisible, setSelectVisible] = useState(false);
    const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);

    // 加载数据
    useEffect(() => {
        loadShareGroups();
    }, [operationPlanId, batchId]);

    const loadShareGroups = async () => {
        setLoading(true);
        try {
            // 获取操作所属共享组
            const myResponse = await axios.get<BatchShareGroup[]>(
                `/api/operation-plans/${operationPlanId}/share-groups`
            );
            setMyGroups(myResponse.data);

            // 获取批次所有共享组
            const allResponse = await axios.get<BatchShareGroup[]>(
                `/api/batches/${batchId}/share-groups`
            );
            setAllGroups(allResponse.data);
        } catch (error) {
            console.error('Failed to load share groups:', error);
        } finally {
            setLoading(false);
        }
    };

    // 加入共享组
    const handleJoin = async () => {
        if (!selectedGroupId) return;
        setJoining(true);
        try {
            await axios.post(`/api/share-groups/${selectedGroupId}/operations`, {
                operation_plan_id: operationPlanId,
            });
            message.success('已加入共享组');
            setSelectVisible(false);
            setSelectedGroupId(null);
            loadShareGroups();
            onRefresh?.();
        } catch (error: any) {
            message.error(error?.response?.data?.error || '加入失败');
        } finally {
            setJoining(false);
        }
    };

    // 退出共享组
    const handleLeave = async (groupId: number, groupName: string) => {
        Modal.confirm({
            title: '确认退出',
            content: `确定要退出共享组 "${groupName}" 吗？`,
            okText: '退出',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                setLeavingId(groupId);
                try {
                    await axios.delete(`/api/share-groups/${groupId}/operations/${operationPlanId}`);
                    message.success('已退出共享组');
                    loadShareGroups();
                    onRefresh?.();
                } catch (error: any) {
                    message.error(error?.response?.data?.error || '退出失败');
                } finally {
                    setLeavingId(null);
                }
            },
        });
    };

    // 可加入的共享组 (排除已加入的)
    const availableGroups = allGroups.filter(
        g => !myGroups.some(mg => mg.id === g.id)
    );

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: 20 }}>
                <Spin size="small" />
            </div>
        );
    }

    return (
        <div>
            {/* 已加入的共享组 */}
            {myGroups.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 16, color: '#999' }}>
                    <TeamOutlined style={{ fontSize: 24, marginBottom: 8, display: 'block' }} />
                    <div style={{ fontSize: 12 }}>该操作未加入任何共享组</div>
                </div>
            ) : (
                <div style={{ marginBottom: 12 }}>
                    {myGroups.map(group => (
                        <div
                            key={group.id}
                            style={{
                                background: '#f5f5f5',
                                borderRadius: 6,
                                padding: 10,
                                marginBottom: 8,
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Space size={8}>
                                    <TeamOutlined />
                                    <Text strong>{group.group_name}</Text>
                                    <Tag color={group.share_mode === 'SAME_TEAM' ? 'blue' : 'orange'}>
                                        {group.share_mode === 'SAME_TEAM' ? '同组执行' : '不同人员'}
                                    </Tag>
                                </Space>
                                <Tooltip title="退出共享组">
                                    <Button
                                        type="text"
                                        size="small"
                                        danger
                                        icon={<CloseOutlined />}
                                        loading={leavingId === group.id}
                                        onClick={() => handleLeave(group.id, group.group_name)}
                                    />
                                </Tooltip>
                            </div>
                            {group.members && group.members.length > 0 && (
                                <div style={{ marginTop: 6, fontSize: 11, color: '#666' }}>
                                    成员: {group.members.slice(0, 4).map(m => m.operation_name).join(', ')}
                                    {group.members.length > 4 && ` +${group.members.length - 4}`}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* 加入共享组选择器 */}
            {selectVisible ? (
                <div style={{ background: '#fafafa', borderRadius: 6, padding: 12 }}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                        选择要加入的共享组
                    </Text>
                    <Select
                        placeholder="选择共享组"
                        style={{ width: '100%', marginBottom: 8 }}
                        value={selectedGroupId}
                        onChange={setSelectedGroupId}
                    >
                        {availableGroups.map(g => (
                            <Option key={g.id} value={g.id}>
                                <Space>
                                    <span>{g.group_name}</span>
                                    <Tag color={g.share_mode === 'SAME_TEAM' ? 'blue' : 'orange'}>
                                        {g.share_mode === 'SAME_TEAM' ? '同组' : '不同'}
                                    </Tag>
                                </Space>
                            </Option>
                        ))}
                    </Select>
                    <Space>
                        <Button size="small" onClick={() => { setSelectVisible(false); setSelectedGroupId(null); }}>
                            取消
                        </Button>
                        <Button
                            type="primary"
                            size="small"
                            loading={joining}
                            disabled={!selectedGroupId}
                            onClick={handleJoin}
                        >
                            加入
                        </Button>
                    </Space>
                </div>
            ) : (
                <Button
                    type="dashed"
                    icon={<PlusOutlined />}
                    block
                    onClick={() => setSelectVisible(true)}
                    disabled={availableGroups.length === 0}
                >
                    {availableGroups.length > 0 ? '加入共享组' : '无可加入的共享组'}
                </Button>
            )}
        </div>
    );
};

export default BatchShareGroupSection;

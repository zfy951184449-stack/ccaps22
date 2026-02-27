import React, { useState, useEffect } from 'react';
import { Button, List, Avatar, Empty, message, Tag, Spin, Popconfirm } from 'antd';
import { UserOutlined, PlusOutlined, DeleteOutlined, TeamOutlined } from '@ant-design/icons';
import axios from 'axios';
import OperationSelectorModal from './OperationSelectorModal';

interface ShareGroupMembersTabProps {
    operation: any;
    onUpdate?: () => void;
    getContainer?: () => HTMLElement;
}

const ShareGroupMembersTab: React.FC<ShareGroupMembersTabProps> = ({ operation, onUpdate, getContainer }) => {
    const [loading, setLoading] = useState(false);
    const [members, setMembers] = useState<any[]>([]);
    const [currentGroup, setCurrentGroup] = useState<any>(null);
    const [selectorVisible, setSelectorVisible] = useState(false);

    useEffect(() => {
        if (operation) {
            fetchGroupInfo();
        }
    }, [operation]);

    const fetchGroupInfo = async () => {
        setLoading(true);
        try {
            // Get groups for this operation
            const res = await axios.get(`/api/share-groups/batch-operation/${operation.id}`);
            if (res.data && res.data.length > 0) {
                // Assuming one group for now as per design simplicity, pick the first one
                const group = res.data[0];
                setCurrentGroup(group);
                setMembers(group.members || []);
            } else {
                setCurrentGroup(null);
                setMembers([]);
            }
        } catch (error) {
            console.error('Failed to fetch share group info', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddOperations = async (selectedIds: number[]) => {
        if (selectedIds.length === 0) return;

        try {
            setLoading(true);
            await axios.post('/api/share-groups/batch-operations/merge', {
                target_operation_id: operation.id,
                member_operation_ids: selectedIds
            });
            message.success('已添加操作到共享组');
            setSelectorVisible(false);
            fetchGroupInfo(); // Reload info
            onUpdate?.(); // Notify parent
        } catch (error) {
            console.error('Merge failed', error);
            message.error('添加失败');
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveMember = async (memberOpId: number) => {
        if (!currentGroup) return;
        try {
            await axios.delete(`/api/share-groups/${currentGroup.id}/operations/${memberOpId}`);
            message.success('已移除成员');
            fetchGroupInfo();
            onUpdate?.();
        } catch (error) {
            message.error('移除失败');
        }
    };

    // If no group, we just show "Current Operation" effectively as a potential list or empty state?
    // Design says: "If no group, show 'No share members' or just self"
    // Let's create a virtual list containing self if no group exists, to make it clear.
    const displayMembers = members.length > 0 ? members : [
        {
            operation_plan_id: operation.id,
            operation_name: operation.name,
            stage_name: '当前', // Mock stage or fetch? simple mock for "Self" logic
            isSelf: true
        }
    ];

    // Mark self in real list
    const processedMembers = displayMembers.map(m => ({
        ...m,
        isSelf: m.operation_plan_id === operation.id
    }));

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center' }}>
                    Current Share Group Members
                    {currentGroup && (
                        <Tag color="blue" style={{ marginLeft: 8 }}>{currentGroup.group_name}</Tag>
                    )}
                </div>

                {loading && !selectorVisible ? (
                    <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
                ) : (
                    <div style={{
                        border: '1px solid #f0f0f0',
                        borderRadius: 8,
                        maxHeight: 300,
                        overflowY: 'auto',
                        backgroundColor: '#fff'
                    }}>
                        <List
                            itemLayout="horizontal"
                            dataSource={processedMembers}
                            renderItem={(item: any) => (
                                <List.Item
                                    style={{ padding: '8px 12px' }}
                                    actions={!item.isSelf && currentGroup ? [
                                        <Popconfirm title="移除此成员?" onConfirm={() => handleRemoveMember(item.operation_plan_id)}>
                                            <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                                        </Popconfirm>
                                    ] : []}
                                >
                                    <List.Item.Meta
                                        avatar={<Avatar icon={<UserOutlined />} style={{ backgroundColor: item.isSelf ? '#1890ff' : '#d9d9d9' }} />}
                                        title={
                                            <span style={{ fontWeight: item.isSelf ? 600 : 400 }}>
                                                {item.operation_name}
                                                {item.isSelf && <span style={{ color: '#999', fontSize: 12, marginLeft: 4 }}>(Current)</span>}
                                            </span>
                                        }
                                        description={item.stage_name ? <Tag style={{ margin: 0 }}>{item.stage_name}</Tag> : null}
                                    />
                                </List.Item>
                            )}
                        />
                        {processedMembers.length === 0 && <Empty description="暂无共享成员" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
                    </div>
                )}
            </div>

            <div style={{ marginTop: 'auto' }}>
                <Button
                    type="primary"
                    block
                    icon={<PlusOutlined />}
                    onClick={() => setSelectorVisible(true)}
                    className="h-10 text-base shadow-lg shadow-blue-500/20 bg-gradient-to-r from-blue-500 to-blue-600 border-0 hover:scale-[1.02] transition-transform rounded-xl"
                    style={{ height: 40 }} // Keep inline height for AntD consistency just in case
                >
                    Add Operations
                </Button>
            </div>

            <OperationSelectorModal
                visible={selectorVisible}
                batchId={operation.batch_id}
                defaultStageId={operation.stage_id}
                currentOperationId={operation.id}
                onCancel={() => setSelectorVisible(false)}
                onSelect={handleAddOperations}
                getContainer={getContainer}
            />
        </div>
    );
};

export default ShareGroupMembersTab;

import React, { useState, useEffect } from 'react';
import {
    WxbButton,
    WxbList,
    WxbAvatar,
    WxbEmpty,
    WxbTag,
    WxbSpinner,
    WxbPopconfirm,
    wxbToast,
} from '../../wxb-ui';
import axios from 'axios';
import OperationSelectorModal from './OperationSelectorModal';

interface ShareGroupMembersTabProps {
    operation: any;
    onUpdate?: () => void;
    getContainer?: () => HTMLElement;
}

// 用户图标（人形轮廓）
const IconUser = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M2 14c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
);

// 加号图标
const IconPlus = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
);

// 删除图标
const IconDelete = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 3.5h10M5.5 3.5V2.5h3V3.5M3.5 3.5l.75 8h5.5l.75-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

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
            // 获取该操作所在的共享组
            const res = await axios.get(`/api/share-groups/batch-operation/${operation.id}`);
            if (res.data && res.data.length > 0) {
                // 当前设计一个操作最多归属一个共享组，取第一个
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
            wxbToast.success('已添加操作到共享组');
            setSelectorVisible(false);
            fetchGroupInfo(); // 重新加载数据
            onUpdate?.(); // 通知父组件
        } catch (error) {
            console.error('Merge failed', error);
            wxbToast.error('添加失败');
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveMember = async (memberOpId: number) => {
        if (!currentGroup) return;
        try {
            await axios.delete(`/api/share-groups/${currentGroup.id}/operations/${memberOpId}`);
            wxbToast.success('已移除成员');
            fetchGroupInfo();
            onUpdate?.();
        } catch (error) {
            wxbToast.error('移除失败');
        }
    };

    // 若无共享组，显示当前操作自身作为唯一成员，使界面意图清晰
    const displayMembers = members.length > 0 ? members : [
        {
            operation_plan_id: operation.id,
            operation_name: operation.name,
            stage_name: '当前', // 自身标记
            isSelf: true
        }
    ];

    // 在真实列表中标记自身
    const processedMembers = displayMembers.map((m: any) => ({
        ...m,
        isSelf: m.operation_plan_id === operation.id
    }));

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center' }}>
                    当前共享组成员
                    {currentGroup && (
                        <WxbTag color="blue" style={{ marginLeft: 8 }}>{currentGroup.group_name}</WxbTag>
                    )}
                </div>

                {loading && !selectorVisible ? (
                    <div style={{ textAlign: 'center', padding: 20 }}>
                        <WxbSpinner size={28} />
                    </div>
                ) : (
                    <div style={{
                        border: '1px solid var(--wx-border-default, #E2E8F0)',
                        borderRadius: 8,
                        maxHeight: 300,
                        overflowY: 'auto',
                        backgroundColor: 'var(--wx-surface-1, #fff)'
                    }}>
                        {processedMembers.length > 0 ? (
                            <WxbList
                                bordered={false}
                                dataSource={processedMembers}
                                renderItem={(item: any) => (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '8px 12px',
                                    }}>
                                        {/* 左侧：头像 + 信息 */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                                            <WxbAvatar
                                                size={32}
                                                color={item.isSelf ? 'var(--wx-blue-600, #1563DC)' : 'var(--wx-surface-3, #EDF1F6)'}
                                                style={{ color: item.isSelf ? 'var(--wx-white, #fff)' : 'var(--wx-fg-2, #4B5563)', flexShrink: 0 }}
                                            >
                                                <IconUser />
                                            </WxbAvatar>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{
                                                    fontWeight: item.isSelf ? 600 : 400,
                                                    fontSize: 13,
                                                    color: 'var(--wx-fg-1, #111827)',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                }}>
                                                    {item.operation_name}
                                                    {item.isSelf && (
                                                        <span style={{
                                                            color: 'var(--wx-fg-4, #8898A8)',
                                                            fontSize: 11,
                                                            marginLeft: 4,
                                                        }}>
                                                            (当前)
                                                        </span>
                                                    )}
                                                </div>
                                                {item.stage_name && (
                                                    <WxbTag color="neutral" style={{ marginTop: 2 }}>
                                                        {item.stage_name}
                                                    </WxbTag>
                                                )}
                                            </div>
                                        </div>

                                        {/* 右侧：移除按钮（非自身且有共享组时显示） */}
                                        {!item.isSelf && currentGroup && (
                                            <WxbPopconfirm
                                                title="移除此成员?"
                                                onConfirm={() => handleRemoveMember(item.operation_plan_id)}
                                            >
                                                <WxbButton
                                                    variant="ghost"
                                                    size="sm"
                                                    style={{
                                                        color: 'var(--wx-red-600, #DC2626)',
                                                        padding: '2px 6px',
                                                        marginLeft: 8,
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    <IconDelete />
                                                </WxbButton>
                                            </WxbPopconfirm>
                                        )}
                                    </div>
                                )}
                            />
                        ) : (
                            <WxbEmpty description="暂无共享成员" />
                        )}
                    </div>
                )}
            </div>

            <div style={{ marginTop: 'auto' }}>
                <WxbButton
                    variant="primary"
                    size="lg"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    onClick={() => setSelectorVisible(true)}
                >
                    <IconPlus />
                    添加操作
                </WxbButton>
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

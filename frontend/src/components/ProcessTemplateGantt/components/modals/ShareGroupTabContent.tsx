/**
 * 共享组 Tab 内容组件
 * 显示当前操作所属的共享组，支持加入和退出
 */

import React from 'react';
import { Button, Typography, Tag, Tooltip } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { ShareGroup } from '../../types';

const { Text } = Typography;

// 设计 tokens
const TOKENS = {
    cardBg: '#ffffff',
    cardBorder: '#e5e5e5',
    cardRadius: 8,
    sectionTitle: '#8c8c8c',
    infoBoxBg: '#f5f5f5',
    infoBoxBorder: '#e5e5e5',
    infoBoxTitle: '#595959',
    primaryColor: '#1890ff',
};

interface ShareGroupTabContentProps {
    operationShareGroups: ShareGroup[];
    onEdit: (group: ShareGroup) => void;
    onRemove: (groupId: number) => void;
    onAddOrCreate: () => void;
}

// 共享组卡片
const ShareGroupCard: React.FC<{
    group: ShareGroup;
    onEdit: () => void;
    onRemove: () => void;
}> = ({ group, onEdit, onRemove }) => {
    const shareMode = (group as any).share_mode;
    const members = (group as any).members || [];

    return (
        <div
            style={{
                background: TOKENS.cardBg,
                border: `1px solid ${TOKENS.cardBorder}`,
                borderRadius: TOKENS.cardRadius,
                padding: 12,
                marginBottom: 10,
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text strong style={{ fontSize: 13 }}>
                    <TeamOutlined style={{ marginRight: 6, color: '#666' }} />
                    {group.group_name}
                </Text>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <Tag color={shareMode === 'SAME_TEAM' ? 'blue' : 'orange'}>
                        {shareMode === 'SAME_TEAM' ? '同组执行' : '不同人员'}
                    </Tag>
                    <Tooltip title="编辑共享组">
                        <Button
                            type="text"
                            size="small"
                            icon={<EditOutlined />}
                            onClick={onEdit}
                        />
                    </Tooltip>
                    <Tooltip title="退出共享组">
                        <Button
                            type="text"
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                            onClick={onRemove}
                        />
                    </Tooltip>
                </div>
            </div>

            {/* 组员列表 */}
            {members.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {members.slice(0, 5).map((member: any, idx: number) => (
                        <span
                            key={idx}
                            style={{
                                background: '#f0f0f0',
                                padding: '4px 10px',
                                borderRadius: 12,
                                fontSize: 11,
                                color: '#555',
                            }}
                        >
                            {member.operation_name || `操作 ${member.schedule_id}`}
                            {member.is_current && <span style={{ color: '#007aff', marginLeft: 4 }}>★</span>}
                        </span>
                    ))}
                    {members.length > 5 && (
                        <span style={{ color: '#999', fontSize: 11, padding: '4px 0' }}>
                            +{members.length - 5} 更多
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};

// Section 标题
const SectionTitle: React.FC<{ title: string; count: number }> = ({ title, count }) => (
    <div style={{
        fontSize: 11,
        fontWeight: 600,
        color: TOKENS.sectionTitle,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 12,
    }}>
        {title} ({count})
    </div>
);

// 信息提示框
const InfoBox: React.FC = () => (
    <div style={{
        background: TOKENS.infoBoxBg,
        border: `1px solid ${TOKENS.infoBoxBorder}`,
        borderRadius: TOKENS.cardRadius,
        padding: 14,
        marginTop: 16,
    }}>
        <div style={{ fontWeight: 600, color: TOKENS.infoBoxTitle, marginBottom: 6, fontSize: 12 }}>
            共享模式说明
        </div>
        <div style={{ fontSize: 12, color: '#444', lineHeight: 1.6 }}>
            • <Tag color="blue" style={{ fontSize: 10 }}>同组执行</Tag> 组内操作由同一组人员完成
            <br />
            • <Tag color="orange" style={{ fontSize: 10 }}>不同人员</Tag> 组内操作必须由不同人员完成
        </div>
    </div>
);

export const ShareGroupTabContent: React.FC<ShareGroupTabContentProps> = ({
    operationShareGroups,
    onEdit,
    onRemove,
    onAddOrCreate,
}) => {
    return (
        <div style={{ padding: 16 }}>
            <SectionTitle title="已加入的共享组" count={operationShareGroups.length} />

            {operationShareGroups.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 24, color: '#999' }}>
                    <TeamOutlined style={{ fontSize: 32, marginBottom: 8, display: 'block' }} />
                    <div style={{ fontSize: 12 }}>该操作未加入任何共享组</div>
                </div>
            ) : (
                operationShareGroups.map((group) => (
                    <ShareGroupCard
                        key={group.id}
                        group={group}
                        onEdit={() => onEdit(group)}
                        onRemove={() => onRemove(group.id)}
                    />
                ))
            )}

            <button
                onClick={onAddOrCreate}
                style={{
                    width: '100%',
                    padding: 10,
                    border: '1px dashed #d9d9d9',
                    borderRadius: TOKENS.cardRadius,
                    background: 'transparent',
                    color: TOKENS.primaryColor,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 500,
                    transition: 'all 0.15s ease',
                    marginTop: 8,
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = TOKENS.primaryColor;
                    e.currentTarget.style.background = 'rgba(24,144,255,0.04)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#d9d9d9';
                    e.currentTarget.style.background = 'transparent';
                }}
            >
                <PlusOutlined style={{ marginRight: 6 }} />
                加入/创建共享组
            </button>

            <InfoBox />
        </div>
    );
};

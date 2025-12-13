import React, { useMemo, useState } from 'react';
import { Modal, Input, Empty, Tag, Typography } from 'antd';
import { SearchOutlined, ClockCircleOutlined, UserOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface OperationSelectionModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (scheduleId: number) => void;
    operations: any[];
    currentOperationId?: number;
    title: string;
}

export const OperationSelectionModal: React.FC<OperationSelectionModalProps> = ({
    visible,
    onClose,
    onSelect,
    operations,
    currentOperationId,
    title
}) => {
    const [searchText, setSearchText] = useState('');

    // Group operations by stage and sort by time
    const groupedOperations = useMemo(() => {
        const filtered = operations.filter(op =>
            op.id !== currentOperationId &&
            (op.operation_name?.toLowerCase().includes(searchText.toLowerCase()) ||
                op.operation_code?.toLowerCase().includes(searchText.toLowerCase()) ||
                op.stage_name?.toLowerCase().includes(searchText.toLowerCase()))
        );

        const grouped = new Map<string, any[]>();

        filtered.forEach(op => {
            const stageKey = op.stage_name || '未分组';
            if (!grouped.has(stageKey)) {
                grouped.set(stageKey, []);
            }
            grouped.get(stageKey)!.push(op);
        });

        // Sort operations within each stage by time
        grouped.forEach((ops, stage) => {
            ops.sort((a, b) => {
                const aDay = a.operation_day || 0;
                const bDay = b.operation_day || 0;
                if (aDay !== bDay) return aDay - bDay;

                const aTime = a.recommended_time || 0;
                const bTime = b.recommended_time || 0;
                return aTime - bTime;
            });
        });

        return Array.from(grouped.entries()).sort((a, b) => {
            // Sort stages by the earliest operation in each stage
            const aFirstOp = a[1][0];
            const bFirstOp = b[1][0];
            const aDay = aFirstOp.operation_day || 0;
            const bDay = bFirstOp.operation_day || 0;
            return aDay - bDay;
        });
    }, [operations, currentOperationId, searchText]);

    const handleSelect = (scheduleId: number) => {
        onSelect(scheduleId);
        onClose();
        setSearchText('');
    };

    return (
        <Modal
            title={title}
            open={visible}
            onCancel={() => {
                onClose();
                setSearchText('');
            }}
            footer={null}
            width={1000}
            bodyStyle={{ padding: 0 }}
        >
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0' }}>
                <Input
                    prefix={<SearchOutlined />}
                    placeholder="搜索操作名称、编码或阶段..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    allowClear
                />
            </div>

            <div style={{
                overflowX: 'auto',
                whiteSpace: 'nowrap',
                padding: '16px 24px',
                display: 'flex',
                gap: '16px',
                height: '60vh',
                background: '#fff'
            }}>
                {groupedOperations.length === 0 ? (
                    <div style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <Empty description="未找到操作" />
                    </div>
                ) : (
                    groupedOperations.map(([stageName, ops]) => (
                        <div key={stageName} style={{
                            display: 'inline-flex',
                            flexDirection: 'column',
                            width: '320px',
                            flexShrink: 0,
                            height: '100%',
                            background: '#f5f7fa',
                            borderRadius: '8px',
                            padding: '12px',
                            border: '1px solid #e8e8e8'
                        }}>
                            <div style={{
                                marginBottom: 12,
                                paddingBottom: 8,
                                borderBottom: '1px solid #e8e8e8',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <Text strong style={{ fontSize: 16, color: '#1890ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }} title={stageName}>
                                    {stageName}
                                </Text>
                                <Tag style={{ margin: 0 }}>{ops.length}</Tag>
                            </div>

                            <div style={{
                                overflowY: 'auto',
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                                paddingRight: '4px'
                            }}>
                                {ops.map((op: any) => (
                                    <div
                                        key={op.id}
                                        onClick={() => handleSelect(op.id)}
                                        style={{
                                            padding: '12px',
                                            border: '1px solid #d9d9d9',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            background: '#fff',
                                            whiteSpace: 'normal',
                                            position: 'relative'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.borderColor = '#1890ff';
                                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(24, 144, 255, 0.15)';
                                            e.currentTarget.style.transform = 'translateY(-2px)';
                                            e.currentTarget.style.zIndex = '1';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.borderColor = '#d9d9d9';
                                            e.currentTarget.style.boxShadow = 'none';
                                            e.currentTarget.style.transform = 'translateY(0)';
                                            e.currentTarget.style.zIndex = '0';
                                        }}
                                    >
                                        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div>
                                                <Text strong style={{ fontSize: 14, display: 'block' }}>
                                                    {op.operation_code}
                                                </Text>
                                                <Text style={{ fontSize: 13, color: '#595959' }}>
                                                    {op.operation_name}
                                                </Text>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                            <Tag icon={<ClockCircleOutlined />} style={{ margin: 0, fontSize: 11 }}>
                                                Day {op.operation_day || 0} · {op.recommended_time || 0}:00
                                            </Tag>
                                            {op.standard_time && (
                                                <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>
                                                    {op.standard_time}h
                                                </Tag>
                                            )}
                                            {op.required_people && (
                                                <Tag icon={<UserOutlined />} color="green" style={{ margin: 0, fontSize: 11 }}>
                                                    {op.required_people}人
                                                </Tag>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </Modal>
    );
};

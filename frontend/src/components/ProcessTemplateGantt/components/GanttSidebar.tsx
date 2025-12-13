import React from 'react';
import { Button, Space, Tag, Typography } from 'antd';
import {
    CaretDownOutlined,
    CaretRightOutlined,
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    UserOutlined,
    ClockCircleOutlined
} from '@ant-design/icons';
import { GanttNode, FlattenedRow, ProcessStage } from '../types';
import { TOKENS, ROW_HEIGHT } from '../constants';

const { Text } = Typography;

interface GanttSidebarProps {
    virtualRows: FlattenedRow[];
    virtualOffsetY: number;
    totalHeight: number;
    selectedNode: GanttNode | null;
    setSelectedNode: (node: GanttNode | null) => void;
    toggleNodeExpanded: (row: FlattenedRow) => void;
    handleAddNode: (type: 'stage' | 'operation', parentNode: GanttNode) => void;
    handleEditNode: (node: GanttNode) => void;
    handleDeleteNode: (nodeId: string) => void;
    stageColorMap: Map<number, string>;
    hoveredRowId: string | null;
    setHoveredRowId: (id: string | null) => void;
}

export const GanttSidebar: React.FC<GanttSidebarProps> = ({
    virtualRows,
    virtualOffsetY,
    totalHeight,
    selectedNode,
    setSelectedNode,
    toggleNodeExpanded,
    handleAddNode,
    handleEditNode,
    handleDeleteNode,
    stageColorMap,
    hoveredRowId,
    setHoveredRowId
}) => {
    const renderRowMain = (node: GanttNode) => {
        const isTemplate = node.type === 'template';
        const isStage = node.type === 'stage';
        const nameColor = isTemplate ? TOKENS.textPrimary : isStage ? TOKENS.textPrimary : TOKENS.textSecondary;
        const fontWeight = isTemplate ? 600 : isStage ? 500 : 500;

        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                {isStage && node.data && (() => {
                    const stageColor = stageColorMap.get((node.data as ProcessStage).id) || TOKENS.primary;
                    return (
                        <Tag
                            color={stageColor}
                            style={{ margin: 0, flexShrink: 0, borderRadius: 8, paddingInline: 10, background: 'transparent', color: stageColor, border: `1px solid ${stageColor}` }}
                        >
                            {node.stage_code}
                        </Tag>
                    );
                })()}
                <Text
                    style={{
                        fontSize: isTemplate ? 15 : 13,
                        fontWeight,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        flex: 1,
                        minWidth: 0,
                        color: nameColor
                    }}
                    title={node.title}
                >
                    {node.title}
                </Text>
                {node.type === 'operation' && (
                    <Space size={4} style={{ flexShrink: 0 }}>
                        {/* 合并的独立操作显示总数 */}
                        {(node.data as any)?._consolidatedCount ? (
                            <Tag
                                style={{ margin: 0, fontSize: 11, borderRadius: 6, color: '#7c3aed', background: 'rgba(124, 58, 237, 0.12)', border: 'none' }}
                            >
                                共{(node.data as any)._consolidatedCount}个
                            </Tag>
                        ) : (
                            <>
                                <Tag
                                    icon={<UserOutlined />}
                                    style={{ margin: 0, fontSize: 11, borderRadius: 6, color: TOKENS.textSecondary, background: 'rgba(100, 116, 139, 0.12)', border: 'none' }}
                                >
                                    {node.required_people}人
                                </Tag>
                                <Tag
                                    icon={<ClockCircleOutlined />}
                                    style={{ margin: 0, fontSize: 11, borderRadius: 6, color: TOKENS.textSecondary, background: 'rgba(148, 163, 184, 0.12)', border: 'none' }}
                                >
                                    {node.standard_time}h
                                </Tag>
                            </>
                        )}
                    </Space>
                )}
            </div>
        );
    };

    const renderRowActions = (node: GanttNode) => {
        const actions: React.ReactNode[] = [];

        if (node.type === 'template') {
            actions.push(
                <Button
                    key="add-stage"
                    type="primary"
                    icon={<PlusOutlined />}
                    style={{
                        borderRadius: 8,
                        height: 32,
                        paddingInline: 16,
                        fontWeight: 500
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        handleAddNode('stage', node);
                    }}
                >
                    添加阶段
                </Button>
            );
        }

        if (node.type === 'stage') {
            actions.push(
                <Button
                    key="add-operation"
                    type="default"
                    icon={<PlusOutlined />}
                    style={{
                        borderRadius: 8,
                        height: 32,
                        paddingInline: 12,
                        borderColor: TOKENS.primary,
                        color: TOKENS.primary,
                        fontWeight: 500
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        handleAddNode('operation', node);
                    }}
                >
                    添加操作
                </Button>
            );
        }

        if (selectedNode?.id === node.id && node.editable) {
            actions.push(
                <Button
                    key="edit"
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    style={{ height: 24 }}
                    onClick={(e) => {
                        e.stopPropagation();
                        handleEditNode(node);
                    }}
                />
            );

            if (node.type !== 'template') {
                actions.push(
                    <Button
                        key="delete"
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        style={{ height: 24 }}
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteNode(node.id);
                        }}
                    />
                );
            }
        }

        if (!actions.length) {
            return null;
        }

        return (
            <Space size={8} style={{ flexShrink: 0 }}>
                {actions}
            </Space>
        );
    };

    const renderTreeRow = (row: FlattenedRow) => {
        const node = row.node;
        const isSelected = selectedNode?.id === node.id;
        const isTemplate = node.type === 'template';
        const isStage = node.type === 'stage';

        let backgroundColor = isSelected ? 'rgba(37, 99, 235, 0.08)' : 'transparent';
        if (!isSelected) {
            if (row.id === hoveredRowId) {
                backgroundColor = 'rgba(59, 130, 246, 0.12)';
            } else if (isTemplate) {
                backgroundColor = '#F9FAFB';
            } else if (isStage) {
                backgroundColor = 'rgba(148, 163, 184, 0.08)';
            }
        }

        return (
            <div
                key={row.id}
                role="row"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    height: ROW_HEIGHT,
                    paddingRight: 12,
                    paddingLeft: 12,
                    background: backgroundColor,
                    borderBottom: `1px solid ${TOKENS.border}`,
                    borderRadius: isTemplate ? 10 : 0,
                    cursor: 'pointer'
                }}
                onClick={() => {
                    setSelectedNode(node);
                }}
                onMouseEnter={() => setHoveredRowId(row.id)}
                onMouseLeave={() => setHoveredRowId(null)}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flex: 1,
                        minWidth: 0,
                        paddingLeft: row.depth * 16
                    }}
                >
                    {row.hasChildren ? (
                        <Button
                            type="text"
                            size="small"
                            icon={row.isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
                            style={{
                                width: 28,
                                height: 28,
                                padding: 0,
                                color: TOKENS.secondary
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleNodeExpanded(row);
                            }}
                        />
                    ) : (
                        <span style={{ width: 28 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        {renderRowMain(node)}
                    </div>
                </div>
                <div style={{ marginLeft: 8 }}>{renderRowActions(node)}</div>
            </div>
        );
    };

    return (
        <div style={{ position: 'relative', height: totalHeight, overflow: 'hidden' }}>
            <div style={{ transform: `translateY(${virtualOffsetY}px)` }}>
                {virtualRows.map((row) => renderTreeRow(row))}
            </div>
        </div>
    );
};

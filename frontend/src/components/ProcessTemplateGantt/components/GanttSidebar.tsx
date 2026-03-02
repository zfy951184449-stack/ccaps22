import React from 'react';
import { Button, Space, Typography, Checkbox, Tag } from 'antd';
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
import { DSButton } from '../../design-system';

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
    // Imperative hover handler
    setHoveredRow: (id: string | null) => void;
    // 快捷创建共享组模式
    isShareGroupMode?: boolean;
    selectedOperationIds?: string[];
    onOperationCheck?: (operationId: string, checked: boolean) => void;
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
    setHoveredRow,
    // 快捷创建共享组
    isShareGroupMode = false,
    selectedOperationIds = [],
    onOperationCheck
}) => {
    const renderRowMain = (node: GanttNode) => {
        const isTemplate = node.type === 'template';
        const isStage = node.type === 'stage';
        const isOperation = node.type === 'operation';
        const nameColor = isTemplate ? TOKENS.textPrimary : isStage ? TOKENS.textPrimary : TOKENS.textSecondary;
        const fontWeight = isTemplate ? 600 : isStage ? 500 : 500;
        const isChecked = selectedOperationIds.includes(node.id);

        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                {/* 共享组模式下显示勾选框 */}
                {isShareGroupMode && isOperation && onOperationCheck && (
                    <Checkbox
                        checked={isChecked}
                        onChange={(e) => {
                            e.stopPropagation();
                            onOperationCheck(node.id, e.target.checked);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        style={{ flexShrink: 0 }}
                    />
                )}
                {isStage && node.data && (() => {
                    const stageColor = stageColorMap.get((node.data as ProcessStage).id) || TOKENS.primary;
                    return (
                        <div
                            style={{
                                flexShrink: 0,
                                borderRadius: 4,
                                width: 4,
                                height: 14,
                                backgroundColor: stageColor,
                                marginRight: 2
                            }}
                        />
                    );
                })()}
                <Text
                    style={{
                        fontSize: isTemplate ? 14 : 13,
                        fontWeight,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        flex: 1,
                        minWidth: 0,
                        color: nameColor,
                        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif'
                    }}
                    title={node.title}
                >
                    {node.title}
                </Text>
                {/* 辅助信息降噪：使用纯文本+图标，去除 Tag 背景 */}
                {node.type === 'operation' && (
                    <Space size={8} style={{ flexShrink: 0, marginLeft: 4 }}>
                        {(node.data as any)?.resource_summary ? (
                            <Tag color={(node.data as any)?.resource_rule_source_scope === 'TEMPLATE_OVERRIDE' ? 'blue' : 'default'}>
                                {(node.data as any).resource_summary}
                            </Tag>
                        ) : (node.data as any)?.resource_rule_source_scope === 'NONE' ? (
                            <Tag>未定义资源</Tag>
                        ) : null}
                        {(node.data as any)?._consolidatedCount ? (
                            <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 500 }}>
                                {(node.data as any)._consolidatedCount} items
                            </span>
                        ) : (
                            <>
                                <Space size={2} style={{ fontSize: 11, color: TOKENS.textSecondary, opacity: 0.8 }}>
                                    <UserOutlined style={{ fontSize: 10 }} />
                                    <span>{node.required_people}</span>
                                </Space>
                                <Space size={2} style={{ fontSize: 11, color: TOKENS.textSecondary, opacity: 0.8 }}>
                                    <ClockCircleOutlined style={{ fontSize: 10 }} />
                                    <span>{node.standard_time}h</span>
                                </Space>
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
                <DSButton
                    key="add-stage"
                    icon={<PlusOutlined />}
                    tooltip="添加阶段"
                    variant="ghost"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleAddNode('stage', node);
                    }}
                />
            );
        }

        if (node.type === 'stage') {
            actions.push(
                <DSButton
                    key="add-operation"
                    icon={<PlusOutlined />}
                    tooltip="添加操作"
                    variant="ghost"
                    style={{ color: TOKENS.primary }}
                    onClick={(e) => {
                        e.stopPropagation();
                        handleAddNode('operation', node);
                    }}
                />
            );
        }

        if (selectedNode?.id === node.id && node.editable) {
            actions.push(
                <DSButton
                    key="edit"
                    icon={<EditOutlined />}
                    tooltip="编辑"
                    variant="ghost"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleEditNode(node);
                    }}
                />
            );

            if (node.type !== 'template') {
                actions.push(
                    <DSButton
                        key="delete"
                        icon={<DeleteOutlined />}
                        tooltip="删除"
                        variant="ghost"
                        danger
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



        // Apple Style Selection: Blue Tint with rounded corners
        // Zebra Striping will be handled by CSS :nth-child(even)
        // We only explicitly set background for selected state or if we want to override zebra
        let backgroundColor = isSelected ? 'rgba(0, 122, 255, 0.1)' : undefined;

        return (
            <div
                key={row.id}
                role="row"
                className={`gantt-sidebar-row ${isSelected ? 'is-selected' : ''}`}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    height: ROW_HEIGHT,
                    paddingRight: 8,
                    paddingLeft: 8,
                    background: backgroundColor,
                    // Remove borderBottom for cleaner look
                    // borderBottom: `1px solid ${TOKENS.border}`,
                    cursor: 'pointer',
                    transition: 'background-color 0.1s ease',
                    position: 'relative' // For positioning if needed
                }}
                // Add data-row-id for imperative DOM manipulation
                data-row-id={node.id}
                onClick={() => {
                    setSelectedNode(node);
                }}
                onMouseEnter={() => setHoveredRow(node.id)}
                onMouseLeave={() => setHoveredRow(null)}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flex: 1, // Allow text to take remaining space
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
                                width: 24,
                                height: 24,
                                padding: 0,
                                color: TOKENS.secondary,
                                flexShrink: 0
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleNodeExpanded(row);
                            }}
                        />
                    ) : (
                        <span style={{ width: 24, flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                        {renderRowMain(node)}
                    </div>
                </div>
                <div className="row-actions" style={{ marginLeft: 8 }}>{renderRowActions(node)}</div>
            </div>
        );
    };

    return (
        <>
            <style>{`
                .gantt-sidebar-row {
                    margin: 0 8px; /* Floating effect margin */
                    border-radius: 6px; /* Rounded corners */
                }
                /* Zebra Striping: Even rows get a subtle background */
                .gantt-sidebar-row:nth-child(even) {
                    background-color: rgba(0, 0, 0, 0.015);
                }
                /* Hover overrides Zebra */
                .gantt-sidebar-row:hover,
                .gantt-sidebar-row.is-hovered {
                    background-color: rgba(0, 0, 0, 0.04) !important; /* Softer hover gray */
                }
                /* Selection overrides everything */
                .gantt-sidebar-row.is-selected {
                    background-color: rgba(0, 122, 255, 0.1) !important;
                }
                
                /* Hide actions by default */
                .gantt-sidebar-row .row-actions {
                    opacity: 0;
                    transition: opacity 0.15s ease;
                    pointer-events: none;
                }
                /* Show actions on hover or when selected */
                .gantt-sidebar-row:hover .row-actions,
                .gantt-sidebar-row.is-hovered .row-actions,
                .gantt-sidebar-row.is-selected .row-actions {
                    opacity: 1;
                    pointer-events: auto;
                }
            `}</style>
            <div style={{ position: 'relative', height: totalHeight, overflow: 'hidden' }}>
                <div style={{ transform: `translateY(${virtualOffsetY}px)` }}>
                    {virtualRows.map((row) => renderTreeRow(row))}
                </div>
            </div>
        </>
    );
};

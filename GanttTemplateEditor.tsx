import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { 
  Card, 
  Tree, 
  Typography, 
  Space, 
  Tag, 
  Button,
  Tooltip,
  Empty,
  message,
  Dropdown,
  InputNumber,
  Row,
  Col,
  Divider,
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  TimePicker,
  Switch,
  Popconfirm
} from 'antd';
import type { MenuProps } from 'antd';
import { 
  CaretRightOutlined,
  CaretDownOutlined, 
  UserOutlined, 
  ClockCircleOutlined, 
  SafetyCertificateOutlined,
  EditOutlined,
  DeleteOutlined,
  PlusOutlined,
  SaveOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  DragOutlined,
  CopyOutlined,
  ScissorOutlined,
  SettingOutlined,
  LinkOutlined,
  DisconnectOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import type { 
  ProcessTemplateDetail,
  ProcessStage,
  ProcessOperation
} from '@/types/gantt.types';

const { Title, Text } = Typography;
const { Option } = Select;

interface GanttTemplateEditorProps {
  onSave?: (template: ProcessTemplateDetail) => Promise<void>;
}

interface GanttNode {
  id: string;
  title: string;
  type: 'template' | 'stage' | 'operation';
  parent_id?: string;
  stage_code?: string;
  hc_requirement?: number;
  estimated_duration_hours?: number;
  required_qualifications?: string[];
  dependencies?: string[];
  start_day?: number;
  start_hour?: number;
  children?: GanttNode[];
  expanded?: boolean;
  editable?: boolean;
  level?: number;
}

interface TimeBlock {
  id: string;
  node_id: string;
  title: string;
  start_day: number;
  start_hour: number;
  duration_hours: number;
  color: string;
  dependencies?: string[];
}

// 定义阶段颜色映射
const STAGE_COLORS: Record<string, string> = {
  'TF': '#1890ff',      // 蓝色
  'SF': '#52c41a',      // 绿色 
  'WAVE': '#faad14',    // 橙色
  'SUB': '#f5222d',     // 红色
  'HARVEST': '#722ed1', // 紫色
  'DEFAULT': '#8c8c8c'  // 灰色
};

// 时间轴配置
const HOUR_WIDTH = 30; // 每小时的像素宽度
const ROW_HEIGHT = 36; // 每行的高度
const DAYS_TO_SHOW = 35; // 显示35天

const GanttTemplateEditor: React.FC<GanttTemplateEditorProps> = ({ 
  onSave 
}) => {
  const { templateId: templateIdParam } = useParams();
  const templateId = parseInt(templateIdParam || '7');
  const [template, setTemplate] = useState<ProcessTemplateDetail | null>(null);
  const [ganttNodes, setGanttNodes] = useState<GanttNode[]>([]);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [selectedNode, setSelectedNode] = useState<GanttNode | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingNode, setEditingNode] = useState<GanttNode | null>(null);
  const [zoom, setZoom] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedBlock, setDraggedBlock] = useState<TimeBlock | null>(null);
  const [showDependencies, setShowDependencies] = useState(true);
  const [autoLayout, setAutoLayout] = useState(false);

  // 加载模板数据
  useEffect(() => {
    loadTemplate();
  }, [templateId]);

  const loadTemplate = async () => {
    try {
      // 模拟加载模板数据
      const mockTemplate: ProcessTemplateDetail = {
        template_id: templateId,
        template_name: `批次工艺模板 ${templateId}`,
        product_type: 'mAb',
        estimated_duration_days: 30,
        stages: [
          {
            stage_template_id: 1,
            stage_code: 'TF',
            stage_name: 'T-Flask摇瓶培养',
            sequence_number: 1,
            estimated_duration_hours: 120,
            operations: [
              {
                operation_template_id: 1,
                operation_name: '细胞复苏',
                sequence_number: 1,
                estimated_duration_hours: 6,
                hc_requirement: 3,
                required_qualifications: ['细胞培养认证', 'BSC操作认证'],
                dependencies: []
              },
              {
                operation_template_id: 2,
                operation_name: 'T75传代',
                sequence_number: 2,
                estimated_duration_hours: 4,
                hc_requirement: 2,
                required_qualifications: ['细胞培养认证'],
                dependencies: ['1']
              }
            ]
          },
          {
            stage_template_id: 2,
            stage_code: 'SF',
            stage_name: '摇瓶扩增培养',
            sequence_number: 2,
            estimated_duration_hours: 192,
            operations: [
              {
                operation_template_id: 3,
                operation_name: '500mL SF接种',
                sequence_number: 1,
                estimated_duration_hours: 3,
                hc_requirement: 2,
                required_qualifications: ['细胞培养认证'],
                dependencies: ['2']
              },
              {
                operation_template_id: 4,
                operation_name: '1L SF传代',
                sequence_number: 2,
                estimated_duration_hours: 3,
                hc_requirement: 2,
                required_qualifications: ['细胞培养认证'],
                dependencies: ['3']
              },
              {
                operation_template_id: 5,
                operation_name: '3L SF传代',
                sequence_number: 3,
                estimated_duration_hours: 3,
                hc_requirement: 2,
                required_qualifications: ['细胞培养认证'],
                dependencies: ['4']
              }
            ]
          },
          {
            stage_template_id: 3,
            stage_code: 'WAVE',
            stage_name: '20L WAVE培养',
            sequence_number: 3,
            estimated_duration_hours: 72,
            operations: [
              {
                operation_template_id: 6,
                operation_name: 'WAVE装袋灌注',
                sequence_number: 1,
                estimated_duration_hours: 8,
                hc_requirement: 2,
                required_qualifications: ['WAVE操作认证', '灭菌操作认证'],
                dependencies: ['5']
              },
              {
                operation_template_id: 7,
                operation_name: 'WAVE接种',
                sequence_number: 2,
                estimated_duration_hours: 4,
                hc_requirement: 2,
                required_qualifications: ['WAVE操作认证'],
                dependencies: ['6']
              },
              {
                operation_template_id: 8,
                operation_name: 'WAVE日常监控',
                sequence_number: 3,
                estimated_duration_hours: 2,
                hc_requirement: 1,
                required_qualifications: ['WAVE操作认证'],
                dependencies: ['7']
              }
            ]
          },
          {
            stage_template_id: 4,
            stage_code: 'SUB',
            stage_name: 'SUB生物反应器培养',
            sequence_number: 4,
            estimated_duration_hours: 360,
            operations: [
              {
                operation_template_id: 9,
                operation_name: '50L SUB准备',
                sequence_number: 1,
                estimated_duration_hours: 12,
                hc_requirement: 3,
                required_qualifications: ['SUB操作认证', '电极校准认证'],
                dependencies: ['8']
              },
              {
                operation_template_id: 10,
                operation_name: '50L SUB接种',
                sequence_number: 2,
                estimated_duration_hours: 6,
                hc_requirement: 2,
                required_qualifications: ['SUB操作认证'],
                dependencies: ['9']
              },
              {
                operation_template_id: 11,
                operation_name: '250L SUB转种',
                sequence_number: 3,
                estimated_duration_hours: 8,
                hc_requirement: 3,
                required_qualifications: ['SUB操作认证'],
                dependencies: ['10']
              }
            ]
          }
        ]
      };

      setTemplate(mockTemplate);
      const nodes = buildGanttNodes(mockTemplate);
      setGanttNodes(nodes);
      setTimeBlocks(generateTimeBlocks(nodes));
      // 默认展开模板节点（始终展开）和所有阶段节点
      const defaultExpandedKeys = [mockTemplate.template_id.toString()];
      nodes[0].children?.forEach(stageNode => {
        defaultExpandedKeys.push(stageNode.id);
      });
      setExpandedKeys(defaultExpandedKeys);
    } catch (error) {
      message.error('加载模板失败');
      console.error(error);
    }
  };

  const buildGanttNodes = (template: ProcessTemplateDetail): GanttNode[] => {
    const nodes: GanttNode[] = [];
    
    // 根节点
    const templateNode: GanttNode = {
      id: template.template_id.toString(),
      title: template.template_name,
      type: 'template',
      expanded: true,
      children: [],
      level: 0
    };

    let cumulativeDay = 0;
    let cumulativeHour = 0;

    // 阶段节点
    template.stages.forEach((stage) => {
      const stageNode: GanttNode = {
        id: `stage_${stage.stage_template_id}`,
        title: `${stage.stage_code} - ${stage.stage_name}`,
        type: 'stage',
        parent_id: template.template_id.toString(),
        stage_code: stage.stage_code,
        estimated_duration_hours: stage.estimated_duration_hours,
        start_day: cumulativeDay,
        start_hour: cumulativeHour,
        expanded: true,
        children: [],
        editable: true,
        level: 1
      };

      // 操作节点
      stage.operations.forEach((operation) => {
        const operationNode: GanttNode = {
          id: `operation_${operation.operation_template_id}`,
          title: operation.operation_name,
          type: 'operation',
          parent_id: `stage_${stage.stage_template_id}`,
          hc_requirement: operation.hc_requirement,
          estimated_duration_hours: operation.estimated_duration_hours,
          required_qualifications: operation.required_qualifications,
          dependencies: operation.dependencies,
          start_day: cumulativeDay,
          start_hour: cumulativeHour,
          editable: true,
          level: 2
        };

        stageNode.children?.push(operationNode);

        // 更新累计时间
        cumulativeHour += operation.estimated_duration_hours;
        if (cumulativeHour >= 24) {
          cumulativeDay += Math.floor(cumulativeHour / 24);
          cumulativeHour = cumulativeHour % 24;
        }
      });

      templateNode.children?.push(stageNode);
    });

    nodes.push(templateNode);
    return nodes;
  };

  const generateTimeBlocks = (nodes: GanttNode[]): TimeBlock[] => {
    const blocks: TimeBlock[] = [];
    
    const processNode = (node: GanttNode) => {
      if (node.type === 'operation' && node.estimated_duration_hours) {
        blocks.push({
          id: `block_${node.id}`,
          node_id: node.id,
          title: node.title,
          start_day: node.start_day || 0,
          start_hour: node.start_hour || 0,
          duration_hours: node.estimated_duration_hours,
          color: STAGE_COLORS[node.parent_id?.includes('TF') ? 'TF' : 
                              node.parent_id?.includes('SF') ? 'SF' :
                              node.parent_id?.includes('WAVE') ? 'WAVE' :
                              node.parent_id?.includes('SUB') ? 'SUB' : 'DEFAULT'],
          dependencies: node.dependencies
        });
      }
      
      if (node.children) {
        node.children.forEach(processNode);
      }
    };

    nodes.forEach(node => {
      if (node.children) {
        node.children.forEach(stageNode => {
          if (stageNode.children) {
            stageNode.children.forEach(processNode);
          }
        });
      }
    });

    return blocks;
  };

  const handleNodeSelect = (selectedKeys: React.Key[]) => {
    if (selectedKeys.length > 0) {
      const nodeId = selectedKeys[0].toString();
      const node = findNodeById(ganttNodes, nodeId);
      setSelectedNode(node);
    } else {
      setSelectedNode(null);
    }
  };

  const findNodeById = (nodes: GanttNode[], id: string): GanttNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = findNodeById(node.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  const handleAddNode = (parentNode: GanttNode, type: 'stage' | 'operation') => {
    const newNode: GanttNode = {
      id: `${type}_new_${Date.now()}`,
      title: type === 'stage' ? '新阶段' : '新操作',
      type: type,
      parent_id: parentNode.id,
      estimated_duration_hours: type === 'stage' ? 120 : 4,
      hc_requirement: type === 'operation' ? 2 : undefined,
      required_qualifications: type === 'operation' ? [] : undefined,
      start_day: 0,
      start_hour: 0,
      editable: true,
      children: type === 'stage' ? [] : undefined
    };

    setEditingNode(newNode);
    setEditModalVisible(true);
  };

  const handleEditNode = (node: GanttNode) => {
    setEditingNode(node);
    setEditModalVisible(true);
  };

  const handleDeleteNode = (nodeId: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除该节点吗？删除后不可恢复。',
      onOk: () => {
        const deleteNodeRecursive = (nodes: GanttNode[]): GanttNode[] => {
          return nodes.filter(node => {
            if (node.id === nodeId) return false;
            if (node.children) {
              node.children = deleteNodeRecursive(node.children);
            }
            return true;
          });
        };

        setGanttNodes(deleteNodeRecursive(ganttNodes));
        setTimeBlocks(blocks => blocks.filter(block => !block.node_id.includes(nodeId)));
        message.success('删除成功');
      }
    });
  };

  const handleSaveNode = (values: any) => {
    if (editingNode) {
      const updateNodeRecursive = (nodes: GanttNode[]): GanttNode[] => {
        return nodes.map(node => {
          if (node.id === editingNode.id) {
            return { ...node, ...values };
          }
          if (node.children) {
            node.children = updateNodeRecursive(node.children);
          }
          return node;
        });
      };

      if (editingNode.id.includes('new')) {
        // 添加新节点
        const addNodeRecursive = (nodes: GanttNode[]): GanttNode[] => {
          return nodes.map(node => {
            if (node.id === editingNode.parent_id) {
              if (!node.children) node.children = [];
              node.children.push({ ...editingNode, ...values });
            } else if (node.children) {
              node.children = addNodeRecursive(node.children);
            }
            return node;
          });
        };
        setGanttNodes(addNodeRecursive(ganttNodes));
      } else {
        // 更新现有节点
        setGanttNodes(updateNodeRecursive(ganttNodes));
      }

      // 重新生成时间块
      setTimeout(() => {
        setTimeBlocks(generateTimeBlocks(ganttNodes));
      }, 100);
    }

    setEditModalVisible(false);
    setEditingNode(null);
    message.success('保存成功');
  };

  const handleBlockDrag = (block: TimeBlock, newDay: number, newHour: number) => {
    setTimeBlocks(blocks => 
      blocks.map(b => 
        b.id === block.id 
          ? { ...b, start_day: newDay, start_hour: newHour }
          : b
      )
    );

    // 更新节点的时间信息
    const updateNodeTime = (nodes: GanttNode[]): GanttNode[] => {
      return nodes.map(node => {
        if (`block_${node.id}` === block.id) {
          return { ...node, start_day: newDay, start_hour: newHour };
        }
        if (node.children) {
          node.children = updateNodeTime(node.children);
        }
        return node;
      });
    };

    setGanttNodes(updateNodeTime(ganttNodes));
  };

  const handleAutoLayout = () => {
    let currentDay = 0;
    let currentHour = 0;

    const updatedBlocks = timeBlocks.map(block => {
      const newBlock = {
        ...block,
        start_day: currentDay,
        start_hour: currentHour
      };

      currentHour += block.duration_hours;
      if (currentHour >= 24) {
        currentDay += Math.floor(currentHour / 24);
        currentHour = currentHour % 24;
      }

      return newBlock;
    });

    setTimeBlocks(updatedBlocks);
    message.success('自动布局完成');
  };

  const handleSaveTemplate = async () => {
    if (onSave && template) {
      try {
        await onSave(template);
        message.success('模板保存成功');
      } catch (error) {
        message.error('保存失败');
      }
    }
  };

  const renderTreeNodeTitle = (node: GanttNode) => {
    const isSelected = selectedNode?.id === node.id;

    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        width: '100%',
        padding: '2px 0'
      }}>
        <Space size="small">
          {node.type === 'stage' && <Tag color="blue">{node.stage_code}</Tag>}
          <Text strong={node.type === 'template'}>{node.title}</Text>
          {node.type === 'operation' && (
            <>
              <Tag icon={<UserOutlined />} color="cyan">
                {node.hc_requirement}人
              </Tag>
              <Tag icon={<ClockCircleOutlined />} color="orange">
                {node.estimated_duration_hours}h
              </Tag>
              {node.required_qualifications && node.required_qualifications.length > 0 && (
                <Tooltip title={node.required_qualifications.join(', ')}>
                  <Tag icon={<SafetyCertificateOutlined />} color="green">
                    资质
                  </Tag>
                </Tooltip>
              )}
            </>
          )}
        </Space>

        {isSelected && node.editable && (
          <Space size="small">
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'edit',
                    icon: <EditOutlined />,
                    label: '编辑',
                    onClick: () => handleEditNode(node)
                  },
                  node.type === 'template' && {
                    key: 'addStage',
                    icon: <PlusOutlined />,
                    label: '添加阶段',
                    onClick: () => handleAddNode(node, 'stage')
                  },
                  node.type === 'stage' && {
                    key: 'addOperation',
                    icon: <PlusOutlined />,
                    label: '添加操作',
                    onClick: () => handleAddNode(node, 'operation')
                  },
                  {
                    type: 'divider'
                  },
                  {
                    key: 'delete',
                    icon: <DeleteOutlined />,
                    label: '删除',
                    danger: true,
                    onClick: () => handleDeleteNode(node.id)
                  }
                ].filter(Boolean) as MenuProps['items']
              }}
              trigger={['click']}
            >
              <Button type="text" size="small" icon={<SettingOutlined />} />
            </Dropdown>
          </Space>
        )}
      </div>
    );
  };

  const buildTreeData = (nodes: GanttNode[]): DataNode[] => {
    return nodes.map(node => ({
      title: renderTreeNodeTitle(node),
      key: node.id,
      children: node.children ? buildTreeData(node.children) : undefined,
    }));
  };

  const renderTimeAxis = () => {
    const days = [];
    for (let i = 0; i < DAYS_TO_SHOW; i++) {
      days.push(
        <div
          key={i}
          style={{
            width: 24 * HOUR_WIDTH * zoom / 100,
            height: 40,
            border: '1px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#fafafa',
            fontWeight: 500,
            fontSize: 12
          }}
        >
          D+{i}
        </div>
      );
    }
    return <div style={{ display: 'flex' }}>{days}</div>;
  };

  const renderTimeBlocks = () => {
    return (
      <div style={{ 
        position: 'relative', 
        minHeight: timeBlocks.length * ROW_HEIGHT + 100,
        width: DAYS_TO_SHOW * 24 * HOUR_WIDTH * zoom / 100
      }}>
        {/* 渲染网格线 */}
        {Array.from({ length: DAYS_TO_SHOW }).map((_, dayIndex) => (
          <div
            key={`grid_${dayIndex}`}
            style={{
              position: 'absolute',
              left: dayIndex * 24 * HOUR_WIDTH * zoom / 100,
              top: 0,
              width: 1,
              height: '100%',
              background: '#f0f0f0'
            }}
          />
        ))}

        {/* 渲染时间块 */}
        {timeBlocks.map((block, index) => {
          const left = (block.start_day * 24 + block.start_hour) * HOUR_WIDTH * zoom / 100;
          const width = block.duration_hours * HOUR_WIDTH * zoom / 100;
          const top = index * ROW_HEIGHT + 10;

          return (
            <div
              key={block.id}
              draggable={!autoLayout}
              onDragStart={() => {
                setIsDragging(true);
                setDraggedBlock(block);
              }}
              onDragEnd={(e) => {
                setIsDragging(false);
                if (draggedBlock) {
                  const rect = e.currentTarget.parentElement?.getBoundingClientRect();
                  if (rect) {
                    const x = e.clientX - rect.left;
                    const totalHours = x / (HOUR_WIDTH * zoom / 100);
                    const newDay = Math.floor(totalHours / 24);
                    const newHour = Math.floor(totalHours % 24);
                    handleBlockDrag(draggedBlock, Math.max(0, newDay), Math.max(0, newHour));
                  }
                }
                setDraggedBlock(null);
              }}
              style={{
                position: 'absolute',
                left: left,
                top: top,
                width: width,
                height: ROW_HEIGHT - 6,
                background: block.color,
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                padding: '0 8px',
                color: 'white',
                fontSize: 12,
                cursor: autoLayout ? 'default' : 'move',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                border: '1px solid rgba(255,255,255,0.3)',
                opacity: isDragging && draggedBlock?.id === block.id ? 0.5 : 1,
                transition: 'all 0.2s'
              }}
            >
              <Tooltip title={`${block.title}\n开始: D+${block.start_day} ${block.start_hour}:00\n时长: ${block.duration_hours}小时`}>
                <span style={{ 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis', 
                  whiteSpace: 'nowrap',
                  width: '100%'
                }}>
                  {block.title}
                </span>
              </Tooltip>
              {!autoLayout && (
                <DragOutlined style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }} />
              )}
            </div>
          );
        })}

        {/* 渲染依赖关系线 */}
        {showDependencies && timeBlocks.map(block => {
          if (block.dependencies && block.dependencies.length > 0) {
            return block.dependencies.map(depId => {
              const depBlock = timeBlocks.find(b => b.node_id.includes(`operation_${depId}`));
              if (depBlock) {
                const startX = (depBlock.start_day * 24 + depBlock.start_hour + depBlock.duration_hours) * HOUR_WIDTH * zoom / 100;
                const startY = timeBlocks.indexOf(depBlock) * ROW_HEIGHT + ROW_HEIGHT / 2 + 10;
                const endX = (block.start_day * 24 + block.start_hour) * HOUR_WIDTH * zoom / 100;
                const endY = timeBlocks.indexOf(block) * ROW_HEIGHT + ROW_HEIGHT / 2 + 10;

                return (
                  <svg
                    key={`dep_${depBlock.id}_${block.id}`}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      pointerEvents: 'none'
                    }}
                  >
                    <line
                      x1={startX}
                      y1={startY}
                      x2={endX}
                      y2={endY}
                      stroke="#1890ff"
                      strokeWidth="2"
                      strokeDasharray="5,5"
                      markerEnd="url(#arrowhead)"
                    />
                    <defs>
                      <marker
                        id="arrowhead"
                        markerWidth="10"
                        markerHeight="10"
                        refX="9"
                        refY="3"
                        orient="auto"
                      >
                        <polygon
                          points="0 0, 10 3, 0 6"
                          fill="#1890ff"
                        />
                      </marker>
                    </defs>
                  </svg>
                );
              }
              return null;
            });
          }
          return null;
        })}
      </div>
    );
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 工具栏 */}
      <div style={{ 
        padding: '12px 16px', 
        background: '#fff', 
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Space>
          <Title level={4} style={{ margin: 0 }}>
            甘特图编辑器 - {template?.template_name || `模板 ${templateId}`}
          </Title>
        </Space>

        <Space>
          <Button 
            icon={<SaveOutlined />} 
            type="primary"
            onClick={handleSaveTemplate}
          >
            保存模板
          </Button>
          
          <Divider type="vertical" />
          
          <Tooltip title="显示依赖关系">
            <Button
              icon={showDependencies ? <LinkOutlined /> : <DisconnectOutlined />}
              onClick={() => setShowDependencies(!showDependencies)}
              type={showDependencies ? 'primary' : 'default'}
            >
              依赖
            </Button>
          </Tooltip>

          <Tooltip title="自动布局">
            <Button
              icon={<SettingOutlined />}
              onClick={handleAutoLayout}
            >
              自动布局
            </Button>
          </Tooltip>

          <Divider type="vertical" />

          <Space>
            <Button
              icon={<ZoomOutOutlined />}
              onClick={() => setZoom(Math.max(50, zoom - 10))}
              disabled={zoom <= 50}
            />
            <InputNumber
              value={zoom}
              onChange={(value) => setZoom(value || 100)}
              formatter={value => `${value}%`}
              parser={value => value?.replace('%', '') as any}
              style={{ width: 80 }}
              min={50}
              max={200}
              step={10}
            />
            <Button
              icon={<ZoomInOutlined />}
              onClick={() => setZoom(Math.min(200, zoom + 10))}
              disabled={zoom >= 200}
            />
          </Space>

          <Button
            icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            onClick={() => setIsFullscreen(!isFullscreen)}
          >
            {isFullscreen ? '退出全屏' : '全屏'}
          </Button>
        </Space>
      </div>

      {/* 主体内容 */}
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        overflow: 'hidden',
        background: '#fafafa' 
      }}>
        {/* 左侧树形结构 */}
        <div style={{ 
          width: '35%', 
          background: '#fff',
          borderRight: '1px solid #f0f0f0',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ 
            padding: '8px 16px', 
            background: '#fafafa',
            borderBottom: '1px solid #f0f0f0',
            fontWeight: 500
          }}>
            工艺结构
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
            <Tree
              showLine={{ showLeafIcon: false }}
              switcherIcon={(props) => {
                const nodeKey = props.data?.key?.toString();
                // 模板节点不显示展开图标（始终展开）
                if (nodeKey && !nodeKey.startsWith('stage_')) {
                  return null;
                }
                // 只在阶段节点显示展开图标
                return props.expanded ? <CaretDownOutlined /> : <CaretRightOutlined />;
              }}
              expandedKeys={expandedKeys}
              onExpand={(keys) => {
                // 将keys转换为字符串数组
                const stringKeys = keys.map(k => k.toString());
                const templateKey = ganttNodes[0]?.id;
                
                // 确保模板节点始终在展开列表中
                if (templateKey && !stringKeys.includes(templateKey)) {
                  stringKeys.unshift(templateKey);
                }
                
                setExpandedKeys(stringKeys);
              }}
              onSelect={handleNodeSelect}
              treeData={buildTreeData(ganttNodes)}
              blockNode
              selectable={true}
            />
          </div>
        </div>

        {/* 右侧甘特图 */}
        <div style={{ 
          flex: 1, 
          display: 'flex',
          flexDirection: 'column',
          background: '#fff'
        }}>
          <div style={{ 
            padding: '8px 16px', 
            background: '#fafafa',
            borderBottom: '1px solid #f0f0f0',
            fontWeight: 500
          }}>
            时间轴
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {renderTimeAxis()}
            {renderTimeBlocks()}
          </div>
        </div>
      </div>

      {/* 编辑模态框 */}
      <Modal
        title={editingNode?.type === 'stage' ? '编辑阶段' : '编辑操作'}
        open={editModalVisible}
        onCancel={() => {
          setEditModalVisible(false);
          setEditingNode(null);
        }}
        footer={null}
        width={600}
      >
        <Form
          layout="vertical"
          initialValues={editingNode}
          onFinish={handleSaveNode}
        >
          <Form.Item
            name="title"
            label="名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input />
          </Form.Item>

          {editingNode?.type === 'stage' && (
            <Form.Item
              name="stage_code"
              label="阶段代码"
              rules={[{ required: true, message: '请选择阶段代码' }]}
            >
              <Select>
                <Option value="TF">TF - T-Flask</Option>
                <Option value="SF">SF - Shake Flask</Option>
                <Option value="WAVE">WAVE - Wave反应器</Option>
                <Option value="SUB">SUB - 生物反应器</Option>
                <Option value="HARVEST">HARVEST - 收获</Option>
              </Select>
            </Form.Item>
          )}

          <Form.Item
            name="estimated_duration_hours"
            label="预计时长（小时）"
            rules={[{ required: true, message: '请输入预计时长' }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>

          {editingNode?.type === 'operation' && (
            <>
              <Form.Item
                name="hc_requirement"
                label="人员需求（HC）"
                rules={[{ required: true, message: '请输入人员需求' }]}
              >
                <InputNumber min={1} max={10} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item
                name="required_qualifications"
                label="资质要求"
              >
                <Select mode="multiple" placeholder="选择所需资质">
                  <Option value="细胞培养认证">细胞培养认证</Option>
                  <Option value="BSC操作认证">BSC操作认证</Option>
                  <Option value="WAVE操作认证">WAVE操作认证</Option>
                  <Option value="SUB操作认证">SUB操作认证</Option>
                  <Option value="电极校准认证">电极校准认证</Option>
                  <Option value="灭菌操作认证">灭菌操作认证</Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="dependencies"
                label="依赖操作"
              >
                <Select mode="multiple" placeholder="选择依赖的操作">
                  {timeBlocks.map(block => (
                    <Option key={block.node_id} value={block.node_id.replace('operation_', '')}>
                      {block.title}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </>
          )}

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                保存
              </Button>
              <Button onClick={() => {
                setEditModalVisible(false);
                setEditingNode(null);
              }}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default GanttTemplateEditor;
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Tree, 
  Typography, 
  Space, 
  Tag, 
  Button,
  Tooltip,
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
  Table,
  Segmented
} from 'antd';
import type { MenuProps } from 'antd';
import { 
  CaretRightOutlined,
  CaretDownOutlined, 
  UserOutlined, 
  ClockCircleOutlined, 
  EditOutlined,
  DeleteOutlined,
  PlusOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  DragOutlined,
  SettingOutlined,
  LinkOutlined,
  DisconnectOutlined,
  ArrowLeftOutlined
} from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import type { ColumnsType } from 'antd/es/table';
import axios from 'axios';
import './GanttTemplateEditor.css';

const { Title, Text } = Typography;
const { Option } = Select;

// 接口定义 - 匹配我们的数据库结构
interface ProcessTemplate {
  id: number;
  template_code: string;
  template_name: string;
  description: string;
  total_days: number;
}

interface ProcessStage {
  id: number;
  template_id: number;
  stage_code: string;
  stage_name: string;
  stage_order: number;
  start_day: number;
  description?: string;
}

interface StageOperation {
  id: number;
  stage_id: number;
  operation_id: number;
  operation_code: string;
  operation_name: string;
  operation_day: number;
  recommended_time: number;
  recommended_day_offset?: number;
  window_start_time: number;
  window_start_day_offset?: number;
  window_end_time: number;
  window_end_day_offset?: number;
  operation_order: number;
  standard_time?: number;
  required_people?: number;
}

interface Operation {
  id: number;
  operation_code: string;
  operation_name: string;
  standard_time: number;
  required_people: number;
}

interface GanttTemplateEditorProps {
  template: ProcessTemplate;
  onBack: () => void;
}

interface GanttNode {
  id: string;
  title: string;
  type: 'template' | 'stage' | 'operation';
  parent_id?: string;
  stage_code?: string;
  standard_time?: number;
  required_people?: number;
  dependencies?: string[];
  start_day?: number;
  start_hour?: number;
  children?: GanttNode[];
  expanded?: boolean;
  editable?: boolean;
  level?: number;
  data?: ProcessStage | StageOperation; // 存储原始数据
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

interface TemplateTableRow {
  key: string;
  type: 'stage' | 'operation';
  name: string;
  code?: string;
  stageName?: string;
  stageOrder?: number;
  stageStartDay?: number;
  operationOrder?: number;
  dayOffset?: number;
  absoluteDay?: number;
  durationHours?: number | null;
  requiredPeople?: number | null;
  windowStart?: number | null;
  windowEnd?: number | null;
  description?: string | null;
  operationCount?: number;
  children?: TemplateTableRow[];
}

// 定义阶段颜色映射
const STAGE_COLORS: Record<string, string> = {
  'STAGE1': '#1890ff',      // 蓝色
  'STAGE2': '#52c41a',      // 绿色 
  'STAGE3': '#faad14',      // 橙色
  'STAGE4': '#f5222d',      // 红色
  'STAGE5': '#722ed1',      // 紫色
  'DEFAULT': '#8c8c8c'      // 灰色
};

// 时间轴配置
const HOUR_WIDTH = 30; // 每小时的像素宽度
const ROW_HEIGHT = 36; // 每行的高度
const DAYS_TO_SHOW = 35; // 显示35天

const GanttTemplateEditor: React.FC<GanttTemplateEditorProps> = ({ 
  template,
  onBack 
}) => {
  const [stages, setStages] = useState<ProcessStage[]>([]);
  const [stageOperations, setStageOperations] = useState<{ [key: number]: StageOperation[] }>({});
  const [availableOperations, setAvailableOperations] = useState<Operation[]>([]);
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
  const [loading, setLoading] = useState(false);
  const [activeView, setActiveView] = useState<'structure' | 'table'>('structure');

  const [form] = Form.useForm();
  const API_BASE_URL = 'http://localhost:3001/api';

  // 加载模板数据
  useEffect(() => {
    loadTemplateData();
  }, [template]);

  const loadTemplateData = async () => {
    setLoading(true);
    try {
      // 获取阶段数据
      const stagesResponse = await axios.get(`${API_BASE_URL}/process-stages/template/${template.id}`);
      setStages(stagesResponse.data);
      
      // 获取可用操作
      const operationsResponse = await axios.get(`${API_BASE_URL}/stage-operations/available`);
      setAvailableOperations(operationsResponse.data);
      
      // 获取每个阶段的操作
      const stageOpsMap: { [key: number]: StageOperation[] } = {};
      for (const stage of stagesResponse.data) {
        const opsResponse = await axios.get(`${API_BASE_URL}/stage-operations/stage/${stage.id}`);
        stageOpsMap[stage.id] = opsResponse.data;
      }
      setStageOperations(stageOpsMap);
      
      // 构建甘特图节点
      const nodes = buildGanttNodes(stagesResponse.data, stageOpsMap);
      setGanttNodes(nodes);
      
      // 生成时间块
      const blocks = generateTimeBlocks(nodes);
      console.log('Generated time blocks:', blocks); // 调试信息
      setTimeBlocks(blocks);
      
      // 默认展开所有节点
      const defaultExpandedKeys = [template.id.toString()];
      nodes[0].children?.forEach(stageNode => {
        defaultExpandedKeys.push(stageNode.id);
      });
      setExpandedKeys(defaultExpandedKeys);
      
    } catch (error) {
      message.error('加载模板数据失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const buildGanttNodes = (stages: ProcessStage[], stageOpsMap: { [key: number]: StageOperation[] }): GanttNode[] => {
    const nodes: GanttNode[] = [];
    
    // 根节点
    const templateNode: GanttNode = {
      id: template.id.toString(),
      title: template.template_name,
      type: 'template',
      expanded: true,
      children: [],
      level: 0
    };

    // 阶段节点
    stages.forEach((stage) => {
      const stageNode: GanttNode = {
        id: `stage_${stage.id}`,
        title: `${stage.stage_code} - ${stage.stage_name}`,
        type: 'stage',
        parent_id: template.id.toString(),
        stage_code: stage.stage_code,
        start_day: stage.start_day,
        start_hour: 0,
        expanded: true,
        children: [],
        editable: true,
        level: 1,
        data: stage
      };

      // 操作节点
      const operations = stageOpsMap[stage.id] || [];
      operations.forEach((operation) => {
        const operationNode: GanttNode = {
          id: `operation_${operation.id}`,
          title: operation.operation_name,
          type: 'operation',
          parent_id: `stage_${stage.id}`,
          required_people: operation.required_people,
          standard_time: operation.standard_time,
          start_day: stage.start_day + operation.operation_day,
          start_hour: Math.floor(operation.recommended_time),
          editable: true,
          level: 2,
          data: operation
        };

        stageNode.children?.push(operationNode);
      });

      templateNode.children?.push(stageNode);
    });

    nodes.push(templateNode);
    return nodes;
  };

  const generateTimeBlocks = (nodes: GanttNode[]): TimeBlock[] => {
    const blocks: TimeBlock[] = [];
    const processedNodeIds = new Set<string>(); // 防止重复处理
    
    const processNode = (node: GanttNode) => {
      // 防止重复处理同一个节点
      if (processedNodeIds.has(node.id)) {
        return;
      }
      processedNodeIds.add(node.id);
      
      if (node.type === 'operation' && node.standard_time && node.standard_time > 0) {
        // 获取阶段信息来确定颜色
        let stageCode = 'DEFAULT';
        if (node.parent_id?.includes('stage_')) {
          const stageId = node.parent_id.replace('stage_', '');
          const stage = stages.find(s => s.id.toString() === stageId);
          stageCode = stage?.stage_code || 'DEFAULT';
        }
        
        const block: TimeBlock = {
          id: `block_${node.id}`,
          node_id: node.id,
          title: node.title,
          start_day: node.start_day || 0,
          start_hour: node.start_hour || 0,
          duration_hours: node.standard_time,
          color: STAGE_COLORS[stageCode] || STAGE_COLORS.DEFAULT,
          dependencies: node.dependencies
        };
        
        blocks.push(block);
        console.log('Adding block:', block); // 调试信息
      }
      
      if (node.children) {
        node.children.forEach(processNode);
      }
    };

    // 只遍历一次节点层次结构
    nodes.forEach(processNode);
    console.log('Total blocks generated:', blocks.length); // 调试信息
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
      standard_time: type === 'operation' ? 4 : undefined,
      required_people: type === 'operation' ? 2 : undefined,
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
    
    // 设置表单初始值
    if (node.type === 'stage' && node.data) {
      const stageData = node.data as ProcessStage;
      form.setFieldsValue({
        stage_name: stageData.stage_name,
        stage_code: stageData.stage_code,
        start_day: stageData.start_day,
        description: stageData.description
      });
    } else if (node.type === 'operation' && node.data) {
      const operationData = node.data as StageOperation;
      form.setFieldsValue({
        operation_id: operationData.operation_id,
        operation_day: operationData.operation_day,
        recommended_time: operationData.recommended_time,
        recommended_day_offset: operationData.recommended_day_offset ?? 0,
        window_start_time: operationData.window_start_time,
        window_start_day_offset: operationData.window_start_day_offset ?? 0,
        window_end_time: operationData.window_end_time,
        window_end_day_offset: operationData.window_end_day_offset ?? 0
      });
    }
    
    setEditModalVisible(true);
  };

  const handleDeleteNode = (nodeId: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除该节点吗？删除后不可恢复。',
      onOk: async () => {
        try {
          const node = findNodeById(ganttNodes, nodeId);
          if (node) {
            if (node.type === 'stage' && node.data) {
              await axios.delete(`${API_BASE_URL}/process-stages/${(node.data as ProcessStage).id}`);
            } else if (node.type === 'operation' && node.data) {
              await axios.delete(`${API_BASE_URL}/stage-operations/${(node.data as StageOperation).id}`);
            }
            
            // 重新加载数据
            await loadTemplateData();
            message.success('删除成功');
          }
        } catch (error) {
          message.error('删除失败');
          console.error(error);
        }
      }
    });
  };

  const handleSaveNode = async (values: any) => {
    try {
      if (editingNode) {
        if (editingNode.type === 'stage') {
          if (editingNode.id.includes('new')) {
            // 创建新阶段
            await axios.post(`${API_BASE_URL}/process-stages/template/${template.id}`, values);
          } else {
            // 更新现有阶段
            const stageData = editingNode.data as ProcessStage;
            await axios.put(`${API_BASE_URL}/process-stages/${stageData.id}`, values);
          }
        } else if (editingNode.type === 'operation') {
          const parentStageId = editingNode.parent_id?.replace('stage_', '');
          if (editingNode.id.includes('new')) {
            // 创建新操作
            await axios.post(`${API_BASE_URL}/stage-operations/stage/${parentStageId}`, values);
          } else {
            // 更新现有操作
            const operationData = editingNode.data as StageOperation;
            await axios.put(`${API_BASE_URL}/stage-operations/${operationData.id}`, values);
          }
        }
        
        // 重新加载数据
        await loadTemplateData();
        message.success('保存成功');
      }
    } catch (error) {
      message.error('保存失败');
      console.error(error);
    }

    setEditModalVisible(false);
    setEditingNode(null);
    form.resetFields();
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

  const renderTreeNodeTitle = (node: GanttNode) => {
    const isSelected = selectedNode?.id === node.id;

    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        width: '100%',
        padding: '4px 0',
        minHeight: '32px',
        overflow: 'hidden'
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          flex: 1, 
          minWidth: 0,
          gap: '6px'
        }}>
          {node.type === 'stage' && (
            <Tag color="blue" style={{ margin: 0, flexShrink: 0 }}>
              {node.stage_code}
            </Tag>
          )}
          <Text 
            strong={node.type === 'template'} 
            style={{ 
              fontSize: node.type === 'template' ? '14px' : '13px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: '20px',
              flex: 1,
              minWidth: 0
            }}
            title={node.title}
          >
            {node.title}
          </Text>
          {node.type === 'operation' && (
            <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
              <Tag icon={<UserOutlined />} color="cyan" style={{ margin: 0, fontSize: '11px' }}>
                {node.required_people}人
              </Tag>
              <Tag icon={<ClockCircleOutlined />} color="orange" style={{ margin: 0, fontSize: '11px' }}>
                {node.standard_time}h
              </Tag>
            </div>
          )}
        </div>

        {isSelected && node.editable && (
          <div style={{ flexShrink: 0, marginLeft: '8px' }}>
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
          </div>
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
    const timeHeaders = [];
    
    for (let day = 0; day < DAYS_TO_SHOW; day++) {
      // 日期标题
      timeHeaders.push(
        <div
          key={`day_${day}`}
          style={{
            width: 24 * HOUR_WIDTH * zoom / 100,
            height: 20,
            border: '1px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#e6f7ff',
            fontWeight: 600,
            fontSize: 11,
            color: day === 0 ? '#1890ff' : '#666'
          }}
        >
          Day {day}
        </div>
      );
      
      // 小时标题行
      const hourRow = [];
      for (let hour = 0; hour < 24; hour++) {
        hourRow.push(
          <div
            key={`hour_${day}_${hour}`}
            style={{
              width: HOUR_WIDTH * zoom / 100,
              height: 20,
              border: '1px solid #f0f0f0',
              borderTop: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#fafafa',
              fontSize: 9,
              color: '#999'
            }}
          >
            {hour}
          </div>
        );
      }
      timeHeaders.push(
        <div key={`hours_${day}`} style={{ display: 'flex' }}>
          {hourRow}
        </div>
      );
    }
    
    return (
      <div>
        {/* 天数标题行 */}
        <div style={{ display: 'flex' }}>
          {Array.from({ length: DAYS_TO_SHOW }).map((_, day) => (
            <div
              key={`day_${day}`}
              style={{
                width: 24 * HOUR_WIDTH * zoom / 100,
                height: 20,
                border: '1px solid #f0f0f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#e6f7ff',
                fontWeight: 600,
                fontSize: 11,
                color: day === 0 ? '#1890ff' : '#666'
              }}
            >
              Day {day}
            </div>
          ))}
        </div>
        
        {/* 小时标题行 */}
        <div style={{ display: 'flex' }}>
          {Array.from({ length: DAYS_TO_SHOW }).map((_, day) => (
            <div key={`hours_${day}`} style={{ display: 'flex' }}>
              {Array.from({ length: 24 }).map((_, hour) => (
                <div
                  key={`hour_${day}_${hour}`}
                  style={{
                    width: HOUR_WIDTH * zoom / 100,
                    height: 20,
                    border: '1px solid #f0f0f0',
                    borderTop: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#fafafa',
                    fontSize: 9,
                    color: '#999'
                  }}
                >
                  {hour}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const getNodeRowIndex = (nodeId: string): number => {
    // 计算节点在树形结构中的显示位置
    let rowIndex = 0;
    
    const traverseNodes = (nodes: GanttNode[]): boolean => {
      for (const node of nodes) {
        if (node.id === nodeId) {
          return true; // 找到目标节点
        }
        rowIndex++;
        
        // 如果节点展开并且有子节点，递归遍历
        if (expandedKeys.includes(node.id) && node.children && node.children.length > 0) {
          if (traverseNodes(node.children)) {
            return true;
          }
        }
      }
      return false;
    };
    
    traverseNodes(ganttNodes);
    console.log(`Node ${nodeId} row index: ${rowIndex}`); // 调试信息
    return rowIndex;
  };

  const renderTimeBlocks = () => {
    // 计算总行数（包括展开的节点）
    const getTotalRows = (nodes: GanttNode[]): number => {
      let count = 0;
      for (const node of nodes) {
        count++;
        if (expandedKeys.includes(node.id) && node.children && node.children.length > 0) {
          count += getTotalRows(node.children);
        }
      }
      return count;
    };

    const totalRows = getTotalRows(ganttNodes);
    const containerHeight = Math.max(totalRows * ROW_HEIGHT + 78, 400);

    return (
      <div style={{ 
        position: 'relative', 
        minHeight: containerHeight,
        width: DAYS_TO_SHOW * 24 * HOUR_WIDTH * zoom / 100,
        background: '#fafafa'
      }}>
        {/* 渲染网格线 */}
        {Array.from({ length: DAYS_TO_SHOW + 1 }).map((_, dayIndex) => (
          <div
            key={`grid_${dayIndex}`}
            style={{
              position: 'absolute',
              left: dayIndex * 24 * HOUR_WIDTH * zoom / 100,
              top: 0,
              width: 1,
              height: containerHeight,
              background: dayIndex % 7 === 0 ? '#d9d9d9' : '#f0f0f0'
            }}
          />
        ))}

        {/* 渲染水平网格线 */}
        {Array.from({ length: totalRows + 1 }).map((_, rowIndex) => (
          <div
            key={`hgrid_${rowIndex}`}
            style={{
              position: 'absolute',
              left: 0,
              top: rowIndex * ROW_HEIGHT,
              width: '100%',
              height: 1,
              background: '#f0f0f0'
            }}
          />
        ))}

        {/* 渲染时间块 */}
        {timeBlocks.map((block) => {
          const left = (block.start_day * 24 + block.start_hour) * HOUR_WIDTH * zoom / 100;
          const width = Math.max(block.duration_hours * HOUR_WIDTH * zoom / 100, 20); // 最小宽度
          
          // 找到对应的节点在树中的位置  
          const rowIndex = getNodeRowIndex(block.node_id);
          // 计算顶部偏移：时间轴标题(约38px) + 天数行(20px) + 小时行(20px) = 78px
          const top = rowIndex * ROW_HEIGHT + 78;

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
              onDoubleClick={() => {
                // 双击编辑时间块对应的节点
                const node = findNodeById(ganttNodes, block.node_id);
                if (node) {
                  handleEditNode(node);
                }
              }}
              style={{
                position: 'absolute',
                left: left,
                top: top,
                width: width,
                height: ROW_HEIGHT - 8,
                background: block.color,
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                padding: '0 8px',
                color: 'white',
                fontSize: 11,
                fontWeight: 500,
                cursor: autoLayout ? 'default' : 'move',
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                border: '1px solid rgba(255,255,255,0.3)',
                opacity: isDragging && draggedBlock?.id === block.id ? 0.6 : 1,
                transition: 'all 0.2s',
                zIndex: 10
              }}
            >
              <Tooltip title={`${block.title}\n开始: Day ${block.start_day} ${block.start_hour}:00\n时长: ${block.duration_hours}小时`}>
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
                <DragOutlined style={{ marginLeft: 4, fontSize: 10, opacity: 0.8 }} />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const { tableData, totalStages, totalOperations } = useMemo(() => {
    const stageRows: TemplateTableRow[] = stages
      .slice()
      .sort((a, b) => a.stage_order - b.stage_order)
      .map(stage => {
        const operations = (stageOperations[stage.id] || [])
          .slice()
          .sort((a, b) => a.operation_order - b.operation_order);

        const children: TemplateTableRow[] = operations.map(operation => ({
          key: `operation-${operation.id}`,
          type: 'operation',
          name: operation.operation_name,
          code: operation.operation_code,
          stageName: stage.stage_name,
          stageOrder: stage.stage_order,
          stageStartDay: stage.start_day,
          operationOrder: operation.operation_order,
          dayOffset: operation.operation_day,
          absoluteDay: stage.start_day + operation.operation_day,
          durationHours: operation.recommended_time ?? operation.standard_time ?? null,
          requiredPeople: operation.required_people ?? null,
          windowStart: operation.window_start_time ?? null,
          windowEnd: operation.window_end_time ?? null,
          description: null
        }));

        return {
          key: `stage-${stage.id}`,
          type: 'stage',
          name: stage.stage_name,
          code: stage.stage_code,
          stageName: stage.stage_name,
          stageOrder: stage.stage_order,
          stageStartDay: stage.start_day,
          description: stage.description ?? null,
          operationCount: children.length,
          children
        } as TemplateTableRow;
      });

    const totalOps = stageRows.reduce((acc, row) => acc + (row.operationCount || 0), 0);

    return {
      tableData: stageRows,
      totalStages: stageRows.length,
      totalOperations: totalOps
    };
  }, [stages, stageOperations]);

  const tableColumns: ColumnsType<TemplateTableRow> = useMemo(() => [
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: TemplateTableRow['type']) => (
        <Tag color={type === 'stage' ? 'blue' : 'green'}>
          {type === 'stage' ? '阶段' : '操作'}
        </Tag>
      )
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 220,
      render: (value: string, record) => (
        <Space direction="vertical" size={0}>
          <Text strong={record.type === 'stage'}>{value}</Text>
          {record.type === 'operation' && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              所属阶段：{record.stageName}
            </Text>
          )}
        </Space>
      )
    },
    {
      title: '编码',
      dataIndex: 'code',
      key: 'code',
      width: 160,
      render: (value?: string) => value || '-'
    },
    {
      title: '排序',
      key: 'order',
      width: 120,
      render: (_, record) =>
        record.type === 'stage' ? record.stageOrder ?? '-' : record.operationOrder ?? '-'
    },
    {
      title: '开始日',
      key: 'start_day',
      width: 120,
      render: (_, record) =>
        record.type === 'stage'
          ? record.stageStartDay ?? '-'
          : record.absoluteDay ?? '-'
    },
    {
      title: '阶段内天数',
      dataIndex: 'dayOffset',
      key: 'dayOffset',
      width: 140,
      render: (value, record) => (record.type === 'operation' ? value ?? '-' : '--')
    },
    {
      title: '持续时间 (小时)',
      dataIndex: 'durationHours',
      key: 'durationHours',
      width: 160,
      render: (value, record) => (record.type === 'operation' ? (value ?? '-') : '--')
    },
    {
      title: '需求人数',
      dataIndex: 'requiredPeople',
      key: 'requiredPeople',
      width: 140,
      render: (value, record) => (record.type === 'operation' ? (value ?? '-') : '--')
    },
    {
      title: '时间窗口 (小时)',
      key: 'window',
      width: 180,
      render: (_, record) => {
        if (record.type === 'stage') {
          return '--';
        }
        const { windowStart, windowEnd } = record;
        if (windowStart == null && windowEnd == null) {
          return '-';
        }
        return `${windowStart ?? '-'} ~ ${windowEnd ?? '-'}`;
      }
    },
    {
      title: '描述 / 备注',
      dataIndex: 'description',
      key: 'description',
      render: (value, record) => {
        if (record.type === 'stage') {
          return value || '-';
        }
        return '-';
      }
    },
    {
      title: '操作数',
      dataIndex: 'operationCount',
      key: 'operationCount',
      width: 120,
      render: (value, record) => (record.type === 'stage' ? value ?? 0 : '--')
    }
  ], []);

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
          <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
            返回
          </Button>
          <Title level={4} style={{ margin: 0 }}>
            甘特图编辑器 - {template.template_name}
          </Title>
        </Space>

        <Space align="center" size={16}>
          <Segmented
            value={activeView}
            onChange={(value) => setActiveView(value as 'structure' | 'table')}
            options={[
              { label: '结构视图', value: 'structure' },
              { label: '表格视图', value: 'table' }
            ]}
          />

          {activeView === 'structure' ? (
            <Space>
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
                  onClick={() => setZoom(Math.max(10, zoom - 10))}
                  disabled={zoom <= 10}
                />
                <InputNumber
                  value={zoom}
                  onChange={(value) => setZoom(value || 100)}
                  formatter={value => `${value}%`}
                  parser={value => value?.replace('%', '') as any}
                  style={{ width: 80 }}
                  min={10}
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
          ) : (
            <Text type="secondary">
              阶段 {totalStages} 个 · 操作 {totalOperations} 个
            </Text>
          )}
        </Space>
      </div>

      {/* 主体内容 */}
      {activeView === 'structure' ? (
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
            <div style={{ flex: 1, overflow: 'auto' }}>
              <Tree
                showLine={{ showLeafIcon: false }}
                switcherIcon={(props) => {
                  const nodeKey = props.data?.key?.toString();
                  // 模板节点不显示展开图标（始终展开）
                  if (nodeKey && !nodeKey.startsWith('stage_')) {
                    return null;
                  }
                  // 阶段节点显示展开图标，只有当有子节点时才显示
                  if (props.data?.children && props.data.children.length > 0) {
                    return props.expanded ? <CaretDownOutlined /> : <CaretRightOutlined />;
                  }
                  return null;
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
                style={{
                  background: 'transparent'
                }}
                className="gantt-tree"
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
      ) : (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          background: '#fff'
        }}>
          <div
            style={{
              padding: '12px 16px',
              background: '#fafafa',
              borderBottom: '1px solid #f0f0f0'
            }}
          >
            <Space size={24} wrap>
              <Text>阶段：{totalStages}</Text>
              <Text>操作：{totalOperations}</Text>
              <Text type="secondary">{loading ? '数据加载中…' : '数据已同步'}</Text>
            </Space>
          </div>
          <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <Table
                columns={tableColumns}
                dataSource={tableData}
                loading={loading}
                pagination={false}
                bordered
                size="middle"
                rowKey="key"
                expandable={{ defaultExpandAllRows: true }}
                scroll={{ x: 'max-content' }}
                sticky
              />
            </div>
          </div>
        </div>
      )}

      {/* 编辑模态框 */}
      <Modal
        title={editingNode?.type === 'stage' ? '编辑阶段' : '编辑操作'}
        open={editModalVisible}
        onCancel={() => {
          setEditModalVisible(false);
          setEditingNode(null);
          form.resetFields();
        }}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSaveNode}
        >
          {editingNode?.type === 'stage' && (
            <>
              <Form.Item
                name="stage_name"
                label="阶段名称"
                rules={[{ required: true, message: '请输入阶段名称' }]}
              >
                <Input />
              </Form.Item>

              <Form.Item
                name="stage_code"
                label="阶段代码"
                rules={[{ required: true, message: '请输入阶段代码' }]}
              >
                <Input />
              </Form.Item>

              <Form.Item
                name="start_day"
                label="开始天数"
                rules={[{ required: true, message: '请输入开始天数' }]}
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item
                name="description"
                label="描述"
              >
                <Input.TextArea rows={3} />
              </Form.Item>
            </>
          )}

          {editingNode?.type === 'operation' && (
            <>
              <Form.Item
                name="operation_id"
                label="选择操作"
                rules={[{ required: true, message: '请选择操作' }]}
              >
                <Select placeholder="请选择操作" disabled={!!editingNode.data}>
                  {availableOperations.map(op => (
                    <Option key={op.id} value={op.id}>
                      {op.operation_code} - {op.operation_name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item
                name="operation_day"
                label="操作天数（相对于阶段）"
                rules={[{ required: true, message: '请输入操作天数' }]}
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item
                name="recommended_time"
                label="推荐开始时间"
                rules={[{ required: true, message: '请输入推荐时间' }]}
              >
                <InputNumber min={0} max={23.9} step={0.5} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item
                name="recommended_day_offset"
                label="推荐开始偏移（天）"
                initialValue={0}
                rules={[{
                  validator: (_, value) => {
                    const numValue = value !== undefined ? Number(value) : 0;
                    if (Number.isNaN(numValue) || numValue < -7 || numValue > 7) {
                      return Promise.reject(new Error('偏移天数需在 -7 到 7 之间'));
                    }
                    return Promise.resolve();
                  }
                }]}
              >
                <InputNumber min={-7} max={7} step={1} style={{ width: '100%' }} addonAfter="天" />
              </Form.Item>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="window_start_time"
                    label="时间窗口开始"
                    rules={[{ required: true, message: '请输入开始时间' }]}
                  >
                    <InputNumber min={0} max={23.9} step={0.5} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="window_end_time"
                    label="时间窗口结束"
                    rules={[{ required: true, message: '请输入结束时间' }]}
                  >
                    <InputNumber min={0} max={23.9} step={0.5} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="window_start_day_offset"
                    label="窗口开始偏移（天）"
                    initialValue={0}
                    rules={[{
                      validator: (_, value) => {
                        const numValue = value !== undefined ? Number(value) : 0;
                        if (Number.isNaN(numValue) || numValue < -7 || numValue > 7) {
                          return Promise.reject(new Error('偏移天数需在 -7 到 7 之间'));
                        }
                        return Promise.resolve();
                      }
                    }]}
                  >
                    <InputNumber min={-7} max={7} step={1} style={{ width: '100%' }} addonAfter="天" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="window_end_day_offset"
                    label="窗口结束偏移（天）"
                    initialValue={0}
                    rules={[{
                      validator: (_, value) => {
                        const numValue = value !== undefined ? Number(value) : 0;
                        if (Number.isNaN(numValue) || numValue < -7 || numValue > 7) {
                          return Promise.reject(new Error('偏移天数需在 -7 到 7 之间'));
                        }
                        return Promise.resolve();
                      }
                    }]}
                  >
                    <InputNumber min={-7} max={7} step={1} style={{ width: '100%' }} addonAfter="天" />
                  </Form.Item>
                </Col>
              </Row>
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
                form.resetFields();
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

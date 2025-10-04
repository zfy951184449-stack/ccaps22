import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Card, 
  Tree, 
  Row, 
  Col, 
  Typography, 
  Space, 
  Tag, 
  Button,
  Tooltip,
  Empty,
  message,
  Popconfirm,
  Dropdown,
  Slider,
  InputNumber
} from 'antd';
import type { MenuProps } from 'antd';
import { 
  CaretRightOutlined, 
  UserOutlined, 
  ClockCircleOutlined, 
  SafetyCertificateOutlined,
  EditOutlined,
  DeleteOutlined,
  PlusOutlined,
  MoreOutlined,
  SaveOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  CompressOutlined,
  CloseOutlined
} from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';

import type { 
  GanttNode, 
  GanttTimeBlock, 
  ProcessTemplateDetail,
  ProcessStage,
  ProcessOperation,
  InlineEditingState,
  TreeNodeOperations
} from '@/types/gantt.types';
import OperationEditModal from './gantt/OperationEditModal';
import StageEditModal from './gantt/StageEditModal';
import InlineEditor from './gantt/InlineEditor';
import EnhancedTreeNodeActions from './gantt/EnhancedTreeNodeActions';

const { Title, Text } = Typography;

interface GanttChartEnhancedProps {
  templateDetail: ProcessTemplateDetail | null;
  mode: 'template_edit' | 'production_overview';
  onEdit?: (nodeId: string) => void;
  onSave?: (templateDetail: ProcessTemplateDetail) => void;
}

// 添加内联样式来控制树组件行高和背景
const treeStyles = `
/* 去除Tree组件的默认padding */
.gantt-tree.ant-tree {
  padding: 0 !important;
  margin: 0 !important;
  position: relative !important;
}

.gantt-tree .ant-tree-list {
  padding: 0 !important;
  margin: 0 !important;
  position: relative !important;
  top: 0 !important;
}

.gantt-tree .ant-tree-list-holder {
  padding: 0 !important;
  margin: 0 !important;
}

.gantt-tree .ant-tree-list-holder-inner {
  padding: 0 !important;
  margin: 0 !important;
}

/* 移除虚拟滚动容器的额外空间 */
.gantt-tree .ant-tree-list-scrollbar {
  display: none !important;
}

.gantt-tree .rc-virtual-list {
  padding: 0 !important;
  margin: 0 !important;
}

.gantt-tree .rc-virtual-list-holder {
  padding: 0 !important;
  margin: 0 !important;
}

.gantt-tree .ant-tree-treenode {
  padding: 0 !important;
  margin: 0 !important;
  position: relative;
  display: flex;
  align-items: center;
  min-height: 36px !important;
  max-height: 36px !important;
  height: 36px !important;
}

/* 确保第一个节点没有额外的margin */
.gantt-tree .ant-tree-treenode:first-child {
  margin-top: 0 !important;
}

.gantt-tree > .ant-tree-list > .ant-tree-list-holder > div > .ant-tree-treenode:first-child {
  margin-top: 0 !important;
  padding-top: 0 !important;
}

.gantt-tree .ant-tree-node-content-wrapper {
  height: 36px !important;
  line-height: 36px !important;
  padding: 0 4px !important;
  margin: 0 !important;
  overflow: hidden !important;
  background-color: transparent !important;
  display: flex;
  align-items: center;
}

.gantt-tree .ant-tree-title {
  height: 36px !important;
  line-height: 36px !important;
  overflow: hidden !important;
  display: flex;
  align-items: center;
}

.gantt-tree .ant-tree-switcher {
  height: 36px !important;
  line-height: 36px !important;
  flex-shrink: 0 !important;
  background-color: transparent !important;
  display: flex;
  align-items: center;
  justify-content: center;
}

.gantt-tree .ant-tree-indent {
  display: inline-block;
  margin: 0 !important;
  padding: 0 !important;
}

.gantt-tree .ant-tree-indent-unit {
  display: inline-block;
  width: 24px;
}

.gantt-tree .ant-tree-node-content-wrapper:hover {
  background-color: rgba(0, 0, 0, 0.04) !important;
}

.gantt-tree .ant-tree-node-selected .ant-tree-node-content-wrapper {
  background-color: rgba(24, 144, 255, 0.1) !important;
}

/* 为树形节点添加交替行背景 */
.gantt-tree-container {
  position: relative;
  padding: 0 !important;
  margin: 0 !important;
}

.gantt-tree-row-bg {
  position: absolute;
  left: 0;
  right: 0;
  height: 36px;
  pointer-events: none;
  z-index: 0;
}

.gantt-tree .ant-tree {
  position: relative;
  z-index: 1;
}

/* blockNode模式下的样式 */
.gantt-tree.ant-tree-block-node .ant-tree-list-holder-inner {
  display: block !important;
  padding: 0 !important;
  margin: 0 !important;
}

.gantt-tree.ant-tree-block-node .ant-tree-list-holder-inner::before {
  content: none !important;
  display: none !important;
}

.gantt-tree.ant-tree-block-node .ant-tree-treenode {
  display: flex !important;
  width: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
}

.gantt-tree.ant-tree-block-node .ant-tree-node-content-wrapper {
  flex: 1 !important;
  width: 100% !important;
}

/* 强制第一个可见节点从顶部开始 */
.gantt-tree .ant-tree-list-holder-inner > div:first-child {
  margin-top: 0 !important;
  padding-top: 0 !important;
}

/* 非虚拟滚动模式下的样式调整 */
.gantt-tree.ant-tree:not(.ant-tree-virtual) .ant-tree-list-holder-inner {
  padding: 0 !important;
  margin: 0 !important;
}

.gantt-tree.ant-tree:not(.ant-tree-virtual) .ant-tree-list-holder-inner > .ant-tree-treenode:first-child {
  margin-top: 0 !important;
}

/* 强制树内容从顶部开始 */
.gantt-tree > div:first-child {
  margin-top: 0 !important;
  padding-top: 0 !important;
}

/* 树节点交互样式 */
.tree-node-title:hover .tree-node-actions {
  opacity: 1 !important;
}

.tree-node-title .tree-node-actions {
  transition: opacity 0.2s ease;
}

/* 内联编辑器样式 */
.tree-node-title .ant-input,
.tree-node-title .ant-input-number {
  font-size: 12px;
  border-radius: 2px;
}

.tree-node-title .ant-tag {
  transition: all 0.2s ease;
}

.tree-node-title .ant-tag:hover {
  transform: scale(1.05);
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
`;

const GanttChartEnhanced: React.FC<GanttChartEnhancedProps> = ({ 
  templateDetail, 
  mode,
  onEdit,
  onSave
}) => {
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [ganttNodes, setGanttNodes] = useState<GanttNode[]>([]);
  const [timeBlocks, setTimeBlocks] = useState<GanttTimeBlock[]>([]);
  const [editingOperation, setEditingOperation] = useState<ProcessOperation | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingStage, setEditingStage] = useState<ProcessStage | null>(null);
  const [showStageEditModal, setShowStageEditModal] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [currentTemplateDetail, setCurrentTemplateDetail] = useState<ProcessTemplateDetail | null>(null);
  const [visibleRows, setVisibleRows] = useState<string[]>([]);
  const [horizontalScrollLeft, setHorizontalScrollLeft] = useState(0);
  const [verticalScrollTop, setVerticalScrollTop] = useState(0);
  const [zoomScale, setZoomScale] = useState(1.0); // 缩放比例，1.0 = 100%
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null); // 当前编辑的节点ID
  const [editingField, setEditingField] = useState<string | null>(null); // 当前编辑的字段
  const [editingValue, setEditingValue] = useState<string>(''); // 编辑的值
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  
  // 内联编辑状态
  const [inlineEditingState, setInlineEditingState] = useState<InlineEditingState>({
    editingNodeId: null,
    editingField: null,
    editingValue: ''
  });
  const timeAxisRef = useRef<HTMLDivElement>(null);
  const treeContainerRef = useRef<HTMLDivElement>(null);
  const ganttContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 每次templateDetail变化时，完全重置所有状态
    if (templateDetail && templateDetail.template_id) {
      // 先清空状态，确保没有残留数据
      setGanttNodes([]);
      setTimeBlocks([]);
      setExpandedKeys([]);
      setVisibleRows([]);
      
      // 然后设置新数据
      setCurrentTemplateDetail(templateDetail);
      const nodes = buildGanttNodes(templateDetail);
      setGanttNodes(nodes);
      
      // 默认展开所有节点以显示完整甘特图
      const allKeys: string[] = [];
      const collectAllKeys = (nodeList: GanttNode[]) => {
        nodeList.forEach(node => {
          allKeys.push(node.id);
          if (node.children) {
            collectAllKeys(node.children);
          }
        });
      };
      collectAllKeys(nodes);
      setExpandedKeys(allKeys);
      
      const blocks = generateTimeBlocks(nodes, templateDetail);
      setTimeBlocks(blocks);
    } else {
      // 当templateDetail为空时，清空所有状态
      setCurrentTemplateDetail(null);
      setGanttNodes([]);
      setTimeBlocks([]);
      setExpandedKeys([]);
      setVisibleRows([]);
    }
  }, [templateDetail]);

  const buildGanttNodes = (template: ProcessTemplateDetail): GanttNode[] => {
    const nodes: GanttNode[] = [];
    
    // 根节点：工艺模板
    const templateNode: GanttNode = {
      id: template.template_id.toString(),
      title: template.template_name,
      type: 'template',
      expanded: true,
      children: []
    };

    // 如果没有stages，直接返回只有根节点的数组
    if (!template.stages || template.stages.length === 0) {
      nodes.push(templateNode);
      return nodes;
    }

    // 阶段节点
    template.stages.forEach((stage, stageIndex) => {
      // 使用stage_template_id作为唯一标识
      const stageNode: GanttNode = {
        id: `t${template.template_id}_stage_${stage.stage_template_id}`,
        title: `${stage.stage_code} - ${stage.stage_name}`,
        type: 'stage',
        parent_id: template.template_id.toString(),
        stage_code: stage.stage_code,
        estimated_duration_hours: stage.duration_days ? stage.duration_days * 24 : 24, // 将天数转换为小时
        absolute_start_day: stage.absolute_start_day, // 阶段时间轴定位
        expanded: true,
        children: []
      };

      // 操作节点
      stage.operations.forEach((operation, operationIndex) => {
        const operationNode: GanttNode = {
          id: `t${template.template_id}_operation_${operation.operation_template_id}`,
          title: operation.operation_name,
          type: 'operation',
          parent_id: `t${template.template_id}_stage_${stage.stage_template_id}`,
          hc_requirement: operation.hc_requirement,
          estimated_duration_hours: parseFloat(operation.standard_duration_hours || '0'), // 确保是数字类型
          required_qualifications: operation.required_qualifications,
          // 操作时间轴定位
          stage_relative_day: operation.stage_relative_day,
          recommended_start_hour: operation.recommended_start_hour,
          time_window_start_hours: operation.time_window_start_hours,
          time_window_end_hours: operation.time_window_end_hours,
          operation_code: operation.operation_code,
          editable: mode === 'template_edit'
        };

        stageNode.children?.push(operationNode);
      });

      templateNode.children?.push(stageNode);
    });

    nodes.push(templateNode);
    return nodes;
  };

  const generateTimeBlocks = (nodes: GanttNode[], template?: ProcessTemplateDetail | null): GanttTimeBlock[] => {
    const blocks: GanttTimeBlock[] = [];
    
    // 如果没有模板数据或没有节点，返回空数组
    if (!template || !nodes || nodes.length === 0) {
      return blocks;
    }

    const processStage = (stageNode: GanttNode, stageData?: any) => {
      // 使用时间锚定数据计算阶段在总时间轴上的绝对位置
      const stageAbsoluteStartDay = stageData?.absolute_start_day || 0;
      const stageDurationDays = stageData?.duration_days || Math.ceil((stageNode.estimated_duration_hours || 24) / 24);
      const stageStartHour = stageAbsoluteStartDay * 24; // 转换为小时
      const stageDurationHours = stageDurationDays * 24; // 转换为小时
      
      // 处理操作级别的时间块
      if (stageNode.children) {
        stageNode.children.forEach((operationNode, operationIndex) => {
          if (operationNode.type === 'operation' && operationNode.estimated_duration_hours) {
            // 通过operation_template_id精确查找对应的操作数据
            const operationIdFromNode = operationNode.id.match(/operation_([^_]+)$/)?.[1];
            const operationData = stageData?.operations?.find((op: any) => 
              op.operation_template_id?.toString() === operationIdFromNode ||
              op.operation_id?.toString() === operationIdFromNode
            );
            
            // 使用operationNode中的数据作为备选，确保数据同步
            const stageRelativeDay = operationData?.stage_relative_day ?? operationNode.stage_relative_day ?? 0;
            
            // 计算操作的绝对开始天数
            let operationAbsoluteDay;
            if (stageRelativeDay >= 0) {
              // 正数：相对于阶段开始的第几天
              operationAbsoluteDay = stageAbsoluteStartDay + stageRelativeDay;
            } else {
              // 负数：相对于阶段开始的前几天（-1表示阶段开始前一天）
              operationAbsoluteDay = stageAbsoluteStartDay + stageRelativeDay;
            }
            
            // 获取时间窗口和推荐时间信息，优先使用operationNode中的数据
            const timeWindowStart = operationData?.time_window_start_hours ?? operationNode.time_window_start_hours ?? 0;
            const timeWindowEnd = operationData?.time_window_end_hours ?? operationNode.time_window_end_hours ?? 24;
            const recommendedStartHour = operationData?.recommended_start_hour ?? operationNode.recommended_start_hour ?? timeWindowStart;
            
            // 计算精确的开始时间（天数 + 小时数）
            const operationStartHour = (operationAbsoluteDay * 24) + recommendedStartHour;
            const timeWindowStartHour = (operationAbsoluteDay * 24) + timeWindowStart;
            const timeWindowEndHour = (operationAbsoluteDay * 24) + timeWindowEnd;
            
            // 创建时间窗口背景块（浅色）
            const timeWindowBlock: GanttTimeBlock = {
              id: `window_${operationNode.id}`,
              node_id: operationNode.id,
              start_hour: timeWindowStartHour,
              duration_hours: timeWindowEnd - timeWindowStart,
              title: `${operationNode.title} - 时间窗口 (总Day${operationAbsoluteDay} ${timeWindowStart.toString().padStart(2,'0')}:00-${timeWindowEnd.toString().padStart(2,'0')}:00)`,
              color: getOperationColor(stageNode.stage_code || 'DEFAULT', 0.3), // 浅色背景
              isTimeWindow: true
            };
            blocks.push(timeWindowBlock);
            
            // 创建推荐执行时间块（深色）
            const operationBlock: GanttTimeBlock = {
              id: `block_${operationNode.id}`,
              node_id: operationNode.id,
              start_hour: operationStartHour,
              duration_hours: operationNode.estimated_duration_hours,
              title: `${operationNode.title} (总Day${operationAbsoluteDay} ${recommendedStartHour.toString().padStart(2,'0')}:00-${(recommendedStartHour + operationNode.estimated_duration_hours).toString().padStart(2,'0')}:00)`,
              color: getOperationColor(stageNode.stage_code || 'DEFAULT'),
              isRecommended: true
            };
            blocks.push(operationBlock);
          }
        });
      }
      
      // 为阶段节点生成时间块（用于折叠时显示）
      const stageBlock: GanttTimeBlock = {
        id: `block_stage_${stageNode.id}`,
        node_id: stageNode.id,
        start_hour: stageStartHour,
        duration_hours: stageDurationHours,
        title: `${stageNode.stage_code || '阶段'} - ${stageNode.title} (Day${stageAbsoluteStartDay}-${stageAbsoluteStartDay + stageDurationDays - 1})`,
        color: getOperationColor(stageNode.stage_code || 'DEFAULT')
      };
      blocks.push(stageBlock);
    };

    // 需要传递模板数据以获取时间锚定信息
    if (template && template.stages) {
      nodes.forEach(rootNode => {
        if (rootNode.children) {
          rootNode.children.forEach((stageNode, stageIndex) => {
            // 查找对应的阶段数据
            const stageData = template.stages.find(stage => 
              stage.stage_code === stageNode.stage_code
            ) || template.stages[stageIndex];
            
            processStage(stageNode, stageData);
          });
        }
      });
    }

    return blocks;
  };

  const getOperationColor = (stageCode: string, alpha: number = 1): string => {
    const stageColors: { [key: string]: string } = {
      'TF': '#1890ff',      // 蓝色
      'SF': '#52c41a',      // 绿色 
      'WAVE': '#faad14',    // 橙色
      'SUB': '#f5222d',     // 红色
      'HARVEST': '#722ed1', // 紫色
      'DEFAULT': '#8c8c8c'  // 灰色
    };
    const baseColor = stageColors[stageCode] || stageColors['DEFAULT'];
    
    // 转换为RGBA格式以支持透明度
    const hex = baseColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const handleEditOperation = (nodeId: string) => {
    // Extract operation ID from format: t{templateId}_operation_{operationId}
    const match = nodeId.match(/operation_([^_]+)$/);
    const operationId = match ? match[1] : nodeId.split('_').pop();
    console.log('handleEditOperation - nodeId:', nodeId, 'operationId:', operationId);
    
    if (currentTemplateDetail) {
      console.log('Available template data:', currentTemplateDetail);
      
      for (const stage of currentTemplateDetail.stages) {
        console.log('Checking stage:', stage.stage_name, 'operations:', stage.operations.length);
        
        const operation = stage.operations.find(op => 
          // 安全地处理可能为undefined的operation_template_id
          (op.operation_template_id && op.operation_template_id.toString() === operationId) ||
          (op.operation_id && op.operation_id.toString() === operationId) ||
          op.operation_code === operationId
        );
        
        if (operation) {
          console.log('Found operation details:', {
            id: operation.operation_template_id || operation.operation_id,
            name: operation.operation_name,
            hc_requirement: operation.hc_requirement,
            duration: operation.estimated_duration_hours,
            qualifications: operation.required_qualifications,
            stage_relative_day: operation.stage_relative_day,
            recommended_start_hour: operation.recommended_start_hour,
            time_window_start: operation.time_window_start_hours,
            time_window_end: operation.time_window_end_hours,
            full_object: operation
          });
          setEditingOperation(operation);
          setShowEditModal(true);
          break;
        }
      }
    } else {
      console.error('No currentTemplateDetail available');
    }
  };

  const handleEditStage = (nodeId: string) => {
    // Extract stage ID from format: t{templateId}_stage_{stageId}
    const match = nodeId.match(/stage_([^_]+)$/);
    const stageId = match ? match[1] : nodeId.split('_').pop();
    console.log('handleEditStage - nodeId:', nodeId, 'stageId:', stageId);
    
    if (currentTemplateDetail) {
      const stage = currentTemplateDetail.stages.find(s => 
        // 安全地处理可能为undefined的stage_template_id
        (s.stage_template_id && s.stage_template_id.toString() === stageId) ||
        (s.stage_id && s.stage_id.toString() === stageId) ||
        s.stage_code === stageId
      );
      
      if (stage) {
        console.log('Found stage details:', {
          id: stage.stage_template_id || stage.stage_id,
          name: stage.stage_name,
          code: stage.stage_code,
          duration: stage.duration_days,
          order: stage.stage_order,
          full_object: stage
        });
        setEditingStage(stage);
        setShowStageEditModal(true);
      } else {
        console.error('Stage not found with ID:', stageId, 'Available stages:', currentTemplateDetail.stages);
      }
    } else {
      console.error('No currentTemplateDetail available');
    }
  };

  const handleSaveStage = (updatedStage: ProcessStage) => {
    if (!currentTemplateDetail) return;
    
    // 更新当前模板详情中的阶段数据
    const newTemplateDetail = { ...currentTemplateDetail };
    const stageIndex = newTemplateDetail.stages.findIndex(s => 
      s.stage_template_id === updatedStage.stage_template_id
    );
    
    if (stageIndex !== -1) {
      newTemplateDetail.stages[stageIndex] = updatedStage;
    }
    
    setCurrentTemplateDetail(newTemplateDetail);
    setIsDirty(true);
    
    // 重新构建甘特图数据
    const nodes = buildGanttNodes(newTemplateDetail);
    setGanttNodes(nodes);
    const blocks = generateTimeBlocks(nodes, newTemplateDetail);
    setTimeBlocks(blocks);
    
    setShowStageEditModal(false);
    setEditingStage(null);
  };

  const handleSaveOperation = (updatedOperation: ProcessOperation) => {
    if (!currentTemplateDetail) return;
    
    // 更新templateDetail中的操作数据
    const newTemplateDetail = { ...currentTemplateDetail };
    for (const stage of newTemplateDetail.stages) {
      const opIndex = stage.operations.findIndex(op => 
        op.operation_template_id === updatedOperation.operation_template_id
      );
      if (opIndex !== -1) {
        stage.operations[opIndex] = updatedOperation;
        break;
      }
    }
    
    setCurrentTemplateDetail(newTemplateDetail);
    setIsDirty(true);
    
    // 重新构建甘特图数据
    const nodes = buildGanttNodes(newTemplateDetail);
    setGanttNodes(nodes);
    const blocks = generateTimeBlocks(nodes, newTemplateDetail);
    setTimeBlocks(blocks);
    
    setShowEditModal(false);
    setEditingOperation(null);
  };

  const handleDeleteOperation = (nodeId: string) => {
    // Extract operation ID from format: t{templateId}_operation_{operationId}
    const match = nodeId.match(/operation_([^_]+)$/);
    const operationId = match ? match[1] : nodeId.split('_').pop();
    if (!currentTemplateDetail) return;
    
    // 从templateDetail中删除操作
    const newTemplateDetail = { ...currentTemplateDetail };
    for (const stage of newTemplateDetail.stages) {
      const opIndex = stage.operations.findIndex(op => 
        (op.operation_template_id && op.operation_template_id.toString() === operationId) ||
        (op.operation_id && op.operation_id.toString() === operationId) ||
        op.operation_code === operationId
      );
      if (opIndex !== -1) {
        stage.operations.splice(opIndex, 1);
        break;
      }
    }
    
    setCurrentTemplateDetail(newTemplateDetail);
    setIsDirty(true);
    
    // 重新构建甘特图数据
    const nodes = buildGanttNodes(newTemplateDetail);
    setGanttNodes(nodes);
    const blocks = generateTimeBlocks(nodes, newTemplateDetail);
    setTimeBlocks(blocks);
    
    message.success('操作已删除');
  };

  const handleSaveTemplate = async () => {
    if (currentTemplateDetail && onSave) {
      try {
        await onSave(currentTemplateDetail);
        setIsDirty(false);
        message.success('模板已保存');
      } catch (error) {
        message.error('保存失败');
      }
    }
  };

  // 内联编辑处理函数
  const treeNodeOperations: TreeNodeOperations = {
    onEditField: (nodeId: string, field: 'name' | 'duration' | 'hc_requirement') => {
      let currentValue: string | number = '';
      
      // 获取当前值
      if (nodeId.includes('operation')) {
        const match = nodeId.match(/operation_([^_]+)$/);
        const operationId = match ? match[1] : nodeId.split('_').pop();
        const operation = findOperationById(operationId);
        if (operation) {
          switch (field) {
            case 'name':
              currentValue = operation.operation_name;
              break;
            case 'duration':
              currentValue = operation.estimated_duration_hours;
              break;
            case 'hc_requirement':
              currentValue = operation.hc_requirement;
              break;
          }
        }
      } else if (nodeId.includes('stage')) {
        const match = nodeId.match(/stage_([^_]+)$/);
        const stageId = match ? match[1] : nodeId.split('_').pop();
        const stage = findStageById(stageId);
        if (stage) {
          switch (field) {
            case 'name':
              currentValue = stage.stage_name;
              break;
            case 'duration':
              currentValue = stage.duration_days || 0;
              break;
          }
        }
      } else {
        // 模板级别
        if (currentTemplateDetail) {
          switch (field) {
            case 'name':
              currentValue = currentTemplateDetail.template_name;
              break;
          }
        }
      }

      setInlineEditingState({
        editingNodeId: nodeId,
        editingField: field,
        editingValue: currentValue
      });
    },

    onAddChild: (parentNodeId: string, type: 'stage' | 'operation') => {
      if (!currentTemplateDetail) return;
      
      const newTemplateDetail = { ...currentTemplateDetail };
      
      if (type === 'stage') {
        // 允许自定义阶段
        const stageNumber = newTemplateDetail.stages.length + 1;
        const newStageId = Date.now(); // 使用时间戳作为唯一ID
        const newStage: ProcessStage = {
          stage_template_id: newStageId,
          stage_code: `STAGE_${stageNumber}`,
          stage_name: `新阶段 ${stageNumber}`,
          stage_order: stageNumber,
          duration_days: 3,
          estimated_duration_hours: 72,
          absolute_start_day: newTemplateDetail.stages.length > 0 
            ? Math.max(...newTemplateDetail.stages.map(s => (s.absolute_start_day || 0) + (s.duration_days || 0)))
            : 0,
          operations: []
        };
        newTemplateDetail.stages.push(newStage);
      } else if (type === 'operation') {
        // Extract stage ID from format: t{templateId}_stage_{stageId}
        console.log('=== Adding Operation Debug ===');
        console.log('parentNodeId:', parentNodeId);
        
        // 更灵活的正则表达式，可以匹配各种格式的stage ID
        const match = parentNodeId.match(/stage_([^_]+)$/);
        const parentStageId = match ? match[1] : parentNodeId.split('_').pop();
        console.log('Extracted parentStageId:', parentStageId);
        console.log('All stages:', newTemplateDetail.stages.map(s => ({
          id: s.stage_template_id || s.stage_id,
          idString: s.stage_template_id ? s.stage_template_id.toString() : (s.stage_id ? s.stage_id.toString() : 'unknown'),
          name: s.stage_name,
          code: s.stage_code
        })));
        
        const stageIndex = newTemplateDetail.stages.findIndex(s => 
          (s.stage_template_id && s.stage_template_id.toString() === parentStageId) ||
          (s.stage_id && s.stage_id.toString() === parentStageId) ||
          s.stage_code === parentStageId
        );
        console.log('Found stage at index:', stageIndex);
        
        if (stageIndex !== -1) {
          const stage = newTemplateDetail.stages[stageIndex];
          const newOperation: ProcessOperation = {
            operation_template_id: Date.now(), // 临时ID
            operation_name: `新操作 ${stage.operations.length + 1}`,
            operation_order: stage.operations.length + 1,
            hc_requirement: 2,
            estimated_duration_hours: 2,
            standard_duration_hours: '2.00',
            required_qualifications: [],
            dependencies: [],
            stage_relative_day: 0,
            time_window_start_hours: 8,
            time_window_end_hours: 18,
            recommended_start_hour: 9
          };
          stage.operations.push(newOperation);
        } else {
          message.error('无法找到对应的阶段');
        }
      }

      setCurrentTemplateDetail(newTemplateDetail);
      setIsDirty(true);
      updateGanttData(newTemplateDetail);
      message.success(`新${type === 'stage' ? '阶段' : '操作'}已添加`);
    },

    onCopyNode: (nodeId: string) => {
      message.info('复制功能开发中...');
    },

    onDeleteNode: (nodeId: string) => {
      if (nodeId.includes('operation')) {
        handleDeleteOperation(nodeId);
      } else {
        message.info('阶段删除功能开发中...');
      }
    },

    onShowNodeDetails: (nodeId: string) => {
      if (nodeId.includes('operation')) {
        handleEditOperation(nodeId);
      } else if (nodeId.includes('stage')) {
        handleEditStage(nodeId);
      } else {
        message.info('详细信息功能开发中...');
      }
    },

    onShowNodeDependencies: (nodeId: string) => {
      message.info('依赖管理功能开发中...');
    },

    onSaveEdit: (nodeId: string, field: string, value: string | number) => {
      if (!currentTemplateDetail) return;
      
      const newTemplateDetail = { ...currentTemplateDetail };
      let updated = false;

      if (nodeId.includes('operation')) {
        const match = nodeId.match(/operation_([^_]+)$/);
        const operationId = match ? match[1] : nodeId.split('_').pop();
        for (const stage of newTemplateDetail.stages) {
          const operation = stage.operations.find(op => 
            (op.operation_template_id && op.operation_template_id.toString() === operationId) ||
            (op.operation_id && op.operation_id.toString() === operationId) ||
            op.operation_code === operationId
          );
          if (operation) {
            switch (field) {
              case 'name':
                operation.operation_name = value as string;
                updated = true;
                break;
              case 'duration':
                operation.estimated_duration_hours = value as number;
                operation.standard_duration_hours = (value as number).toFixed(2);
                updated = true;
                break;
              case 'hc_requirement':
                operation.hc_requirement = value as number;
                updated = true;
                break;
            }
            break;
          }
        }
      } else if (nodeId.includes('stage')) {
        const match = nodeId.match(/stage_([^_]+)$/);
        const stageId = match ? match[1] : nodeId.split('_').pop();
        const stage = newTemplateDetail.stages.find(s => 
          (s.stage_template_id && s.stage_template_id.toString() === stageId) ||
          (s.stage_id && s.stage_id.toString() === stageId) ||
          s.stage_code === stageId
        );
        if (stage) {
          switch (field) {
            case 'name':
              stage.stage_name = value as string;
              updated = true;
              break;
            case 'duration':
              stage.duration_days = value as number;
              stage.estimated_duration_hours = (value as number) * 24;
              updated = true;
              break;
          }
        }
      } else {
        // 模板级别
        switch (field) {
          case 'name':
            newTemplateDetail.template_name = value as string;
            updated = true;
            break;
        }
      }

      if (updated) {
        setCurrentTemplateDetail(newTemplateDetail);
        setIsDirty(true);
        updateGanttData(newTemplateDetail);
        message.success('修改已保存');
      }

      setInlineEditingState({
        editingNodeId: null,
        editingField: null,
        editingValue: ''
      });
    },

    onCancelEdit: () => {
      setInlineEditingState({
        editingNodeId: null,
        editingField: null,
        editingValue: ''
      });
    }
  };

  // 辅助函数
  const findOperationById = (operationId: string | undefined): ProcessOperation | null => {
    if (!currentTemplateDetail || !operationId) return null;
    for (const stage of currentTemplateDetail.stages) {
      const operation = stage.operations.find(op => 
        (op.operation_template_id && op.operation_template_id.toString() === operationId) ||
        (op.operation_id && op.operation_id.toString() === operationId) ||
        op.operation_code === operationId
      );
      if (operation) return operation;
    }
    return null;
  };

  const findStageById = (stageId: string | undefined): ProcessStage | null => {
    if (!currentTemplateDetail || !stageId) return null;
    return currentTemplateDetail.stages.find(s => 
      (s.stage_template_id && s.stage_template_id.toString() === stageId) ||
      (s.stage_id && s.stage_id.toString() === stageId) ||
      s.stage_code === stageId
    ) || null;
  };

  const updateGanttData = (templateDetail: ProcessTemplateDetail) => {
    const nodes = buildGanttNodes(templateDetail);
    setGanttNodes(nodes);
    const blocks = generateTimeBlocks(nodes, templateDetail);
    setTimeBlocks(blocks);
  };

  const getOperationMenuItems = (nodeId: string): MenuProps['items'] => [
    {
      key: 'edit',
      label: '编辑',
      icon: <EditOutlined />,
      onClick: () => handleEditOperation(nodeId)
    },
    {
      key: 'delete',
      label: '删除',
      icon: <DeleteOutlined />,
      danger: true,
      onClick: () => handleDeleteOperation(nodeId)
    }
  ];

  const buildTreeData = (nodes: GanttNode[]): DataNode[] => {
    return nodes.map(node => ({
      title: renderTreeNodeTitle(node),
      key: node.id,
      children: node.children ? buildTreeData(node.children) : undefined,
      style: { height: 36 }, // 确保行高一致
    }));
  };

  const renderTreeNodeTitle = (node: GanttNode) => {
    const isEditing = inlineEditingState.editingNodeId === node.id;
    
    return (
      <div 
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          width: '100%',
          height: 32,
          padding: '2px 0',
          overflow: 'hidden'
        }}
        className="tree-node-title"
        onMouseEnter={() => setHoveredNodeId(node.id)}
        onMouseLeave={() => setHoveredNodeId(null)}
      >
        <div style={{ 
          flex: 1,
          minWidth: 0,
          marginRight: 8,
          overflow: 'hidden'
        }}>
          {isEditing ? (
            // 内联编辑模式
            <InlineEditor
              value={inlineEditingState.editingValue}
              type={inlineEditingState.editingField === 'name' ? 'text' : 'number'}
              min={inlineEditingState.editingField === 'hc_requirement' ? 1 : 0.1}
              max={inlineEditingState.editingField === 'hc_requirement' ? 20 : 1000}
              suffix={
                inlineEditingState.editingField === 'duration' 
                  ? (node.type === 'stage' ? '天' : '小时')
                  : inlineEditingState.editingField === 'hc_requirement' 
                  ? '人' 
                  : undefined
              }
              onSave={(value) => treeNodeOperations.onSaveEdit(node.id, inlineEditingState.editingField!, value)}
              onCancel={treeNodeOperations.onCancelEdit}
              validation={(value) => {
                if (inlineEditingState.editingField === 'name' && (!value || (value as string).trim().length === 0)) {
                  return '名称不能为空';
                }
                if ((inlineEditingState.editingField === 'duration' || inlineEditingState.editingField === 'hc_requirement') && Number(value) <= 0) {
                  return '值必须大于0';
                }
                return null;
              }}
            />
          ) : (
            // 正常显示模式
            <div 
              style={{ 
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'nowrap',
                overflow: 'hidden'
              }}
              onDoubleClick={() => {
                if (mode === 'template_edit') {
                  treeNodeOperations.onEditField(node.id, 'name');
                }
              }}
            >

              {/* 节点标题 */}
              <Text 
                strong={node.type === 'template'} 
                style={{ 
                  fontSize: node.type === 'template' ? 14 : 13,
                  marginRight: 8,
                  flexShrink: 0,
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  cursor: mode === 'template_edit' ? 'pointer' : 'default',
                  color: node.type === 'template' ? '#1890ff' : 
                         node.type === 'stage' ? '#52c41a' : 
                         '#595959'
                }}
                title={node.title}
              >
                {node.title}
              </Text>

            </div>
          )}
        </div>

        {/* 操作按钮区域 - 简化显示条件，在编辑模式下直接显示操作按钮 */}
        {mode === 'template_edit' && !isEditing && (node.type === 'operation' || node.type === 'stage') && (
          <EnhancedTreeNodeActions
            node={node}
            mode={mode}
            onEdit={treeNodeOperations.onEditField}
            onAdd={treeNodeOperations.onAddChild}
            onCopy={treeNodeOperations.onCopyNode}
            onDelete={treeNodeOperations.onDeleteNode}
            onShowDetails={treeNodeOperations.onShowNodeDetails}
            onShowDependencies={treeNodeOperations.onShowNodeDependencies}
          />
        )}
      </div>
    );
  };

  // 收集所有可见行（基于树的展开状态）
  const collectVisibleRows = useCallback((nodes: GanttNode[], parentExpanded = true): string[] => {
    const rows: string[] = [];
    
    nodes.forEach(node => {
      if (parentExpanded) {
        rows.push(node.id);
        
        if (node.children && node.children.length > 0) {
          const isExpanded = expandedKeys.includes(node.id);
          const childRows = collectVisibleRows(node.children, isExpanded);
          rows.push(...childRows);
        }
      }
    });
    
    return rows;
  }, [expandedKeys]);

  // 更新可见行
  useEffect(() => {
    const visible = collectVisibleRows(ganttNodes);
    setVisibleRows(visible);
  }, [ganttNodes, expandedKeys, collectVisibleRows]);

  // 移除树容器中的空白40px div
  useEffect(() => {
    const removeEmptyDiv = () => {
      const treeContainer = document.querySelector('.gantt-tree-container');
      if (treeContainer) {
        const children = Array.from(treeContainer.children);
        children.forEach(child => {
          if (child instanceof HTMLDivElement) {
            const styles = window.getComputedStyle(child);
            if (styles.height === '40px' && 
                styles.backgroundColor === 'rgb(245, 245, 245)' && 
                !child.innerText && 
                !child.querySelector('.ant-tree')) {
              child.remove();
            }
          }
        });
      }
    };
    
    // 延迟执行以确保DOM已渲染
    const timer = setTimeout(removeEmptyDiv, 100);
    return () => clearTimeout(timer);
  }, [ganttNodes, expandedKeys]);

  // 处理甘特图内容区域的滚动事件
  const handleGanttScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const element = e.target as HTMLDivElement;
    const newHorizontalScrollLeft = element.scrollLeft;
    const newVerticalScrollTop = element.scrollTop;
    
    // 更新状态
    setHorizontalScrollLeft(newHorizontalScrollLeft);
    setVerticalScrollTop(newVerticalScrollTop);
    
    // 同步左侧树形列表的垂直滚动
    if (treeContainerRef.current) {
      treeContainerRef.current.scrollTop = newVerticalScrollTop;
    }
  }, []);

  // 处理左侧树形列表的滚动事件
  const handleTreeScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const element = e.target as HTMLDivElement;
    const newVerticalScrollTop = element.scrollTop;
    
    // 更新状态
    setVerticalScrollTop(newVerticalScrollTop);
    
    // 同步右侧甘特图内容区域的垂直滚动
    if (ganttContentRef.current) {
      ganttContentRef.current.scrollTop = newVerticalScrollTop;
    }
  }, []);

  // 缩放控制函数
  const handleZoomIn = useCallback(() => {
    setZoomScale(prev => Math.min(prev * 1.2, 5.0)); // 最大5倍缩放
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomScale(prev => Math.max(prev / 1.2, 0.2)); // 最小0.2倍缩放
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoomScale(1.0);
  }, []);

  const handleZoomChange = useCallback((value: number) => {
    setZoomScale(Math.max(0.2, Math.min(5.0, value)));
  }, []);

  // 鼠标滚轮缩放
  const handleWheelZoom = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1; // 缩放步长
      setZoomScale(prev => Math.max(0.2, Math.min(5.0, prev * delta)));
    }
  }, []);

  const renderTimeAxis = () => {
    // 计算总小时数
    let maxHours = 720; // 默认30天
    if (timeBlocks.length > 0) {
      maxHours = Math.max(...timeBlocks.map(block => block.start_hour + block.duration_hours), 720);
    } else if (templateDetail) {
      maxHours = (templateDetail.total_duration_days || 30) * 24;
    }
    
    const baseHourWidth = 8; // 基础每小时宽度
    const hourWidth = baseHourWidth * zoomScale; // 应用缩放比例
    const hoursPerDay = 24;
    const dayWidth = hourWidth * hoursPerDay; // 每天宽度
    const days = Math.ceil(maxHours / 24);
    
    return (
      <div style={{ 
        display: 'flex', 
        borderBottom: '1px solid #f0f0f0', 
        height: 40,
        flexShrink: 0,
        backgroundColor: '#fafafa', 
        zIndex: 2,
        position: 'relative',
        overflow: 'hidden',
        transform: `translateX(-${horizontalScrollLeft}px)` // 使用水平滚动偏移
      }}>
        {/* 天级别刻度 */}
        {Array.from({ length: days }, (_, dayIndex) => (
          <div key={`day-${dayIndex}`} style={{ position: 'relative' }}>
            {/* 天标题 */}
            <div
              style={{
                width: dayWidth,
                height: 24,
                border: '1px solid #f0f0f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#f5f5f5',
                fontWeight: 600,
                fontSize: 11,
                borderBottom: 'none'
              }}
            >
              总Day{dayIndex}
            </div>
            {/* 小时刻度 */}
            <div style={{ display: 'flex', height: 16 }}>
              {Array.from({ length: hoursPerDay }, (_, hourIndex) => {
                const isWorkingHour = hourIndex >= 9 && hourIndex < 17; // 9am-5pm
                // 根据缩放比例调整显示频率
                const shouldShowLabel = zoomScale >= 1 
                  ? hourIndex % 6 === 0 
                  : zoomScale >= 0.5 
                    ? hourIndex % 12 === 0
                    : hourIndex === 0 || hourIndex === 12; // 极小缩放时只显示0和12点
                    
                return (
                  <div
                    key={`hour-${dayIndex}-${hourIndex}`}
                    style={{
                      width: hourWidth,
                      height: 16,
                      borderRight: hourIndex % 6 === 5 ? '1px solid #d9d9d9' : '1px solid #f0f0f0',
                      background: isWorkingHour 
                        ? 'rgba(24, 144, 255, 0.15)' // 工作时间淡蓝色
                        : hourIndex % 12 === 0 ? '#fafafa' : 'transparent',
                      fontSize: Math.min(8, Math.max(6, Math.round(8 * zoomScale))), // 动态字体大小
                      textAlign: 'center',
                      lineHeight: '16px',
                      color: isWorkingHour ? '#1890ff' : '#666',
                      overflow: 'hidden'
                    }}
                    title={`${hourIndex}:00${isWorkingHour ? ' (工作时间)' : ''}`}
                  >
                    {shouldShowLabel && hourWidth > 12 ? hourIndex : ''}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const handleTimeBlockDrag = useCallback((blockId: string, newStartHour: number) => {
    if (mode !== 'template_edit') return;
    
    setTimeBlocks(prev => prev.map(block => 
      block.id === blockId 
        ? { ...block, start_hour: Math.max(0, newStartHour) }
        : block
    ));
    setIsDirty(true);
    
    // TODO: 更新对应的操作数据
    message.info('时间调整已应用，请保存模板');
  }, [mode]);

  const renderTimeBlocks = () => {
    if (timeBlocks.length === 0) {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Empty description="暂无时间块数据" />
        </div>
      );
    }

    // 使用与时间轴相同的小时精度设置
    const baseHourWidth = 8; // 基础每小时宽度
    const hourWidth = baseHourWidth * zoomScale; // 应用缩放比例，与时间轴保持一致
    const rowHeight = 36; // 每行高度，与树形组件保持一致
    
    // 使用与时间轴相同的计算逻辑
    let maxHours = 720;
    if (timeBlocks.length > 0) {
      maxHours = Math.max(...timeBlocks.map(block => block.start_hour + block.duration_hours), 720);
    } else if (templateDetail) {
      maxHours = (templateDetail.total_duration_days || 30) * 24;
    }
    
    const totalWidth = maxHours * hourWidth; // 总宽度 = 总小时数 × 每小时宽度

    return (
      <div style={{ 
        position: 'relative', 
        width: totalWidth,
        minHeight: visibleRows.length * rowHeight
      }}>
        {/* 行背景（奇数偶数行交替） */}
        {visibleRows.map((rowId, index) => (
          <div
            key={`row-bg-${rowId}`}
            style={{
              position: 'absolute',
              top: index * rowHeight,
              left: 0,
              width: '100%',
              height: rowHeight,
              backgroundColor: index % 2 === 0 ? '#fafafa' : '#ffffff',
              zIndex: 0
            }}
          />
        ))}
        
        {/* 工作时间列背景（9am-5pm） */}
        {Array.from({ length: Math.ceil(maxHours / 24) }, (_, dayIndex) => (
          <div
            key={`work-hours-${dayIndex}`}
            style={{
              position: 'absolute',
              top: 0,
              left: (dayIndex * 24 + 9) * hourWidth, // 9am开始
              width: 8 * hourWidth, // 8小时宽度 (9am-5pm)
              height: visibleRows.length * rowHeight,
              backgroundColor: 'rgba(24, 144, 255, 0.04)', // 工作时间淡蓝色背景
              zIndex: 1,
              pointerEvents: 'none'
            }}
          />
        ))}
        
        {/* 背景网格 */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundImage: `
            linear-gradient(to right, #f0f0f0 1px, transparent 1px),
            linear-gradient(to bottom, #e8e8e8 1px, transparent 1px)
          `,
          backgroundSize: `${hourWidth * 24}px ${rowHeight}px`,
          zIndex: 2,
          pointerEvents: 'none'
        }} />
        
        {/* 时间块 */}
        {timeBlocks.filter(block => {
          // 过滤掉时间窗口块，只显示推荐时间块和阶段块
          if (block.isTimeWindow) return false;
          
          // 检查是否是阶段级别的时间块
          const isStageBlock = block.id.includes('block_stage_');
          
          // 如果是阶段级别的时间块，检查该阶段是否已展开
          if (isStageBlock) {
            const stageNodeId = block.node_id;
            const isExpanded = expandedKeys.includes(stageNodeId);
            // 如果阶段已展开，不显示阶段级别的时间块（因为会显示操作级别的时间块）
            if (isExpanded) return false;
          }
          
          return true;
        }).map((block) => {
          const rowIndex = visibleRows.indexOf(block.node_id);
          
          // 如果节点不在可见行中，不渲染
          if (rowIndex === -1) return null;
          
          const leftOffset = block.start_hour * hourWidth; // 精确到小时的位置
          const width = Math.max(block.duration_hours * hourWidth, hourWidth * 0.5); // 最小宽度0.5小时
          
          return (
            <div
              key={block.id}
              style={{
                position: 'absolute',
                left: leftOffset,
                top: rowIndex * rowHeight + 4, // 使用与背景相同的行高计算，留4px上边距
                width: width,
                height: rowHeight - 8, // 留8px的上下边距
                background: block.color,
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                color: 'white',
                fontSize: 10,
                cursor: mode === 'template_edit' ? 'move' : 'default',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                border: '1px solid rgba(255,255,255,0.3)',
                transition: 'all 0.2s ease',
                paddingLeft: 4,
                paddingRight: 4,
                zIndex: 10 // 确保时间块在所有背景之上
              }}
              title={`${block.title}\n开始: 总Day${Math.floor(block.start_hour / 24)} ${block.start_hour % 24}:00\n时长: ${block.duration_hours}小时\n结束: 总Day${Math.floor((block.start_hour + block.duration_hours) / 24)} ${(block.start_hour + block.duration_hours) % 24}:00`}
              draggable={mode === 'template_edit'}
              onDragEnd={(e) => {
                if (mode === 'template_edit') {
                  const rect = e.currentTarget.parentElement!.getBoundingClientRect();
                  const newLeftOffset = e.clientX - rect.left;
                  const newStartHour = Math.round(newLeftOffset / hourWidth * 2) / 2; // 支持半小时精度
                  handleTimeBlockDrag(block.id, newStartHour);
                }
              }}
            >
              <span style={{ 
                overflow: 'hidden', 
                textOverflow: 'ellipsis', 
                whiteSpace: 'nowrap',
                fontSize: width > 80 ? 10 : 8
              }}>
                {width > 40 ? (
                  block.title.length > Math.floor(width / 6) 
                    ? `${block.title.substring(0, Math.floor(width / 6))}...` 
                    : block.title
                ) : ''}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  if (!templateDetail) {
    return (
      <Card title="甘特图">
        <Empty description="请先选择工艺模板" />
      </Card>
    );
  }

  return (
    <>
      <style>{treeStyles}</style>
      <div style={{ height: 600, border: '1px solid #f0f0f0' }}>
        <div style={{ 
          height: 40, 
          background: '#fafafa', 
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          justifyContent: 'space-between'
        }}>
          <Title level={4} style={{ margin: 0, writingMode: 'horizontal-tb' }}>
            甘特图 - {templateDetail.template_name}
            {isDirty && <Tag color="orange" style={{ marginLeft: 8 }}>未保存</Tag>}
          </Title>
          <Space>
            {/* 缩放控制 */}
            <Space.Compact>
              <Tooltip title="缩小">
                <Button 
                  size="small" 
                  icon={<ZoomOutOutlined />} 
                  onClick={handleZoomOut}
                  disabled={zoomScale <= 0.2}
                />
              </Tooltip>
              <Tooltip title="重置缩放">
                <Button 
                  size="small" 
                  icon={<CompressOutlined />} 
                  onClick={handleZoomReset}
                  disabled={zoomScale === 1.0}
                />
              </Tooltip>
              <Tooltip title="放大">
                <Button 
                  size="small" 
                  icon={<ZoomInOutlined />} 
                  onClick={handleZoomIn}
                  disabled={zoomScale >= 5.0}
                />
              </Tooltip>
            </Space.Compact>
            
            {/* 缩放滑块 */}
            <Tooltip title="可以使用 Ctrl+滚轮 进行缩放" placement="bottom">
              <div style={{ width: 120, display: 'flex', alignItems: 'center' }}>
                <Slider
                  min={0.2}
                  max={5.0}
                  step={0.1}
                  value={zoomScale}
                  onChange={handleZoomChange}
                  style={{ flex: 1, margin: '0 8px' }}
                  tooltip={{
                    formatter: (value) => `${Math.round((value || 1) * 100)}%`
                  }}
                />
                <Text style={{ fontSize: 11, minWidth: 40 }}>
                  {Math.round(zoomScale * 100)}%
                </Text>
              </div>
            </Tooltip>
            
            {mode === 'template_edit' && (
              <>
                <Button 
                  type="primary" 
                  size="small" 
                  icon={<SaveOutlined />}
                  onClick={handleSaveTemplate}
                  disabled={!isDirty}
                >
                  保存模板
                </Button>
                <Button type="default" size="small" icon={<EditOutlined />}>
                  编辑模式
                </Button>
              </>
            )}
          </Space>
        </div>
        
        <div style={{ display: 'flex', height: 560, overflow: 'hidden' }}>
          {/* 左侧任务列表 - 固定宽度 */}
          <div style={{ 
            width: 300, 
            borderRight: '1px solid #f0f0f0',
            background: '#fff',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* 左侧表头 */}
            <div 
              data-component="left-header"
              style={{ 
              height: 40, // 与右侧时间轴表头保持同一高度
              background: '#f5f5f5', 
              borderBottom: '1px solid #f0f0f0',
              display: 'flex',
              alignItems: 'center',
              padding: '0 12px',
              fontSize: 14,
              fontWeight: 500,
              flexShrink: 0
            }}>
              任务结构
            </div>
            
            {/* 左侧树形列表 */}
            <div 
              ref={treeContainerRef}
              style={{ 
                flex: 1,
                overflow: 'auto',
                position: 'relative',
                padding: 0,
                margin: 0
              }}
              onScroll={handleTreeScroll}
              className="gantt-tree-container"
            >
              {/* 行背景 */}
              {visibleRows.map((rowId, index) => (
                <div
                  key={`tree-row-bg-${rowId}`}
                  className="gantt-tree-row-bg"
                  style={{
                    top: index * 36, // rowHeight = 36px for tree，与时间块保持一致
                    backgroundColor: index % 2 === 0 ? '#fafafa' : '#ffffff'
                  }}
                />
              ))}
              
              <div style={{ 
                position: 'absolute', 
                top: 0, 
                left: 0, 
                right: 0, 
                padding: 0, 
                margin: 0
              }}>
                <Tree
                  showLine={{ showLeafIcon: false }}
                  switcherIcon={<CaretRightOutlined />}
                  expandedKeys={expandedKeys}
                  onExpand={setExpandedKeys}
                  treeData={buildTreeData(ganttNodes)}
                  blockNode={true}
                  virtual={false}
                  style={{
                    background: 'transparent',
                    padding: 0,
                    margin: 0
                  }}
                  className="gantt-tree"
                />
              </div>
            </div>
          </div>

          {/* 右侧甘特图区域 */}
          <div style={{ 
            flex: 1, 
            background: '#fff',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            {/* 时间轴表头 - 直接渲染，不要额外的包裹div */}
            {renderTimeAxis()}
            
            {/* 甘特图内容区 */}
            <div 
              ref={ganttContentRef}
              style={{ 
                flex: 1,
                overflow: 'auto',
                position: 'relative'
              }}
              onScroll={handleGanttScroll}
              onWheel={handleWheelZoom}
            >
              {renderTimeBlocks()}
            </div>
          </div>
        </div>
      </div>

      {/* 操作编辑弹窗 */}
      <OperationEditModal
        open={showEditModal}
        operation={editingOperation}
        onCancel={() => {
          setShowEditModal(false);
          setEditingOperation(null);
        }}
        onSave={handleSaveOperation}
      />
      
      <StageEditModal
        open={showStageEditModal}
        stage={editingStage}
        onCancel={() => {
          setShowStageEditModal(false);
          setEditingStage(null);
        }}
        onSave={handleSaveStage}
      />
    </>
  );
};

export default GanttChartEnhanced;
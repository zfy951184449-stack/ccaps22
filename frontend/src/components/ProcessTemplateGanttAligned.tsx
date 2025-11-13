import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Typography, 
  Space, 
  Tag, 
  Button,
  Tooltip,
  Empty,
  message,
  Slider,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Row,
  Col,
  Tabs,
  Card,
  List,
  Alert,
  Popconfirm
} from 'antd';
import { 
  CaretRightOutlined,
  CaretDownOutlined,
  UserOutlined, 
  ClockCircleOutlined, 
  EditOutlined,
  DeleteOutlined,
  PlusOutlined,
  SaveOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  CompressOutlined,
  ArrowLeftOutlined,
  DragOutlined,
  SafetyOutlined
} from '@ant-design/icons';
import axios from 'axios';
import OperationConstraintsPanel from './OperationConstraintsPanel';
import { ConstraintValidationResult, ConstraintConflict } from '../types';

const { Text } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;
const { TextArea } = Input;

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
  description?: string;
}

interface Constraint {
  constraint_id?: number;
  related_schedule_id: number;
  related_operation_name: string;
  related_operation_code: string;
  constraint_type: number;
  lag_time: number;
  share_personnel: boolean;
  constraint_name?: string;
  constraint_level?: number;
  description?: string;
  relation_type: 'predecessor' | 'successor';
}

interface ShareGroup {
  id: number;
  group_code: string;
  group_name: string;
  description?: string;
  color: string;
  operation_count?: number;
  priority?: number;
}

interface GanttConstraint {
  constraint_id: number;
  from_schedule_id: number;
  from_operation_id: number;
  from_operation_name: string;
  from_operation_code: string;
  to_schedule_id: number;
  to_operation_id: number;
  to_operation_name: string;
  to_operation_code: string;
  constraint_type: number;
  lag_time: number;
  share_personnel?: boolean;
  constraint_level?: number;
  constraint_name?: string;
  from_stage_name: string;
  to_stage_name: string;
  from_operation_day: number;
  from_recommended_time: number;
  to_operation_day: number;
  to_recommended_time: number;
  from_stage_start_day: number;
  to_stage_start_day: number;
}

interface ProcessTemplateGanttAlignedProps {
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
  start_day?: number;
  start_hour?: number;
  children?: GanttNode[];
  expanded?: boolean;
  editable?: boolean;
  level?: number;
  data?: ProcessStage | StageOperation;
}

interface TimeBlock {
  id: string;
  node_id: string;
  title: string;
  start_hour: number;
  duration_hours: number;
  color: string;
  isTimeWindow?: boolean;
  isRecommended?: boolean;
  isStage?: boolean;
}

// 阶段颜色映射
const TOKENS = {
  primary: '#2563EB',
  secondary: '#64748B',
  alert: '#DC2626',
  background: '#F8FAFC',
  card: '#FFFFFF',
  border: '#E5E7EB',
  textPrimary: '#111827',
  textSecondary: '#374151'
} as const;

const STAGE_COLORS: Record<string, string> = {
  STAGE1: '#2563EB',
  STAGE2: '#0F766E',
  STAGE3: '#D97706',
  STAGE4: '#B91C1C',
  STAGE5: '#7C3AED',
  DEFAULT: '#475569'
};

// 时间轴配置
const BASE_HOUR_WIDTH = 8; // 基础每小时像素宽度
const HEADER_HEIGHT = 40; // 树/时间轴表头高度
const TITLE_BAR_HEIGHT = 64; // 顶部标题区域高度
const CONTENT_GAP = 16; // 标题区与主视图间距
const LEFT_PANEL_WIDTH = 360; // 左侧树列宽度
const ROW_HEIGHT = 36; // 树与甘特行高度统一

interface FlattenedRow {
  id: string;
  node: GanttNode;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  parentId?: string;
}

const toRgba = (hex: string, alpha: number) => {
  const color = hex.replace('#', '');
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const normalizeSearchInput = (text: string) =>
  text
    .toLowerCase()
    .replace(/[\u3000\s]+/g, ' ')
    .trim();

const normalizeForFuzzyMatch = (text: string) =>
  normalizeSearchInput(text).replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '');

const isSubsequence = (pattern: string, target: string) => {
  if (!pattern) {
    return true;
  }
  let patternIndex = 0;
  for (let i = 0; i < target.length && patternIndex < pattern.length; i += 1) {
    if (target[i] === pattern[patternIndex]) {
      patternIndex += 1;
    }
  }
  return patternIndex === pattern.length;
};

const fuzzyMatch = (query: string, target: string) => {
  if (!query) {
    return true;
  }
  if (!target) {
    return false;
  }

  const normalizedTarget = normalizeSearchInput(target);
  const compressedTarget = normalizeForFuzzyMatch(target);
  const tokens = normalizeSearchInput(query).split(' ').filter(Boolean);

  if (!tokens.length) {
    return true;
  }

  return tokens.every((token) => {
    const compressedToken = normalizeForFuzzyMatch(token);
    if (!compressedToken) {
      return true;
    }
    if (normalizedTarget.includes(token)) {
      return true;
    }
    return isSubsequence(compressedToken, compressedTarget);
  });
};

const ProcessTemplateGanttAligned: React.FC<ProcessTemplateGanttAlignedProps> = ({ 
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
  const [zoomScale, setZoomScale] = useState(1.0);
  const [loading, setLoading] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(640);
  
  const isPanningRef = useRef(false);
  const panStartXRef = useRef(0);
  const panStartScrollLeftRef = useRef(0);
  const panRafRef = useRef<number | null>(null);

  // 约束和共享组相关state
  const [operationConstraints, setOperationConstraints] = useState<{
    predecessors: Constraint[];
    successors: Constraint[];
  }>({ predecessors: [], successors: [] });
  const [shareGroups, setShareGroups] = useState<ShareGroup[]>([]);
  const [operationShareGroups, setOperationShareGroups] = useState<ShareGroup[]>([]);
  const [availableOperationsForConstraints, setAvailableOperationsForConstraints] = useState<any[]>([]);
  const [ganttConstraints, setGanttConstraints] = useState<GanttConstraint[]>([]);
  const [validationDrawerVisible, setValidationDrawerVisible] = useState(false);
  const [validationLoading, setValidationLoading] = useState(false);
  const [validationResult, setValidationResult] = useState<ConstraintValidationResult | null>(null);
  const [activeHighlight, setActiveHighlight] = useState<{ operations: string[]; constraints: number[] }>({ operations: [], constraints: [] });
  const [scheduling, setScheduling] = useState(false);
  const [shareGroupModalVisible, setShareGroupModalVisible] = useState(false);
  const [assigningGroup, setAssigningGroup] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [personnelCurve, setPersonnelCurve] = useState<{ points: { hourIndex: number; requiredPeople: number }[]; peak?: { hourIndex: number; requiredPeople: number } | null }>({ points: [], peak: null });
  const [scheduleConflicts, setScheduleConflicts] = useState<Record<number, string>>({});
  const [operationModalVisible, setOperationModalVisible] = useState(false);
  const [operationSubmitting, setOperationSubmitting] = useState(false);
  const [laborHover, setLaborHover] = useState<{
    hourIndex: number;
    value: number;
    x: number;
    y: number;
  } | null>(null);

  const [form] = Form.useForm();
  const [constraintForm] = Form.useForm();
  const [shareGroupForm] = Form.useForm();
  const [assignGroupForm] = Form.useForm();
  const [operationForm] = Form.useForm<Operation>();

  const operationSearchIndex = useMemo(() => {
    const map = new Map<number, string>();
    availableOperations.forEach((op) => {
      const searchText = [op.operation_code, op.operation_name, op.description]
        .filter(Boolean)
        .join(' ');
      map.set(op.id, searchText);
    });
    return map;
  }, [availableOperations]);

  const generateOperationCode = useCallback(() => {
    const base = `OP-${Date.now()}`;
    if (!availableOperations.some((op) => op.operation_code === base)) {
      return base;
    }
    let counter = 1;
    let candidate = `${base}-${counter}`;
    while (availableOperations.some((op) => op.operation_code === candidate)) {
      counter += 1;
      candidate = `${base}-${counter}`;
    }
    return candidate;
  }, [availableOperations]);
  const API_BASE_URL = 'http://localhost:3001/api';

  const ganttContentRef = useRef<HTMLDivElement>(null);


  const stageColorMap = useMemo(() => {
    const map = new Map<number, string>();
    const paletteKeys = Object.keys(STAGE_COLORS).filter(key => key !== 'DEFAULT');
  stages.forEach((stage, index) => {
    const paletteKey = paletteKeys[index % paletteKeys.length] || 'DEFAULT';
    map.set(stage.id, STAGE_COLORS[paletteKey]);
  });
  return map;
  }, [stages]);

  const flattenGanttNodes = useCallback((nodes: GanttNode[], depth = 0, parentId?: string): FlattenedRow[] => {
    const expandedSet = new Set(expandedKeys);
    const result: FlattenedRow[] = [];

    nodes.forEach((node) => {
      const hasChildren = Array.isArray(node.children) && node.children.length > 0;
      const isExpanded = expandedSet.has(node.id) || node.type === 'template';

      result.push({
        id: node.id,
        node,
        depth,
        hasChildren,
        isExpanded,
        parentId
      });

      if (hasChildren && isExpanded) {
        result.push(...flattenGanttNodes(node.children!, depth + 1, node.id));
      }
    });

    return result;
  }, [expandedKeys]);

  const flattenedRows = useMemo(() => {
    if (!ganttNodes.length) {
      return [] as FlattenedRow[];
    }
    return flattenGanttNodes(ganttNodes, 0, undefined);
  }, [flattenGanttNodes, ganttNodes]);

  const rowIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    flattenedRows.forEach((row, index) => {
      map.set(row.id, index);
    });
    return map;
  }, [flattenedRows]);

  const totalHeight = flattenedRows.length * ROW_HEIGHT;
  const overscanCount = 6;
  const visibleStartIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT));
  const viewportRowCount = Math.max(1, Math.ceil(viewportHeight / ROW_HEIGHT));
  const visibleEndIndex = Math.min(flattenedRows.length, visibleStartIndex + viewportRowCount + overscanCount);
  const virtualRows = useMemo(() => flattenedRows.slice(visibleStartIndex, visibleEndIndex), [flattenedRows, visibleStartIndex, visibleEndIndex]);
  const virtualOffsetY = visibleStartIndex * ROW_HEIGHT;

  // 加载模板数据
  useEffect(() => {
    loadTemplateData();
    loadShareGroups();
    loadAvailableOperationsForConstraints();
    loadGanttConstraints();
  }, [template]);

  useEffect(() => {
    setValidationResult(null);
    setActiveHighlight({ operations: [], constraints: [] });
    setValidationDrawerVisible(false);
  }, [template.id]);

  useEffect(() => {
    assignGroupForm.setFieldsValue({ priority: Math.max(1, operationShareGroups.length + 1) });
  }, [operationShareGroups, assignGroupForm]);

  useEffect(() => {
    const container = ganttContentRef.current;
    if (!container) {
      return;
    }

    const updateViewport = () => {
      setViewportHeight(container.clientHeight || 0);
    };

    updateViewport();

    const resizeObserver = new ResizeObserver(() => {
      updateViewport();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

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
      setTimeBlocks(blocks);

      // 默认展开所有节点
      const defaultExpandedKeys = [template.id.toString()];
      nodes[0].children?.forEach(stageNode => {
        defaultExpandedKeys.push(stageNode.id);
      });
      setExpandedKeys(defaultExpandedKeys);

      // 加载人员用量曲线
      try {
        const curveResponse = await axios.get(`${API_BASE_URL}/process-templates/${template.id}/personnel-curve`);
        setPersonnelCurve({
          points: curveResponse.data.points || [],
          peak: curveResponse.data.peak || null
        });
      } catch (curveError) {
        console.error('Failed to load personnel curve:', curveError);
        setPersonnelCurve({ points: [], peak: null });
      }

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
    const sortedStages = stages
      .slice()
      .sort((a, b) => {
        if (a.start_day !== b.start_day) {
          return a.start_day - b.start_day;
        }
        if (a.stage_order !== b.stage_order) {
          return a.stage_order - b.stage_order;
        }
        return a.id - b.id;
      });

    sortedStages.forEach((stage) => {
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
      const operations = (stageOpsMap[stage.id] || [])
        .slice()
        .sort((a, b) => {
          const aDay =
            stage.start_day +
            a.operation_day +
            (a.recommended_day_offset ?? 0);
          const bDay =
            stage.start_day +
            b.operation_day +
            (b.recommended_day_offset ?? 0);
          if (aDay !== bDay) {
            return aDay - bDay;
          }
          const aTime =
            typeof a.recommended_time === 'number' ? a.recommended_time : 0;
          const bTime =
            typeof b.recommended_time === 'number' ? b.recommended_time : 0;
          if (aTime !== bTime) {
            return aTime - bTime;
          }
          return a.operation_order - b.operation_order;
        });

      operations.forEach((operation) => {
        const recommendedDayOffset = operation.recommended_day_offset ?? 0;
        const absoluteStartDay = stage.start_day + operation.operation_day + recommendedDayOffset;
        const operationNode: GanttNode = {
          id: `operation_${operation.id}`,
          title: operation.operation_name,
          type: 'operation',
          parent_id: `stage_${stage.id}`,
          required_people: operation.required_people || 1,
          standard_time: typeof operation.standard_time === 'string' 
            ? parseFloat(operation.standard_time) || 4 
            : operation.standard_time || 4, // 默认4小时
          start_day: absoluteStartDay,
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
    const processedNodeIds = new Set<string>();
    
    const processNode = (node: GanttNode) => {
      if (processedNodeIds.has(node.id)) {
        return;
      }
      processedNodeIds.add(node.id);
      
      if (node.type === 'stage') {
        const stageCode = node.stage_code || 'DEFAULT';

        let stageStartHour = (node.start_day || 0) * 24;
        let stageEndHour = stageStartHour + 24;

        if (node.children && node.children.length > 0) {
          let earliestDay = Infinity;
          let maxEndHour = -Infinity;

          node.children.forEach(child => {
            const operationData = child.data as StageOperation;

            const stageDayBase = node.start_day || 0;
            const opDay = child.start_day ?? stageDayBase;
            const recommendedTime = typeof operationData?.recommended_time === 'string'
              ? parseFloat(operationData.recommended_time)
              : (operationData?.recommended_time ?? 9);

            const opStartHour = opDay * 24 + recommendedTime;

            let duration = typeof child.standard_time === 'string'
              ? parseFloat(child.standard_time)
              : child.standard_time;

            if (!duration || isNaN(duration) || duration <= 0) {
              duration = 4;
            }

            const opEndHour = opStartHour + duration;

            earliestDay = Math.min(earliestDay, opDay);
            maxEndHour = Math.max(maxEndHour, opEndHour);
          });

          if (earliestDay !== Infinity) {
            stageStartHour = earliestDay * 24;
            stageEndHour = Math.max(stageStartHour + 24, Math.ceil(maxEndHour / 24) * 24);
          }
        }

        const durationHours = stageEndHour - stageStartHour;

        if (isNaN(stageStartHour) || isNaN(durationHours) || durationHours <= 0) {
          console.error('Invalid stage block data:', {
            nodeId: node.id,
            stageStartHour,
            stageEndHour,
            durationHours
          });
          return;
        }

        const stageBlock: TimeBlock = {
          id: `stage_block_${node.id}`,
          node_id: node.id,
          title: `${stageCode} - ${node.title}`,
          start_hour: stageStartHour,
          duration_hours: durationHours,
          color: getOperationColor(stageCode, 0.2),
          isStage: true
        };
        blocks.push(stageBlock);
      }
      
      if (node.type === 'operation') {
        if (!node.standard_time || node.standard_time <= 0) {
          console.warn('Operation has invalid standard_time, using default:', node);
          node.standard_time = 4; // 使用默认4小时
        }
        // 获取阶段信息来确定颜色
        let stageCode = 'DEFAULT';
        if (node.parent_id?.includes('stage_')) {
          const stageId = node.parent_id.replace('stage_', '');
          const stage = stages.find(s => s.id.toString() === stageId);
          stageCode = stage?.stage_code || 'DEFAULT';
        }

        const operationData = node.data as StageOperation;
        
        // 解析推荐时间（确保是数字格式）
        const recommendedTime = typeof operationData?.recommended_time === 'string' 
          ? parseFloat(operationData.recommended_time) 
          : (operationData?.recommended_time || 9); // 默认9:00
        
        // 计算操作的绝对开始时间（小时）
        const nodeStartDay = node.start_day || 0;
        let operationAbsoluteStartHour = nodeStartDay * 24 + recommendedTime;

        // 数据验证 - 使用默认值而不是跳过
        if (isNaN(operationAbsoluteStartHour)) {
          console.warn('Invalid operationAbsoluteStartHour, using default:', node);
          operationAbsoluteStartHour = nodeStartDay * 24 + 9; // 默认9:00
        }
        
        // 处理 standard_time 可能是字符串的情况
        let actualStandardTime = typeof node.standard_time === 'string' 
          ? parseFloat(node.standard_time) 
          : node.standard_time;
        
        if (!actualStandardTime || isNaN(actualStandardTime) || actualStandardTime <= 0) {
          console.warn('Invalid standard_time, using default:', node);
          actualStandardTime = 4; // 默认4小时
        }
        
        // 时间窗口块 - 显示在操作块下方
        // 解析时间窗口参数
        const windowStartTime = typeof operationData?.window_start_time === 'string' 
          ? parseFloat(operationData.window_start_time) 
          : (operationData?.window_start_time || 7); // 默认7:00
        const windowEndTime = typeof operationData?.window_end_time === 'string' 
          ? parseFloat(operationData.window_end_time) 
          : (operationData?.window_end_time || 18); // 默认18:00
          
        const windowStartHour = (node.start_day || 0) * 24 + windowStartTime;
        const windowEndHour = (node.start_day || 0) * 24 + windowEndTime;
        
        if (!isNaN(windowStartHour) && !isNaN(windowEndHour) && windowEndHour > windowStartHour) {
          const windowBlock: TimeBlock = {
            id: `window_${node.id}`,
            node_id: node.id,
            title: `${node.title} - 时间窗口 (Day${node.start_day} ${windowStartTime}:00-${windowEndTime}:00)`,
            start_hour: windowStartHour,
            duration_hours: windowEndHour - windowStartHour,
            color: getOperationColor(stageCode, 0.4), // 更透明
            isTimeWindow: true
          };
          blocks.push(windowBlock);
        }
        
        // 操作时间块 - 显示在时间窗口上方
        const operationBlock: TimeBlock = {
          id: `block_${node.id}`,
          node_id: node.id,
          title: `${node.title} (Day${node.start_day} ${recommendedTime}:00-${recommendedTime + actualStandardTime}:00)`,
          start_hour: operationAbsoluteStartHour,
          duration_hours: actualStandardTime,
          color: getOperationColor(stageCode),
          isRecommended: true
        };
        blocks.push(operationBlock);
      }
      
      if (node.children) {
        node.children.forEach(processNode);
      }
    };

    nodes.forEach(processNode);
    return blocks;
  };

  const getOperationColor = (stageCode: string, alpha: number = 1): string => {
    const baseColor = STAGE_COLORS[stageCode] || STAGE_COLORS.DEFAULT;
    
    // 转换为RGBA格式
    const hex = baseColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // 计算实际时间范围 - 基于操作的实际范围
  const calculateTimeRange = useCallback(() => {
    if (timeBlocks.length === 0) {
      return { startDay: -2, endDay: 10 }; // 默认范围
    }
    
    let minDay = Infinity;
    let maxDay = -Infinity;
    let hasValidBlocks = false;
    
    // 只计算操作时间块（排除阶段块和时间窗口）
    timeBlocks.forEach(block => {
      if (block.isStage || block.isTimeWindow) {
        return; // 跳过阶段块和时间窗口
      }
      
      // 验证时间块数据的有效性
      if (isNaN(block.start_hour) || isNaN(block.duration_hours)) {
        console.error('Invalid time block data in calculateTimeRange:', block);
        return;
      }
      
      const blockStartDay = Math.floor(block.start_hour / 24);
      // 计算操作结束所在的天数（操作可能跨天）
      const blockEndDay = Math.floor((block.start_hour + block.duration_hours) / 24);
      
      if (!isNaN(blockStartDay) && !isNaN(blockEndDay)) {
        minDay = Math.min(minDay, blockStartDay);
        maxDay = Math.max(maxDay, blockEndDay);
        hasValidBlocks = true;
      }
    });
    
    // 如果没有有效的操作块，使用默认范围
    if (!hasValidBlocks) {
      return { startDay: -2, endDay: 10 };
    }
    
    // 在实际范围基础上添加缓冲区
    const startDay = minDay - 1; // 在最早操作前留1天
    const endDay = maxDay + 2;   // 在最晚操作后留2天
    
    // 最终验证结果
    if (isNaN(startDay) || isNaN(endDay)) {
      console.error('Invalid time range calculated:', { startDay, endDay, minDay, maxDay });
      return { startDay: -2, endDay: 10 }; // 返回默认值
    }
    
    return { startDay, endDay };
  }, [timeBlocks]);

  const timeRange = useMemo(() => calculateTimeRange(), [calculateTimeRange]);
  const hourWidth = BASE_HOUR_WIDTH * zoomScale;
  const startDay = timeRange.startDay;
  const endDay = timeRange.endDay;
  const totalDays = endDay - startDay + 1;
  const headerWidth = Math.max(totalDays, 0) * 24 * hourWidth;
  const curveHeight = personnelCurve.points.length > 0 ? 72 : 0;
  const treeHeaderHeight = curveHeight > 0 ? 133 : HEADER_HEIGHT;

  const titleBarHeight = TITLE_BAR_HEIGHT;

  const scrollToHour = useCallback(
    (hourIndex: number) => {
      const container = ganttContentRef.current;
      if (!container) {
        return;
      }
      const targetLeft =
        (hourIndex - startDay * 24) * hourWidth - container.clientWidth / 2;
      container.scrollTo({
        left: Math.max(0, targetLeft),
        behavior: 'smooth'
      });
    },
    [hourWidth, startDay]
  );

  const operationBlockMap = useMemo(() => {
    const map = new Map<number, TimeBlock>();

    timeBlocks.forEach(block => {
      if (block.isStage || block.isTimeWindow) {
        return;
      }

      if (block.node_id.startsWith('operation_')) {
        const scheduleId = Number(block.node_id.replace('operation_', ''));
        if (!Number.isNaN(scheduleId)) {
          map.set(scheduleId, block);
        }
      }
    });

    return map;
  }, [timeBlocks]);

  const conflictOperationSet = useMemo(() => {
    const set = new Set<string>();
    if (!validationResult?.conflicts) {
      return set;
    }
    validationResult.conflicts.forEach((conflict) => {
      conflict.operationScheduleIds?.forEach((scheduleId) => {
        set.add(`operation_${scheduleId}`);
      });
    });
    return set;
  }, [validationResult]);

  const conflictConstraintSet = useMemo(() => {
    const set = new Set<number>();
    if (!validationResult?.conflicts) {
      return set;
    }
    validationResult.conflicts.forEach((conflict) => {
      conflict.constraintIds?.forEach((constraintId) => {
        set.add(constraintId);
      });
    });
    return set;
  }, [validationResult]);

  const activeOperationSet = useMemo(() => new Set(activeHighlight.operations), [activeHighlight.operations]);
  const activeConstraintSet = useMemo(() => new Set(activeHighlight.constraints), [activeHighlight.constraints]);

  const getSeverityTagColor = useCallback((severity: ConstraintConflict['severity']) => {
    switch (severity) {
      case 'CRITICAL':
        return 'red';
      case 'WARNING':
        return 'orange';
      default:
        return 'blue';
    }
  }, []);

  // 收集可见行
  // 当缩放比例改变时，重置甘特图内容区域的滚动位置
  useEffect(() => {
    if (ganttContentRef.current) {
      ganttContentRef.current.scrollLeft = 0;
    }
  }, [zoomScale]);

  // 使用requestAnimationFrame优化滚动性能
  const rafIdRef = useRef<number | null>(null);
  
  useEffect(() => {
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

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
    } else if (node.type === 'operation') {
      assignGroupForm.resetFields();
      assignGroupForm.setFieldsValue({ priority: 1 });
      if (node.data) {
        // 编辑现有操作
        const operationData = node.data as StageOperation;
        
        // 确保时间值是数字格式，处理可能的字符串格式
        const parseTimeValue = (value: any): number => {
          if (typeof value === 'string') {
            return parseFloat(value);
          }
          return typeof value === 'number' ? value : 0;
        };
        
      form.setFieldsValue({
        operation_id: operationData.operation_id,
        operation_day: operationData.operation_day,
        recommended_time: parseTimeValue(operationData.recommended_time ?? 9),
        recommended_day_offset: operationData.recommended_day_offset ?? 0,
        window_start_time: parseTimeValue(operationData.window_start_time ?? 9),
        window_start_day_offset: operationData.window_start_day_offset ?? 0,
        window_end_time: parseTimeValue(operationData.window_end_time ?? 17),
        window_end_day_offset: operationData.window_end_day_offset ?? 0,
      });
        
        // 加载操作的约束和共享组
        loadOperationConstraints(operationData.id);
        loadOperationShareGroups(operationData.id);
      } else {
        // 新建操作 - 设置默认值
        form.setFieldsValue({
          operation_day: 0,
          recommended_time: 9,
          recommended_day_offset: 0,
          window_start_time: 9,
          window_start_day_offset: 0,
          window_end_time: 17,
          window_end_day_offset: 0,
        });
        
        // 清空约束和共享组
        setOperationConstraints({ predecessors: [], successors: [] });
        setOperationShareGroups([]);
      }
    }
    
    setEditModalVisible(true);
  };
  
  // 加载共享组
  const loadShareGroups = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/share-groups/template/${template.id}`);
      const normalized: ShareGroup[] = (response.data || []).map((group: any) => ({
        ...group,
        id: Number(group.id),
        operation_count: group.operation_count !== undefined ? Number(group.operation_count) : undefined
      }));
      setShareGroups(normalized);
    } catch (error) {
      console.error('Error loading share groups:', error);
    }
  };
  
  // 加载可用操作列表（用于创建约束）
  const loadAvailableOperationsForConstraints = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/constraints/template/${template.id}/available-operations`);
      setAvailableOperationsForConstraints(response.data);
    } catch (error) {
      console.error('Error loading available operations:', error);
    }
  };

  const openOperationModal = useCallback(() => {
    operationForm.resetFields();
    operationForm.setFieldsValue({
      operation_code: generateOperationCode(),
      standard_time: 1,
      required_people: 1,
    });
    setOperationModalVisible(true);
  }, [operationForm, generateOperationCode]);

  const handleOperationModalCancel = useCallback(() => {
    setOperationModalVisible(false);
    setOperationSubmitting(false);
    operationForm.resetFields();
  }, [operationForm]);

  const handleOperationSubmit = useCallback(async () => {
    try {
      const values = await operationForm.validateFields();
      const payload = {
        operation_code: values.operation_code.trim(),
        operation_name: values.operation_name.trim(),
        standard_time: Number(values.standard_time),
        required_people: Number(values.required_people),
        description: values.description?.trim() || undefined,
      };

      setOperationSubmitting(true);
      const response = await axios.post(`${API_BASE_URL}/operations`, payload);
      const created: Operation = response.data;

      setAvailableOperations((prev) => [...prev, created]);
      loadAvailableOperationsForConstraints();

      if (!editingNode?.data && created?.id) {
        form.setFieldsValue({ operation_id: created.id });
      }

      message.success('操作创建成功');
      setOperationModalVisible(false);
      operationForm.resetFields();
    } catch (error: any) {
      if (error?.errorFields) {
        return;
      }
      const msg = error?.response?.data?.error || error?.message || '创建操作失败';
      message.error(msg);
    } finally {
      setOperationSubmitting(false);
    }
  }, [operationForm, editingNode, form, loadAvailableOperationsForConstraints]);
  
  // 加载操作的约束
  const loadOperationConstraints = async (scheduleId: number) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/constraints/operation/${scheduleId}`);

      const normalize = (items: any[] = [], relation: 'predecessor' | 'successor'): Constraint[] =>
        items.map((item) => ({
          constraint_id: item.constraint_id !== undefined ? Number(item.constraint_id) : undefined,
          related_schedule_id: Number(item.related_schedule_id),
          related_operation_name: item.related_operation_name,
          related_operation_code: item.related_operation_code,
          constraint_type: Number(item.constraint_type) || 1,
          lag_time: item.lag_time !== undefined && item.lag_time !== null ? Number(item.lag_time) : 0,
          share_personnel: Boolean(item.share_personnel),
          constraint_name: item.constraint_name || undefined,
          constraint_level: item.constraint_level !== undefined ? Number(item.constraint_level) : undefined,
          description: item.description || undefined,
          relation_type: relation
        }));

      setOperationConstraints({
        predecessors: normalize(response.data?.predecessors, 'predecessor'),
        successors: normalize(response.data?.successors, 'successor')
      });
    } catch (error) {
      console.error('Error loading operation constraints:', error);
      setOperationConstraints({ predecessors: [], successors: [] });
    }
  };
  
  // 加载甘特图的约束关系数据
  const loadGanttConstraints = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/constraints/template/${template.id}/gantt`);

      const normalizedConstraints: GanttConstraint[] = (response.data || []).map((item: any) => ({
        ...item,
        constraint_id: Number(item.constraint_id),
        from_schedule_id: Number(item.from_schedule_id),
        from_operation_id: Number(item.from_operation_id),
        to_schedule_id: Number(item.to_schedule_id),
        to_operation_id: Number(item.to_operation_id),
        constraint_type: Number(item.constraint_type) || 1,
        lag_time: item.lag_time !== undefined && item.lag_time !== null ? Number(item.lag_time) : 0,
        share_personnel: Boolean(item.share_personnel),
        constraint_level: item.constraint_level !== undefined ? Number(item.constraint_level) : undefined,
        constraint_name: item.constraint_name || undefined,
        from_operation_day: Number(item.from_operation_day),
        from_recommended_time: Number(item.from_recommended_time),
        to_operation_day: Number(item.to_operation_day),
        to_recommended_time: Number(item.to_recommended_time),
        from_stage_start_day: Number(item.from_stage_start_day),
        to_stage_start_day: Number(item.to_stage_start_day)
      }));

      setGanttConstraints(normalizedConstraints);
    } catch (error) {
      console.error('Error loading gantt constraints:', error);
      setGanttConstraints([]);
    }
  };

  const handleValidateConstraints = async () => {
    setValidationDrawerVisible(true);
    setValidationLoading(true);
    try {
      const response = await axios.get<ConstraintValidationResult>(`${API_BASE_URL}/constraints/template/${template.id}/validate`);
      setValidationResult(response.data);
      if (response.data.hasConflicts) {
        message.warning('检测完成，发现约束冲突。');
      } else {
        message.success('检测完成，未发现约束冲突。');
      }
    } catch (error) {
      console.error('Failed to validate constraints:', error);
      message.error('约束校验失败，请稍后重试。');
    } finally {
      setValidationLoading(false);
    }
  };

  const handleValidationDrawerClose = () => {
    setValidationDrawerVisible(false);
    setActiveHighlight({ operations: [], constraints: [] });
  };

  const handleConflictHighlight = (conflict: ConstraintConflict) => {
    const operationNodeIds = (conflict.operationScheduleIds || []).map((id) => `operation_${id}`);
    const constraintIds = conflict.constraintIds || [];

    if (operationNodeIds.length === 0 && constraintIds.length === 0) {
      return;
    }

    setActiveHighlight({ operations: operationNodeIds, constraints: constraintIds });

    if (operationNodeIds.length > 0) {
      const newExpanded = new Set(expandedKeys);
      operationNodeIds.forEach((nodeId) => {
        const node = findNodeById(ganttNodes, nodeId);
        if (node?.parent_id) {
          newExpanded.add(node.parent_id);
        }
      });
      setExpandedKeys(Array.from(newExpanded));

      setTimeout(() => {
        const firstNode = operationNodeIds[0];
        const rowIndex = rowIndexMap.get(firstNode);
        if (rowIndex !== undefined && rowIndex >= 0 && ganttContentRef.current) {
          const targetScrollTop = rowIndex * ROW_HEIGHT - ROW_HEIGHT * 2;
          ganttContentRef.current.scrollTop = Math.max(0, targetScrollTop);
        }
      }, 120);
    }
  };

  const clearActiveHighlight = () => {
    setActiveHighlight({ operations: [], constraints: [] });
  };

  // 加载操作的共享组
  const loadOperationShareGroups = async (scheduleId: number) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/share-groups/operation/${scheduleId}`);
      const normalized: ShareGroup[] = (response.data || []).map((group: any) => ({
        ...group,
        id: Number(group.id),
        priority: group.priority !== undefined ? Number(group.priority) : undefined
      }));
      setOperationShareGroups(normalized);
    } catch (error) {
      console.error('Error loading operation share groups:', error);
      setOperationShareGroups([]);
    }
  };

  const handleAssignShareGroup = async (values: any) => {
    if (!editingNode?.data?.id) {
      message.warning('请先保存操作后再设置共享组');
      return;
    }

    setAssigningGroup(true);
    try {
      await axios.post(`${API_BASE_URL}/share-groups/assign`, {
        schedule_id: editingNode.data.id,
        share_group_id: values.share_group_id,
        priority: values.priority ?? 1
      });
      message.success('已加入共享组');
      assignGroupForm.resetFields();
      loadOperationShareGroups(editingNode.data.id);
      loadShareGroups();
    } catch (error) {
      console.error('Error assigning share group:', error);
      message.error('加入共享组失败');
    } finally {
      setAssigningGroup(false);
    }
  };

  const handleRemoveShareGroup = async (groupId: number) => {
    if (!editingNode?.data?.id) return;

    try {
      await axios.delete(`${API_BASE_URL}/share-groups/operation/${editingNode.data.id}/group/${groupId}`);
      message.success('已移出共享组');
      loadOperationShareGroups(editingNode.data.id);
      loadShareGroups();
    } catch (error) {
      console.error('Error removing share group relation:', error);
      message.error('移除共享组失败');
    }
  };

  const handleCreateShareGroup = async (values: any) => {
    setCreatingGroup(true);
    try {
      await axios.post(`${API_BASE_URL}/share-groups`, {
        template_id: template.id,
        group_code: values.group_code,
        group_name: values.group_name,
        description: values.description || null,
        color: values.color || '#1890ff'
      });
      message.success('共享组创建成功');
      setShareGroupModalVisible(false);
      shareGroupForm.resetFields();
      loadShareGroups();
    } catch (error: any) {
      console.error('Error creating share group:', error);
      if (error.response?.data?.error) {
        message.error(error.response.data.error);
      } else {
        message.error('创建共享组失败');
      }
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleSaveNode = async (values: any) => {
    try {
      if (editingNode) {
        if (editingNode.type === 'stage') {
          if (editingNode.id.includes('new')) {
            await axios.post(`${API_BASE_URL}/process-stages/template/${template.id}`, values);
          } else {
            const stageData = editingNode.data as ProcessStage;
            await axios.put(`${API_BASE_URL}/process-stages/${stageData.id}`, values);
          }
        } else if (editingNode.type === 'operation') {
          const parentStageId = editingNode.parent_id?.replace('stage_', '');
          if (editingNode.id.includes('new')) {
            await axios.post(`${API_BASE_URL}/stage-operations/stage/${parentStageId}`, values);
          } else {
            const operationData = editingNode.data as StageOperation;
            await axios.put(`${API_BASE_URL}/stage-operations/${operationData.id}`, values);
          }
        }
        
        await loadTemplateData();
        message.success('保存成功');
        setIsDirty(true);
      }
    } catch (error) {
      message.error('保存失败');
      console.error(error);
    }

    setEditModalVisible(false);
    setEditingNode(null);
    form.resetFields();
  };

  const handleSaveTemplate = async () => {
    try {
      // 调用后端API重新计算模板总天数
      await axios.put(`${API_BASE_URL}/process-templates/${template.id}/recalculate`);
      
      // 清除dirty状态
      setIsDirty(false);
      message.success('模板保存成功');
    } catch (error) {
      console.error('保存模板失败:', error);
      message.error('保存模板失败');
    }
  };

  const handleAutoSchedule = async () => {
    setScheduling(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/process-templates/${template.id}/auto-schedule`);
      const conflicts = response.data?.conflicts || [];
      const conflictMap: Record<number, string> = {};
      conflicts.forEach((conflict: any) => {
        if (conflict.scheduleId) {
          conflictMap[Number(conflict.scheduleId)] = conflict.type;
        }
      });
      setScheduleConflicts(conflictMap);

      await loadTemplateData();
      await loadGanttConstraints();

      if (editingNode?.type === 'operation' && editingNode.data) {
        const scheduleId = (editingNode.data as StageOperation).id;
        if (scheduleId) {
          await loadOperationConstraints(scheduleId);
          await loadOperationShareGroups(scheduleId);
        }
      }

      if (conflicts.length > 0) {
        const criticalCount = conflicts.filter((item: any) => item?.severity === 'CRITICAL').length;
        const conflictPreview = conflicts
          .slice(0, 3)
          .map((item: any) => {
            const namePart = item?.operationName ? `${item.operationName}` : `操作 #${item?.scheduleId ?? ''}`;
            return `${namePart}: ${item?.message ?? '存在排程冲突'}`;
          })
          .join('；');
        const detailMessage = conflictPreview ? `：${conflictPreview}` : '';
        const criticalTag = criticalCount ? `（其中 ${criticalCount} 个为阻断项）` : '';
        message.warning(`自动排程完成，但存在 ${conflicts.length} 个冲突${criticalTag}${detailMessage}`);
      } else {
        message.success('自动排程完成');
      }

      setIsDirty(false);
    } catch (error) {
      console.error('Error running auto schedule:', error);
      message.error('自动排程失败，请稍后重试');
    } finally {
      setScheduling(false);
    }
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
            
            await loadTemplateData();
            message.success('删除成功');
            setIsDirty(true);
          }
        } catch (error: any) {
          console.error('删除失败:', error);
          
          if (error.response?.status === 400 && error.response?.data?.details) {
            const details = error.response.data.details;
            Modal.error({
              title: '无法删除',
              width: 500,
              content: (
                <div>
                  <p style={{ marginBottom: 16 }}>{details.message}</p>
                  {details.batch_codes && details.batch_codes.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <p><strong>相关批次：</strong></p>
                      <div style={{ background: '#EEF2FF', padding: '8px', borderRadius: '6px' }}>
                        {details.batch_codes.map((code: string, index: number) => (
                          <span key={index} style={{ 
                            display: 'inline-block', 
                            background: '#1890ff', 
                            color: 'white', 
                            padding: '2px 8px', 
                            borderRadius: '4px', 
                            margin: '2px', 
                            fontSize: '12px' 
                          }}>
                            {code}
                          </span>
                        ))}
                        {details.suggestion && (
                          <div style={{ marginTop: '8px', color: '#666', fontSize: '12px' }}>
                            {details.suggestion}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  <p style={{ color: '#666', fontSize: '12px', marginBottom: 0 }}>
                    建议：先处理相关批次，或者修改模板后创建新版本。
                  </p>
                </div>
              )
            });
          } else {
            message.error('删除失败');
          }
        }
      }
    });
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

  // 缩放控制
  const handleZoomIn = useCallback(() => {
    setZoomScale(prev => Math.min(prev * 1.2, 5.0));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomScale(prev => Math.max(prev / 1.2, 0.1));
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoomScale(1.0);
  }, []);

  const handleGanttScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const element = e.currentTarget;
    const nextScrollLeft = element.scrollLeft;
    const nextScrollTop = element.scrollTop;
    setScrollTop(nextScrollTop);
  }, []);

  const updatePan = useCallback((clientX: number) => {
    if (!ganttContentRef.current) return;
    const deltaX = clientX - panStartXRef.current;

    if (panRafRef.current) {
      cancelAnimationFrame(panRafRef.current);
    }

    panRafRef.current = requestAnimationFrame(() => {
      if (!ganttContentRef.current) return;
      ganttContentRef.current.scrollLeft = panStartScrollLeftRef.current - deltaX;
    });
  }, []);

  const handleWindowMouseMove = useCallback((e: MouseEvent) => {
    if (!isPanningRef.current) return;
    updatePan(e.clientX);
  }, [updatePan]);

  const handleWindowMouseUp = useCallback(() => {
    if (!isPanningRef.current) return;
    isPanningRef.current = false;
    document.body.style.cursor = '';
    if (panRafRef.current) {
      cancelAnimationFrame(panRafRef.current);
      panRafRef.current = null;
    }
    window.removeEventListener('mousemove', handleWindowMouseMove);
    window.removeEventListener('mouseup', handleWindowMouseUp);
  }, [handleWindowMouseMove]);

  const handleWindowMouseLeave = useCallback(() => {
    if (!isPanningRef.current) return;
    handleWindowMouseUp();
  }, [handleWindowMouseUp]);

  const handleGanttMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (!ganttContentRef.current) return;

    isPanningRef.current = true;
    panStartXRef.current = e.clientX;
    panStartScrollLeftRef.current = ganttContentRef.current.scrollLeft;
    document.body.style.cursor = 'grabbing';

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
  }, [handleWindowMouseMove, handleWindowMouseUp]);

  const handleGanttMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanningRef.current) return;
    updatePan(e.clientX);
  }, [updatePan]);

  const toggleNodeExpanded = useCallback(
    (row: FlattenedRow) => {
      if (!row.hasChildren) {
        return;
      }
      setExpandedKeys((prev) => {
        const next = new Set(prev);
        if (next.has(row.id) && row.id !== template.id.toString()) {
          next.delete(row.id);
        } else {
          next.add(row.id);
        }
        if (!next.has(template.id.toString())) {
          next.add(template.id.toString());
        }
        return Array.from(next);
      });
    },
    [template.id]
  );

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
            handleAddNode(node, 'stage');
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
            handleAddNode(node, 'operation');
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

  const renderTreeRow = (row: FlattenedRow, absoluteIndex: number) => {
    const node = row.node;
    const isSelected = selectedNode?.id === node.id;
    const isTemplate = node.type === 'template';
    const isStage = node.type === 'stage';

    let backgroundColor = isSelected ? 'rgba(37, 99, 235, 0.08)' : 'transparent';
    if (!isSelected) {
      if (isTemplate) {
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

  const renderLaborDemandChart = (
    width: number,
    startDayValue: number,
    totalDaysValue: number,
    height: number,
    hourWidthValue: number
  ) => {
    if (!height || width <= 0 || personnelCurve.points.length === 0) {
      return null;
    }

    const topPadding = 24;
    const bottomPadding = 12;
    const baseHour = startDayValue * 24;
    const totalVisibleHours = Math.max(totalDaysValue, 0) * 24;
    const visibleStartHour = baseHour;
    const visibleEndHour = baseHour + totalVisibleHours;

    const bucket = new Map<number, number>();
    personnelCurve.points.forEach((point) => {
      if (point.hourIndex >= visibleStartHour && point.hourIndex <= visibleEndHour) {
        bucket.set(point.hourIndex, point.requiredPeople);
      }
    });

    const dense: Array<{ hourIndex: number; value: number }> = [];
    for (let hour = visibleStartHour; hour <= visibleEndHour; hour += 1) {
      dense.push({ hourIndex: hour, value: bucket.get(hour) ?? 0 });
    }

    if (!dense.length) {
      return null;
    }

    const maxValue = dense.reduce((max, item) => Math.max(max, item.value), 0) || 1;
    const avgValue =
      dense.reduce((sum, item) => sum + item.value, 0) / Math.max(dense.length, 1);
    const baselineValue = Math.max(1, Math.round(avgValue));
    const capacityValue = Math.max(
      baselineValue,
      personnelCurve.peak?.requiredPeople ?? maxValue
    );
    const yScale = (value: number) => {
      const clamped = Math.max(0, value);
      const scaled =
        (clamped / Math.max(capacityValue, maxValue || 1)) *
        (height - topPadding - bottomPadding);
      return Math.round(height - bottomPadding - scaled);
    };

    const points = dense.map((item) => ({
      hourIndex: item.hourIndex,
      value: item.value,
      x: (item.hourIndex - baseHour) * hourWidthValue,
      y: yScale(item.value)
    }));

    const firstX = points[0].x;
    const lastX = points[points.length - 1].x;

    const areaPath = [
      `M ${firstX} ${height - bottomPadding}`,
      ...points.map((pt) => `L ${pt.x} ${pt.y}`),
      `L ${lastX} ${height - bottomPadding}`,
      'Z'
    ].join(' ');

    const strokePath = points
      .map((pt, index) => `${index === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`)
      .join(' ');

    const baselineY = yScale(baselineValue);
    const capacityY = yScale(capacityValue);

    const exceedAreaPath = [
      `M ${firstX} ${capacityY}`,
      ...points.map((pt) => {
        const y =
          pt.value > capacityValue ? yScale(pt.value) : capacityY;
        return `L ${pt.x} ${y}`;
      }),
      `L ${lastX} ${capacityY}`,
      'Z'
    ].join(' ');

    const peakPoint = points.reduce(
      (acc, pt) => (pt.value > acc.value ? pt : acc),
      { x: 0, y: height - bottomPadding, value: 0, hourIndex: baseHour }
    );

    return (
      <svg
        width={width}
        height={height}
        style={{ display: 'block' }}
        onMouseLeave={() => setLaborHover(null)}
      >
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="transparent"
        />

        {Array.from({ length: totalDaysValue + 1 }, (_, dayIndex) => {
          const dayOffset = dayIndex * 24;
          const x = dayOffset * hourWidthValue;
          const dayNumber = startDayValue + dayIndex;
          const color =
            dayNumber === 0
              ? TOKENS.primary
              : 'rgba(148, 163, 184, 0.3)';
          const opacity = dayNumber === 0 ? 0.8 : 0.3;
          return (
            <line
              key={`vline-${dayIndex}`}
              x1={x}
              y1={topPadding / 2}
              x2={x}
              y2={height - bottomPadding}
              stroke={color}
              strokeWidth={dayNumber === 0 ? 1.2 : 1}
              strokeDasharray={dayNumber === 0 ? undefined : '4 6'}
              opacity={opacity}
            />
          );
        })}

        <path
          d={areaPath}
          fill="rgba(37, 99, 235, 0.15)"
          stroke="none"
        />

        <path
          d={exceedAreaPath}
          fill="rgba(234, 88, 12, 0.25)"
          stroke="none"
        />

        <path
          d={strokePath}
          fill="none"
          stroke={TOKENS.primary}
          strokeWidth={2}
        />

        <line
          x1={0}
          y1={baselineY}
          x2={width}
          y2={baselineY}
          stroke="#CBD5E1"
          strokeWidth={1}
          strokeDasharray="6 6"
        />
        <text
          x={4}
          y={baselineY - 6}
          fill="#64748B"
          fontSize={11}
        >
          基线 {baselineValue} 人
        </text>

        <line
          x1={0}
          y1={capacityY}
          x2={width}
          y2={capacityY}
          stroke="#F97316"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
        <text
          x={width - 88}
          y={capacityY - 6}
          fill="#F97316"
          fontSize={11}
        >
          上限 {capacityValue} 人
        </text>

        {peakPoint.value > 0 && (
          <g transform={`translate(${peakPoint.x}, ${peakPoint.y - 12})`}>
            <rect
              x={-12}
              y={-18}
              width={68}
              height={20}
              rx={6}
              fill="rgba(37, 99, 235, 0.12)"
            />
            <text
              x={0}
              y={-4}
              fill={TOKENS.primary}
              fontSize={12}
              fontWeight={600}
            >
              {peakPoint.value} 人
            </text>
          </g>
        )}

        {points.map((pt) => (
          <rect
            key={pt.hourIndex}
            x={pt.x - hourWidthValue / 2}
            y={0}
            width={Math.max(hourWidthValue, 8)}
            height={height}
            fill="transparent"
            onMouseEnter={() => {
              setLaborHover({
                hourIndex: pt.hourIndex,
                value: pt.value,
                x: pt.x,
                y: pt.y
              });
            }}
            onClick={() => scrollToHour(pt.hourIndex)}
          />
        ))}
      </svg>
    );
  };

  const renderTimeAxis = (hourWidthValue: number, startDayValue: number, endDayValue: number) => {
    const totalDays = endDayValue - startDayValue + 1;

    if (isNaN(hourWidthValue) || isNaN(totalDays) || isNaN(startDayValue) || isNaN(endDayValue) || totalDays <= 0) {
      console.error('Invalid values in renderTimeAxis:', { 
        hourWidth: hourWidthValue, 
        totalDays, 
        startDay: startDayValue, 
        endDay: endDayValue, 
        zoomScale, 
        BASE_HOUR_WIDTH 
      });
      return <div>时间轴加载错误</div>;
    }

    const totalAxisWidth = totalDays * 24 * hourWidthValue;

    return (
      <div style={{ 
        display: 'flex', 
        backgroundColor: TOKENS.card,
        height: HEADER_HEIGHT,
        width: totalAxisWidth,
        minWidth: totalAxisWidth,
        padding: '4px 8px',
        boxSizing: 'border-box'
      }}>
        {Array.from({ length: totalDays }, (_, index) => {
          const dayNumber = startDayValue + index;
          const dayWidth = 24 * hourWidthValue;
          
          return (
            <div key={`day-${dayNumber}`} style={{ 
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0 // 防止收缩
            }}>
              {/* 天数标题行 */}
              <div
                style={{
                  width: dayWidth,
                  height: 18,
                  border: `1px solid ${TOKENS.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: dayNumber === 0 ? 'rgba(37, 99, 235, 0.12)' : TOKENS.background,
                  fontWeight: dayNumber === 0 ? 700 : 600,
                  fontSize: 11,
                  lineHeight: '16px',
                  paddingTop: 2,
                  borderBottom: 'none',
                  color: dayNumber === 0 ? TOKENS.primary : dayNumber < 0 ? TOKENS.alert : TOKENS.textSecondary,
                  flexShrink: 0
                }}
              >
                Day {dayNumber}
              </div>
              
              {/* 小时标题行 */}
              <div style={{ 
                display: 'flex', 
                height: 20,
                flexShrink: 0
              }}>
                {Array.from({ length: 24 }, (_, hourIndex) => {
                  const isWorkingHour = hourIndex >= 9 && hourIndex < 17;
                  const shouldShowHour = hourWidthValue > 15 && (hourIndex % 2 === 0 || hourWidthValue > 25);

                  return (
                    <div
                      key={`hour-${dayNumber}-${hourIndex}`}
                      style={{
                        width: hourWidthValue,
                        height: 20,
                        border: `1px solid ${TOKENS.border}`,
                        borderTop: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: isWorkingHour
                          ? 'rgba(37, 99, 235, 0.12)'
                          : hourIndex % 12 === 0 ? TOKENS.background : 'transparent',
                        fontSize: Math.max(8, Math.min(10, hourWidth / 4)),
                        color: isWorkingHour ? TOKENS.primary : TOKENS.secondary,
                        flexShrink: 0
                      }}
                    >
                      {shouldShowHour ? hourIndex : ''}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderTimeBlocks = () => {
    if (!flattenedRows.length || timeBlocks.length === 0) {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Empty description="暂无时间块数据" />
        </div>
      );
    }

    const hourWidthValue = hourWidth;
    const startDayValue = startDay;
    const endDayValue = endDay;
    const totalDaysValue = endDayValue - startDayValue + 1;
    const totalWidth = totalDaysValue * 24 * hourWidthValue;
    const totalHeightLocal = totalHeight;

    const getStageColorByNode = (node: GanttNode): string | undefined => {
      if (node.type === 'stage' && node.data) {
        return stageColorMap.get((node.data as ProcessStage).id);
      }
      if (node.type === 'operation' && node.parent_id) {
        const stageId = Number(node.parent_id.replace('stage_', ''));
        if (!Number.isNaN(stageId)) {
          return stageColorMap.get(stageId);
        }
      }
      return undefined;
    };

    return (
      <div
        style={{
          position: 'relative',
          width: totalWidth,
          minWidth: totalWidth,
          height: totalHeightLocal,
          minHeight: totalHeightLocal
        }}
      >
        {virtualRows.map((row, index) => {
          const absoluteIndex = visibleStartIndex + index;
          const node = row.node;
          let backgroundColor = absoluteIndex % 2 === 0 ? '#F1F5F9' : TOKENS.card;
          const stageColor = getStageColorByNode(node);

          if (node.type === 'stage' && stageColor) {
            backgroundColor = toRgba(stageColor, 0.08);
          } else if (node.type === 'operation' && stageColor) {
            backgroundColor = toRgba(stageColor, 0.04);
          }

          return (
            <div
              key={`row-bg-${row.id}`}
              style={{
                position: 'absolute',
                top: absoluteIndex * ROW_HEIGHT,
                left: 0,
                width: totalWidth,
                height: ROW_HEIGHT,
                backgroundColor,
                zIndex: 0
              }}
            />
          );
        })}

        {Array.from({ length: totalDaysValue + 1 }, (_, index) => {
          const dayNumber = startDayValue + index;
          const lineLeft = index * 24 * hourWidthValue;
          return (
            <div
              key={`grid-day-${dayNumber}`}
              style={{
                position: 'absolute',
                left: lineLeft,
                top: 0,
                width: 1,
                height: totalHeightLocal,
                background:
                  dayNumber === 0
                    ? TOKENS.primary
                    : dayNumber % 7 === 0
                      ? '#CBD5F5'
                      : TOKENS.border,
                zIndex: 2,
                pointerEvents: 'none'
              }}
            />
          );
        })}

        {Array.from({ length: totalDaysValue * 24 + 1 }, (_, index) => {
          if (index % 24 === 0) return null;
          const lineLeft = index * hourWidthValue;
          const hour = index % 24;
          return (
            <div
              key={`grid-hour-${index}`}
              style={{
                position: 'absolute',
                left: lineLeft,
                top: 0,
                width: 1,
                height: totalHeightLocal,
                background: hour % 6 === 0 ? '#CBD5F5' : '#E7EEF8',
                zIndex: 1,
                pointerEvents: 'none'
              }}
            />
          );
        })}

        {Array.from({ length: totalDaysValue }, (_, dayIndex) => {
          const workHoursLeft = (dayIndex * 24 + 9) * hourWidthValue;
          const workHoursWidth = 8 * hourWidthValue;
          return (
            <div
              key={`work-hours-${dayIndex}`}
              style={{
                position: 'absolute',
                top: 0,
                left: workHoursLeft,
                width: workHoursWidth,
                height: totalHeightLocal,
                backgroundColor: 'rgba(24, 144, 255, 0.04)',
                zIndex: 1,
                pointerEvents: 'none'
              }}
            />
          );
        })}

        {timeBlocks.map((block) => {
          const rowIndex = rowIndexMap.get(block.node_id);
          if (rowIndex === undefined) {
            return null;
          }

          if (rowIndex < visibleStartIndex - overscanCount || rowIndex >= visibleEndIndex + overscanCount) {
            return null;
          }

          const absoluteStartHour = block.start_hour;
          const relativeStartHour = absoluteStartHour - startDayValue * 24;
          const left = relativeStartHour * hourWidthValue;
          const width = Math.max(block.duration_hours * hourWidthValue, hourWidthValue * 0.25);

          if (left + width < 0 || left > totalWidth) {
            return null;
          }

          const isStageBlock = Boolean(block.isStage);
          const isTimeWindowBlock = Boolean(block.isTimeWindow);
          const isHighlightedOperation = activeOperationSet.has(block.node_id);
          const isConflictOperation = conflictOperationSet.has(block.node_id);
          const stageColor = (() => {
            const node = findNodeById(ganttNodes, block.node_id);
            return node ? getStageColorByNode(node) || STAGE_COLORS.DEFAULT : STAGE_COLORS.DEFAULT;
          })();

          let borderStyle = '1px solid rgba(255,255,255,0.4)';
          let boxShadow = '0 1px 4px rgba(0,0,0,0.18)';
          let blockOpacity = 1;
          let blockCursor: React.CSSProperties['cursor'] = 'move';
          let textColor = '#fff';
          let borderRadius = 6;

          if (isStageBlock) {
            borderStyle = '1px dashed #CBD5E1';
            boxShadow = 'none';
            blockOpacity = 1;
            blockCursor = 'pointer';
            textColor = '#1f2937';
            borderRadius = 16;
          } else if (isTimeWindowBlock) {
            borderStyle = '1px dashed rgba(24,144,255,0.45)';
            boxShadow = 'none';
            blockOpacity = 0.5;
            blockCursor = 'default';
          }

          const scheduleId = block.node_id.startsWith('operation_')
            ? Number(block.node_id.replace('operation_', ''))
            : undefined;
          const conflictType = scheduleId ? scheduleConflicts[scheduleId] : undefined;

          if (!isStageBlock) {
            if (conflictType === 'CYCLE') {
              borderStyle = '2px solid rgba(255,77,79,0.9)';
              boxShadow = '0 0 0 2px rgba(255,77,79,0.35)';
            } else if (conflictType === 'WINDOW') {
              borderStyle = '2px solid rgba(250,140,22,0.85)';
              boxShadow = '0 0 0 2px rgba(250,140,22,0.35)';
            } else if (conflictType === 'OVERLAP') {
              borderStyle = '2px solid rgba(24,144,255,0.85)';
              boxShadow = '0 0 0 2px rgba(24,144,255,0.3)';
            } else if (isConflictOperation) {
              borderStyle = '2px solid rgba(250,140,22,0.85)';
              boxShadow = '0 0 0 2px rgba(250,140,22,0.35)';
            }
          }

          if (isHighlightedOperation) {
            borderStyle = '2px solid #ff4d4f';
            boxShadow = '0 0 0 2px rgba(255,77,79,0.45)';
            blockOpacity = 1;
          }

          const blockWidth = Math.min(width, totalWidth - Math.max(0, left));
          const blockHeight = isStageBlock
            ? Math.max(ROW_HEIGHT * 0.65, ROW_HEIGHT - 18)
            : ROW_HEIGHT - 12;
          const blockTop =
            rowIndex * ROW_HEIGHT + (ROW_HEIGHT - blockHeight) / 2;
          const blockLeft = Math.max(0, left);
          const backgroundColor = isStageBlock
            ? toRgba(stageColor, 0.12)
            : stageColor;

          return (
            <div
              key={block.id}
              style={{
                position: 'absolute',
                left: blockLeft,
                top: blockTop,
                width: blockWidth,
                height: blockHeight,
                background: backgroundColor,
                borderRadius,
                display: 'flex',
                alignItems: 'center',
                color: textColor,
                fontSize: 9,
                cursor: blockCursor,
                boxShadow,
                border: borderStyle,
                paddingLeft: 4,
                paddingRight: 4,
                zIndex: isStageBlock ? 4 : isTimeWindowBlock ? 7 : 10,
                opacity: blockOpacity,
                overflow: 'hidden'
              }}
              title={`${block.title}\n开始: Day${Math.floor(absoluteStartHour / 24)} ${absoluteStartHour % 24}:00\n时长: ${block.duration_hours}小时\n结束: Day${Math.floor((absoluteStartHour + block.duration_hours) / 24)} ${(absoluteStartHour + block.duration_hours) % 24}:00`}
              onDoubleClick={() => {
                const node = findNodeById(ganttNodes, block.node_id);
                if (node) {
                  handleEditNode(node);
                }
              }}
            >
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: width > 80 ? 9 : width > 40 ? 8 : 7,
                  fontWeight: block.isTimeWindow ? 'normal' : '500'
                }}
              >
                {width > 30
                  ? block.title.length > Math.floor(width / 8)
                    ? `${block.title.substring(0, Math.floor(width / 8))}...`
                    : block.title
                  : ''}
              </span>
              {!block.isTimeWindow && !block.isStage && blockWidth > 60 && (
                <DragOutlined style={{ marginLeft: 4, fontSize: 7, opacity: 0.8 }} />
              )}
            </div>
          );
        })}

        {renderConstraintLines()}
      </div>
    );
  };

  // 渲染约束关系连线
  const renderConstraintLines = () => {
    if (ganttConstraints.length === 0) return null;

    const hourWidth = BASE_HOUR_WIDTH * zoomScale;
    const { startDay, endDay } = calculateTimeRange();
    const totalWidth = (endDay - startDay + 1) * 24 * hourWidth;

    const getAnchorRelativeHour = (block: TimeBlock, anchor: 'start' | 'end') => {
      const hour = anchor === 'start' ? block.start_hour : block.start_hour + block.duration_hours;
      return hour - startDay * 24;
    };

    const getAnchorType = (type: number): { from: 'start' | 'end'; to: 'start' | 'end' } => {
      switch (type) {
        case 2: // SS
          return { from: 'start', to: 'start' };
        case 3: // FF
          return { from: 'end', to: 'end' };
        case 4: // SF
          return { from: 'start', to: 'end' };
        case 1:
        default:
          return { from: 'end', to: 'start' };
      }
    };

    const typeLabels: Record<number, string> = {
      1: 'FS',
      2: 'SS',
      3: 'FF',
      4: 'SF'
    };

    const getBaseStyle = (type: number) => {
      switch (type) {
        case 2:
          return { color: '#52c41a', dashArray: '6,4' };
        case 3:
          return { color: '#faad14', dashArray: '4,4' };
        case 4:
          return { color: '#722ed1', dashArray: '12,4' };
        case 1:
        default:
          return { color: '#1890ff', dashArray: 'none' };
      }
    };

    return (
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 6
        }}
        data-testid="constraint-lines-svg"
      >
        <defs>
          <filter id="constraint-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {ganttConstraints.map((constraint) => {
          const predecessorScheduleId = constraint.to_schedule_id;
          const successorScheduleId = constraint.from_schedule_id;

          const predecessorNodeId = `operation_${predecessorScheduleId}`;
          const successorNodeId = `operation_${successorScheduleId}`;

          const predecessorRowIndex = rowIndexMap.get(predecessorNodeId);
          const successorRowIndex = rowIndexMap.get(successorNodeId);

          if (
            predecessorRowIndex === undefined ||
            successorRowIndex === undefined
          ) {
            return null;
          }

          if (
            predecessorRowIndex < visibleStartIndex - overscanCount &&
            successorRowIndex < visibleStartIndex - overscanCount
          ) {
            return null;
          }

          if (
            predecessorRowIndex > visibleEndIndex + overscanCount &&
            successorRowIndex > visibleEndIndex + overscanCount
          ) {
            return null;
          }

          const predecessorBlock = operationBlockMap.get(predecessorScheduleId);
          const successorBlock = operationBlockMap.get(successorScheduleId);

          if (!predecessorBlock || !successorBlock) {
            return null;
          }

          const anchorType = getAnchorType(constraint.constraint_type);
          const fromRelativeHour = getAnchorRelativeHour(predecessorBlock, anchorType.from);
          const toRelativeHour = getAnchorRelativeHour(successorBlock, anchorType.to);

          const fromX = fromRelativeHour * hourWidth;
          const toX = toRelativeHour * hourWidth;

          if (fromX < -120 || toX < -120 || fromX > totalWidth + 120 || toX > totalWidth + 120) {
            return null;
          }

          const baseStyle = getBaseStyle(constraint.constraint_type);

          const isSoft = constraint.constraint_level && constraint.constraint_level !== 1;
          const isShared = Boolean(constraint.share_personnel);
          const isConflictConstraint = conflictConstraintSet.has(constraint.constraint_id);
          const isActiveConstraint = activeConstraintSet.has(constraint.constraint_id);

          let strokeColor = baseStyle.color;
          let strokeWidth = isShared ? 3.5 : 2.5;
          const dashArray = baseStyle.dashArray || (isSoft ? '5,4' : 'none');

          if (isConflictConstraint) {
            strokeColor = '#fa8c16';
            strokeWidth = isShared ? 3.8 : 3;
          }

          if (isActiveConstraint) {
            strokeColor = '#ff4d4f';
            strokeWidth = isShared ? 4 : 3.6;
          }

          const sameRow = predecessorRowIndex === successorRowIndex;
          const fromY = predecessorRowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
          const toY = successorRowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;

          const label = typeLabels[constraint.constraint_type] || 'FS';
          const lagText = constraint.lag_time ? `${constraint.lag_time > 0 ? '+' : ''}${constraint.lag_time}h` : '';
          const strokeOpacity = isActiveConstraint ? 1 : (isConflictConstraint ? 0.95 : (isSoft ? 0.65 : 0.9));
          const highlightFilter = isActiveConstraint || isShared ? 'url(#constraint-glow)' : undefined;
          const labelBackgroundColor = isActiveConstraint
            ? 'rgba(255,77,79,0.88)'
            : isConflictConstraint
              ? 'rgba(250,140,22,0.88)'
              : 'rgba(0,0,0,0.65)';

          const arrowSize = 9;
          let arrowPoints = '';

          let pathD = '';
          if (sameRow) {
            const horizontalDirection = toX >= fromX ? 1 : -1;
            const offsetY = fromY + (horizontalDirection > 0 ? ROW_HEIGHT * 0.25 : -ROW_HEIGHT * 0.25);
            pathD = `M ${fromX} ${offsetY} L ${toX} ${offsetY}`;
            arrowPoints = horizontalDirection > 0
              ? `${toX},${offsetY} ${toX - arrowSize},${offsetY - arrowSize / 2} ${toX - arrowSize},${offsetY + arrowSize / 2}`
              : `${toX},${offsetY} ${toX + arrowSize},${offsetY - arrowSize / 2} ${toX + arrowSize},${offsetY + arrowSize / 2}`;
          } else {
            const midX = fromX + (toX - fromX) / 2;
            pathD = `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX} ${toY}`;
            arrowPoints = toX >= midX
              ? `${toX},${toY} ${toX - arrowSize},${toY - arrowSize / 2} ${toX - arrowSize},${toY + arrowSize / 2}`
              : `${toX},${toY} ${toX + arrowSize},${toY - arrowSize / 2} ${toX + arrowSize},${toY + arrowSize / 2}`;
          }

          const midX = sameRow ? (fromX + toX) / 2 : fromX + (toX - fromX) / 2;
          const midY = sameRow
            ? fromY + (toX >= fromX ? ROW_HEIGHT * 0.25 : -ROW_HEIGHT * 0.25)
            : toY + (fromY < toY ? -ROW_HEIGHT * 0.25 : ROW_HEIGHT * 0.25);

          const baseLabelWidth = 44;
          const labelBackgroundWidth = baseLabelWidth + (lagText ? 30 : 0) + (isShared ? 36 : 0);
          const labelHeight = 18;
          const labelXOffset = 12;
          const lagXOffset = labelXOffset + 24;
          const shareXOffset = lagXOffset + (lagText ? 32 : 0);

          return (
            <g key={`constraint-${constraint.constraint_id}`}>
              <path
                d={pathD}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={dashArray}
                strokeLinecap="round"
                opacity={strokeOpacity}
                data-constraint-id={constraint.constraint_id}
                filter={highlightFilter}
              />

              <polygon
                points={arrowPoints}
                fill={strokeColor}
                opacity={strokeOpacity}
              />

              <g transform={`translate(${midX - labelBackgroundWidth / 2}, ${midY - labelHeight / 2})`}>
                <rect
                  width={labelBackgroundWidth}
                  height={labelHeight}
                  rx={9}
                  ry={9}
                  fill={labelBackgroundColor}
                  opacity={0.85}
                />
                <text
                  x={labelXOffset}
                  y={labelHeight / 2 + 3}
                  fontSize="11"
                  fill="#fff"
                  fontWeight="bold"
                >
                  {label}
                </text>
                {lagText && (
                  <text
                    x={lagXOffset}
                    y={labelHeight / 2 + 3}
                    fontSize="10"
                    fill="#fff"
                    opacity={0.85}
                  >
                    {lagText}
                  </text>
                )}
                {isShared && (
                  <text
                    x={shareXOffset}
                    y={labelHeight / 2 + 3}
                    fontSize="10"
                    fill={isActiveConstraint ? '#fff3cd' : '#FFD666'}
                  >
                    共享
                  </text>
                )}
              </g>

              {constraint.constraint_name && (
                <text
                  x={midX}
                  y={midY + labelHeight}
                  fontSize="10"
                  fill={strokeColor}
                  textAnchor="middle"
                  opacity={0.85}
                >
                  {constraint.constraint_name}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    );
  };

  return (
    <>
      {/* 优化滚动条样式 */}
      <style>{`
        .gantt-scroll-container::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .gantt-scroll-container::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 4px;
        }
        .gantt-scroll-container::-webkit-scrollbar-thumb {
          background: #c1c1c1;
          border-radius: 4px;
          transition: background 0.2s ease;
        }
        .gantt-scroll-container::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
        .gantt-scroll-container::-webkit-scrollbar-corner {
          background: #E5E7EB;
        }
        
        /* 时间轴固定样式 */
        .time-axis-fixed {
          position: sticky;
          top: 0;
          z-index: 10;
        background: ${TOKENS.background};
        }
        
        /* 优化性能的GPU加速 */
        .gantt-content-area {
          transform: translateZ(0);
          backface-visibility: hidden;
          perspective: 1000px;
        }

      `}</style>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: TOKENS.background }}>
      {/* 标题栏 */}
      <div
        style={{
          padding: '12px 20px',
          background: TOKENS.card,
          borderBottom: `1px solid ${TOKENS.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: TITLE_BAR_HEIGHT
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={onBack}
            type="default"
            style={{ borderRadius: 8, marginRight: 4 }}
          >
            返回
          </Button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Text style={{ fontSize: 18, fontWeight: 600, color: TOKENS.textPrimary }}>
              增强甘特图编辑器
            </Text>
            <Text style={{ fontSize: 14, fontWeight: 500, color: TOKENS.textSecondary }}>
              {template.template_code || template.template_name}
            </Text>
          </div>
          {isDirty && <Tag color="orange" style={{ marginLeft: 8 }}>未保存</Tag>}
        </div>

        <Space size={16} align="center">
          <Space.Compact>
            <Tooltip title="缩小">
              <Button
                size="small"
                icon={<ZoomOutOutlined />}
                onClick={handleZoomOut}
                disabled={zoomScale <= 0.1}
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

          <div style={{ width: 140, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Slider
              min={0.1}
              max={5.0}
              step={0.1}
              value={zoomScale}
              onChange={setZoomScale}
              style={{ flex: 1 }}
              tooltip={{
                formatter: (value) => `${Math.round((value || 1) * 100)}%`
              }}
            />
            <Text style={{ fontSize: 12, minWidth: 40, textAlign: 'right', color: TOKENS.textSecondary }}>
              {Math.round(zoomScale * 100)}%
            </Text>
          </div>

          <Button
            type="primary"
            icon={<SaveOutlined />}
            style={{ borderRadius: 8, height: 36, paddingInline: 16 }}
            onClick={handleSaveTemplate}
            disabled={!isDirty}
          >
            保存模板
          </Button>
          <Button
            icon={<SafetyOutlined />}
            style={{ borderRadius: 8, height: 36, paddingInline: 16, borderColor: TOKENS.primary, color: TOKENS.primary }}
            onClick={handleAutoSchedule}
            loading={scheduling}
          >
            自动排程
          </Button>
        </Space>
      </div>

      {/* 主体内容 - 使用网格确保对齐 */}
      <div style={{ flex: 1, background: TOKENS.background, overflow: 'visible' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `${LEFT_PANEL_WIDTH}px minmax(0, 1fr)`,
            gridTemplateRows: `${titleBarHeight}px ${CONTENT_GAP}px 1fr`,
            height: '100%'
          }}
        >
          {/* 顶部分隔行 */}
          <div
            style={{
              gridColumn: '1 / 2',
              gridRow: '1 / 2',
              background: TOKENS.background,
              borderRight: `1px solid ${TOKENS.border}`,
              borderBottom: `1px solid ${TOKENS.border}`,
              height: CONTENT_GAP
            }}
          />

          <div
            style={{
              gridColumn: '2 / 3',
              gridRow: '1 / 2',
              background: TOKENS.background,
              borderBottom: `1px solid ${TOKENS.border}`,
              height: CONTENT_GAP
            }}
          />

          {/* 左侧树列表 */}
          <div
            style={{
              gridColumn: '1 / 2',
              gridRow: '3 / 4',
              background: TOKENS.card,
              borderRight: `1px solid ${TOKENS.border}`,
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 6,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              height: treeHeaderHeight,
              padding: '0 16px',
              background: TOKENS.card,
              borderBottom: `1px solid ${TOKENS.border}`
            }}
          >
            <div
              style={{
                height: HEADER_HEIGHT,
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <Text style={{ fontWeight: 600, color: TOKENS.textSecondary, fontSize: 14 }}>
                工艺结构
              </Text>
            </div>
          </div>
            {flattenedRows.length === 0 ? (
              <div style={{ padding: 24 }}>
                <Empty description="暂无阶段或操作" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              </div>
            ) : (
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                <div
                  style={{
                    height: Math.max(totalHeight, viewportHeight),
                    position: 'relative'
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      transform: `translateY(${virtualOffsetY}px)`,
                      willChange: 'transform'
                    }}
                  >
                    {virtualRows.map((row, index) =>
                      renderTreeRow(row, visibleStartIndex + index)
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 右侧甘特内容 */}
          <div
            style={{
              gridColumn: '2 / 3',
              gridRow: '3 / 4',
              background: TOKENS.card,
              position: 'relative',
              overflow: 'visible',
              minWidth: 0,
              minHeight: 0,
            }}
          >
            <div
              ref={ganttContentRef}
              className="gantt-scroll-container gantt-content-area"
              style={{
                width: '100%',
                height: '100%',
                overflowX: 'auto',
                overflowY: 'auto',
                position: 'relative',
                minWidth: 0,
                minHeight: 0,
                scrollbarWidth: 'thin',
                WebkitOverflowScrolling: 'touch'
              }}
              onScroll={handleGanttScroll}
              onWheel={(e) => {
                if (e.ctrlKey || e.metaKey) {
                  e.preventDefault();
                }
              }}
              onMouseDown={handleGanttMouseDown}
              onMouseMove={handleGanttMouseMove}
              onMouseUp={handleWindowMouseUp}
              onMouseLeave={handleWindowMouseLeave}
            >
              <div
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 6,
                  background: TOKENS.card,
                  borderBottom: `1px solid ${TOKENS.border}`
                }}
              >
                {curveHeight > 0 && (
                  <div
                    style={{
                      position: 'relative',
                      width: headerWidth,
                      minWidth: headerWidth,
                      padding: '8px 0 12px',
                      borderBottom: `1px solid ${TOKENS.border}`,
                      background: TOKENS.card
                    }}
                  >
                    {renderLaborDemandChart(headerWidth, startDay, totalDays, curveHeight, hourWidth)}
                    {laborHover && (
                      <div
                        style={{
                          position: 'absolute',
                          left: Math.min(
                            Math.max(laborHover.x - 60, 8),
                            headerWidth - 132
                          ),
                          top: Math.max(laborHover.y - 64, 12),
                          background: '#0F172A',
                          color: '#F8FAFC',
                          padding: '8px 12px',
                          borderRadius: 8,
                          fontSize: 12,
                          boxShadow: '0 8px 16px rgba(15, 23, 42, 0.18)',
                          pointerEvents: 'none'
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>
                          Day {Math.floor(laborHover.hourIndex / 24)} · {laborHover.hourIndex % 24}:00
                        </div>
                        <div style={{ marginTop: 4 }}>
                          人力需求：<strong>{laborHover.value}</strong> 人
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div style={{ width: headerWidth, minWidth: headerWidth }}>
                  {renderTimeAxis(hourWidth, startDay, endDay)}
                </div>
              </div>

              {renderTimeBlocks()}
            </div>
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
                <Input placeholder="请输入阶段名称" />
              </Form.Item>

              <Form.Item
                name="stage_code"
                label="阶段代码"
                rules={[{ required: true, message: '请输入阶段代码' }]}
              >
                <Input placeholder="如：STAGE1, STAGE2" />
              </Form.Item>

              <Form.Item
                name="start_day"
                label="阶段原点位置（Day0在总轴上的位置）"
                tooltip="定义此阶段的Day0在模板总轴上的位置，支持负值。例如：设为-1表示阶段Day0位于总轴Day-1位置"
                rules={[
                  { required: true, message: '请输入阶段原点位置' },
                  { type: 'number', min: -50, max: 200, message: '必须在-50到200之间' }
                ]}
              >
                <InputNumber 
                  min={-50}
                  max={200}
                  style={{ width: '100%' }}
                  placeholder="阶段Day0在总轴的位置"
                  addonBefore="Day"
                />
              </Form.Item>

              <Form.Item
                name="description"
                label="阶段描述"
              >
                <Input.TextArea 
                  rows={3} 
                  placeholder="请输入阶段描述（可选）" 
                />
              </Form.Item>

              <div style={{ 
                background: '#f0f7ff', 
                padding: '12px', 
                borderRadius: '6px',
                border: '1px solid #d6e4ff',
                marginBottom: '16px'
              }}>
                <Text strong style={{ color: '#1890ff' }}>💡 时间锚定说明：</Text>
                <div style={{ marginTop: '8px', color: '#1f1f1f', fontSize: '12px' }}>
                  • 阶段原点：定义该阶段Day0在模板总轴上的位置<br />
                  • 操作定位：阶段内操作相对于阶段Day0进行定位<br />
                  • 绝对位置：操作绝对位置 = 阶段原点 + 操作相对位置
                </div>
              </div>
            </>
          )}

          {editingNode?.type === 'operation' && (
            <Tabs defaultActiveKey="1">
              <TabPane tab="基本信息" key="1">
                <Form.Item
                  name="operation_id"
                  label="选择操作"
                  rules={[{ required: true, message: '请选择操作' }]}
                >
                  <Select 
                    placeholder="请选择操作" 
                    disabled={!!editingNode.data}
                    showSearch
                    filterOption={(input, option) => {
                      if (!input) {
                        return true;
                      }
                      const rawValue = option?.value;
                      const optionValue = typeof rawValue === 'number' ? rawValue : Number(rawValue);
                      if (Number.isNaN(optionValue)) {
                        return false;
                      }
                      const searchTarget = operationSearchIndex.get(optionValue);
                      if (!searchTarget) {
                        return false;
                      }
                      return fuzzyMatch(input, searchTarget);
                    }}
                    dropdownRender={(menu) => (
                      <>
                        {menu}
                        {!editingNode.data && (
                          <div style={{ padding: 8, borderTop: `1px solid ${TOKENS.border}` }}>
                            <Button
                              type="link"
                              icon={<PlusOutlined />}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                openOperationModal();
                              }}
                              block
                            >
                              新建操作
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  >
                    {availableOperations.map(op => (
                      <Option key={op.id} value={op.id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>{op.operation_code} - {op.operation_name}</span>
                          <span style={{ color: '#8c8c8c' }}>({op.standard_time}h)</span>
                        </div>
                      </Option>
                    ))}
                  </Select>
                </Form.Item>

              <Form.Item
                name="operation_day"
                label="操作位置（相对于阶段原点）"
                tooltip="操作在阶段时间轴上的天数位置，相对于阶段Day0。例如：0表示阶段Day0，-1表示阶段Day-1，1表示阶段Day1"
                rules={[
                  { required: true, message: '请输入操作位置' },
                  { type: 'number', min: -30, max: 30, message: '必须在-30到30之间' }
                ]}
              >
                <InputNumber 
                  min={-30}
                  max={30}
                  style={{ width: '100%' }}
                  placeholder="相对于阶段Day0的位置"
                  addonBefore="阶段Day"
                />
              </Form.Item>

              <Form.Item
                name="recommended_time"
                label="推荐开始时间（当天内）"
                tooltip="推荐的操作开始时间，指定在操作当天的几点开始。使用24小时制，例如：9.5表示9:30"
                initialValue={9}
                rules={[
                  { required: true, message: '请输入推荐时间' },
                  { 
                    validator: (_, value) => {
                      const numValue = typeof value === 'string' ? parseFloat(value) : value;
                      if (isNaN(numValue) || numValue < 0 || numValue > 23.9) {
                        return Promise.reject(new Error('推荐时间必须在0-23.9之间（当天的小时数）'));
                      }
                      return Promise.resolve();
                    }
                  }
                ]}
              >
                <InputNumber 
                  min={0}
                  max={23.9}
                  step={0.5}
                  style={{ width: '100%' }}
                  placeholder="默认 9:00"
                  addonAfter="时"
                />
              </Form.Item>

              <Form.Item
                name="recommended_day_offset"
                label="推荐开始偏移（天）"
                tooltip="用于表示操作开始时间跨日的情况，例如 1 表示顺延一天，-1 表示提前一天"
                initialValue={0}
                rules={[
                  {
                    validator: (_, value) => {
                      const numValue = value !== undefined ? Number(value) : 0;
                      if (Number.isNaN(numValue) || numValue < -7 || numValue > 7) {
                        return Promise.reject(new Error('偏移天数需在 -7 到 7 之间'));
                      }
                      return Promise.resolve();
                    }
                  }
                ]}
              >
                <InputNumber
                  min={-7}
                  max={7}
                  step={1}
                  style={{ width: '100%' }}
                  addonAfter="天"
                />
              </Form.Item>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="window_start_time"
                    label="时间窗口开始（当天内）"
                    tooltip="操作可执行的最早时间，在操作当天的几点可以开始"
                    initialValue={9}
                    rules={[
                      { required: true, message: '请输入开始时间' },
                      { 
                        validator: (_, value) => {
                          const numValue = typeof value === 'string' ? parseFloat(value) : value;
                          if (isNaN(numValue) || numValue < 0 || numValue > 23.9) {
                            return Promise.reject(new Error('开始时间必须在0-23.9之间（当天的小时数）'));
                          }
                          return Promise.resolve();
                        }
                      }
                    ]}
                  >
                    <InputNumber 
                      min={0}
                      max={23.9}
                      step={0.5}
                      style={{ width: '100%' }}
                      placeholder="默认 9:00"
                      addonAfter="时"
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="window_end_time"
                    label="时间窗口结束（当天内）"
                    tooltip="操作可执行的最晚时间，在操作当天的几点必须结束"
                    initialValue={17}
                    rules={[
                      { required: true, message: '请输入结束时间' },
                      { 
                        validator: (_, value) => {
                          const numValue = typeof value === 'string' ? parseFloat(value) : value;
                          if (isNaN(numValue) || numValue < 0 || numValue > 23.9) {
                            return Promise.reject(new Error('结束时间必须在0-23.9之间（当天的小时数）'));
                          }
                          return Promise.resolve();
                        }
                      }
                    ]}
                  >
                    <InputNumber 
                      min={0}
                      max={23.9}
                      step={0.5}
                      style={{ width: '100%' }}
                      placeholder="默认 17:00"
                      addonAfter="时"
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="window_start_day_offset"
                    label="窗口开始偏移（天）"
                    initialValue={0}
                    tooltip="若窗口开始允许跨日，请设置偏移天数"
                    rules={[
                      {
                        validator: (_, value) => {
                          const numValue = value !== undefined ? Number(value) : 0;
                          if (Number.isNaN(numValue) || numValue < -7 || numValue > 7) {
                            return Promise.reject(new Error('偏移天数需在 -7 到 7 之间'));
                          }
                          return Promise.resolve();
                        }
                      }
                    ]}
                  >
                    <InputNumber min={-7} max={7} step={1} style={{ width: '100%' }} addonAfter="天" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="window_end_day_offset"
                    label="窗口结束偏移（天）"
                    initialValue={0}
                    tooltip="若窗口结束跨越至后续日期，请设置偏移天数"
                    rules={[
                      {
                        validator: (_, value) => {
                          const numValue = value !== undefined ? Number(value) : 0;
                          if (Number.isNaN(numValue) || numValue < -7 || numValue > 7) {
                            return Promise.reject(new Error('偏移天数需在 -7 到 7 之间'));
                          }
                          return Promise.resolve();
                        }
                      }
                    ]}
                  >
                    <InputNumber min={-7} max={7} step={1} style={{ width: '100%' }} addonAfter="天" />
                  </Form.Item>
                </Col>
              </Row>

                {/* 时间锚定计算显示 */}
                {editingNode.parent_id && (
                  <div style={{ 
                    background: '#f6f6f6', 
                    padding: '16px', 
                    borderRadius: '6px',
                    marginTop: '16px',
                    border: '1px solid #d9d9d9'
                  }}>
                    <Text strong style={{ color: '#1f1f1f' }}>📍 时间锚定计算：</Text>
                    {(() => {
                      const stageId = editingNode.parent_id?.replace('stage_', '');
                      const stage = stages.find(s => s.id.toString() === stageId);
                      const operationDay = form.getFieldValue('operation_day') || 0;
                      const recommendedOffset = form.getFieldValue('recommended_day_offset') || 0;
                      const absoluteDay = stage ? stage.start_day + operationDay + recommendedOffset : operationDay + recommendedOffset;
                      
                      if (stage) {
                        return (
                          <div>
                            <div style={{ marginTop: '8px', color: '#1f1f1f', fontSize: '12px' }}>
                              阶段 <Text code>"{stage.stage_name}"</Text> 原点位置：Day{stage.start_day}
                            </div>
                            <div style={{ color: '#1f1f1f', fontSize: '12px', marginTop: '4px' }}>
                              操作绝对位置：Day{stage.start_day} + Day{operationDay} + 偏移{recommendedOffset}天 = <Text strong style={{ color: '#1890ff' }}>Day{absoluteDay}</Text>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}
              </TabPane>

              <TabPane tab="约束关系" key="2">
                <OperationConstraintsPanel
                  scheduleId={editingNode.data?.id}
                  constraints={operationConstraints}
                  availableOperations={availableOperationsForConstraints}
                  onConstraintAdded={() => {
                    if (editingNode.data?.id) {
                      loadOperationConstraints(editingNode.data.id);
                    }
                    loadGanttConstraints(); // 重新加载甘特图约束数据
                  }}
                  onConstraintUpdated={() => {
                    if (editingNode.data?.id) {
                      loadOperationConstraints(editingNode.data.id);
                    }
                    loadGanttConstraints(); // 重新加载甘特图约束数据
                  }}
                  onConstraintDeleted={() => {
                    if (editingNode.data?.id) {
                      loadOperationConstraints(editingNode.data.id);
                    }
                    loadGanttConstraints(); // 重新加载甘特图约束数据
                  }}
                />
              </TabPane>

              <TabPane tab="人员共享" key="3">
                <div style={{ padding: '16px 0' }}>
                  <Alert 
                    message="人员共享组管理" 
                    description="将操作加入共享组可以减少人员需求。同一共享组内的操作可以由相同人员依次完成。"
                    type="info" 
                    style={{ marginBottom: 16 }}
                  />

                  {editingNode.data?.id ? (
                    <>
                      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
                        <Form
                          layout="inline"
                          form={assignGroupForm}
                          onFinish={handleAssignShareGroup}
                          initialValues={{ priority: Math.max(1, operationShareGroups.length + 1) }}
                          component="div"
                        >
                          <Form.Item
                            name="share_group_id"
                            rules={[{ required: true, message: '请选择共享组' }]}
                          >
                            <Select
                              placeholder={shareGroups.length === 0 ? '请先创建共享组' : '选择共享组'}
                              style={{ width: 220 }}
                              allowClear
                              disabled={shareGroups.length === 0}
                              showSearch
                              optionFilterProp="children"
                            >
                              {shareGroups.map(group => (
                                <Option key={group.id} value={group.id}>
                                  <Space>
                                    <Tag color={group.color} style={{ margin: 0 }}>{group.group_code}</Tag>
                                    <span>{group.group_name}</span>
                                  </Space>
                                </Option>
                              ))}
                            </Select>
                          </Form.Item>

                          <Form.Item
                            name="priority"
                            rules={[{ required: true, message: '请输入优先级' }]}
                          >
                            <InputNumber min={1} max={99} placeholder="优先级" />
                          </Form.Item>

                          <Form.Item>
                            <Button
                              type="primary"
                              loading={assigningGroup}
                              disabled={shareGroups.length === 0}
                              onClick={() => assignGroupForm.submit()}
                            >
                              加入共享组
                            </Button>
                          </Form.Item>
                        </Form>

                        <Button
                          type="link"
                          icon={<PlusOutlined />}
                          onClick={() => {
                            shareGroupForm.resetFields();
                            shareGroupForm.setFieldsValue({ color: '#1890ff' });
                            setShareGroupModalVisible(true);
                          }}
                        >
                          新建共享组
                        </Button>
                      </Space>

                      <Card
                        size="small"
                        title="已加入的共享组"
                        style={{ marginBottom: 16 }}
                      >
                        {operationShareGroups.length > 0 ? (
                          <List
                            size="small"
                            dataSource={operationShareGroups}
                            renderItem={(group) => (
                              <List.Item
                                actions={[
                                  <Popconfirm
                                    key="remove"
                                    title="确认移除"
                                    description="确定要将该操作移出此共享组吗？"
                                    okText="移除"
                                    cancelText="取消"
                                    onConfirm={() => handleRemoveShareGroup(group.id)}
                                  >
                                    <Button type="text" danger size="small">移除</Button>
                                  </Popconfirm>
                                ]}
                              >
                                <Space direction="vertical" style={{ width: '100%' }}>
                                  <Space>
                                    <Tag color={group.color}>{group.group_code}</Tag>
                                    <Text strong>{group.group_name}</Text>
                                  </Space>
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    优先级：{group.priority ?? '-'}
                                  </Text>
                                  {group.description && (
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                      {group.description}
                                    </Text>
                                  )}
                                </Space>
                              </List.Item>
                            )}
                          />
                        ) : (
                          <Empty description="暂未加入任何共享组" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                        )}
                      </Card>

                      <Card size="small" title="模板共享组清单">
                        {shareGroups.length > 0 ? (
                          <List
                            size="small"
                            dataSource={shareGroups}
                            renderItem={(group) => (
                              <List.Item>
                                <Space direction="vertical" style={{ width: '100%' }}>
                                  <Space>
                                    <Tag color={group.color}>{group.group_code}</Tag>
                                    <Text strong>{group.group_name}</Text>
                                    {group.operation_count !== undefined && (
                                      <Tag color="blue" style={{ margin: 0 }}>操作 {group.operation_count}</Tag>
                                    )}
                                  </Space>
                                  {group.description && (
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                      {group.description}
                                    </Text>
                                  )}
                                </Space>
                              </List.Item>
                            )}
                          />
                        ) : (
                          <Empty description="尚未创建共享组" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                        )}
                      </Card>
                    </>
                  ) : (
                    <Empty description="请先保存操作后再设置共享组" />
                  )}
                </div>

                <Modal
                  title="新建共享组"
                  open={shareGroupModalVisible}
                  onCancel={() => {
                    setShareGroupModalVisible(false);
                    shareGroupForm.resetFields();
                  }}
                  footer={null}
                >
                  <Form form={shareGroupForm} layout="vertical" onFinish={handleCreateShareGroup} component="div">
                    <Form.Item
                      name="group_code"
                      label="共享组编码"
                      rules={[{ required: true, message: '请输入共享组编码' }]}
                    >
                      <Input placeholder="例如：SG-01" maxLength={20} />
                    </Form.Item>

                    <Form.Item
                      name="group_name"
                      label="共享组名称"
                      rules={[{ required: true, message: '请输入共享组名称' }]}
                    >
                      <Input placeholder="请输入共享组名称" maxLength={50} />
                    </Form.Item>

                    <Form.Item
                      name="description"
                      label="描述"
                    >
                      <Input.TextArea rows={3} placeholder="共享组说明（可选）" />
                    </Form.Item>

                    <Form.Item
                      name="color"
                      label="标识颜色"
                    >
                      <Input type="color" style={{ width: 80, padding: 0 }} />
                    </Form.Item>

                    <Space>
                      <Button type="primary" loading={creatingGroup} onClick={() => shareGroupForm.submit()}>
                        创建
                      </Button>
                      <Button
                        onClick={() => {
                          setShareGroupModalVisible(false);
                          shareGroupForm.resetFields();
                        }}
                      >
                        取消
                      </Button>
                    </Space>
                  </Form>
                </Modal>
              </TabPane>
            </Tabs>
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
      <Modal
        title="新建操作"
        open={operationModalVisible}
        onCancel={handleOperationModalCancel}
        onOk={handleOperationSubmit}
        confirmLoading={operationSubmitting}
        okText="保存"
        cancelText="取消"
      >
        <Form form={operationForm} layout="vertical">
          <Form.Item
            label="操作编码"
            name="operation_code"
            rules={[{ required: true, message: '请输入操作编码' }]}
          >
            <Input placeholder="自动生成" maxLength={50} disabled />
          </Form.Item>
          <Form.Item
            label="操作名称"
            name="operation_name"
            rules={[{ required: true, message: '请输入操作名称' }]}
          >
            <Input placeholder="请输入操作名称" maxLength={100} />
          </Form.Item>
          <Form.Item
            label="标准时长 (小时)"
            name="standard_time"
            rules={[{ required: true, message: '请输入标准时长' }]}
          >
            <InputNumber min={0.1} max={72} step={0.1} style={{ width: '100%' }} placeholder="例如 2.5" />
          </Form.Item>
          <Form.Item
            label="需要人数"
            name="required_people"
            rules={[{ required: true, message: '请输入需要人数' }]}
          >
            <InputNumber min={1} max={50} step={1} style={{ width: '100%' }} placeholder="例如 3" />
          </Form.Item>
          <Form.Item label="操作描述" name="description">
            <TextArea rows={3} placeholder="可选，补充说明" />
          </Form.Item>
        </Form>
      </Modal>
      </div>
    </>
  );
};

export default ProcessTemplateGanttAligned;

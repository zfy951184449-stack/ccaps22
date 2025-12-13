import React, { useEffect, useState, useCallback } from 'react';
import {
  Modal,
  Tabs,
  Alert,
  Empty,
  Spin,
  Badge,
} from 'antd';
import {
  CheckCircleOutlined,
  FileTextOutlined,
  TeamOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  AlertOutlined,
} from '@ant-design/icons';
import type { SolveResult } from './types';
import { getSolveRunResult } from '../../services/schedulingV2Api';
import {
  SolveSummaryTab,
  OperationAssignmentTab,
  ShiftPlanTab,
  HoursSummaryTab,
  UnassignedOperationsTab,
} from './tabs';
import ConflictAnalysisTab from './tabs/ConflictAnalysisTab';
import './SolveResultModal.css';

interface SolveResultModalProps {
  open: boolean;
  runId: number | null;
  onClose: () => void;
}

const SolveResultModal: React.FC<SolveResultModalProps> = ({
  open,
  runId,
  onClose,
}) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SolveResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 加载求解结果
  const loadResult = useCallback(async () => {
    if (!runId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await getSolveRunResult(runId);
      if (response.success && response.data) {
        setResult(response.data);
      } else {
        setError(response.error || '获取结果失败');
      }
    } catch (e: any) {
      setError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [runId]);

  // 初始加载
  useEffect(() => {
    if (open && runId) {
      loadResult();
    }
  }, [open, runId, loadResult]);

  // 计算未分配数量（用于 Tab 徽标）
  const getUnassignedCount = () => {
    if (!result?.operation_demands || !result?.assignments) return 0;

    const assignmentMap = new Map<number, number>();
    result.assignments.forEach(a => {
      const count = assignmentMap.get(a.operation_plan_id) || 0;
      assignmentMap.set(a.operation_plan_id, count + 1);
    });

    let unassignedCount = 0;
    result.operation_demands.forEach(demand => {
      const assignedCount = assignmentMap.get(demand.operation_plan_id) || 0;
      if (assignedCount < demand.required_people) {
        unassignedCount++;
      }
    });

    return unassignedCount;
  };

  // 处理分配完成（刷新数据）
  const handleAssignmentComplete = useCallback(() => {
    loadResult();
  }, [loadResult]);

  // Tab 项
  const getTabItems = () => {
    if (!result) return [];

    const unassignedCount = getUnassignedCount();
    const assignmentsCount = result.assignments?.length || 0;
    const shiftPlansCount = result.shift_plans?.filter(p => p.plan_type !== 'REST' && p.plan_type !== 'UNAVAILABLE').length || 0;
    const hoursSummariesCount = result.hours_summaries?.length || 0;
    const conflictCount = (result.conflict_report?.critical_conflicts?.length || 0) +
      (result.conflict_report?.warnings?.length || 0);

    return [
      {
        key: 'summary',
        label: (
          <span>
            <FileTextOutlined style={{ marginRight: 4 }} />
            求解摘要
          </span>
        ),
        children: <SolveSummaryTab result={result} />,
      },
      {
        key: 'assignments',
        label: (
          <span>
            <TeamOutlined style={{ marginRight: 4 }} />
            操作分配
            <span style={{ marginLeft: 4, color: '#999', fontSize: 12 }}>
              ({assignmentsCount})
            </span>
          </span>
        ),
        children: <OperationAssignmentTab result={result} />,
      },
      {
        key: 'shifts',
        label: (
          <span>
            <CalendarOutlined style={{ marginRight: 4 }} />
            班次计划
            <span style={{ marginLeft: 4, color: '#999', fontSize: 12 }}>
              ({shiftPlansCount})
            </span>
          </span>
        ),
        children: <ShiftPlanTab result={result} />,
      },
      {
        key: 'hours',
        label: (
          <span>
            <ClockCircleOutlined style={{ marginRight: 4 }} />
            工时统计
            <span style={{ marginLeft: 4, color: '#999', fontSize: 12 }}>
              ({hoursSummariesCount})
            </span>
          </span>
        ),
        children: <HoursSummaryTab result={result} />,
      },
      {
        key: 'unassigned',
        label: (
          <Badge count={unassignedCount} offset={[8, 0]} size="small">
            <span>
              <WarningOutlined style={{ marginRight: 4, color: unassignedCount > 0 ? '#faad14' : undefined }} />
              未安排的操作
            </span>
          </Badge>
        ),
        children: (
          <UnassignedOperationsTab
            result={result}
            onAssignmentComplete={handleAssignmentComplete}
          />
        ),
      },
      {
        key: 'conflicts',
        label: (
          <Badge count={conflictCount} offset={[8, 0]} size="small" style={{ backgroundColor: conflictCount > 0 ? '#ff4d4f' : undefined }}>
            <span>
              <AlertOutlined style={{ marginRight: 4, color: conflictCount > 0 ? '#ff4d4f' : undefined }} />
              冲突分析
            </span>
          </Badge>
        ),
        children: <ConflictAnalysisTab report={result.conflict_report} />,
      },
    ];
  };

  return (
    <Modal
      title={
        <span>
          <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
          求解结果
        </span>
      }
      open={open}
      onCancel={onClose}
      width={1200}
      footer={null}
      className="solve-result-modal"
      destroyOnClose
    >
      {loading ? (
        <div className="loading-container">
          <Spin size="large" tip="加载求解结果..." />
        </div>
      ) : error ? (
        <Alert type="error" message="加载失败" description={error} showIcon />
      ) : !result ? (
        <Empty description="暂无结果" />
      ) : (
        <Tabs
          items={getTabItems()}
          defaultActiveKey="summary"
          className="result-tabs"
        />
      )}
    </Modal>
  );
};

export default SolveResultModal;

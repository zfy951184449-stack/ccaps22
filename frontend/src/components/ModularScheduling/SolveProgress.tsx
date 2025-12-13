import React, { useRef, useEffect, useMemo } from 'react';
import {
  Card,
  Progress,
  Typography,
  Tag,
  Space,
  Button,
  Alert,
  Statistic,
  Row,
  Col,
  Descriptions,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
  StopOutlined,
  PauseCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { Line } from '@ant-design/plots';
import dayjs from 'dayjs';
import { SolveRun, SolveStatus, SolveStage, SolverProgress, STAGE_LABELS, STAGE_PROGRESS } from './types';

// 分数历史数据点
interface ScorePoint {
  time: number;      // 秒
  score: number;     // 目标函数值（取反，使其为正数更直观）
  solutions: number; // 找到的解数量
}

interface SolveProgressProps {
  run: SolveRun | null;
  onRetry?: () => void;
  onCancel?: () => void;
  onAbort?: () => void;  // 中断求解并使用当前结果
  onClose?: () => void;
  aborting?: boolean;    // 是否正在中断
}

/**
 * 获取状态对应的 Tag 配置
 */
const getStatusTag = (status: SolveStatus) => {
  switch (status) {
    case 'QUEUED':
      return { color: 'default', icon: <ClockCircleOutlined />, text: '排队中' };
    case 'RUNNING':
      return { color: 'processing', icon: <SyncOutlined spin />, text: '运行中' };
    case 'COMPLETED':
      return { color: 'success', icon: <CheckCircleOutlined />, text: '已完成' };
    case 'FAILED':
      return { color: 'error', icon: <CloseCircleOutlined />, text: '失败' };
    case 'CANCELLED':
      return { color: 'warning', icon: <ExclamationCircleOutlined />, text: '已取消' };
    default:
      return { color: 'default', icon: null, text: status };
  }
};

const SolveProgress: React.FC<SolveProgressProps> = ({
  run,
  onRetry,
  onCancel,
  onAbort,
  onClose,
  aborting = false,
}) => {
  // 分数历史记录 - 使用 useState 以触发重新渲染
  const [scoreHistory, setScoreHistory] = React.useState<ScorePoint[]>([]);
  const lastRunIdRef = useRef<number | null>(null);

  // 当 run 变化时，收集分数数据
  useEffect(() => {
    if (!run) return;

    // 如果是新的 run，重置历史
    if (run.id !== lastRunIdRef.current) {
      setScoreHistory([]);
      lastRunIdRef.current = run.id;
    }
    // 只在 SOLVING 阶段且有进度数据时收集
    if (run.stage === 'SOLVING' && run.solver_progress) {
      const sp = run.solver_progress;
      const currentScore = sp.best_objective ?? 0;

      setScoreHistory(prev => {
        // 如果是第一个点，添加初始点
        if (prev.length === 0 && sp.elapsed_seconds > 0 && sp.solutions_found > 0) {
          return [{
            time: Math.round(sp.elapsed_seconds),
            score: currentScore,
            solutions: sp.solutions_found,
          }];
        }

        const lastPoint = prev[prev.length - 1];
        // 只在分数变化时添加数据点
        if (!lastPoint || lastPoint.score !== currentScore) {
          return [...prev, {
            time: Math.round(sp.elapsed_seconds),
            score: currentScore,
            solutions: sp.solutions_found,
          }];
        }
        return prev;
      });
    }
  }, [run?.id, run?.stage, run?.solver_progress?.best_objective, run?.solver_progress?.solutions_found]);

  // 图表数据
  const chartData = scoreHistory;

  if (!run) {
    return null;
  }

  const statusTag = getStatusTag(run.status);
  const stageLabel = STAGE_LABELS[run.stage] || run.stage;
  const isRunning = run.status === 'RUNNING' || run.status === 'QUEUED';
  const isCompleted = run.status === 'COMPLETED';
  const isFailed = run.status === 'FAILED';

  // 计算进度：如果正在求解且有进度信息，使用实际进度；否则使用阶段进度
  const solverProgress = run.solver_progress;
  let progress = STAGE_PROGRESS[run.stage] || 0;
  if (run.stage === 'SOLVING' && solverProgress) {
    // SOLVING 阶段：25% 到 75% 之间根据实际进度计算
    progress = 25 + (solverProgress.progress_percent * 0.5);
  }

  // 格式化时间
  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}秒`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分${Math.round(seconds % 60)}秒`;
    return `${Math.floor(seconds / 3600)}小时${Math.floor((seconds % 3600) / 60)}分`;
  };

  return (
    <Card
      className="solve-progress-card"
      title={
        <Space>
          <Typography.Text strong>求解任务</Typography.Text>
          <Typography.Text type="secondary">{run.run_code}</Typography.Text>
          <Tag color={statusTag.color} icon={statusTag.icon}>
            {statusTag.text}
          </Tag>
        </Space>
      }
      extra={
        <Space>
          {isFailed && onRetry && (
            <Button icon={<ReloadOutlined />} onClick={onRetry}>
              重试
            </Button>
          )}
          {/* 中断按钮：仅在求解阶段且已找到解时显示 */}
          {isRunning && run.stage === 'SOLVING' && solverProgress && solverProgress.solutions_found > 0 && onAbort && (
            <Button
              icon={aborting ? <LoadingOutlined /> : <PauseCircleOutlined />}
              onClick={onAbort}
              disabled={aborting}
              type="primary"
              style={{ backgroundColor: '#faad14', borderColor: '#faad14' }}
            >
              {aborting ? '正在中断...' : '中断并使用当前结果'}
            </Button>
          )}
          {isRunning && onCancel && (
            <Button icon={<StopOutlined />} onClick={onCancel} danger>
              取消
            </Button>
          )}
          {!isRunning && onClose && (
            <Button type="link" onClick={onClose}>
              关闭
            </Button>
          )}
        </Space>
      }
    >
      {/* 进度条 */}
      <div style={{ marginBottom: 24 }}>
        <Progress
          percent={Math.round(progress)}
          status={
            isCompleted ? 'success' :
              isFailed ? 'exception' :
                isRunning ? 'active' : 'normal'
          }
          format={() => stageLabel}
          strokeColor={{
            '0%': '#1890ff',
            '100%': '#52c41a',
          }}
        />
      </div>

      {/* 求解进度详情 */}
      {isRunning && run.stage === 'SOLVING' && solverProgress && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Statistic
              title="已找到解"
              value={solverProgress.solutions_found}
              suffix="个"
              valueStyle={{ color: solverProgress.solutions_found > 0 ? '#52c41a' : '#8c8c8c' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="当前分值"
              value={solverProgress.best_objective !== null ? Math.round(solverProgress.best_objective) : '-'}
              valueStyle={{ color: '#1890ff' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="已用时间"
              value={formatTime(solverProgress.elapsed_seconds)}
              valueStyle={{ color: '#722ed1' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="预计剩余"
              value={formatTime(solverProgress.estimated_remaining)}
              valueStyle={{ color: '#faad14' }}
            />
          </Col>
        </Row>
      )}

      {/* 分数曲线图表 */}
      {isRunning && run.stage === 'SOLVING' && chartData.length >= 1 && (
        <div style={{ marginBottom: 16 }}>
          <Typography.Text type="secondary" style={{ marginBottom: 8, display: 'block' }}>
            目标函数变化曲线（分值越低越好）
          </Typography.Text>
          <Line
            data={chartData}
            xField="time"
            yField="score"
            height={150}
            xAxis={{
              title: { text: '时间 (秒)' },
            }}
            yAxis={{
              title: { text: '目标分值' },
              min: 0,
            }}
            smooth
            point={{ size: 3 }}
            color="#52c41a"
            animation={false}
          />
        </div>
      )}


      {/* 简单进度提示（没有详细进度时） */}
      {isRunning && run.stage === 'SOLVING' && !solverProgress && (
        <Alert
          type="info"
          message="正在求解中..."
          description="求解器正在计算最优排班方案，请耐心等待。"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* 错误信息 */}
      {run.error_message && (
        <Alert
          type="error"
          message="求解失败"
          description={run.error_message}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* 结果摘要 */}
      {isCompleted && run.result_summary && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={8}>
            <Statistic
              title="人员分配"
              value={run.result_summary.totalAssignments}
              suffix="条"
              valueStyle={{ color: '#52c41a' }}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="班次计划"
              value={run.result_summary.totalShiftPlans}
              suffix="条"
              valueStyle={{ color: '#1890ff' }}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="求解状态"
              value={run.result_summary.status === 'OPTIMAL' ? '最优解' : '可行解'}
              valueStyle={{
                color: run.result_summary.status === 'OPTIMAL' ? '#52c41a' : '#1890ff'
              }}
            />
          </Col>
        </Row>
      )}

      {/* 任务详情 */}
      <Descriptions size="small" column={2}>
        <Descriptions.Item label="创建时间">
          {dayjs(run.created_at).format('YYYY-MM-DD HH:mm:ss')}
        </Descriptions.Item>
        {run.completed_at && (
          <Descriptions.Item label="完成时间">
            {dayjs(run.completed_at).format('YYYY-MM-DD HH:mm:ss')}
          </Descriptions.Item>
        )}
        <Descriptions.Item label="求解区间">
          {run.window_start} ~ {run.window_end}
        </Descriptions.Item>
        <Descriptions.Item label="目标批次">
          {run.target_batch_ids.length} 个批次
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
};

export default SolveProgress;


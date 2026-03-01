import React, { useEffect, useState } from 'react';
import { Alert, Card, Col, Row, Space, Spin, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { platformApi } from '../services/platformApi';
import { PlatformConflict, PlatformRunSummary } from '../types/platform';

const runColumns: ColumnsType<PlatformRunSummary> = [
  { title: 'Run Code', dataIndex: 'runCode', key: 'runCode' },
  { title: '状态', dataIndex: 'status', key: 'status', render: (value: string) => <Tag color={value === 'FAILED' ? 'error' : value === 'COMPLETED' ? 'success' : 'processing'}>{value}</Tag> },
  { title: '阶段', dataIndex: 'stage', key: 'stage' },
  { title: '求解状态', dataIndex: 'solverStatus', key: 'solverStatus', render: (value?: string | null) => value ?? '-' },
  { title: '填充率', dataIndex: 'fillRate', key: 'fillRate', render: (value?: number | null) => (value === null || value === undefined ? '-' : `${(value * 100).toFixed(1)}%`) },
  { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt' },
];

const conflictColumns: ColumnsType<PlatformConflict> = [
  { title: '冲突类型', dataIndex: 'conflictType', key: 'conflictType', render: (value: string) => <Tag color="volcano">{value}</Tag> },
  { title: '标题', dataIndex: 'title', key: 'title' },
  { title: '详情', dataIndex: 'details', key: 'details' },
];

const PlatformRunMonitorPage: React.FC = () => {
  const [runs, setRuns] = useState<PlatformRunSummary[]>([]);
  const [conflicts, setConflicts] = useState<PlatformConflict[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [runData, conflictData] = await Promise.all([
          platformApi.getRuns(),
          platformApi.getConflicts({ limit: 12 }),
        ]);
        setRuns(runData);
        setConflicts(conflictData);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  if (loading) {
    return <Spin />;
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message="运行监控"
        description="运行监控聚合展示 V4 运行历史和平台冲突，便于计划员和管理员判断平台 readiness 与建模缺口。"
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Card title="V4 运行历史">
            <Table rowKey="id" columns={runColumns} dataSource={runs} pagination={{ pageSize: 8 }} />
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card title="平台冲突快照">
            <Table rowKey="id" columns={conflictColumns} dataSource={conflicts} pagination={{ pageSize: 8 }} />
          </Card>
        </Col>
      </Row>
    </Space>
  );
};

export default PlatformRunMonitorPage;

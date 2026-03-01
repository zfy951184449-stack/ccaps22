import React, { useEffect, useState } from 'react';
import { Alert, Card, Col, List, Row, Space, Spin, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { platformApi } from '../services/platformApi';
import { PlatformConflict, PlatformOverview } from '../types/platform';

const { Paragraph, Text } = Typography;

const conflictColumns: ColumnsType<PlatformConflict> = [
  {
    title: '类型',
    dataIndex: 'conflictType',
    key: 'conflictType',
    render: (value: PlatformConflict['conflictType']) => <Tag color="volcano">{value}</Tag>,
  },
  {
    title: '标题',
    dataIndex: 'title',
    key: 'title',
  },
  {
    title: '部门',
    dataIndex: 'departmentCode',
    key: 'departmentCode',
    render: (value?: string | null) => value ?? '-',
  },
  {
    title: '时间窗口',
    key: 'window',
    render: (_, record) => `${dayjs(record.windowStart).format('MM-DD HH:mm')} - ${dayjs(record.windowEnd).format('MM-DD HH:mm')}`,
  },
];

const PlatformOverviewPage: React.FC = () => {
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [conflicts, setConflicts] = useState<PlatformConflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setErrorMessage(null);
        const [overviewData, conflictData] = await Promise.all([
          platformApi.getOverview(),
          platformApi.getConflicts({ limit: 8 }),
        ]);
        setOverview(overviewData);
        setConflicts(conflictData);
      } catch (error) {
        console.error('Failed to load platform overview:', error);
        setOverview(null);
        setConflicts([]);
        setErrorMessage('平台总览暂时不可用，请先确认平台资源迁移是否已执行。');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  if (loading) {
    return <Spin />;
  }

  if (!overview) {
    return <Alert type="error" message="平台总览加载失败" description={errorMessage ?? '请稍后重试。'} showIcon />;
  }

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      {errorMessage ? <Alert type="warning" showIcon message={errorMessage} /> : null}
      <Alert
        type="info"
        showIcon
        message="平台 MVP 总览"
        description="当前页面聚合展示项目、批次、资源冲突、维护阻断和运行状态，用于统一查看 USP / DSP / SP&I / Maintenance 的平台 readiness。"
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} xl={8}>
          <Card>
            <Statistic title="项目数" value={overview.projectCount} />
            <Text type="secondary">按 project_code 或批次回退键聚合</Text>
          </Card>
        </Col>
        <Col xs={24} md={12} xl={8}>
          <Card>
            <Statistic title="激活批次" value={overview.activeBatchCount} />
            <Text type="secondary">当前已激活批次规模</Text>
          </Card>
        </Col>
        <Col xs={24} md={12} xl={8}>
          <Card>
            <Statistic title="资源总数" value={overview.resourceCount} />
            <Text type="secondary">已进入平台资源模型的可排资源</Text>
          </Card>
        </Col>
        <Col xs={24} md={12} xl={8}>
          <Card>
            <Statistic title="资源冲突" value={overview.resourceConflictCount} valueStyle={{ color: '#cf1322' }} />
            <Text type="secondary">资源日历重叠占用</Text>
          </Card>
        </Col>
        <Col xs={24} md={12} xl={8}>
          <Card>
            <Statistic title="维护阻断" value={overview.maintenanceBlockCount} valueStyle={{ color: '#d48806' }} />
            <Text type="secondary">维护窗口对排程的直接阻断</Text>
          </Card>
        </Col>
        <Col xs={24} md={12} xl={8}>
          <Card>
            <Statistic title="缺主数据项" value={overview.missingMasterDataCount} valueStyle={{ color: '#cf1322' }} />
            <Text type="secondary">操作缺少资源需求定义</Text>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Card title="关键冲突面板">
            <Table rowKey="id" columns={conflictColumns} dataSource={conflicts} pagination={false} locale={{ emptyText: '暂无冲突' }} />
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card title="最近运行">
            <List
              dataSource={overview.recentRuns}
              renderItem={(run) => (
                <List.Item>
                  <List.Item.Meta
                    title={
                      <Space>
                        <Text strong>{run.runCode}</Text>
                        <Tag color={run.status === 'FAILED' ? 'error' : run.status === 'COMPLETED' ? 'success' : 'processing'}>
                          {run.status}
                        </Tag>
                      </Space>
                    }
                    description={`阶段: ${run.stage} · 创建于 ${dayjs(run.createdAt).format('MM-DD HH:mm')}`}
                  />
                </List.Item>
              )}
            />
          </Card>
          <Card title="部门资源覆盖" style={{ marginTop: 16 }}>
            <List
              dataSource={overview.departments}
              renderItem={(item) => (
                <List.Item>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Text>{item.departmentCode}</Text>
                    <Tag>{item.resourceCount}</Tag>
                  </Space>
                </List.Item>
              )}
            />
            <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
              该统计仅基于已进入新资源主数据模型的资源，不代表全厂全量设备。
            </Paragraph>
          </Card>
        </Col>
      </Row>
    </Space>
  );
};

export default PlatformOverviewPage;

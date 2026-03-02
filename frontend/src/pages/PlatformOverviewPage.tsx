import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import { useNavigate } from 'react-router-dom';
import {
  PlatformConflict,
  PlatformConflictDetail,
  PlatformOverview,
  PlatformRunDetail,
  PlatformRunSummary,
} from '../types/platform';
import { platformApi } from '../services/platformApi';
import {
  PlatformConflictDrawer,
  PlatformReadinessCards,
  PlatformRunHealthPanel,
  PlatformTopRisksPanel,
  RunDetailDrawer,
} from '../components/Platform/PlatformPanels';

const { Text } = Typography;

type StatusFilter = 'ALL' | 'CONFLICT' | 'MISSING' | 'MAINTENANCE';

const conflictColumns = (onOpen: (row: PlatformConflict) => void): ColumnsType<PlatformConflict> => [
  {
    title: '类型',
    dataIndex: 'conflictType',
    key: 'conflictType',
  },
  {
    title: '标题',
    dataIndex: 'title',
    key: 'title',
    render: (_, record) => (
      <Button type="link" style={{ padding: 0 }} onClick={() => onOpen(record)}>
        {record.title}
      </Button>
    ),
  },
  {
    title: '业务域',
    dataIndex: 'departmentCode',
    key: 'departmentCode',
    render: (value?: string | null) => value ?? '-',
  },
  {
    title: '时间',
    key: 'window',
    render: (_, record) => `${dayjs(record.windowStart).format('MM-DD HH:mm')} - ${dayjs(record.windowEnd).format('MM-DD HH:mm')}`,
  },
];

const PlatformOverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [conflicts, setConflicts] = useState<PlatformConflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeDomain, setActiveDomain] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(7, 'day'), dayjs().add(30, 'day')]);
  const [selectedConflict, setSelectedConflict] = useState<PlatformConflictDetail | null>(null);
  const [conflictDrawerOpen, setConflictDrawerOpen] = useState(false);
  const [runDetail, setRunDetail] = useState<PlatformRunDetail | null>(null);
  const [runDrawerOpen, setRunDrawerOpen] = useState(false);

  const loadOverview = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const params = {
        domain_code: activeDomain ?? '',
        from: dateRange[0].toISOString(),
        to: dateRange[1].toISOString(),
      };
      const [overviewData, conflictData] = await Promise.all([
        platformApi.getOverview(params),
        platformApi.getConflicts({
          domain_code: activeDomain ?? '',
          from: params.from,
          to: params.to,
          limit: 16,
        }),
      ]);
      setOverview(overviewData);
      setConflicts(conflictData);
    } catch (error) {
      console.error('Failed to load platform overview:', error);
      setOverview(null);
      setConflicts([]);
      setErrorMessage('平台总览暂时不可用，请先确认平台资源迁移和聚合接口状态。');
    } finally {
      setLoading(false);
    }
  }, [activeDomain, dateRange]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const filteredConflicts = useMemo(() => {
    return conflicts.filter((item) => {
      if (statusFilter === 'ALL') {
        return true;
      }
      if (statusFilter === 'CONFLICT') {
        return item.conflictType === 'RESOURCE_CONFLICT' || item.conflictType === 'PERSONNEL_CONFLICT';
      }
      if (statusFilter === 'MISSING') {
        return item.conflictType === 'MISSING_MASTER_DATA';
      }
      if (statusFilter === 'MAINTENANCE') {
        return item.conflictType === 'MAINTENANCE_BLOCK';
      }
      return true;
    });
  }, [conflicts, statusFilter]);

  const handleOpenConflict = async (conflict: PlatformConflict) => {
    setConflictDrawerOpen(true);
    setSelectedConflict(null);
    try {
      const detail = await platformApi.getConflictDetail(conflict.id);
      setSelectedConflict(detail);
    } catch (error) {
      console.error('Failed to load conflict detail:', error);
    }
  };

  const handleOpenRun = async (run: PlatformRunSummary) => {
    setRunDrawerOpen(true);
    setRunDetail(null);
    try {
      setRunDetail(await platformApi.getRunDetail(run.id));
    } catch (error) {
      console.error('Failed to load run detail:', error);
    }
  };

  if (loading) {
    return <Spin />;
  }

  if (!overview) {
    return <Alert type="error" message="平台总览加载失败" description={errorMessage ?? '请稍后重试。'} showIcon />;
  }

  return (
    <Space direction="vertical" size={24} style={{ width: '100%' }}>
      {overview.warnings.length ? <Alert type="warning" showIcon message={overview.warnings.join('；')} /> : null}
      {errorMessage ? <Alert type="warning" showIcon message={errorMessage} /> : null}

      <Card>
        <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space wrap>
            <DatePicker.RangePicker value={dateRange} onChange={(value) => value && setDateRange([value[0]!, value[1]!])} />
            <Select
              allowClear
              placeholder="业务域"
              style={{ width: 160 }}
              value={activeDomain}
              onChange={(value) => setActiveDomain(value)}
              options={[
                { value: 'USP', label: 'USP' },
                { value: 'DSP', label: 'DSP' },
                { value: 'SPI', label: 'SP&I' },
                { value: 'MAINT', label: 'Maintenance' },
              ]}
            />
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 180 }}
              options={[
                { value: 'ALL', label: '全部状态' },
                { value: 'CONFLICT', label: '有冲突' },
                { value: 'MISSING', label: '缺主数据' },
                { value: 'MAINTENANCE', label: '维护阻断' },
              ]}
            />
          </Space>
          <Button onClick={() => void loadOverview()}>刷新</Button>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} xl={6}>
          <Card><Statistic title="项目数" value={overview.projectCount} /></Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card><Statistic title="激活批次" value={overview.activeBatchCount} /></Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card><Statistic title="已建模资源" value={overview.resourceCount} /></Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card><Statistic title="规则覆盖率" value={Math.round(overview.ruleCoverageRate * 100)} suffix="%" /></Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card><Statistic title="资源冲突" value={overview.resourceConflictCount} valueStyle={{ color: '#cf1322' }} /></Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card><Statistic title="人员冲突" value={overview.personnelConflictCount} valueStyle={{ color: '#d48806' }} /></Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card><Statistic title="维护阻断" value={overview.maintenanceBlockCount} valueStyle={{ color: '#d48806' }} /></Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card><Statistic title="缺主数据项" value={overview.missingMasterDataCount} valueStyle={{ color: '#cf1322' }} /></Card>
        </Col>
      </Row>

      <PlatformReadinessCards readiness={overview.readiness} activeDomain={activeDomain} onSelectDomain={setActiveDomain} />

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Card title="关键阻断面板" extra={<Text type="secondary">点击标题下钻</Text>}>
            <Table
              rowKey="id"
              columns={conflictColumns(handleOpenConflict)}
              dataSource={filteredConflicts}
              pagination={false}
              locale={{ emptyText: '当前筛选条件下暂无冲突' }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <PlatformRunHealthPanel runs={overview.recentRuns} onSelectRun={handleOpenRun} />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <PlatformTopRisksPanel title="问题资源 Top" items={overview.topResources} emptyText="暂无高风险资源" />
        </Col>
        <Col xs={24} xl={12}>
          <PlatformTopRisksPanel title="问题项目 Top" items={overview.topProjects} emptyText="暂无高风险项目" />
        </Col>
      </Row>

      <PlatformConflictDrawer
        open={conflictDrawerOpen}
        conflict={selectedConflict}
        onClose={() => setConflictDrawerOpen(false)}
        onNavigate={(path) => navigate(path)}
      />
      <RunDetailDrawer open={runDrawerOpen} run={runDetail} onClose={() => setRunDrawerOpen(false)} />
    </Space>
  );
};

export default PlatformOverviewPage;

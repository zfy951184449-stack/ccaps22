import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Card,
  Col,
  Input,
  Row,
  Select,
  Space,
  Spin,
} from 'antd';
import { platformApi } from '../services/platformApi';
import { PlatformRunDetail, PlatformRunSummary } from '../types/platform';
import { RunDetailDrawer, RunEventsPanel, RunHistoryTable } from '../components/Platform/PlatformPanels';

const { Search } = Input;

const PlatformRunMonitorPage: React.FC = () => {
  const [runs, setRuns] = useState<PlatformRunSummary[]>([]);
  const [selectedRun, setSelectedRun] = useState<PlatformRunSummary | null>(null);
  const [runDetail, setRunDetail] = useState<PlatformRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchValue, setSearchValue] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [stageFilter, setStageFilter] = useState<string | undefined>();
  const [quickFilter, setQuickFilter] = useState<'ALL' | 'FAILED' | 'RECENT'>('ALL');
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const runData = await platformApi.getRuns();
        setRuns(runData);
        if (runData[0]) {
          setSelectedRun(runData[0]);
        }
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  useEffect(() => {
    if (!selectedRun) {
      setRunDetail(null);
      return;
    }

    const loadDetail = async () => {
      setRunDetail(await platformApi.getRunDetail(selectedRun.id));
    };

    void loadDetail();
  }, [selectedRun]);

  const filteredRuns = useMemo(() => {
    return runs.filter((run) => {
      if (searchValue) {
        const query = searchValue.toLowerCase();
        const matched = run.runCode.toLowerCase().includes(query) || run.stage.toLowerCase().includes(query);
        if (!matched) {
          return false;
        }
      }
      if (statusFilter && run.status !== statusFilter) {
        return false;
      }
      if (stageFilter && run.stage !== stageFilter) {
        return false;
      }
      if (quickFilter === 'FAILED' && run.status !== 'FAILED') {
        return false;
      }
      if (quickFilter === 'RECENT') {
        const diffHours = Math.abs(new Date().getTime() - new Date(run.createdAt).getTime()) / 36e5;
        if (diffHours > 24) {
          return false;
        }
      }
      return true;
    });
  }, [quickFilter, runs, searchValue, stageFilter, statusFilter]);

  if (loading) {
    return <Spin />;
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message="运行监控"
        description="聚合展示 V4 运行历史、事件日志和平台关联冲突，用于判断平台运行质量和求解链路稳定性。"
      />

      <Card>
        <Space wrap>
          <Search placeholder="搜索 run code / stage" allowClear value={searchValue} onChange={(event) => setSearchValue(event.target.value)} style={{ width: 260 }} />
          <Select
            allowClear
            placeholder="状态"
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 140 }}
            options={[
              { value: 'QUEUED' },
              { value: 'RUNNING' },
              { value: 'COMPLETED' },
              { value: 'FAILED' },
            ]}
          />
          <Select
            allowClear
            placeholder="阶段"
            value={stageFilter}
            onChange={setStageFilter}
            style={{ width: 160 }}
            options={[
              { value: 'PREPARING' },
              { value: 'PLANNING' },
              { value: 'PERSISTING' },
              { value: 'COMPLETED' },
              { value: 'FAILED' },
            ]}
          />
          <Select
            value={quickFilter}
            onChange={setQuickFilter}
            style={{ width: 160 }}
            options={[
              { value: 'ALL', label: '全部运行' },
              { value: 'FAILED', label: '仅失败' },
              { value: 'RECENT', label: '最近24小时' },
            ]}
          />
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Card title="运行列表">
            <RunHistoryTable
              runs={filteredRuns}
              selectedRunId={selectedRun?.id ?? null}
              onSelectRun={(run) => {
                setSelectedRun(run);
                setDetailDrawerOpen(true);
              }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <RunEventsPanel run={runDetail} />
        </Col>
      </Row>

      <RunDetailDrawer open={detailDrawerOpen} run={runDetail} onClose={() => setDetailDrawerOpen(false)} />
    </Space>
  );
};

export default PlatformRunMonitorPage;

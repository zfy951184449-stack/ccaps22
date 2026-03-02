import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Card,
  Col,
  Descriptions,
  Empty,
  Input,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { operationResourceRequirementsApi, platformApi, resourcesApi } from '../services/platformApi';
import {
  OperationResourceRequirement,
  PlatformConflict,
  PlatformProject,
  PlatformProjectBatch,
  PlatformProjectDetail,
  PlatformProjectTimelineResponse,
  PlatformTimelineItem,
  Resource,
} from '../types/platform';
import PlatformTimelineBoard from '../components/Platform/PlatformTimelineBoard';
import {
  PlatformDependencyGraph,
  PlatformProjectSidebar,
} from '../components/Platform/PlatformPanels';
import { PlatformOperationEditDrawer } from '../components/Platform/PlatformEditors';

const { Search } = Input;
const batchColumns: ColumnsType<PlatformProjectBatch> = [
  { title: '批次编码', dataIndex: 'batchCode', key: 'batchCode' },
  { title: '批次名称', dataIndex: 'batchName', key: 'batchName' },
  { title: '团队', key: 'team', render: (_, record) => record.teamName ?? record.teamCode ?? '-' },
  {
    title: '状态',
    dataIndex: 'planStatus',
    key: 'planStatus',
    render: (value: string) => <Tag color={value === 'ACTIVATED' ? 'success' : 'default'}>{value}</Tag>,
  },
  {
    title: '计划时间',
    key: 'window',
    render: (_, record) => `${record.plannedStartDate ?? '-'} ~ ${record.plannedEndDate ?? '-'}`,
  },
];

const conflictColumns: ColumnsType<PlatformConflict> = [
  { title: '冲突类型', dataIndex: 'conflictType', key: 'conflictType', render: (value: string) => <Tag color="volcano">{value}</Tag> },
  { title: '标题', dataIndex: 'title', key: 'title' },
  {
    title: '窗口',
    key: 'window',
    render: (_, record) => `${dayjs(record.windowStart).format('MM-DD HH:mm')} - ${dayjs(record.windowEnd).format('MM-DD HH:mm')}`,
  },
];

const ProjectPlanningCenterPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<PlatformProject[]>([]);
  const [detail, setDetail] = useState<PlatformProjectDetail | null>(null);
  const [timeline, setTimeline] = useState<PlatformProjectTimelineResponse | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [requirements, setRequirements] = useState<OperationResourceRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(searchParams.get('projectId'));
  const [searchValue, setSearchValue] = useState('');
  const [domainFilter, setDomainFilter] = useState<string | undefined>();
  const [conflictOnly, setConflictOnly] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PlatformTimelineItem | null>(null);
  const [operationDrawerOpen, setOperationDrawerOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [projectData, resourceData] = await Promise.all([platformApi.getProjects(), resourcesApi.list()]);
        setProjects(projectData);
        setResources(resourceData);
        const initialProjectId = selectedProjectId ?? projectData[0]?.id ?? null;
        setSelectedProjectId(initialProjectId);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId) {
      setDetail(null);
      setTimeline(null);
      return;
    }

    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('projectId', selectedProjectId);
      return next;
    });

    const loadDetail = async () => {
      try {
        setDetailLoading(true);
        const [detailData, timelineData] = await Promise.all([
          platformApi.getProjectById(selectedProjectId),
          platformApi.getProjectTimeline(selectedProjectId),
        ]);
        setDetail(detailData);
        setTimeline(timelineData);
      } finally {
        setDetailLoading(false);
      }
    };

    void loadDetail();
  }, [selectedProjectId, setSearchParams]);

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      if (searchValue) {
        const query = searchValue.toLowerCase();
        const matched = project.projectCode.toLowerCase().includes(query) || project.projectName.toLowerCase().includes(query);
        if (!matched) {
          return false;
        }
      }

      if (domainFilter && !project.departmentCodes.includes(domainFilter)) {
        return false;
      }

      if (conflictOnly && project.missingResourceRequirementCount === 0) {
        return false;
      }

      return true;
    });
  }, [conflictOnly, domainFilter, projects, searchValue]);

  const itemLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    (timeline?.items ?? []).forEach((item) => map.set(item.id, item.title));
    return map;
  }, [timeline]);

  const openOperationDrawer = async (item: PlatformTimelineItem) => {
    setSelectedItem(item);
    setOperationDrawerOpen(true);
    const operationId = Number(item.metadata?.operationId ?? 0);
    if (operationId) {
      try {
        setRequirements(await operationResourceRequirementsApi.list({ operation_id: operationId }));
      } catch (error) {
        console.error('Failed to load operation requirements:', error);
        setRequirements([]);
      }
    } else {
      setRequirements([]);
    }
  };

  const handleSaveOperation = async (payload: {
    operation: { plannedStartDatetime?: string; plannedEndDatetime?: string; notes?: string | null };
    binding: {
      resourceType: any;
      requiredCount: number;
      candidateResourceIds?: number[];
      prepMinutes: number;
      changeoverMinutes: number;
      cleanupMinutes: number;
      isMandatory: boolean;
      requiresExclusiveUse: boolean;
    };
  }) => {
    if (!selectedItem) {
      return;
    }

    const operationPlanId = Number(selectedItem.metadata?.operationPlanId ?? 0);
    if (!operationPlanId) {
      return;
    }

    await platformApi.updateOperationPlan(operationPlanId, payload.operation);
    await platformApi.updateOperationResourceBinding(operationPlanId, payload.binding);
    message.success('项目排产已更新');
    setOperationDrawerOpen(false);
    setRequirements([]);

    if (selectedProjectId) {
      const [detailData, timelineData] = await Promise.all([
        platformApi.getProjectById(selectedProjectId),
        platformApi.getProjectTimeline(selectedProjectId),
      ]);
      setDetail(detailData);
      setTimeline(timelineData);
    }
  };

  if (loading) {
    return <Spin />;
  }

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} xl={8}>
        <Card
          title="项目清单"
          extra={
            <Space wrap>
              <Select
                allowClear
                placeholder="业务域"
                style={{ width: 120 }}
                value={domainFilter}
                onChange={setDomainFilter}
                options={[{ value: 'USP' }, { value: 'DSP' }, { value: 'SPI' }, { value: 'MAINT' }]}
              />
              <Select
                value={conflictOnly ? 'RISK' : 'ALL'}
                onChange={(value) => setConflictOnly(value === 'RISK')}
                options={[
                  { value: 'ALL', label: '全部项目' },
                  { value: 'RISK', label: '仅风险项目' },
                ]}
                style={{ width: 120 }}
              />
            </Space>
          }
        >
          <Search placeholder="搜索项目编码 / 名称" allowClear value={searchValue} onChange={(event) => setSearchValue(event.target.value)} style={{ marginBottom: 12 }} />
          <PlatformProjectSidebar projects={filteredProjects} selectedProjectId={selectedProjectId} onSelectProject={setSelectedProjectId} />
        </Card>
      </Col>

      <Col xs={24} xl={16}>
        <Spin spinning={detailLoading}>
          {!detail || !timeline ? (
            <Card>
              <Empty description="请选择项目查看排产详情" />
            </Card>
          ) : (
            <Tabs
              items={[
                {
                  key: 'overview',
                  label: '项目总览',
                  children: (
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                      <Card title="项目摘要">
                        <Descriptions bordered column={2}>
                          <Descriptions.Item label="项目编码">{detail.project.projectCode}</Descriptions.Item>
                          <Descriptions.Item label="项目名称">{detail.project.projectName}</Descriptions.Item>
                          <Descriptions.Item label="批次数">{detail.project.batchCount}</Descriptions.Item>
                          <Descriptions.Item label="激活批次">{detail.project.activatedBatchCount}</Descriptions.Item>
                          <Descriptions.Item label="计划开始">{detail.project.plannedStartDate ?? '-'}</Descriptions.Item>
                          <Descriptions.Item label="计划结束">{detail.project.plannedEndDate ?? '-'}</Descriptions.Item>
                          <Descriptions.Item label="总操作数">{detail.operationsSummary.totalOperations}</Descriptions.Item>
                          <Descriptions.Item label="缺资源需求">{detail.operationsSummary.missingResourceRequirementCount}</Descriptions.Item>
                        </Descriptions>
                      </Card>

                      <Card title="批次清单">
                        <Table rowKey="id" columns={batchColumns} dataSource={detail.batches} pagination={false} />
                      </Card>

                      <Card title="当前冲突">
                        <Table rowKey="id" columns={conflictColumns} dataSource={timeline.conflicts} pagination={false} locale={{ emptyText: '暂无项目冲突' }} />
                      </Card>
                    </Space>
                  ),
                },
                {
                  key: 'gantt',
                  label: '项目甘特',
                  children: (
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                      {timeline.conflicts.length ? (
                        <Alert type="warning" showIcon message={`当前项目存在 ${timeline.conflicts.length} 个已建模冲突，双击操作条可直接改排。`} />
                      ) : null}
                      <PlatformTimelineBoard
                        lanes={timeline.lanes}
                        items={timeline.items}
                        dependencies={timeline.dependencies}
                        windowStart={timeline.windowStart}
                        windowEnd={timeline.windowEnd}
                        selectedItemId={selectedItem?.id ?? null}
                        onItemClick={setSelectedItem}
                        onItemDoubleClick={(item) => void openOperationDrawer(item)}
                        emptyDescription="当前项目暂无操作时间轴数据"
                      />
                    </Space>
                  ),
                },
                {
                  key: 'dependency',
                  label: '依赖关系',
                  children: <PlatformDependencyGraph dependencies={timeline.dependencies} itemLabelMap={itemLabelMap} />,
                },
              ]}
            />
          )}
        </Spin>
      </Col>

      <PlatformOperationEditDrawer
        open={operationDrawerOpen}
        item={selectedItem}
        requirements={requirements}
        resources={resources}
        onClose={() => setOperationDrawerOpen(false)}
        onSubmit={handleSaveOperation}
      />
    </Row>
  );
};

export default ProjectPlanningCenterPage;

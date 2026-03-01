import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Card, Col, Descriptions, Empty, List, Row, Space, Spin, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { platformApi } from '../services/platformApi';
import { PlatformConflict, PlatformProject, PlatformProjectBatch, PlatformProjectDetail } from '../types/platform';

const { Paragraph, Text } = Typography;

const projectColumns: ColumnsType<PlatformProject> = [
  { title: '项目编码', dataIndex: 'projectCode', key: 'projectCode' },
  { title: '项目名称', dataIndex: 'projectName', key: 'projectName' },
  { title: '批次数', dataIndex: 'batchCount', key: 'batchCount' },
  {
    title: '业务域',
    dataIndex: 'departmentCodes',
    key: 'departmentCodes',
    render: (value: string[]) => (
      <Space wrap>
        {value.map((item) => (
          <Tag key={item}>{item}</Tag>
        ))}
      </Space>
    ),
  },
  {
    title: '计划窗口',
    key: 'window',
    render: (_, record) => `${record.plannedStartDate ?? '-'} ~ ${record.plannedEndDate ?? '-'}`,
  },
];

const batchColumns: ColumnsType<PlatformProjectBatch> = [
  { title: '批次编码', dataIndex: 'batchCode', key: 'batchCode' },
  { title: '批次名称', dataIndex: 'batchName', key: 'batchName' },
  {
    title: '团队',
    key: 'team',
    render: (_, record) => record.teamName ?? record.teamCode ?? '-',
  },
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

const ProjectPlanningCenterPage: React.FC = () => {
  const [projects, setProjects] = useState<PlatformProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PlatformProjectDetail | null>(null);
  const [conflicts, setConflicts] = useState<PlatformConflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const projectData = await platformApi.getProjects();
        setProjects(projectData);
        if (projectData.length > 0) {
          setSelectedProjectId(projectData[0].id);
        }
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  useEffect(() => {
    if (!selectedProjectId) {
      return;
    }

    const loadDetail = async () => {
      try {
        setDetailLoading(true);
        const [detailData, conflictData] = await Promise.all([
          platformApi.getProjectById(selectedProjectId),
          platformApi.getConflicts({ project_key: selectedProjectId.replace(/^legacy:/, ''), limit: 10 }),
        ]);
        setDetail(detailData);
        setConflicts(conflictData);
      } finally {
        setDetailLoading(false);
      }
    };

    void loadDetail();
  }, [selectedProjectId]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  if (loading) {
    return <Spin />;
  }

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} xl={10}>
        <Card title="项目清单">
          <Table
            rowKey="id"
            columns={projectColumns}
            dataSource={projects}
            pagination={false}
            rowSelection={{
              type: 'radio',
              selectedRowKeys: selectedProjectId ? [selectedProjectId] : [],
              onChange: (keys) => setSelectedProjectId(String(keys[0])),
            }}
            locale={{ emptyText: '当前暂无项目平台数据，页面将按批次/项目键回退展示。' }}
          />
        </Card>
      </Col>
      <Col xs={24} xl={14}>
        <Spin spinning={detailLoading}>
          {!selectedProject || !detail ? (
            <Card>
              <Empty description="请选择项目查看排产详情" />
            </Card>
          ) : (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Card title="项目详情">
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
                <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
                  当前项目中心按项目键聚合现有批次数据，便于平台层统一查看跨部门排产和资源准备状态。
                </Paragraph>
              </Card>

              <Card title="批次视图">
                <Table rowKey="id" columns={batchColumns} dataSource={detail.batches} pagination={false} />
              </Card>

              <Card title="冲突面板">
                {conflicts.length === 0 ? (
                  <Alert type="success" showIcon message="当前项目未发现已建模冲突" />
                ) : (
                  <List
                    dataSource={conflicts}
                    renderItem={(conflict) => (
                      <List.Item>
                        <List.Item.Meta
                          title={
                            <Space>
                              <Tag color={conflict.severity === 'HIGH' ? 'error' : 'warning'}>{conflict.conflictType}</Tag>
                              <Text strong>{conflict.title}</Text>
                            </Space>
                          }
                          description={`${dayjs(conflict.windowStart).format('MM-DD HH:mm')} - ${dayjs(conflict.windowEnd).format('MM-DD HH:mm')} · ${conflict.details}`}
                        />
                      </List.Item>
                    )}
                  />
                )}
              </Card>
            </Space>
          )}
        </Spin>
      </Col>
    </Row>
  );
};

export default ProjectPlanningCenterPage;

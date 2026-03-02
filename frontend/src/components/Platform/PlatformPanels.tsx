import React from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  List,
  Progress,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  OperationResourceRequirement,
  PlatformBusinessRulesCoverage,
  PlatformConflictDetail,
  PlatformReadinessSummary,
  PlatformRiskItem,
  PlatformRunDetail,
  PlatformRunSummary,
  PlatformTimelineDependency,
} from '../../types/platform';

const { Paragraph, Text } = Typography;

export const PlatformReadinessCards: React.FC<{
  readiness: PlatformReadinessSummary[];
  activeDomain?: string;
  onSelectDomain?: (domainCode?: string) => void;
}> = ({ readiness, activeDomain, onSelectDomain }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
    {readiness.map((item) => (
      <Card
        key={item.domainCode}
        hoverable
        onClick={() => onSelectDomain?.(activeDomain === item.domainCode ? undefined : item.domainCode)}
        style={{
          borderColor: activeDomain === item.domainCode ? '#1677ff' : undefined,
        }}
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Text strong>{item.domainCode}</Text>
            <Tag color={item.readinessStatus === 'READY' ? 'success' : item.readinessStatus === 'AT_RISK' ? 'warning' : 'error'}>
              {item.readinessStatus}
            </Tag>
          </Space>
          <Text type="secondary">项目 {item.projectCount} · 资源 {item.resourceCount}</Text>
          <Progress size="small" percent={Math.round(item.resourceRequirementCoverage * 100)} status="active" />
          <Text type="secondary">资源规则覆盖率</Text>
          <Progress size="small" percent={Math.round(item.candidateBindingCoverage * 100)} strokeColor="#722ed1" />
          <Text type="secondary">候选绑定覆盖率</Text>
          <Space wrap>
            <Tag color="volcano">冲突 {item.conflictCount}</Tag>
            <Tag color="gold">维护阻断 {item.maintenanceBlockCount}</Tag>
          </Space>
        </Space>
      </Card>
    ))}
  </div>
);

export const PlatformTopRisksPanel: React.FC<{
  title: string;
  items: PlatformRiskItem[];
  emptyText?: string;
}> = ({ title, items, emptyText = '暂无风险项' }) => (
  <Card title={title}>
    <List
      dataSource={items}
      locale={{ emptyText }}
      renderItem={(item) => (
        <List.Item>
          <List.Item.Meta
            title={
              <Space>
                <Text strong>{item.label}</Text>
                {item.domainCode ? <Tag>{item.domainCode}</Tag> : null}
              </Space>
            }
            description={item.sublabel ?? '-'}
          />
          <Tag color="volcano">
            {item.metricLabel}: {item.metric}
          </Tag>
        </List.Item>
      )}
    />
  </Card>
);

export const PlatformRunHealthPanel: React.FC<{
  runs: PlatformRunSummary[];
  onSelectRun?: (run: PlatformRunSummary) => void;
}> = ({ runs, onSelectRun }) => (
  <Card title="运行健康">
    <List
      dataSource={runs}
      locale={{ emptyText: '暂无运行记录' }}
      renderItem={(run) => (
        <List.Item
          actions={[
            <Button key="detail" type="link" onClick={() => onSelectRun?.(run)}>
              详情
            </Button>,
          ]}
        >
          <List.Item.Meta
            title={
              <Space>
                <Text strong>{run.runCode}</Text>
                <Tag color={run.status === 'FAILED' ? 'error' : run.status === 'COMPLETED' ? 'success' : 'processing'}>
                  {run.status}
                </Tag>
              </Space>
            }
            description={`阶段 ${run.stage} · ${dayjs(run.createdAt).format('MM-DD HH:mm')}`}
          />
        </List.Item>
      )}
    />
  </Card>
);

export const PlatformConflictDrawer: React.FC<{
  open: boolean;
  conflict?: PlatformConflictDetail | null;
  loading?: boolean;
  onClose: () => void;
  onNavigate?: (path: string) => void;
}> = ({ open, conflict, loading, onClose, onNavigate }) => (
  <Drawer title="冲突详情" width={520} open={open} onClose={onClose}>
    {!conflict ? (
      <Empty description={loading ? '加载中...' : '请选择冲突'} />
    ) : (
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label="类型">
            <Tag color="volcano">{conflict.conflictType}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="严重级别">
            <Tag color={conflict.severity === 'HIGH' ? 'error' : conflict.severity === 'MEDIUM' ? 'warning' : 'default'}>
              {conflict.severity}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="标题">{conflict.title}</Descriptions.Item>
          <Descriptions.Item label="时间窗口">
            {dayjs(conflict.windowStart).format('YYYY-MM-DD HH:mm')} - {dayjs(conflict.windowEnd).format('YYYY-MM-DD HH:mm')}
          </Descriptions.Item>
          <Descriptions.Item label="详情">{conflict.details}</Descriptions.Item>
        </Descriptions>

        <Card title="关联对象" size="small">
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Text>项目: {conflict.relatedProjects.map((item: PlatformConflictDetail['relatedProjects'][number]) => item.projectCode).join(', ') || '-'}</Text>
            <Text>批次: {conflict.relatedBatches.map((item: PlatformConflictDetail['relatedBatches'][number]) => item.batchCode).join(', ') || '-'}</Text>
            <Text>操作: {conflict.relatedOperations.map((item: PlatformConflictDetail['relatedOperations'][number]) => item.operationName).join(', ') || '-'}</Text>
            <Text>资源: {conflict.relatedResources.map((item: PlatformConflictDetail['relatedResources'][number]) => item.resourceName).join(', ') || '-'}</Text>
          </Space>
        </Card>

        <Space wrap>
          {conflict.recommendedRoutes.map((route: PlatformConflictDetail['recommendedRoutes'][number]) => (
            <Button key={route.key} type="primary" ghost onClick={() => onNavigate?.(route.path)}>
              {route.label}
            </Button>
          ))}
        </Space>
      </Space>
    )}
  </Drawer>
);

export const PlatformProjectSidebar: React.FC<{
  projects: Array<{
    id: string;
    projectCode: string;
    projectName: string;
    departmentCodes: string[];
    plannedStartDate: string | null;
    plannedEndDate: string | null;
    missingResourceRequirementCount: number;
  }>;
  selectedProjectId?: string | null;
  onSelectProject: (projectId: string) => void;
}> = ({ projects, selectedProjectId, onSelectProject }) => (
  <List
    dataSource={projects}
    locale={{ emptyText: '暂无项目' }}
    renderItem={(project) => (
      <List.Item
        style={{
          cursor: 'pointer',
          padding: 12,
          borderRadius: 10,
          background: selectedProjectId === project.id ? '#e6f4ff' : undefined,
          marginBottom: 8,
        }}
        onClick={() => onSelectProject(project.id)}
      >
        <List.Item.Meta
          title={
            <Space>
              <Text strong>{project.projectCode}</Text>
              {project.departmentCodes.map((item) => (
                <Tag key={item}>{item}</Tag>
              ))}
            </Space>
          }
          description={
            <Space direction="vertical" size={0}>
              <Text>{project.projectName}</Text>
              <Text type="secondary">
                {project.plannedStartDate ?? '-'} ~ {project.plannedEndDate ?? '-'}
              </Text>
            </Space>
          }
        />
        {project.missingResourceRequirementCount > 0 ? <Tag color="volcano">缺规则 {project.missingResourceRequirementCount}</Tag> : null}
      </List.Item>
    )}
  />
);

export const PlatformDependencyGraph: React.FC<{
  dependencies: PlatformTimelineDependency[];
  itemLabelMap: Map<string, string>;
}> = ({ dependencies, itemLabelMap }) => (
  <Card title="依赖关系">
    {dependencies.length === 0 ? (
      <Empty description="当前项目没有依赖链路" />
    ) : (
      <List
        dataSource={dependencies}
        renderItem={(dependency) => (
          <List.Item>
            <List.Item.Meta
              title={
                <Space>
                  <Text strong>{itemLabelMap.get(dependency.fromItemId) ?? dependency.fromItemId}</Text>
                  <Text type="secondary">→</Text>
                  <Text strong>{itemLabelMap.get(dependency.toItemId) ?? dependency.toItemId}</Text>
                </Space>
              }
              description={`${dependency.type}${dependency.label ? ` · ${dependency.label}` : ''}`}
            />
          </List.Item>
        )}
      />
    )}
  </Card>
);

export const ResourceBindingPanel: React.FC<{
  title: string;
  requirements: OperationResourceRequirement[];
  onEditRequirement?: (requirement: OperationResourceRequirement) => void;
}> = ({ title, requirements, onEditRequirement }) => {
  const columns: ColumnsType<OperationResourceRequirement> = [
    { title: '操作', key: 'operation', render: (_, record) => record.operationName ?? record.operationCode ?? record.operationId },
    { title: '资源类型', dataIndex: 'resourceType', key: 'resourceType', render: (value: string) => <Tag>{value}</Tag> },
    { title: '数量', dataIndex: 'requiredCount', key: 'requiredCount' },
    {
      title: '候选资源',
      key: 'candidateResources',
      render: (_, record) => (
        <Space wrap>
          {record.candidateResources.length ? (
            record.candidateResources.map((resource: OperationResourceRequirement['candidateResources'][number]) => (
              <Tag key={resource.id}>{resource.resourceCode ?? resource.resourceName}</Tag>
            ))
          ) : (
            <Tag>按类型匹配</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        <Button type="link" onClick={() => onEditRequirement?.(record)}>
          编辑
        </Button>
      ),
    },
  ];

  return (
    <Card title={title}>
      <Table rowKey="id" columns={columns} dataSource={requirements} pagination={false} locale={{ emptyText: '暂无绑定关系' }} />
    </Card>
  );
};

export const RuleCoverageCards: React.FC<{ coverage: PlatformBusinessRulesCoverage | null }> = ({ coverage }) => {
  if (!coverage) {
    return null;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
      <Card>
        <Text strong>缺规则操作</Text>
        <Paragraph style={{ marginBottom: 0 }}>{coverage.missingRuleOperations.length}</Paragraph>
      </Card>
      <Card>
        <Text strong>缺候选绑定</Text>
        <Paragraph style={{ marginBottom: 0 }}>{coverage.missingCandidateBindings.length}</Paragraph>
      </Card>
      <Card>
        <Text strong>候选资源类型异常</Text>
        <Paragraph style={{ marginBottom: 0 }}>{coverage.mismatchedCandidates.length}</Paragraph>
      </Card>
    </div>
  );
};

export const MissingRulePanel: React.FC<{ coverage: PlatformBusinessRulesCoverage | null }> = ({ coverage }) => {
  if (!coverage) {
    return null;
  }

  return (
    <Card title="差异清单">
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          type="warning"
          showIcon
          message={`缺规则操作 ${coverage.missingRuleOperations.length} 个，缺候选绑定 ${coverage.missingCandidateBindings.length} 个`}
        />
        <List
          header="缺规则操作"
          bordered
          dataSource={coverage.missingRuleOperations.slice(0, 12)}
          locale={{ emptyText: '暂无缺规则操作' }}
          renderItem={(item: PlatformBusinessRulesCoverage['missingRuleOperations'][number]) => (
            <List.Item>
              <Space direction="vertical" size={0}>
                <Text strong>
                  {item.operationCode} / {item.operationName}
                </Text>
                <Text type="secondary">
                  {item.projectCode} / {item.batchCode} / {item.domainCode}
                </Text>
              </Space>
            </List.Item>
          )}
        />
      </Space>
    </Card>
  );
};

export const RunHistoryTable: React.FC<{
  runs: PlatformRunSummary[];
  loading?: boolean;
  selectedRunId?: number | null;
  onSelectRun: (run: PlatformRunSummary) => void;
}> = ({ runs, loading, selectedRunId, onSelectRun }) => {
  const columns: ColumnsType<PlatformRunSummary> = [
    { title: 'Run Code', dataIndex: 'runCode', key: 'runCode' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (value: string) => <Tag color={value === 'FAILED' ? 'error' : value === 'COMPLETED' ? 'success' : 'processing'}>{value}</Tag>,
    },
    { title: '阶段', dataIndex: 'stage', key: 'stage' },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', render: (value: string) => dayjs(value).format('MM-DD HH:mm') },
  ];

  return (
    <Table
      rowKey="id"
      loading={loading}
      columns={columns}
      dataSource={runs}
      pagination={{ pageSize: 8 }}
      rowSelection={{
        type: 'radio',
        selectedRowKeys: selectedRunId ? [selectedRunId] : [],
        onChange: (_, rows) => {
          if (rows[0]) {
            onSelectRun(rows[0]);
          }
        },
      }}
    />
  );
};

export const RunEventsPanel: React.FC<{ run?: PlatformRunDetail | null }> = ({ run }) => (
  <Card title="事件日志">
    {!run ? (
      <Empty description="请选择运行记录" />
    ) : (
      <List
        dataSource={run.events}
        locale={{ emptyText: '暂无事件' }}
        renderItem={(event: PlatformRunDetail['events'][number]) => (
          <List.Item>
            <List.Item.Meta
              title={
                <Space>
                  <Tag>{event.stage}</Tag>
                  <Tag color={event.status === 'ERROR' ? 'error' : event.status === 'SUCCESS' ? 'success' : 'default'}>{event.status}</Tag>
                  <Text>{event.eventKey}</Text>
                </Space>
              }
              description={`${dayjs(event.createdAt).format('MM-DD HH:mm:ss')} · ${event.message}`}
            />
          </List.Item>
        )}
      />
    )}
  </Card>
);

export const RunDetailDrawer: React.FC<{
  open: boolean;
  run?: PlatformRunDetail | null;
  onClose: () => void;
}> = ({ open, run, onClose }) => (
  <Drawer open={open} onClose={onClose} width={560} title="运行详情">
    {!run ? (
      <Empty description="请选择运行记录" />
    ) : (
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Descriptions bordered column={1} size="small">
          <Descriptions.Item label="Run Code">{run.runCode}</Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={run.status === 'FAILED' ? 'error' : run.status === 'COMPLETED' ? 'success' : 'processing'}>{run.status}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="阶段">{run.stage}</Descriptions.Item>
          <Descriptions.Item label="窗口">
            {run.windowStart ?? '-'} ~ {run.windowEnd ?? '-'}
          </Descriptions.Item>
          <Descriptions.Item label="错误">{run.errorMessage ?? '-'}</Descriptions.Item>
        </Descriptions>

        {run.warnings.length ? <Alert type="warning" showIcon message={run.warnings.join('；')} /> : null}

        <Card title="关联项目" size="small">
          <List
            dataSource={run.relatedProjects}
            locale={{ emptyText: '暂无关联项目' }}
            renderItem={(item: PlatformRunDetail['relatedProjects'][number]) => (
              <List.Item>
                <Text>{item.projectCode}</Text>
              </List.Item>
            )}
          />
        </Card>

        <Card title="关联冲突" size="small">
          <List
            dataSource={run.relatedConflicts}
            locale={{ emptyText: '暂无关联冲突' }}
            renderItem={(item: PlatformRunDetail['relatedConflicts'][number]) => (
              <List.Item>
                <Space>
                  <Tag color="volcano">{item.conflictType}</Tag>
                  <Text>{item.title}</Text>
                </Space>
              </List.Item>
            )}
          />
        </Card>
      </Space>
    )}
  </Drawer>
);

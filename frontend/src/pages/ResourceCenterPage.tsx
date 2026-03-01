import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import { organizationApi, operationApi } from '../services/api';
import { operationResourceRequirementsApi, resourcesApi } from '../services/platformApi';
import { Team, Operation } from '../types';
import {
  OperationResourceRequirement,
  OperationResourceRequirementInput,
  Resource,
  ResourceCalendarEntry,
  ResourceInput,
  ResourceType,
} from '../types/platform';

const { Paragraph } = Typography;

const resourceTypeOptions: Array<{ label: string; value: ResourceType }> = [
  { label: '房间', value: 'ROOM' },
  { label: '设备', value: 'EQUIPMENT' },
  { label: '容器/储罐', value: 'VESSEL_CONTAINER' },
  { label: '器具', value: 'TOOLING' },
  { label: '灭菌资源', value: 'STERILIZATION_RESOURCE' },
];

const resourceColumns: ColumnsType<Resource> = [
  { title: '资源编码', dataIndex: 'resourceCode', key: 'resourceCode' },
  { title: '资源名称', dataIndex: 'resourceName', key: 'resourceName' },
  { title: '类型', dataIndex: 'resourceType', key: 'resourceType' },
  { title: '部门', dataIndex: 'departmentCode', key: 'departmentCode' },
  { title: '归属单元', dataIndex: 'ownerUnitName', key: 'ownerUnitName', render: (value?: string | null) => value ?? '-' },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    render: (value: string) => <Tag color={value === 'ACTIVE' ? 'success' : value === 'MAINTENANCE' ? 'warning' : 'default'}>{value}</Tag>,
  },
];

const calendarColumns: ColumnsType<ResourceCalendarEntry> = [
  {
    title: '事件',
    dataIndex: 'eventType',
    key: 'eventType',
    render: (value: string) => <Tag color={value === 'MAINTENANCE' ? 'gold' : value === 'OCCUPIED' ? 'blue' : 'default'}>{value}</Tag>,
  },
  {
    title: '时间',
    key: 'window',
    render: (_, record) => `${dayjs(record.startDatetime).format('MM-DD HH:mm')} - ${dayjs(record.endDatetime).format('MM-DD HH:mm')}`,
  },
  { title: '来源', dataIndex: 'sourceType', key: 'sourceType' },
  { title: '备注', dataIndex: 'notes', key: 'notes', render: (value?: string | null) => value ?? '-' },
];

const requirementColumns: ColumnsType<OperationResourceRequirement> = [
  { title: '操作', key: 'operation', render: (_, record) => record.operationName ?? record.operationCode ?? record.operationId },
  { title: '资源类型', dataIndex: 'resourceType', key: 'resourceType' },
  { title: '数量', dataIndex: 'requiredCount', key: 'requiredCount' },
  {
    title: '候选资源',
    key: 'candidateResources',
    render: (_, record) => (
      <Space wrap>
        {record.candidateResources.length ? (
          record.candidateResources.map((resource) => (
            <Tag key={resource.id}>{resource.resourceCode ?? resource.resourceName ?? resource.id}</Tag>
          ))
        ) : (
          <Tag>按类型匹配</Tag>
        )}
      </Space>
    ),
  },
  { title: '前置', dataIndex: 'prepMinutes', key: 'prepMinutes' },
  { title: '切换', dataIndex: 'changeoverMinutes', key: 'changeoverMinutes' },
  { title: '清理', dataIndex: 'cleanupMinutes', key: 'cleanupMinutes' },
];

interface ResourceCalendarFormValues {
  window: [Dayjs, Dayjs];
  eventType: ResourceCalendarEntry['eventType'];
  sourceType: ResourceCalendarEntry['sourceType'];
  notes?: string;
}

interface ResourceFormValues {
  resourceCode: string;
  resourceName: string;
  resourceType: ResourceType;
  departmentCode: Resource['departmentCode'];
  ownerOrgUnitId: number | null;
  status: Resource['status'];
  capacity: number;
  location?: string;
  cleanLevel?: string;
  isShared: boolean;
  isSchedulable: boolean;
  metadataText?: string;
}

interface RequirementFormValues {
  operationId: number;
  resourceType: ResourceType;
  requiredCount: number;
  candidateResourceIds?: number[];
  isMandatory: boolean;
  requiresExclusiveUse: boolean;
  prepMinutes: number;
  changeoverMinutes: number;
  cleanupMinutes: number;
}

const ResourceCenterPage: React.FC = () => {
  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [calendarEntries, setCalendarEntries] = useState<ResourceCalendarEntry[]>([]);
  const [requirements, setRequirements] = useState<OperationResourceRequirement[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [resourceModalOpen, setResourceModalOpen] = useState(false);
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [requirementDrawerOpen, setRequirementDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resourceForm] = Form.useForm<ResourceFormValues>();
  const [calendarForm] = Form.useForm<ResourceCalendarFormValues>();
  const [requirementForm] = Form.useForm<RequirementFormValues>();
  const selectedResourceId = selectedResource?.id;
  const selectedRequirementResourceType = Form.useWatch('resourceType', requirementForm);

  const candidateResourceOptions = useMemo(
    () =>
      resources
        .filter((resource) => resource.resourceType === selectedRequirementResourceType && resource.isSchedulable)
        .map((resource) => ({
          value: resource.id,
          label: `${resource.resourceCode} - ${resource.resourceName}`,
        })),
    [resources, selectedRequirementResourceType],
  );

  const loadResources = async () => {
    const [resourceData, requirementData, teamData, operationData] = await Promise.all([
      resourcesApi.list(),
      operationResourceRequirementsApi.list(),
      organizationApi.getTeams(),
      operationApi.getAll().then((res) => res.data),
    ]);
    setResources(resourceData);
    setRequirements(requirementData);
    setTeams(teamData);
    setOperations(operationData);
    if (resourceData.length > 0) {
      setSelectedResource((current) => current ?? resourceData[0]);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setErrorMessage(null);
        await loadResources();
      } catch (error) {
        console.error('Failed to load resource center:', error);
        setResources([]);
        setRequirements([]);
        setCalendarEntries([]);
        setSelectedResource(null);
        setErrorMessage('资源中心暂时不可用，请先确认平台资源迁移是否已执行。');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  useEffect(() => {
    if (!selectedResourceId) {
      setCalendarEntries([]);
      return;
    }

    const loadCalendar = async () => {
      try {
        const [detail, entries] = await Promise.all([
          resourcesApi.getById(selectedResourceId),
          resourcesApi.getCalendar(selectedResourceId),
        ]);
        setSelectedResource(detail);
        setCalendarEntries(entries);
      } catch (error) {
        console.error('Failed to load resource calendar:', error);
        setCalendarEntries([]);
        message.warning('资源详情或资源日历暂时不可用。');
      }
    };

    void loadCalendar();
  }, [selectedResourceId]);

  useEffect(() => {
    const selectedCandidateIds = requirementForm.getFieldValue('candidateResourceIds') as number[] | undefined;
    if (!selectedCandidateIds?.length) {
      return;
    }

    const validIds = new Set(candidateResourceOptions.map((option) => option.value));
    const nextIds = selectedCandidateIds.filter((candidateId) => validIds.has(candidateId));
    if (nextIds.length !== selectedCandidateIds.length) {
      requirementForm.setFieldsValue({ candidateResourceIds: nextIds });
    }
  }, [candidateResourceOptions, requirementForm]);

  const handleCreateResource = async () => {
    const values = await resourceForm.validateFields();
    let metadata: Record<string, unknown> | null = null;
    try {
      if (values.metadataText?.trim()) {
        metadata = JSON.parse(values.metadataText);
      }
    } catch (_error) {
      message.error('扩展信息必须是合法 JSON');
      return;
    }
    const payload: ResourceInput = {
      resourceCode: values.resourceCode,
      resourceName: values.resourceName,
      resourceType: values.resourceType,
      departmentCode: values.departmentCode,
      ownerOrgUnitId: values.ownerOrgUnitId ?? null,
      status: values.status,
      capacity: values.capacity,
      location: values.location ?? null,
      cleanLevel: values.cleanLevel ?? null,
      isShared: values.isShared,
      isSchedulable: values.isSchedulable,
      metadata,
    };
    await resourcesApi.create(payload);
    message.success('资源已创建');
    setResourceModalOpen(false);
    resourceForm.resetFields();
    await loadResources();
  };

  const handleCreateCalendarEntry = async () => {
    if (!selectedResource) {
      return;
    }
    const values = await calendarForm.validateFields();
    await resourcesApi.createCalendarEntry(selectedResource.id, {
      startDatetime: values.window[0].toISOString(),
      endDatetime: values.window[1].toISOString(),
      eventType: values.eventType,
      sourceType: values.sourceType,
      notes: values.notes ?? null,
    });
    message.success('资源日历已更新');
    setCalendarModalOpen(false);
    calendarForm.resetFields();
    setCalendarEntries(await resourcesApi.getCalendar(selectedResource.id));
  };

  const handleCreateRequirement = async () => {
    const values = await requirementForm.validateFields();
    const payload: OperationResourceRequirementInput = {
      operationId: values.operationId,
      resourceType: values.resourceType,
      requiredCount: values.requiredCount,
      candidateResourceIds: values.candidateResourceIds ?? [],
      isMandatory: values.isMandatory,
      requiresExclusiveUse: values.requiresExclusiveUse,
      prepMinutes: values.prepMinutes,
      changeoverMinutes: values.changeoverMinutes,
      cleanupMinutes: values.cleanupMinutes,
    };
    await operationResourceRequirementsApi.create(payload);
    message.success('资源需求规则已创建');
    setRequirementDrawerOpen(false);
    requirementForm.resetFields();
    setRequirements(await operationResourceRequirementsApi.list());
  };

  if (loading) {
    return <Spin />;
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {errorMessage ? <Alert type="warning" showIcon message={errorMessage} /> : null}
      <Alert
        type="info"
        showIcon
        message="资源中心"
        description="该页面是平台资源层的前台承接页面，用于管理设备、房间、器具、储罐和灭菌资源，并查看资源日历与操作资源需求。"
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={11}>
          <Card
            title="资源列表"
            extra={
              <Button type="primary" onClick={() => setResourceModalOpen(true)}>
                新增资源
              </Button>
            }
          >
            <Table
              rowKey="id"
              columns={resourceColumns}
              dataSource={resources}
              pagination={false}
              rowSelection={{
                type: 'radio',
                selectedRowKeys: selectedResource ? [selectedResource.id] : [],
                onChange: (keys) => {
                  const next = resources.find((item) => item.id === Number(keys[0])) ?? null;
                  setSelectedResource(next);
                },
              }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={13}>
          <Card
            title="资源详情"
            extra={
              <Space>
                <Button disabled={!selectedResource} onClick={() => setCalendarModalOpen(true)}>
                  新增日历事件
                </Button>
                <Button onClick={() => setRequirementDrawerOpen(true)}>新增资源需求</Button>
              </Space>
            }
          >
            {!selectedResource ? (
              <Alert type="warning" message="请选择一个资源查看详情" />
            ) : (
              <Descriptions bordered column={2}>
                <Descriptions.Item label="资源编码">{selectedResource.resourceCode}</Descriptions.Item>
                <Descriptions.Item label="资源名称">{selectedResource.resourceName}</Descriptions.Item>
                <Descriptions.Item label="类型">{selectedResource.resourceType}</Descriptions.Item>
                <Descriptions.Item label="部门">{selectedResource.departmentCode}</Descriptions.Item>
                <Descriptions.Item label="状态">{selectedResource.status}</Descriptions.Item>
                <Descriptions.Item label="容量">{selectedResource.capacity}</Descriptions.Item>
                <Descriptions.Item label="位置">{selectedResource.location ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="洁净级别">{selectedResource.cleanLevel ?? '-'}</Descriptions.Item>
                <Descriptions.Item label="共享资源">{selectedResource.isShared ? '是' : '否'}</Descriptions.Item>
                <Descriptions.Item label="可排资源">{selectedResource.isSchedulable ? '是' : '否'}</Descriptions.Item>
                <Descriptions.Item label="日历条目">{selectedResource.stats?.calendarCount ?? 0}</Descriptions.Item>
                <Descriptions.Item label="维护窗口">{selectedResource.stats?.maintenanceCount ?? 0}</Descriptions.Item>
              </Descriptions>
            )}
            <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
              资源详情与资源日历是后续把设备/房间/器具约束送入求解器的基础。
            </Paragraph>
          </Card>

          <Card title="资源日历 / 占用时间轴" style={{ marginTop: 16 }}>
            <Table rowKey="id" columns={calendarColumns} dataSource={calendarEntries} pagination={false} locale={{ emptyText: '暂无资源日历事件' }} />
          </Card>
        </Col>
      </Row>

      <Card title="操作资源需求">
        <Table rowKey="id" columns={requirementColumns} dataSource={requirements} pagination={{ pageSize: 8 }} />
      </Card>

      <Modal
        title="新增资源"
        open={resourceModalOpen}
        onCancel={() => setResourceModalOpen(false)}
        onOk={() => void handleCreateResource()}
        destroyOnClose
      >
        <Form form={resourceForm} layout="vertical" initialValues={{ capacity: 1, status: 'ACTIVE', isShared: false, isSchedulable: true }}>
          <Form.Item name="resourceCode" label="资源编码" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="resourceName" label="资源名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="resourceType" label="资源类型" rules={[{ required: true }]}>
            <Select options={resourceTypeOptions} />
          </Form.Item>
          <Form.Item name="departmentCode" label="部门" rules={[{ required: true }]}>
            <Select options={[{ value: 'USP' }, { value: 'DSP' }, { value: 'SPI' }, { value: 'MAINT' }]} />
          </Form.Item>
          <Form.Item name="ownerOrgUnitId" label="归属组织单元">
            <Select allowClear options={teams.map((team) => ({ value: team.id, label: team.team_name ?? team.team_code }))} />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select options={[{ value: 'ACTIVE' }, { value: 'INACTIVE' }, { value: 'MAINTENANCE' }, { value: 'RETIRED' }]} />
          </Form.Item>
          <Form.Item name="capacity" label="容量" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="location" label="位置">
            <Input />
          </Form.Item>
          <Form.Item name="cleanLevel" label="洁净级别">
            <Input />
          </Form.Item>
          <Form.Item name="metadataText" label="扩展信息(JSON)">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="isShared" label="共享资源" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="isSchedulable" label="参与排程" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="新增资源日历事件"
        open={calendarModalOpen}
        onCancel={() => setCalendarModalOpen(false)}
        onOk={() => void handleCreateCalendarEntry()}
        destroyOnClose
      >
        <Form form={calendarForm} layout="vertical">
          <Form.Item name="window" label="时间窗口" rules={[{ required: true }]}>
            <DatePicker.RangePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="eventType" label="事件类型" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'OCCUPIED' },
                { value: 'CHANGEOVER' },
                { value: 'LOCKED' },
                { value: 'UNAVAILABLE' },
              ]}
            />
          </Form.Item>
          <Form.Item name="sourceType" label="来源" rules={[{ required: true }]}>
            <Select options={[{ value: 'MANUAL' }, { value: 'SCHEDULING' }, { value: 'MAINTENANCE' }]} />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title="新增操作资源需求"
        open={requirementDrawerOpen}
        onClose={() => setRequirementDrawerOpen(false)}
        width={420}
        extra={
          <Button type="primary" onClick={() => void handleCreateRequirement()}>
            保存
          </Button>
        }
      >
        <Form
          form={requirementForm}
          layout="vertical"
          initialValues={{
            requiredCount: 1,
            candidateResourceIds: [],
            isMandatory: true,
            requiresExclusiveUse: true,
            prepMinutes: 0,
            changeoverMinutes: 0,
            cleanupMinutes: 0,
          }}
        >
          <Form.Item name="operationId" label="操作" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={operations.map((operation) => ({
                value: operation.id,
                label: `${operation.operation_code} - ${operation.operation_name}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="resourceType" label="资源类型" rules={[{ required: true }]}>
            <Select options={resourceTypeOptions} />
          </Form.Item>
          <Form.Item name="candidateResourceIds" label="候选资源">
            <Select
              mode="multiple"
              allowClear
              disabled={!selectedRequirementResourceType}
              optionFilterProp="label"
              options={candidateResourceOptions}
              placeholder={selectedRequirementResourceType ? '不选则按资源类型匹配，选择后将精确绑定到具体资源' : '请先选择资源类型'}
            />
          </Form.Item>
          <Form.Item name="requiredCount" label="数量" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="prepMinutes" label="前置准备时间(分钟)">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="changeoverMinutes" label="切换时间(分钟)">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="cleanupMinutes" label="清洁时间(分钟)">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="isMandatory" label="是否硬约束" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="requiresExclusiveUse" label="是否独占资源" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Drawer>
    </Space>
  );
};

export default ResourceCenterPage;

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Input,
  Row,
  Select,
  Space,
  Spin,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import { useSearchParams } from 'react-router-dom';
import { organizationApi, operationApi } from '../services/api';
import { operationResourceRequirementsApi, platformApi, resourcesApi } from '../services/platformApi';
import { Operation, Team } from '../types';
import {
  OperationResourceRequirement,
  PlatformTimelineItem,
  PlatformResourceTimelineResponse,
  Resource,
  ResourceCalendarEntry,
} from '../types/platform';
import PlatformTimelineBoard from '../components/Platform/PlatformTimelineBoard';
import { ResourceBindingPanel } from '../components/Platform/PlatformPanels';
import { RequirementEditDrawer, ResourceEventDrawer, ResourceFormModal } from '../components/Platform/PlatformEditors';

const { Search } = Input;
const { Text } = Typography;

const ResourceCenterPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [resources, setResources] = useState<Resource[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [requirements, setRequirements] = useState<OperationResourceRequirement[]>([]);
  const [timeline, setTimeline] = useState<PlatformResourceTimelineResponse | null>(null);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [selectedTimelineItem, setSelectedTimelineItem] = useState<PlatformTimelineItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [domainFilter, setDomainFilter] = useState<string | undefined>();
  const [conflictOnly, setConflictOnly] = useState(false);
  const [resourceModalOpen, setResourceModalOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [requirementDrawerOpen, setRequirementDrawerOpen] = useState(false);
  const [editingRequirement, setEditingRequirement] = useState<OperationResourceRequirement | null>(null);
  const [eventDrawerOpen, setEventDrawerOpen] = useState(false);

  const loadBase = useCallback(async () => {
    const [resourceData, requirementData, teamData, operationData] = await Promise.all([
      resourcesApi.list(),
      operationResourceRequirementsApi.list(),
      organizationApi.getTeams(),
      operationApi.getAll().then((response) => response.data),
    ]);
    setResources(resourceData);
    setRequirements(requirementData);
    setTeams(teamData);
    setOperations(operationData);
    const fromQuery = searchParams.get('resourceId');
    const initial = resourceData.find((resource) => String(resource.id) === fromQuery) ?? resourceData[0] ?? null;
    setSelectedResource(initial);
  }, [searchParams]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setErrorMessage(null);
        await loadBase();
      } catch (error) {
        console.error('Failed to load resource center:', error);
        setResources([]);
        setRequirements([]);
        setTimeline(null);
        setSelectedResource(null);
        setErrorMessage('资源中心暂时不可用，请先确认平台资源迁移是否已执行。');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [loadBase]);

  useEffect(() => {
    if (!selectedResource) {
      setTimeline(null);
      return;
    }

    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('resourceId', String(selectedResource.id));
      return next;
    });

    const loadTimeline = async () => {
      try {
        setTimelineLoading(true);
        setTimeline(
          await platformApi.getResourceTimeline({
            resource_id: selectedResource.id,
            resource_type: typeFilter ?? '',
            department_code: domainFilter ?? '',
            conflict_only: conflictOnly,
          }),
        );
      } finally {
        setTimelineLoading(false);
      }
    };

    void loadTimeline();
  }, [conflictOnly, domainFilter, selectedResource, setSearchParams, typeFilter]);

  const filteredResources = useMemo(() => {
    return resources.filter((resource) => {
      if (searchValue) {
        const query = searchValue.toLowerCase();
        const matched = resource.resourceCode.toLowerCase().includes(query) || resource.resourceName.toLowerCase().includes(query);
        if (!matched) {
          return false;
        }
      }
      if (typeFilter && resource.resourceType !== typeFilter) {
        return false;
      }
      if (domainFilter && resource.departmentCode !== domainFilter) {
        return false;
      }
      return true;
    });
  }, [domainFilter, resources, searchValue, typeFilter]);

  const selectedResourceRequirements = useMemo(() => {
    if (!selectedResource) {
      return [];
    }

    return requirements.filter(
      (requirement) =>
        requirement.candidateResourceIds.includes(selectedResource.id) || requirement.resourceType === selectedResource.resourceType,
    );
  }, [requirements, selectedResource]);

  const orgUnitOptions = useMemo(
    () =>
      teams.map((team) => ({
        value: Number(team.id),
        label: team.unit_name ?? team.unitName ?? team.team_name ?? team.teamName ?? `Unit ${team.id}`,
      })),
    [teams],
  );

  const handleCreateOrUpdateResource = async (payload: any) => {
    if (editingResource) {
      await resourcesApi.update(editingResource.id, payload);
      message.success('资源已更新');
    } else {
      await resourcesApi.create(payload);
      message.success('资源已创建');
    }
    setResourceModalOpen(false);
    setEditingResource(null);
    await loadBase();
  };

  const handleSaveRequirement = async (payload: any) => {
    if (editingRequirement) {
      await operationResourceRequirementsApi.update(editingRequirement.id, payload);
      message.success('资源规则已更新');
    } else {
      await operationResourceRequirementsApi.create(payload);
      message.success('资源规则已创建');
    }
    setRequirementDrawerOpen(false);
    setEditingRequirement(null);
    setRequirements(await operationResourceRequirementsApi.list());
  };

  const handleUpdateEvent = async (payload: ResourceCalendarEntry) => {
    await resourcesApi.updateCalendarEntry(payload.resourceId, payload.id, {
      startDatetime: payload.startDatetime,
      endDatetime: payload.endDatetime,
      eventType: payload.eventType,
      sourceType: payload.sourceType,
      sourceId: payload.sourceId,
      notes: payload.notes,
    });
    message.success('资源事件已更新');
    setEventDrawerOpen(false);
    if (selectedResource) {
      setTimeline(await platformApi.getResourceTimeline({ resource_id: selectedResource.id, conflict_only: conflictOnly }));
    }
  };

  const handleDeleteEvent = async () => {
    const metadata = selectedTimelineItem?.metadata ?? {};
    const resourceId = Number(metadata.resourceId ?? 0);
    const eventId = Number(metadata.eventId ?? 0);
    if (!resourceId || !eventId) {
      return;
    }
    await resourcesApi.deleteCalendarEntry(resourceId, eventId);
    message.success('资源事件已删除');
    setEventDrawerOpen(false);
    if (selectedResource) {
      setTimeline(await platformApi.getResourceTimeline({ resource_id: selectedResource.id, conflict_only: conflictOnly }));
    }
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
        description="统一管理设备、房间、容器、器具和灭菌资源，并在同一页面查看占用时间轴、候选资源绑定和资源主数据缺口。"
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={8}>
          <Card
            title="资源列表"
            extra={
              <Button
                type="primary"
                onClick={() => {
                  setEditingResource(null);
                  setResourceModalOpen(true);
                }}
              >
                新增资源
              </Button>
            }
          >
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Search placeholder="搜索资源编码 / 名称" allowClear value={searchValue} onChange={(event) => setSearchValue(event.target.value)} />
              <Space wrap>
                <Select
                  allowClear
                  placeholder="资源类型"
                  value={typeFilter}
                  onChange={setTypeFilter}
                  style={{ width: 160 }}
                  options={[
                    { value: 'ROOM', label: '房间' },
                    { value: 'EQUIPMENT', label: '设备' },
                    { value: 'VESSEL_CONTAINER', label: '容器/储罐' },
                    { value: 'TOOLING', label: '器具' },
                    { value: 'STERILIZATION_RESOURCE', label: '灭菌资源' },
                  ]}
                />
                <Select
                  allowClear
                  placeholder="部门"
                  value={domainFilter}
                  onChange={setDomainFilter}
                  style={{ width: 140 }}
                  options={[{ value: 'USP' }, { value: 'DSP' }, { value: 'SPI' }, { value: 'MAINT' }]}
                />
                <Select
                  value={conflictOnly ? 'RISK' : 'ALL'}
                  onChange={(value) => setConflictOnly(value === 'RISK')}
                  options={[
                    { value: 'ALL', label: '全部' },
                    { value: 'RISK', label: '仅冲突' },
                  ]}
                  style={{ width: 120 }}
                />
              </Space>

              <div>
                {filteredResources.length === 0 ? (
                  <Empty description="暂无资源" />
                ) : (
                  filteredResources.map((resource) => (
                    <Card
                      key={resource.id}
                      size="small"
                      hoverable
                      style={{
                        marginBottom: 8,
                        borderColor: selectedResource?.id === resource.id ? '#1677ff' : undefined,
                      }}
                      onClick={() => setSelectedResource(resource)}
                    >
                      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                        <Space direction="vertical" size={0}>
                          <Text strong>{resource.resourceCode}</Text>
                          <Text>{resource.resourceName}</Text>
                        </Space>
                        <Space wrap>
                          <Tag>{resource.resourceType}</Tag>
                          <Tag color="blue">{resource.departmentCode}</Tag>
                        </Space>
                      </Space>
                    </Card>
                  ))
                )}
              </div>
            </Space>
          </Card>
        </Col>

        <Col xs={24} xl={16}>
          {!selectedResource ? (
            <Card><Empty description="请选择资源查看详情" /></Card>
          ) : (
            <Tabs
              items={[
                {
                  key: 'detail',
                  label: '资源详情',
                  children: (
                    <Card
                      title={selectedResource.resourceName}
                      extra={
                        <Button
                          onClick={() => {
                            setEditingResource(selectedResource);
                            setResourceModalOpen(true);
                          }}
                        >
                          编辑资源
                        </Button>
                      }
                    >
                      <Descriptions bordered column={2}>
                        <Descriptions.Item label="资源编码">{selectedResource.resourceCode}</Descriptions.Item>
                        <Descriptions.Item label="资源类型">{selectedResource.resourceType}</Descriptions.Item>
                        <Descriptions.Item label="部门">{selectedResource.departmentCode}</Descriptions.Item>
                        <Descriptions.Item label="状态">{selectedResource.status}</Descriptions.Item>
                        <Descriptions.Item label="容量">{selectedResource.capacity}</Descriptions.Item>
                        <Descriptions.Item label="位置">{selectedResource.location ?? '-'}</Descriptions.Item>
                        <Descriptions.Item label="洁净等级">{selectedResource.cleanLevel ?? '-'}</Descriptions.Item>
                        <Descriptions.Item label="归属单元">{selectedResource.ownerUnitName ?? '-'}</Descriptions.Item>
                      </Descriptions>
                    </Card>
                  ),
                },
                {
                  key: 'timeline',
                  label: '占用时间轴',
                  children: (
                    <Spin spinning={timelineLoading}>
                      <PlatformTimelineBoard
                        lanes={timeline?.lanes ?? []}
                        items={timeline?.items ?? []}
                        windowStart={timeline?.windowStart}
                        windowEnd={timeline?.windowEnd}
                        selectedItemId={selectedTimelineItem?.id ?? null}
                        onItemClick={(item) => {
                          setSelectedTimelineItem(item);
                          setEventDrawerOpen(true);
                        }}
                        emptyDescription="当前资源暂无占用事件"
                      />
                    </Spin>
                  ),
                },
                {
                  key: 'binding',
                  label: '候选绑定',
                  children: (
                    <ResourceBindingPanel
                      title="资源参与的规则"
                      requirements={selectedResourceRequirements}
                      onEditRequirement={(requirement) => {
                        setEditingRequirement(requirement);
                        setRequirementDrawerOpen(true);
                      }}
                    />
                  ),
                },
              ]}
              tabBarExtraContent={
                <Space>
                  <Button
                    onClick={() => {
                      setEditingRequirement(null);
                      setRequirementDrawerOpen(true);
                    }}
                  >
                    新增资源规则
                  </Button>
                </Space>
              }
            />
          )}
        </Col>
      </Row>

      <ResourceFormModal
        open={resourceModalOpen}
        resource={editingResource}
        orgUnitOptions={orgUnitOptions}
        onCancel={() => {
          setResourceModalOpen(false);
          setEditingResource(null);
        }}
        onSubmit={handleCreateOrUpdateResource}
      />

      <RequirementEditDrawer
        open={requirementDrawerOpen}
        requirement={editingRequirement}
        operations={operations}
        resources={resources}
        onClose={() => {
          setRequirementDrawerOpen(false);
          setEditingRequirement(null);
        }}
        onSubmit={handleSaveRequirement}
      />

      <ResourceEventDrawer
        open={eventDrawerOpen}
        item={selectedTimelineItem}
        onClose={() => setEventDrawerOpen(false)}
        onUpdate={handleUpdateEvent}
        onDelete={selectedTimelineItem?.metadata?.sourceType === 'MANUAL' ? handleDeleteEvent : undefined}
      />
    </Space>
  );
};

export default ResourceCenterPage;

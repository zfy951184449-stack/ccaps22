import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Input,
  List,
  Row,
  Select,
  Space,
  Spin,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { maintenanceWindowsApi, platformApi, resourcesApi } from '../services/platformApi';
import { MaintenanceWindow, PlatformMaintenanceImpact, Resource } from '../types/platform';
import PlatformTimelineBoard from '../components/Platform/PlatformTimelineBoard';
import { MaintenanceWindowFormModal } from '../components/Platform/PlatformEditors';

const { Search } = Input;
const { Text } = Typography;

const MaintenanceWindowsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [windows, setWindows] = useState<MaintenanceWindow[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedWindow, setSelectedWindow] = useState<MaintenanceWindow | null>(null);
  const [impact, setImpact] = useState<PlatformMaintenanceImpact | null>(null);
  const [loading, setLoading] = useState(true);
  const [impactLoading, setImpactLoading] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState<string | undefined>();
  const [domainFilter, setDomainFilter] = useState<string | undefined>();
  const [hardBlockFilter, setHardBlockFilter] = useState<'ALL' | 'HARD' | 'SOFT'>('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWindow, setEditingWindow] = useState<MaintenanceWindow | null>(null);

  const loadData = useCallback(async () => {
    const [windowData, resourceData] = await Promise.all([maintenanceWindowsApi.list(), resourcesApi.list()]);
    setWindows(windowData);
    setResources(resourceData);
    const selectedFromQuery = searchParams.get('windowId');
    setSelectedWindow(windowData.find((item) => String(item.id) === selectedFromQuery) ?? windowData[0] ?? null);
  }, [searchParams]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        await loadData();
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [loadData]);

  useEffect(() => {
    if (!selectedWindow) {
      setImpact(null);
      return;
    }

    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('windowId', String(selectedWindow.id));
      return next;
    });

    const loadImpact = async () => {
      try {
        setImpactLoading(true);
        setImpact(
          await platformApi.getMaintenanceImpact({
            resource_id: selectedWindow.resourceId,
            from: selectedWindow.startDatetime,
            to: selectedWindow.endDatetime,
          }),
        );
      } finally {
        setImpactLoading(false);
      }
    };

    void loadImpact();
  }, [selectedWindow, setSearchParams]);

  const filteredWindows = useMemo(() => {
    return windows.filter((windowRecord) => {
      if (searchValue) {
        const query = searchValue.toLowerCase();
        const matched = (windowRecord.resourceName ?? '').toLowerCase().includes(query) || (windowRecord.resourceCode ?? '').toLowerCase().includes(query);
        if (!matched) {
          return false;
        }
      }

      if (domainFilter && windowRecord.departmentCode !== domainFilter) {
        return false;
      }

      if (hardBlockFilter === 'HARD' && !windowRecord.isHardBlock) {
        return false;
      }

      if (hardBlockFilter === 'SOFT' && windowRecord.isHardBlock) {
        return false;
      }

      if (resourceTypeFilter) {
        const resource = resources.find((item) => item.id === windowRecord.resourceId);
        if (resource?.resourceType !== resourceTypeFilter) {
          return false;
        }
      }

      return true;
    });
  }, [domainFilter, hardBlockFilter, resourceTypeFilter, resources, searchValue, windows]);

  const timelineData = useMemo(() => {
    const filteredResourceIds = new Set(filteredWindows.map((item) => item.resourceId));
    const lanes = resources
      .filter((resource) => filteredResourceIds.has(resource.id))
      .map((resource) => ({
        id: `resource-${resource.id}`,
        label: `${resource.resourceCode} / ${resource.resourceName}`,
        groupLabel: resource.departmentCode,
        domainCode: resource.departmentCode,
        laneType: resource.resourceType,
      }));
    const items = filteredWindows.map((windowRecord) => ({
      id: `maintenance-${windowRecord.id}`,
      laneId: `resource-${windowRecord.resourceId}`,
      itemType: 'MAINTENANCE',
      title: windowRecord.windowType,
      subtitle: windowRecord.notes ?? (windowRecord.isHardBlock ? '硬阻断' : '提示'),
      startDatetime: windowRecord.startDatetime,
      endDatetime: windowRecord.endDatetime,
      color: windowRecord.isHardBlock ? '#cf1322' : '#fa8c16',
      status: windowRecord.isHardBlock ? 'HARD_BLOCK' : 'WARNING',
      metadata: {
        maintenanceWindowId: windowRecord.id,
        resourceId: windowRecord.resourceId,
      },
    }));
    return { lanes, items };
  }, [filteredWindows, resources]);

  const handleSubmitWindow = async (payload: any) => {
    if (editingWindow) {
      await maintenanceWindowsApi.update(editingWindow.id, payload);
      message.success('维护窗口已更新');
    } else {
      await maintenanceWindowsApi.create(payload);
      message.success('维护窗口已创建');
    }
    setModalOpen(false);
    setEditingWindow(null);
    await loadData();
  };

  const handleDelete = async () => {
    if (!selectedWindow) {
      return;
    }
    await maintenanceWindowsApi.delete(selectedWindow.id);
    message.success('维护窗口已删除');
    setSelectedWindow(null);
    await loadData();
  };

  if (loading) {
    return <Spin />;
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Alert
        type="warning"
        showIcon
        message="维护窗口"
        description="Maintenance 在 MVP 阶段先通过停机/保养窗口进入平台，并直接影响资源可用性、项目排产和冲突分析。"
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={8}>
          <Card
            title="停机 / 保养窗口"
            extra={
              <Button
                type="primary"
                onClick={() => {
                  setEditingWindow(null);
                  setModalOpen(true);
                }}
              >
                新增维护窗口
              </Button>
            }
          >
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Search placeholder="搜索资源" allowClear value={searchValue} onChange={(event) => setSearchValue(event.target.value)} />
              <Space wrap>
                <Select
                  allowClear
                  placeholder="资源类型"
                  value={resourceTypeFilter}
                  onChange={setResourceTypeFilter}
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
                  value={hardBlockFilter}
                  onChange={setHardBlockFilter}
                  style={{ width: 140 }}
                  options={[
                    { value: 'ALL', label: '全部' },
                    { value: 'HARD', label: '硬阻断' },
                    { value: 'SOFT', label: '提示型' },
                  ]}
                />
              </Space>

              <List
                dataSource={filteredWindows}
                locale={{ emptyText: '暂无维护窗口' }}
                renderItem={(windowRecord) => (
                  <List.Item
                    style={{
                      cursor: 'pointer',
                      padding: 12,
                      borderRadius: 10,
                      background: selectedWindow?.id === windowRecord.id ? '#fff7e6' : undefined,
                      marginBottom: 8,
                    }}
                    onClick={() => setSelectedWindow(windowRecord)}
                    actions={[
                      <Button
                        key="edit"
                        type="link"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingWindow(windowRecord);
                          setModalOpen(true);
                        }}
                      >
                        编辑
                      </Button>,
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <Space>
                          <Text strong>{windowRecord.resourceCode ?? windowRecord.resourceName ?? windowRecord.resourceId}</Text>
                          <Tag color={windowRecord.isHardBlock ? 'error' : 'gold'}>{windowRecord.isHardBlock ? '硬阻断' : '提示'}</Tag>
                        </Space>
                      }
                      description={`${windowRecord.windowType} · ${windowRecord.startDatetime} ~ ${windowRecord.endDatetime}`}
                    />
                  </List.Item>
                )}
              />
            </Space>
          </Card>
        </Col>

        <Col xs={24} xl={16}>
          {!selectedWindow ? (
            <Card><Empty description="请选择维护窗口" /></Card>
          ) : (
            <Tabs
              items={[
                {
                  key: 'timeline',
                  label: '停机日历',
                  children: (
                    <PlatformTimelineBoard
                      lanes={timelineData.lanes}
                      items={timelineData.items}
                      selectedItemId={selectedWindow ? `maintenance-${selectedWindow.id}` : null}
                      onItemClick={(item) => {
                        const id = Number(item.metadata?.maintenanceWindowId ?? 0);
                        const next = windows.find((windowRecord) => windowRecord.id === id);
                        if (next) {
                          setSelectedWindow(next);
                        }
                      }}
                      emptyDescription="当前筛选条件下暂无维护窗口"
                    />
                  ),
                },
                {
                  key: 'impact',
                  label: '影响分析',
                  children: (
                    <Spin spinning={impactLoading}>
                      {!impact ? (
                        <Empty description="当前窗口暂无影响数据" />
                      ) : (
                        <Space direction="vertical" size={16} style={{ width: '100%' }}>
                          <Alert
                            type={selectedWindow.isHardBlock ? 'error' : 'warning'}
                            showIcon
                            message={`${selectedWindow.windowType} 将影响 ${impact.affectedProjects.length} 个项目、${impact.affectedBatches.length} 个批次`}
                          />
                          <Card title="受影响项目">
                            <List
                              dataSource={impact.affectedProjects}
                              locale={{ emptyText: '暂无受影响项目' }}
                              renderItem={(item) => (
                                <List.Item
                                  actions={[
                                    <Button
                                      key="goto"
                                      type="link"
                                      onClick={() => navigate(`/project-planning-center?projectId=legacy:${item.projectCode}`)}
                                    >
                                      打开项目
                                    </Button>,
                                  ]}
                                >
                                  <Tag>{item.projectCode}</Tag>
                                </List.Item>
                              )}
                            />
                          </Card>
                          <Card title="受影响操作">
                            <List
                              dataSource={impact.affectedOperations}
                              locale={{ emptyText: '暂无受影响操作' }}
                              renderItem={(item) => (
                                <List.Item>
                                  <List.Item.Meta
                                    title={`${item.operationCode} / ${item.operationName}`}
                                    description={`${item.projectCode} / ${item.batchCode} · ${item.startDatetime} ~ ${item.endDatetime}`}
                                  />
                                </List.Item>
                              )}
                            />
                          </Card>
                        </Space>
                      )}
                    </Spin>
                  ),
                },
              ]}
              tabBarExtraContent={
                <Space>
                  <Button
                    onClick={() => {
                      setEditingWindow(selectedWindow);
                      setModalOpen(true);
                    }}
                  >
                    编辑
                  </Button>
                  <Button danger onClick={() => void handleDelete()}>
                    删除
                  </Button>
                </Space>
              }
            />
          )}
        </Col>
      </Row>

      <MaintenanceWindowFormModal
        open={modalOpen}
        resources={resources}
        windowRecord={editingWindow}
        onCancel={() => {
          setModalOpen(false);
          setEditingWindow(null);
        }}
        onSubmit={handleSubmitWindow}
      />
    </Space>
  );
};

export default MaintenanceWindowsPage;

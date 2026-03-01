import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, DatePicker, Form, Input, Modal, Select, Space, Spin, Switch, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Dayjs } from 'dayjs';
import { maintenanceWindowsApi, resourcesApi } from '../services/platformApi';
import { MaintenanceWindow, MaintenanceWindowInput, Resource } from '../types/platform';

interface MaintenanceWindowFormValues {
  resourceId: number;
  windowType: MaintenanceWindow['windowType'];
  window: [Dayjs, Dayjs];
  isHardBlock: boolean;
  notes?: string;
}

const columns: ColumnsType<MaintenanceWindow> = [
  { title: '资源', key: 'resource', render: (_, record) => record.resourceName ?? record.resourceCode ?? record.resourceId },
  { title: '类型', dataIndex: 'windowType', key: 'windowType' },
  { title: '部门', dataIndex: 'departmentCode', key: 'departmentCode', render: (value?: string) => value ?? '-' },
  {
    title: '时间窗口',
    key: 'window',
    render: (_, record) => `${record.startDatetime} ~ ${record.endDatetime}`,
  },
  {
    title: '阻断',
    dataIndex: 'isHardBlock',
    key: 'isHardBlock',
    render: (value: boolean) => <Tag color={value ? 'error' : 'default'}>{value ? '硬阻断' : '提示'}</Tag>,
  },
  { title: '备注', dataIndex: 'notes', key: 'notes', render: (value?: string | null) => value ?? '-' },
];

const MaintenanceWindowsPage: React.FC = () => {
  const [windows, setWindows] = useState<MaintenanceWindow[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm<MaintenanceWindowFormValues>();

  const loadData = async () => {
    const [windowData, resourceData] = await Promise.all([maintenanceWindowsApi.list(), resourcesApi.list()]);
    setWindows(windowData);
    setResources(resourceData);
  };

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
  }, []);

  const handleCreate = async () => {
    const values = await form.validateFields();
    const payload: MaintenanceWindowInput = {
      resourceId: values.resourceId,
      windowType: values.windowType,
      startDatetime: values.window[0].toISOString(),
      endDatetime: values.window[1].toISOString(),
      isHardBlock: values.isHardBlock,
      ownerDeptCode: 'MAINT',
      notes: values.notes ?? null,
    };
    await maintenanceWindowsApi.create(payload);
    message.success('维护窗口已创建');
    setModalOpen(false);
    form.resetFields();
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
        description="Maintenance 在 MVP 阶段先通过停机/保养窗口进入平台，并直接影响资源可用性与冲突分析。"
      />

      <Card
        title="停机 / 保养窗口"
        extra={
          <Button type="primary" onClick={() => setModalOpen(true)}>
            新增维护窗口
          </Button>
        }
      >
        <Table rowKey="id" columns={columns} dataSource={windows} pagination={{ pageSize: 8 }} />
      </Card>

      <Modal
        title="新增维护窗口"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => void handleCreate()}
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={{ isHardBlock: true }}>
          <Form.Item name="resourceId" label="资源" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={resources.map((resource) => ({
                value: resource.id,
                label: `${resource.resourceCode} - ${resource.resourceName}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="windowType" label="窗口类型" rules={[{ required: true }]}>
            <Select options={[{ value: 'PM' }, { value: 'BREAKDOWN' }, { value: 'CALIBRATION' }, { value: 'CLEANING' }]} />
          </Form.Item>
          <Form.Item name="window" label="时间窗口" rules={[{ required: true }]}>
            <DatePicker.RangePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="isHardBlock" label="是否硬阻断" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
};

export default MaintenanceWindowsPage;

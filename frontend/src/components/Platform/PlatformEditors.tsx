import React, { useEffect, useMemo } from 'react';
import {
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { Operation } from '../../types';
import {
  MaintenanceWindow,
  MaintenanceWindowInput,
  OperationResourceRequirement,
  OperationResourceRequirementInput,
  PlatformOperationResourceBindingInput,
  PlatformOperationUpdateInput,
  PlatformTimelineItem,
  Resource,
  ResourceCalendarEntry,
  ResourceInput,
  ResourceType,
} from '../../types/platform';

const { Text } = Typography;

const resourceTypeOptions: Array<{ label: string; value: ResourceType }> = [
  { label: '房间', value: 'ROOM' },
  { label: '设备', value: 'EQUIPMENT' },
  { label: '容器/储罐', value: 'VESSEL_CONTAINER' },
  { label: '器具', value: 'TOOLING' },
  { label: '灭菌资源', value: 'STERILIZATION_RESOURCE' },
];

interface ResourceFormValues {
  resourceCode: string;
  resourceName: string;
  resourceType: ResourceType;
  departmentCode?: Resource['departmentCode'];
  ownerOrgUnitId: number | null;
  status: Resource['status'];
  capacity: number;
  location?: string;
  cleanLevel?: string;
  isShared: boolean;
  isSchedulable: boolean;
  metadataText?: string;
}

export const ResourceFormModal: React.FC<{
  open: boolean;
  resource?: Resource | null;
  orgUnitOptions: Array<{ label: string; value: number }>;
  onCancel: () => void;
  onSubmit: (payload: ResourceInput) => Promise<void> | void;
}> = ({ open, resource, orgUnitOptions, onCancel, onSubmit }) => {
  const [form] = Form.useForm<ResourceFormValues>();

  useEffect(() => {
    form.setFieldsValue(
      resource
        ? {
            resourceCode: resource.resourceCode,
            resourceName: resource.resourceName,
            resourceType: resource.resourceType,
            departmentCode: resource.departmentCode,
            ownerOrgUnitId: resource.ownerOrgUnitId,
            status: resource.status,
            capacity: resource.capacity,
            location: resource.location ?? undefined,
            cleanLevel: resource.cleanLevel ?? undefined,
            isShared: resource.isShared,
            isSchedulable: resource.isSchedulable,
            metadataText: resource.metadata ? JSON.stringify(resource.metadata, null, 2) : undefined,
          }
        : {
            status: 'ACTIVE',
            capacity: 1,
            isShared: false,
            isSchedulable: true,
          },
    );
  }, [form, resource, open]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    let metadata: Record<string, unknown> | null = null;
    if (values.metadataText?.trim()) {
      metadata = JSON.parse(values.metadataText);
    }

    await onSubmit({
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
    });
  };

  return (
    <Modal
      title={resource ? '编辑资源' : '新增资源'}
      open={open}
      onCancel={onCancel}
      onOk={() => void handleSubmit()}
      destroyOnClose
      width={720}
    >
      <Form form={form} layout="vertical">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Form.Item name="resourceCode" label="资源编码" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="resourceName" label="资源名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="resourceType" label="资源类型" rules={[{ required: true }]}>
            <Select options={resourceTypeOptions} />
          </Form.Item>
          <Form.Item name="ownerOrgUnitId" label="归属单元">
            <Select allowClear options={orgUnitOptions} />
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
          <Form.Item name="cleanLevel" label="洁净等级">
            <Input />
          </Form.Item>
          <Form.Item name="isShared" label="是否共享" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="isSchedulable" label="是否可排" valuePropName="checked">
            <Switch />
          </Form.Item>
        </div>
        <Form.Item
          name="metadataText"
          label="扩展信息 (JSON)"
          rules={[
            {
              validator: async (_, value) => {
                if (!value?.trim()) {
                  return;
                }
                JSON.parse(value);
              },
              message: '扩展信息必须是合法 JSON',
            },
          ]}
        >
          <Input.TextArea rows={6} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

interface MaintenanceWindowFormValues {
  resourceId: number;
  windowType: MaintenanceWindow['windowType'];
  window: [Dayjs, Dayjs];
  isHardBlock: boolean;
  notes?: string;
}

export const MaintenanceWindowFormModal: React.FC<{
  open: boolean;
  resources: Resource[];
  windowRecord?: MaintenanceWindow | null;
  onCancel: () => void;
  onSubmit: (payload: MaintenanceWindowInput) => Promise<void> | void;
}> = ({ open, resources, windowRecord, onCancel, onSubmit }) => {
  const [form] = Form.useForm<MaintenanceWindowFormValues>();

  useEffect(() => {
    form.setFieldsValue(
      windowRecord
        ? {
            resourceId: windowRecord.resourceId,
            windowType: windowRecord.windowType,
            window: [dayjs(windowRecord.startDatetime), dayjs(windowRecord.endDatetime)],
            isHardBlock: windowRecord.isHardBlock,
            notes: windowRecord.notes ?? undefined,
          }
        : {
            isHardBlock: true,
          },
    );
  }, [form, open, windowRecord]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    await onSubmit({
      resourceId: values.resourceId,
      windowType: values.windowType,
      startDatetime: values.window[0].toISOString(),
      endDatetime: values.window[1].toISOString(),
      isHardBlock: values.isHardBlock,
      ownerDeptCode: 'MAINT',
      notes: values.notes ?? null,
    });
  };

  return (
    <Modal
      title={windowRecord ? '编辑维护窗口' : '新增维护窗口'}
      open={open}
      onCancel={onCancel}
      onOk={() => void handleSubmit()}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
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
  );
};

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

export const RequirementEditDrawer: React.FC<{
  open: boolean;
  requirement?: OperationResourceRequirement | null;
  operations: Operation[];
  resources: Resource[];
  allowOperationSelect?: boolean;
  onClose: () => void;
  onSubmit: (payload: OperationResourceRequirementInput) => Promise<void> | void;
}> = ({ open, requirement, operations, resources, allowOperationSelect = true, onClose, onSubmit }) => {
  const [form] = Form.useForm<RequirementFormValues>();
  const selectedResourceType = Form.useWatch('resourceType', form);

  useEffect(() => {
    form.setFieldsValue(
      requirement
        ? {
            operationId: requirement.operationId,
            resourceType: requirement.resourceType,
            requiredCount: requirement.requiredCount,
            candidateResourceIds: requirement.candidateResourceIds,
            isMandatory: requirement.isMandatory,
            requiresExclusiveUse: requirement.requiresExclusiveUse,
            prepMinutes: requirement.prepMinutes,
            changeoverMinutes: requirement.changeoverMinutes,
            cleanupMinutes: requirement.cleanupMinutes,
          }
        : {
            requiredCount: 1,
            isMandatory: true,
            requiresExclusiveUse: true,
            prepMinutes: 0,
            changeoverMinutes: 0,
            cleanupMinutes: 0,
          },
    );
  }, [form, open, requirement]);

  const candidateOptions = useMemo(
    () =>
      resources
        .filter((resource) => resource.resourceType === selectedResourceType && resource.isSchedulable)
        .map((resource) => ({
          value: resource.id,
          label: `${resource.resourceCode} - ${resource.resourceName}`,
        })),
    [resources, selectedResourceType],
  );

  const handleSubmit = async () => {
    const values = await form.validateFields();
    await onSubmit({
      operationId: values.operationId,
      resourceType: values.resourceType,
      requiredCount: values.requiredCount,
      candidateResourceIds: values.candidateResourceIds ?? [],
      isMandatory: values.isMandatory,
      requiresExclusiveUse: values.requiresExclusiveUse,
      prepMinutes: values.prepMinutes,
      changeoverMinutes: values.changeoverMinutes,
      cleanupMinutes: values.cleanupMinutes,
    });
  };

  return (
    <Drawer title={requirement ? '编辑资源规则' : '新增资源规则'} width={520} open={open} onClose={onClose} extra={<Button type="primary" onClick={() => void handleSubmit()}>保存</Button>}>
      <Form form={form} layout="vertical">
        <Form.Item name="operationId" label="操作" rules={[{ required: true }]}>
          <Select
            disabled={!allowOperationSelect}
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
        <Form.Item name="requiredCount" label="数量" rules={[{ required: true }]}>
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="candidateResourceIds" label="候选资源">
          <Select mode="multiple" allowClear options={candidateOptions} placeholder="为空则按资源类型匹配" />
        </Form.Item>
        <Space style={{ width: '100%' }} align="start">
          <Form.Item name="isMandatory" label="硬约束" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="requiresExclusiveUse" label="独占资源" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Space>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <Form.Item name="prepMinutes" label="前置准备">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="changeoverMinutes" label="切换时间">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="cleanupMinutes" label="清洁时间">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </div>
      </Form>
    </Drawer>
  );
};

interface OperationEditFormValues {
  window: [Dayjs, Dayjs];
  notes?: string;
  resourceType: ResourceType;
  requiredCount: number;
  candidateResourceIds?: number[];
  isMandatory: boolean;
  requiresExclusiveUse: boolean;
  prepMinutes: number;
  changeoverMinutes: number;
  cleanupMinutes: number;
}

export const PlatformOperationEditDrawer: React.FC<{
  open: boolean;
  item?: PlatformTimelineItem | null;
  requirements: OperationResourceRequirement[];
  resources: Resource[];
  onClose: () => void;
  onSubmit: (payload: {
    operation: PlatformOperationUpdateInput;
    binding: PlatformOperationResourceBindingInput;
  }) => Promise<void> | void;
}> = ({ open, item, requirements, resources, onClose, onSubmit }) => {
  const [form] = Form.useForm<OperationEditFormValues>();
  const selectedResourceType = Form.useWatch('resourceType', form);
  const primaryRequirement = requirements[0];

  useEffect(() => {
    const metadata = (item?.metadata ?? {}) as Record<string, unknown>;
    form.resetFields();
    if (item) {
      form.setFieldsValue({
        window: [dayjs(item.startDatetime), dayjs(item.endDatetime)],
        notes: typeof metadata.notes === 'string' ? metadata.notes : undefined,
        resourceType: primaryRequirement?.resourceType ?? 'EQUIPMENT',
        requiredCount: primaryRequirement?.requiredCount ?? 1,
        candidateResourceIds: primaryRequirement?.candidateResourceIds ?? [],
        isMandatory: primaryRequirement?.isMandatory ?? true,
        requiresExclusiveUse: primaryRequirement?.requiresExclusiveUse ?? true,
        prepMinutes: primaryRequirement?.prepMinutes ?? 0,
        changeoverMinutes: primaryRequirement?.changeoverMinutes ?? 0,
        cleanupMinutes: primaryRequirement?.cleanupMinutes ?? 0,
      });
    }
  }, [form, item, primaryRequirement]);

  const candidateOptions = useMemo(
    () =>
      resources
        .filter((resource) => resource.resourceType === selectedResourceType && resource.isSchedulable)
        .map((resource) => ({
          value: resource.id,
          label: `${resource.resourceCode} - ${resource.resourceName}`,
        })),
    [resources, selectedResourceType],
  );

  const handleSubmit = async () => {
    const values = await form.validateFields();
    await onSubmit({
      operation: {
        plannedStartDatetime: values.window[0].toISOString(),
        plannedEndDatetime: values.window[1].toISOString(),
        notes: values.notes ?? null,
      },
      binding: {
        resourceType: values.resourceType,
        requiredCount: values.requiredCount,
        candidateResourceIds: values.candidateResourceIds ?? [],
        prepMinutes: values.prepMinutes,
        changeoverMinutes: values.changeoverMinutes,
        cleanupMinutes: values.cleanupMinutes,
        isMandatory: values.isMandatory,
        requiresExclusiveUse: values.requiresExclusiveUse,
      },
    });
  };

  return (
    <Drawer title="平台内直接改排" width={560} open={open} onClose={onClose} extra={<Button type="primary" onClick={() => void handleSubmit()}>保存</Button>}>
      {!item ? null : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="操作">{item.title}</Descriptions.Item>
            <Descriptions.Item label="上下文">{item.subtitle ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="现有规则">
              {requirements.length ? (
                <Space wrap>
                  {requirements.map((requirement) => (
                    <Tag key={requirement.id}>{`${requirement.resourceType} x${requirement.requiredCount}`}</Tag>
                  ))}
                </Space>
              ) : (
                <Tag color="volcano">未定义</Tag>
              )}
            </Descriptions.Item>
          </Descriptions>

          <Form form={form} layout="vertical">
            <Form.Item name="window" label="计划时间" rules={[{ required: true }]}>
              <DatePicker.RangePicker showTime style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="notes" label="备注">
              <Input.TextArea rows={3} />
            </Form.Item>
            <Form.Item name="resourceType" label="资源类型" rules={[{ required: true }]}>
              <Select options={resourceTypeOptions} />
            </Form.Item>
            <Form.Item name="requiredCount" label="数量" rules={[{ required: true }]}>
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="candidateResourceIds" label="候选资源">
              <Select mode="multiple" allowClear options={candidateOptions} placeholder="为空则按资源类型匹配" />
            </Form.Item>
            <Space style={{ width: '100%' }} align="start">
              <Form.Item name="isMandatory" label="硬约束" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name="requiresExclusiveUse" label="独占资源" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Space>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <Form.Item name="prepMinutes" label="前置准备">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="changeoverMinutes" label="切换时间">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="cleanupMinutes" label="清洁时间">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </div>
          </Form>
        </Space>
      )}
    </Drawer>
  );
};

interface ResourceEventFormValues {
  window: [Dayjs, Dayjs];
  notes?: string;
}

export const ResourceEventDrawer: React.FC<{
  open: boolean;
  item?: PlatformTimelineItem | null;
  onClose: () => void;
  onUpdate?: (payload: ResourceCalendarEntry) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
}> = ({ open, item, onClose, onUpdate, onDelete }) => {
  const [form] = Form.useForm<ResourceEventFormValues>();

  useEffect(() => {
    form.resetFields();
    if (item) {
      form.setFieldsValue({
        window: [dayjs(item.startDatetime), dayjs(item.endDatetime)],
        notes: typeof item.metadata?.notes === 'string' ? item.metadata.notes : undefined,
      });
    }
  }, [form, item]);

  const handleSubmit = async () => {
    if (!item || !onUpdate) {
      return;
    }
    const values = await form.validateFields();
    const metadata = item.metadata ?? {};
    await onUpdate({
      id: Number(metadata.eventId ?? 0),
      resourceId: Number(metadata.resourceId ?? 0),
      startDatetime: values.window[0].toISOString(),
      endDatetime: values.window[1].toISOString(),
      eventType: String(metadata.eventType ?? item.title) as ResourceCalendarEntry['eventType'],
      sourceType: String(metadata.sourceType ?? 'MANUAL') as ResourceCalendarEntry['sourceType'],
      sourceId: metadata.sourceId ? Number(metadata.sourceId) : null,
      notes: values.notes ?? null,
    });
  };

  return (
    <Drawer
      title="资源事件详情"
      width={460}
      open={open}
      onClose={onClose}
      extra={
        <Space>
          {onDelete ? (
            <Button danger onClick={() => void onDelete()}>
              删除
            </Button>
          ) : null}
          {onUpdate ? (
            <Button type="primary" onClick={() => void handleSubmit()}>
              保存
            </Button>
          ) : null}
        </Space>
      }
    >
      {!item ? (
        <Text type="secondary">请选择事件</Text>
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="标题">{item.title}</Descriptions.Item>
            <Descriptions.Item label="说明">{item.subtitle ?? '-'}</Descriptions.Item>
          </Descriptions>
          <Form form={form} layout="vertical">
            <Form.Item name="window" label="时间窗口" rules={[{ required: true }]}>
              <DatePicker.RangePicker showTime style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="notes" label="备注">
              <Input.TextArea rows={4} />
            </Form.Item>
          </Form>
        </Space>
      )}
    </Drawer>
  );
};

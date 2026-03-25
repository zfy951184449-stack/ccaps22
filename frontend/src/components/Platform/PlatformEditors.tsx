import React, { useEffect } from 'react';
import { Form, Input, InputNumber, Modal, Select, Switch } from 'antd';
import { Resource, ResourceInput, ResourceType } from '../../types/platform';

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

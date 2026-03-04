import React, { useEffect } from 'react';
import { Form, Input, Modal, Select } from 'antd';
import { TeamSummary } from './types';

interface TemplateCreateDraftModalProps {
  open: boolean;
  teams: TeamSummary[];
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (payload: { templateName: string; teamId?: number | null; description?: string }) => Promise<void> | void;
}

interface DraftFormValues {
  templateName: string;
  teamId?: number;
  description?: string;
}

const TemplateCreateDraftModal: React.FC<TemplateCreateDraftModalProps> = ({
  open,
  teams,
  loading,
  onCancel,
  onSubmit,
}) => {
  const [form] = Form.useForm<DraftFormValues>();

  useEffect(() => {
    if (!open) {
      return;
    }
    form.resetFields();
  }, [form, open]);

  const handleOk = async () => {
    const values = await form.validateFields();
    await onSubmit({
      templateName: values.templateName,
      teamId: values.teamId ?? null,
      description: values.description ?? '',
    });
  };

  return (
    <Modal
      title="新建工艺模版"
      open={open}
      onCancel={onCancel}
      onOk={() => void handleOk()}
      okText="创建并进入编辑器"
      confirmLoading={loading}
      destroyOnClose
      width={620}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="templateName"
          label="模板名称"
          rules={[{ required: true, message: '请输入模板名称' }]}
        >
          <Input placeholder="例如：mAb USP/DSP 标准工艺" />
        </Form.Item>
        <Form.Item name="teamId" label="所属团队">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="可选，创建后可在编辑器中修改"
            options={teams.map((team) => ({
              value: Number(team.id),
              label: team.unit_name,
            }))}
          />
        </Form.Item>
        <Form.Item name="description" label="描述">
          <Input.TextArea rows={4} placeholder="补充模板适用范围、工艺阶段或资源语义" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default TemplateCreateDraftModal;

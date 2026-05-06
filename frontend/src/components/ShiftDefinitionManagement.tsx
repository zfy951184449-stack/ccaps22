import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Table,
  TimePicker,
  message,
  Select,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  EditOutlined,
  StopOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { ShiftDefinition, ShiftDefinitionCategory } from '../types';
import { shiftDefinitionApi } from '../services/api';
import { WxbCard, WxbButton, WxbBadge, WxbTableWrapper, WxbModal, WxbInput, WxbSwitch } from './wxb-ui';

type FormValues = {
  shift_code: string;
  shift_name: string;
  category: ShiftDefinitionCategory;
  start_time: Dayjs;
  end_time: Dayjs;
  is_cross_day: boolean;
  is_night_shift: boolean;
  nominal_hours: number;
  max_extension_hours?: number;
  description?: string;
  is_active: boolean;
};

const categoryLabels: Record<ShiftDefinitionCategory, string> = {
  STANDARD: '标准班次',
  SPECIAL: '特殊班次',
  TEMPORARY: '临时班次',
};

const formatTimeValue = (value?: string) => {
  if (!value) {
    return dayjs('08:00', 'HH:mm');
  }
  const normalized = value.length >= 5 ? value.slice(0, 5) : value;
  return dayjs(normalized, 'HH:mm');
};

const toTimeString = (value: Dayjs) => value?.format('HH:mm');

const ShiftDefinitionManagement: React.FC = () => {
  const [data, setData] = useState<ShiftDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<ShiftDefinition | null>(null);
  const [deactivateRecord, setDeactivateRecord] = useState<ShiftDefinition | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [form] = Form.useForm<FormValues>();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const list = await shiftDefinitionApi.getAll({ includeInactive });
      setData(list);
    } catch (error: any) {
      console.error('Failed to load shift definitions', error);
      message.error(error?.response?.data?.error ?? '加载班次定义失败');
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const resetForm = useCallback(() => {
    form.resetFields();
    form.setFieldsValue({
      category: 'STANDARD',
      is_cross_day: false,
      is_night_shift: false,
      is_active: true,
      start_time: dayjs('08:00', 'HH:mm'),
      end_time: dayjs('17:00', 'HH:mm'),
      nominal_hours: 8,
      max_extension_hours: 0,
    });
  }, [form]);

  const openCreateModal = () => {
    setEditing(null);
    resetForm();
    setModalVisible(true);
  };

  const openEditModal = (record: ShiftDefinition) => {
    setEditing(record);
    form.setFieldsValue({
      shift_code: record.shift_code,
      shift_name: record.shift_name,
      category: record.category,
      start_time: formatTimeValue(record.start_time),
      end_time: formatTimeValue(record.end_time),
      is_cross_day: record.is_cross_day,
      is_night_shift: record.is_night_shift ?? false,
      nominal_hours: record.nominal_hours,
      max_extension_hours: record.max_extension_hours ?? 0,
      description: record.description ?? '',
      is_active: record.is_active,
    });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload: Omit<ShiftDefinition, 'id' | 'created_at' | 'updated_at'> = {
        shift_code: values.shift_code,
        shift_name: values.shift_name,
        category: values.category,
        start_time: toTimeString(values.start_time),
        end_time: toTimeString(values.end_time),
        is_cross_day: values.is_cross_day,
        is_night_shift: values.is_night_shift ?? false,
        nominal_hours: Number(values.nominal_hours),
        max_extension_hours: values.max_extension_hours ?? 0,
        description: values.description ?? '',
        is_active: values.is_active,
      };

      if (editing) {
        await shiftDefinitionApi.update(editing.id!, payload);
        message.success('班次定义已更新');
      } else {
        await shiftDefinitionApi.create(payload);
        message.success('班次定义已创建');
      }

      setModalVisible(false);
      setEditing(null);
      await fetchData();
    } catch (error: any) {
      if (error?.errorFields) {
        return;
      }
      console.error('Failed to save shift definition', error);
      message.error(error?.response?.data?.error ?? '保存班次定义失败');
    }
  };

  const handleDeactivate = (record: ShiftDefinition) => {
    setDeactivateRecord(record);
  };

  const confirmDeactivate = async () => {
    if (!deactivateRecord?.id) return;
    try {
      await shiftDefinitionApi.remove(deactivateRecord.id);
      message.success('班次定义已停用');
      setDeactivateRecord(null);
      await fetchData();
    } catch (error: any) {
      console.error('Failed to deactivate shift definition', error);
      message.error(error?.response?.data?.error ?? '停用失败');
    }
  };

  const handleToggleActive = async (record: ShiftDefinition, value: boolean) => {
    try {
      await shiftDefinitionApi.update(record.id!, { is_active: value });
      message.success(`班次已${value ? '启用' : '停用'}`);
      await fetchData();
    } catch (error: any) {
      console.error('Failed to toggle shift definition', error);
      message.error(error?.response?.data?.error ?? '更新状态失败');
    }
  };

  const columns = useMemo(
    () => [
      {
        title: '班次编码',
        dataIndex: 'shift_code',
        key: 'shift_code',
      },
      {
        title: '班次名称',
        dataIndex: 'shift_name',
        key: 'shift_name',
      },
      {
        title: '类别',
        dataIndex: 'category',
        key: 'category',
        render: (value: ShiftDefinitionCategory) => (
          <WxbBadge 
            status={value === 'STANDARD' ? 'info' : value === 'SPECIAL' ? 'neutral' : 'warning'} 
            label={categoryLabels[value] ?? value} 
            variant="outline"
          />
        ),
      },
      {
        title: '时间',
        key: 'time_window',
        render: (_: any, record: ShiftDefinition) => (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{record.start_time} ~ {record.end_time}</span>
            {record.is_cross_day && <WxbBadge status="error" label="跨日" variant="bar" />}
            {record.is_night_shift && <WxbBadge status="info" label="夜班" variant="bar" />}
          </span>
        ),
      },
      {
        title: '折算工时',
        dataIndex: 'nominal_hours',
        key: 'nominal_hours',
        render: (value: number) => `${value} h`,
      },
      {
        title: '加班扩展',
        dataIndex: 'max_extension_hours',
        key: 'max_extension_hours',
        render: (value: number | undefined) => `${value ?? 0} h`,
      },
      {
        title: '状态',
        dataIndex: 'is_active',
        key: 'is_active',
        render: (value: boolean) => (
          <WxbBadge status={value ? 'success' : 'neutral'} label={value ? '启用' : '停用'} variant="bar" />
        ),
      },
      {
        title: '操作',
        key: 'actions',
        render: (_: any, record: ShiftDefinition) => (
          <Space>
            <WxbButton
              variant="ghost"
              size="sm"
              onClick={() => openEditModal(record)}
            >
              <EditOutlined style={{ marginRight: 4 }} />编辑
            </WxbButton>
            <WxbButton
              variant={record.is_active ? 'danger' : 'primary'}
              size="sm"
              onClick={() => record.is_active ? handleDeactivate(record) : handleToggleActive(record, true)}
            >
              {record.is_active ? '停用' : '启用'}
            </WxbButton>
          </Space>
        ),
      },
    ],
    [handleToggleActive],
  );

  return (
    <div className="dashboard-page" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <WxbCard>
        <h2 className="wxb-h4" style={{ marginBottom: 8 }}>班次定义管理</h2>
        <p className="wxb-body" style={{ color: 'var(--wxb-color-text-secondary)', marginBottom: 24 }}>
          在此维护班次的时间、类别与工时设置，用于人员基础班表和生产排班的班次引用。班次编码需保持全局唯一，推荐遵循
          <strong> DAY / LONGDAY / NIGHT / REST </strong>
          等规范。
        </p>
        <Space wrap>
          <WxbButton variant="primary" onClick={openCreateModal}>
            <PlusOutlined style={{ marginRight: 8 }} />新增班次
          </WxbButton>
          <WxbButton variant="secondary" onClick={fetchData} disabled={loading}>
            <ReloadOutlined style={{ marginRight: 8 }} />{loading ? '刷新中' : '刷新'}
          </WxbButton>
          <WxbSwitch
            checked={includeInactive}
            onChange={setIncludeInactive}
            checkedChildren="含停用"
            unCheckedChildren="仅启用"
          />
        </Space>
      </WxbCard>

      <WxbCard>
        <WxbTableWrapper>
          <Table
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={data}
            pagination={{ pageSize: 10 }}
          />
        </WxbTableWrapper>
      </WxbCard>

      <WxbModal
        title={editing ? `编辑班次：${editing.shift_name}` : '新增班次定义'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setEditing(null);
        }}
        onOk={handleSubmit}
        destroyOnClose
        okText="保存"
      >
        <Form<FormValues>
          form={form}
          layout="vertical"
          initialValues={{
            category: 'STANDARD',
            is_cross_day: false,
            is_night_shift: false,
            is_active: true,
            start_time: dayjs('08:00', 'HH:mm'),
            end_time: dayjs('17:00', 'HH:mm'),
            nominal_hours: 8,
            max_extension_hours: 0,
          }}
        >
          <Form.Item
            name="shift_code"
            label="班次编码"
            rules={[{ required: true, message: '请输入班次编码' }]}
          >
            <WxbInput placeholder="例如 DAY、NIGHT" disabled={Boolean(editing)} />
          </Form.Item>

          <Form.Item
            name="shift_name"
            label="班次名称"
            rules={[{ required: true, message: '请输入班次名称' }]}
          >
            <WxbInput placeholder="例如 日班、夜班" />
          </Form.Item>

          <Form.Item
            name="category"
            label="班次类别"
            rules={[{ required: true, message: '请选择类别' }]}
          >
            <Select
              options={[
                { label: categoryLabels.STANDARD, value: 'STANDARD' },
                { label: categoryLabels.SPECIAL, value: 'SPECIAL' },
                { label: categoryLabels.TEMPORARY, value: 'TEMPORARY' },
              ]}
            />
          </Form.Item>

          <Space size="large">
            <Form.Item
              name="start_time"
              label="开始时间"
              rules={[{ required: true, message: '请选择开始时间' }]}
            >
              <TimePicker format="HH:mm" minuteStep={15} />
            </Form.Item>
            <Form.Item
              name="end_time"
              label="结束时间"
              rules={[{ required: true, message: '请选择结束时间' }]}
            >
              <TimePicker format="HH:mm" minuteStep={15} />
            </Form.Item>
          </Space>

          <Space size="large">
            <Form.Item name="is_cross_day" label="跨日班次" valuePropName="checked">
              <WxbSwitch />
            </Form.Item>
            <Form.Item name="is_night_shift" label="夜班" valuePropName="checked" tooltip="标记为夜班后，求解器会应用夜班休息约束">
              <WxbSwitch />
            </Form.Item>
          </Space>

          <Space size="large">
            <Form.Item
              name="nominal_hours"
              label="折算工时 (小时)"
              rules={[{ required: true, message: '请输入折算工时' }]}
            >
              <InputNumber min={0} step={0.5} />
            </Form.Item>
            <Form.Item
              name="max_extension_hours"
              label="最大加班 (小时)"
            >
              <InputNumber min={0} step={0.5} />
            </Form.Item>
          </Space>

          <Form.Item name="description" label="说明">
            <Input.TextArea rows={3} placeholder="可填写班次适用范围、注意事项等" />
          </Form.Item>

          <Form.Item name="is_active" label="启用状态" valuePropName="checked">
            <WxbSwitch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </Form>
      </WxbModal>

      {/* 停用确认弹窗 */}
      <WxbModal
        title="确认停用"
        open={!!deactivateRecord}
        onCancel={() => setDeactivateRecord(null)}
        onOk={confirmDeactivate}
        okText="确认停用"
        okVariant="danger"
        width={400}
      >
        <p className="wxb-body" style={{ margin: '16px 0' }}>
          确认要停用班次 <strong>【{deactivateRecord?.shift_name}】</strong> 吗？
        </p>
      </WxbModal>
    </div>
  );
};

export default ShiftDefinitionManagement;

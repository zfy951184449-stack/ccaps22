import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Employee,
  OrgHierarchyResponse,
  OrgUnitNode,
  Qualification,
  ShiftDefinition,
  SpecialShiftOccurrence,
  SpecialShiftPlanCategory,
  SpecialShiftWindow,
  SpecialShiftWindowDetail,
  SpecialShiftWindowPreview,
} from '../types';
import {
  employeeApi,
  organizationStructureApi,
  qualificationApi,
  shiftDefinitionApi,
  specialShiftWindowApi,
} from '../services/api';

const weekdayOptions = [
  { label: '周一', value: 1 },
  { label: '周二', value: 2 },
  { label: '周三', value: 3 },
  { label: '周四', value: 4 },
  { label: '周五', value: 5 },
  { label: '周六', value: 6 },
  { label: '周日', value: 7 },
];

type EditorFormValues = {
  window_name: string;
  org_unit_id: number;
  date_range: [Dayjs, Dayjs];
  lock_after_apply: boolean;
  notes?: string;
  rules: Array<{
    shift_id: number;
    required_people: number;
    plan_category: SpecialShiftPlanCategory;
    qualification_id?: number | null;
    min_level?: number | null;
    is_mandatory: boolean;
    days_of_week: number[];
    notes?: string;
    allow_employee_ids?: number[];
    deny_employee_ids?: number[];
  }>;
};

const flattenOrgUnits = (units: OrgUnitNode[], depth = 0): Array<{ label: string; value: number }> => {
  const rows: Array<{ label: string; value: number }> = [];
  units.forEach((unit) => {
    rows.push({
      value: unit.id,
      label: `${'　'.repeat(depth)}${unit.unitName} [${unit.unitType}]`,
    });
    rows.push(...flattenOrgUnits(unit.children || [], depth + 1));
  });
  return rows;
};

const collectDescendantUnitIds = (units: OrgUnitNode[], targetUnitId: number): number[] => {
  for (const unit of units) {
    if (unit.id === targetUnitId) {
      const descendantIds: number[] = [];
      const visit = (node: OrgUnitNode) => {
        descendantIds.push(node.id);
        (node.children || []).forEach(visit);
      };
      visit(unit);
      return descendantIds;
    }

    const childMatches = collectDescendantUnitIds(unit.children || [], targetUnitId);
    if (childMatches.length > 0) {
      return childMatches;
    }
  }

  return [];
};

const statusColorMap: Record<string, string> = {
  DRAFT: 'default',
  ACTIVE: 'processing',
  CANCELLED: 'warning',
  ARCHIVED: 'default',
  PENDING: 'default',
  SCHEDULED: 'processing',
  APPLIED: 'success',
  INFEASIBLE: 'error',
};

const confirmAction = (options: { title: string; content: string; okText: string; cancelText: string }) =>
  new Promise<boolean>((resolve) => {
    let modalRef: ReturnType<typeof Modal.confirm>;
    modalRef = Modal.confirm({
      ...options,
      onOk: async () => {
        resolve(true);
        modalRef.destroy();
      },
      onCancel: () => {
        resolve(false);
        modalRef.destroy();
      },
    });
  });

const SpecialShiftWindowsPage: React.FC = () => {
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm<EditorFormValues>();

  const [windows, setWindows] = useState<SpecialShiftWindow[]>([]);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [occurrenceOpen, setOccurrenceOpen] = useState(false);
  const [editingWindow, setEditingWindow] = useState<SpecialShiftWindowDetail | null>(null);
  const [previewData, setPreviewData] = useState<SpecialShiftWindowPreview | null>(null);
  const [occurrences, setOccurrences] = useState<SpecialShiftOccurrence[]>([]);

  const [filters, setFilters] = useState<{
    status?: string;
    org_unit_id?: number;
    start_date?: string;
    end_date?: string;
  }>({});

  const [orgTree, setOrgTree] = useState<OrgHierarchyResponse | null>(null);
  const [shiftDefinitions, setShiftDefinitions] = useState<ShiftDefinition[]>([]);
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const selectedOrgUnitId = Form.useWatch('org_unit_id', form);

  const orgUnitOptions = useMemo(() => flattenOrgUnits(orgTree?.units || []), [orgTree]);
  const scopedUnitIds = useMemo(() => {
    if (!selectedOrgUnitId) {
      return [];
    }
    return collectDescendantUnitIds(orgTree?.units || [], selectedOrgUnitId);
  }, [orgTree, selectedOrgUnitId]);
  const employeeOptions = useMemo(() => {
    if (!selectedOrgUnitId) {
      return [];
    }

    const unitIdSet = new Set(scopedUnitIds);
    return employees
      .filter((employee) => {
        const unitId = employee.unit_id ?? employee.unitId ?? null;
        return unitId !== null && unitIdSet.has(unitId);
      })
      .map((employee) => ({
        label: `${employee.employee_name} (${employee.employee_code})`,
        value: employee.id!,
      }));
  }, [employees, scopedUnitIds, selectedOrgUnitId]);
  const shiftOptions = useMemo(
    () =>
      shiftDefinitions
        .filter((shift) => shift.is_active && shift.nominal_hours > 0 && shift.shift_code.toUpperCase() !== 'REST')
        .map((shift) => ({
          label: `${shift.shift_name} (${shift.shift_code})`,
          value: shift.id!,
        })),
    [shiftDefinitions],
  );
  const qualificationOptions = useMemo(
    () =>
      qualifications.map((qualification) => ({
        label: qualification.qualification_name,
        value: qualification.id!,
      })),
    [qualifications],
  );

  const loadWindows = useCallback(async () => {
    setTableLoading(true);
    try {
      const data = await specialShiftWindowApi.list(filters);
      setWindows(data);
    } catch (error: any) {
      messageApi.error(error?.response?.data?.error || '加载专项班次窗口失败');
    } finally {
      setTableLoading(false);
    }
  }, [filters, messageApi]);

  const loadReferences = useCallback(async () => {
    setReferenceLoading(true);
    try {
      const [orgResult, shiftResult, qualificationResult, employeeResult] = await Promise.all([
        organizationStructureApi.getTree(),
        shiftDefinitionApi.getAll(),
        qualificationApi.getAll(),
        employeeApi.getAll(),
      ]);

      setOrgTree(orgResult);
      setShiftDefinitions(shiftResult);
      setQualifications(qualificationResult.data);
      setEmployees(employeeResult.data);
    } catch (error: any) {
      messageApi.error(error?.response?.data?.error || '加载专项班次基础数据失败');
    } finally {
      setReferenceLoading(false);
    }
  }, [messageApi]);

  useEffect(() => {
    loadReferences();
  }, [loadReferences]);

  useEffect(() => {
    loadWindows();
  }, [loadWindows]);

  useEffect(() => {
    const rules = form.getFieldValue('rules') as EditorFormValues['rules'] | undefined;
    if (!rules || !selectedOrgUnitId) {
      return;
    }

    const allowedEmployeeIds = new Set(employeeOptions.map((option) => option.value));
    let changed = false;

    const sanitizedRules = rules.map((rule) => {
      const allowEmployeeIds = (rule.allow_employee_ids || []).filter((employeeId) => allowedEmployeeIds.has(employeeId));
      const denyEmployeeIds = (rule.deny_employee_ids || []).filter((employeeId) => allowedEmployeeIds.has(employeeId));

      if (
        allowEmployeeIds.length !== (rule.allow_employee_ids || []).length ||
        denyEmployeeIds.length !== (rule.deny_employee_ids || []).length
      ) {
        changed = true;
      }

      return {
        ...rule,
        allow_employee_ids: allowEmployeeIds,
        deny_employee_ids: denyEmployeeIds,
      };
    });

    if (changed) {
      form.setFieldsValue({ rules: sanitizedRules });
    }
  }, [employeeOptions, form, selectedOrgUnitId]);

  const resetEditor = () => {
    setEditingWindow(null);
    setPreviewData(null);
    form.resetFields();
  };

  const openCreateDrawer = () => {
    resetEditor();
    form.setFieldsValue({
      lock_after_apply: true,
      rules: [
        {
          required_people: 1,
          plan_category: 'BASE',
          is_mandatory: true,
          days_of_week: [1, 2, 3, 4, 5, 6, 7],
          allow_employee_ids: [],
          deny_employee_ids: [],
        },
      ],
    });
    setEditorOpen(true);
  };

  const openEditDrawer = async (windowId: number) => {
    try {
      const detail = await specialShiftWindowApi.get(windowId);
      setEditingWindow(detail);
      setPreviewData(detail.preview_summary);
      form.setFieldsValue({
        window_name: detail.window.window_name,
        org_unit_id: detail.window.org_unit_id,
        date_range: [dayjs(detail.window.start_date), dayjs(detail.window.end_date)],
        lock_after_apply: detail.window.lock_after_apply,
        notes: detail.window.notes || undefined,
        rules: detail.rules.map((rule) => ({
          shift_id: rule.shift_id,
          required_people: rule.required_people,
          plan_category: rule.plan_category,
          qualification_id: rule.qualification_id ?? undefined,
          min_level: rule.min_level ?? undefined,
          is_mandatory: rule.is_mandatory ?? true,
          days_of_week: rule.days_of_week,
          notes: rule.notes || undefined,
          allow_employee_ids: rule.allow_employee_ids || [],
          deny_employee_ids: rule.deny_employee_ids || [],
        })),
      });
      setEditorOpen(true);
    } catch (error: any) {
      messageApi.error(error?.response?.data?.error || '加载专项班次窗口详情失败');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const payload = {
        window_name: values.window_name,
        org_unit_id: values.org_unit_id,
        start_date: values.date_range[0].format('YYYY-MM-DD'),
        end_date: values.date_range[1].format('YYYY-MM-DD'),
        lock_after_apply: values.lock_after_apply,
        notes: values.notes || null,
        rules: values.rules.map((rule) => ({
          shift_id: rule.shift_id,
          required_people: rule.required_people,
          plan_category: rule.plan_category,
          qualification_id: rule.qualification_id ?? null,
          min_level: rule.qualification_id ? rule.min_level ?? 1 : null,
          is_mandatory: rule.is_mandatory,
          days_of_week: rule.days_of_week,
          notes: rule.notes || null,
          allow_employee_ids: rule.allow_employee_ids || [],
          deny_employee_ids: rule.deny_employee_ids || [],
        })),
      };

      const detail = editingWindow
        ? await specialShiftWindowApi.update(editingWindow.window.id, payload)
        : await specialShiftWindowApi.create(payload);

      setEditingWindow(detail);
      setPreviewData(detail.preview_summary);
      setEditorOpen(false);
      await loadWindows();
      messageApi.success(editingWindow ? '专项班次窗口已更新' : '专项班次窗口已创建');
      resetEditor();
    } catch (error: any) {
      if (error?.errorFields) {
        return;
      }
      messageApi.error(error?.response?.data?.error || '保存专项班次窗口失败');
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async (windowId: number) => {
    try {
      const data = await specialShiftWindowApi.preview(windowId);
      setPreviewData(data);
      setPreviewOpen(true);
    } catch (error: any) {
      messageApi.error(error?.response?.data?.error || '预览专项班次窗口失败');
    }
  };

  const handleActivate = async (windowId: number) => {
    try {
      const preview = await specialShiftWindowApi.preview(windowId);
      setPreviewData(preview);
      if (!preview.can_activate) {
        setPreviewOpen(true);
        messageApi.warning('预览存在阻断项，不能激活');
        return;
      }

      const confirmed = await confirmAction({
        title: '激活专项班次窗口',
        content: `将激活 ${preview.occurrence_count} 条专项 coverage occurrence。`,
        okText: '激活',
        cancelText: '取消',
      });
      if (!confirmed) {
        return;
      }

      await specialShiftWindowApi.activate(windowId);
      await loadWindows();
      messageApi.success('专项班次窗口已激活');
    } catch (error: any) {
      messageApi.error(error?.response?.data?.error || '激活专项班次窗口失败');
    }
  };

  const handleCancelWindow = async (windowId: number) => {
    try {
      const confirmed = await confirmAction({
        title: '取消专项班次窗口',
        content: '仅会取消今天及之后、尚未应用的 occurrence。',
        okText: '确认取消',
        cancelText: '返回',
      });
      if (!confirmed) {
        return;
      }

      await specialShiftWindowApi.cancel(windowId);
      await loadWindows();
      messageApi.success('专项班次窗口已取消');
    } catch (error: any) {
      messageApi.error(error?.response?.data?.error || '取消专项班次窗口失败');
    }
  };

  const handleOpenOccurrences = async (windowId: number) => {
    try {
      const data = await specialShiftWindowApi.getOccurrences(windowId);
      setOccurrences(data);
      setOccurrenceOpen(true);
    } catch (error: any) {
      messageApi.error(error?.response?.data?.error || '加载 occurrence 失败');
    }
  };

  const windowColumns = [
    {
      title: '窗口',
      dataIndex: 'window_name',
      key: 'window_name',
      render: (_: unknown, record: SpecialShiftWindow) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{record.window_name}</Typography.Text>
          <Typography.Text type="secondary">{record.window_code}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '组织范围',
      dataIndex: 'org_unit_name',
      key: 'org_unit_name',
    },
    {
      title: '期间',
      key: 'date_range',
      render: (_: unknown, record: SpecialShiftWindow) => `${record.start_date} ~ ${record.end_date}`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => <Tag color={statusColorMap[status] || 'default'}>{status}</Tag>,
    },
    {
      title: '规则/Occurrence',
      key: 'stats',
      render: (_: unknown, record: SpecialShiftWindow) => (
        <Space size="small">
          <Tag>{record.rule_count} 条规则</Tag>
          <Tag color="blue">{record.occurrence_count} occurrence</Tag>
          <Tag color="processing">S {record.scheduled_count}</Tag>
          <Tag color="success">A {record.applied_count}</Tag>
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, record: SpecialShiftWindow) => (
        <Space wrap>
          <Button size="small" onClick={() => openEditDrawer(record.id)} disabled={record.status !== 'DRAFT'}>
            编辑
          </Button>
          <Button size="small" onClick={() => handlePreview(record.id)}>
            预览
          </Button>
          <Button size="small" onClick={() => handleOpenOccurrences(record.id)}>
            Occurrence
          </Button>
          <Button
            size="small"
            type="primary"
            onClick={() => handleActivate(record.id)}
            disabled={record.status !== 'DRAFT'}
          >
            激活
          </Button>
          <Button
            size="small"
            danger
            onClick={() => handleCancelWindow(record.id)}
            disabled={record.status !== 'ACTIVE'}
          >
            取消
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {contextHolder}

      <Card
        bordered={false}
        style={{
          borderRadius: 24,
          background: 'linear-gradient(135deg, rgba(255,255,255,0.92), rgba(244,248,255,0.78))',
          boxShadow: '0 18px 48px rgba(15, 23, 42, 0.08)',
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Space size="middle" wrap>
            <Select
              allowClear
              placeholder="状态"
              style={{ width: 160 }}
              options={[
                { label: 'DRAFT', value: 'DRAFT' },
                { label: 'ACTIVE', value: 'ACTIVE' },
                { label: 'CANCELLED', value: 'CANCELLED' },
                { label: 'ARCHIVED', value: 'ARCHIVED' },
              ]}
              value={filters.status}
              onChange={(value) => setFilters((current) => ({ ...current, status: value }))}
            />
            <Select
              allowClear
              showSearch
              placeholder="组织范围"
              style={{ width: 260 }}
              options={orgUnitOptions}
              value={filters.org_unit_id}
              onChange={(value) => setFilters((current) => ({ ...current, org_unit_id: value }))}
              optionFilterProp="label"
            />
            <DatePicker
              placeholder="开始日期"
              value={filters.start_date ? dayjs(filters.start_date) : null}
              onChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  start_date: value ? value.format('YYYY-MM-DD') : undefined,
                }))
              }
            />
            <DatePicker
              placeholder="结束日期"
              value={filters.end_date ? dayjs(filters.end_date) : null}
              onChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  end_date: value ? value.format('YYYY-MM-DD') : undefined,
                }))
              }
            />
          </Space>

          <Space>
            <Button onClick={loadWindows} loading={tableLoading}>
              刷新
            </Button>
            <Button type="primary" onClick={openCreateDrawer} loading={referenceLoading}>
              新建专项班次窗口
            </Button>
          </Space>
        </div>
      </Card>

      <Card
        bordered={false}
        style={{
          borderRadius: 24,
          background: 'rgba(255,255,255,0.88)',
          boxShadow: '0 18px 48px rgba(15, 23, 42, 0.06)',
        }}
      >
        <Table
          rowKey="id"
          dataSource={windows}
          columns={windowColumns}
          loading={tableLoading}
          pagination={{ pageSize: 8 }}
        />
      </Card>

      <Drawer
        title={editingWindow ? '编辑专项班次窗口' : '新建专项班次窗口'}
        open={editorOpen}
        width={860}
        onClose={() => {
          setEditorOpen(false);
          resetEditor();
        }}
        extra={
          <Space>
            <Button
              onClick={() => {
                setEditorOpen(false);
                resetEditor();
              }}
            >
              取消
            </Button>
            <Button type="primary" onClick={handleSubmit} loading={saving}>
              保存
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" initialValues={{ lock_after_apply: true }}>
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="window_name" label="窗口名称" rules={[{ required: true, message: '请输入窗口名称' }]}>
              <Input placeholder="例如：USP 1月夜班覆盖" />
            </Form.Item>
            <Form.Item name="org_unit_id" label="组织范围" rules={[{ required: true, message: '请选择组织范围' }]}>
              <Select showSearch options={orgUnitOptions} optionFilterProp="label" placeholder="选择组织范围" />
            </Form.Item>
            <Form.Item name="date_range" label="期间" rules={[{ required: true, message: '请选择期间' }]}>
              <DatePicker.RangePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="lock_after_apply" label="应用后锁定" valuePropName="checked">
              <Switch checkedChildren="锁定" unCheckedChildren="不锁定" />
            </Form.Item>
          </div>

          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} placeholder="补充窗口背景、适用场景、执行要求" />
          </Form.Item>

          <Divider orientation="left">覆盖规则</Divider>

          <Form.List name="rules">
            {(fields, { add, remove }) => (
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                {fields.map((field, index) => (
                  <Card
                    key={field.key}
                    size="small"
                    title={`规则 ${index + 1}`}
                    extra={
                      fields.length > 1 ? (
                        <Button type="text" danger icon={<MinusCircleOutlined />} onClick={() => remove(field.name)}>
                          删除
                        </Button>
                      ) : null
                    }
                  >
                    <div className="grid grid-cols-2 gap-4">
                      <Form.Item
                        {...field}
                        name={[field.name, 'shift_id']}
                        label="班次"
                        rules={[{ required: true, message: '请选择班次' }]}
                      >
                        <Select options={shiftOptions} placeholder="选择夜班、长白班等工作班次" />
                      </Form.Item>
                      <Form.Item
                        {...field}
                        name={[field.name, 'required_people']}
                        label="每天需求人数"
                        rules={[{ required: true, message: '请输入人数' }]}
                      >
                        <InputNumber min={1} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item
                        {...field}
                        name={[field.name, 'plan_category']}
                        label="工时类别"
                        rules={[{ required: true, message: '请选择工时类别' }]}
                      >
                        <Select
                          options={[
                            { label: 'BASE', value: 'BASE' },
                            { label: 'OVERTIME', value: 'OVERTIME' },
                          ]}
                        />
                      </Form.Item>
                      <Form.Item {...field} name={[field.name, 'days_of_week']} label="适用星期" rules={[{ required: true }]}>
                        <Checkbox.Group options={weekdayOptions} />
                      </Form.Item>
                      <Form.Item {...field} name={[field.name, 'qualification_id']} label="资质要求">
                        <Select allowClear options={qualificationOptions} placeholder="无则留空" />
                      </Form.Item>
                      <Form.Item noStyle shouldUpdate>
                        {() => {
                          const qualificationId = form.getFieldValue(['rules', field.name, 'qualification_id']);
                          if (!qualificationId) {
                            return null;
                          }
                          return (
                            <Form.Item {...field} name={[field.name, 'min_level']} label="最低资质等级">
                              <InputNumber min={1} max={10} style={{ width: '100%' }} />
                            </Form.Item>
                          );
                        }}
                      </Form.Item>
                      <Form.Item
                        {...field}
                        name={[field.name, 'allow_employee_ids']}
                        label={`允许候选人白名单${selectedOrgUnitId ? `（组织范围内 ${employeeOptions.length} 人）` : ''}`}
                      >
                        <Select
                          mode="multiple"
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          options={employeeOptions}
                          disabled={!selectedOrgUnitId}
                          placeholder={selectedOrgUnitId ? '为空则使用组织范围全部员工' : '请先选择组织范围'}
                        />
                      </Form.Item>
                      <Form.Item
                        {...field}
                        name={[field.name, 'deny_employee_ids']}
                        label={`排除员工黑名单${selectedOrgUnitId ? `（组织范围内 ${employeeOptions.length} 人）` : ''}`}
                      >
                        <Select
                          mode="multiple"
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          options={employeeOptions}
                          disabled={!selectedOrgUnitId}
                          placeholder={selectedOrgUnitId ? '选择需要排除的员工' : '请先选择组织范围'}
                        />
                      </Form.Item>
                    </div>
                    <Form.Item {...field} name={[field.name, 'is_mandatory']} label="硬约束" valuePropName="checked">
                      <Switch checkedChildren="必须满足" unCheckedChildren="可选" />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, 'notes']} label="规则备注">
                      <Input placeholder="例如：仅限 USP A 组夜班 handover 覆盖" />
                    </Form.Item>
                  </Card>
                ))}

                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() =>
                    add({
                      required_people: 1,
                      plan_category: 'BASE',
                      is_mandatory: true,
                      days_of_week: [1, 2, 3, 4, 5, 6, 7],
                      allow_employee_ids: [],
                      deny_employee_ids: [],
                    })
                  }
                  block
                >
                  新增规则
                </Button>
              </Space>
            )}
          </Form.List>
        </Form>
      </Drawer>

      <Modal
        title="专项班次窗口预览"
        open={previewOpen}
        width={980}
        footer={<Button onClick={() => setPreviewOpen(false)}>关闭</Button>}
        onCancel={() => setPreviewOpen(false)}
      >
        {previewData ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {!previewData.can_activate && (
              <Alert
                type="warning"
                message="当前预览存在阻断项，窗口不能激活"
                description="需要保证每条 occurrence 的静态候选人数不低于 required_people。"
                showIcon
              />
            )}
            {previewData.warnings.length > 0 && (
              <Alert
                type="info"
                message="预览提示"
                description={previewData.warnings.join('；')}
                showIcon
              />
            )}
            <Descriptions bordered size="small" column={3}>
              <Descriptions.Item label="窗口 ID">{previewData.window_id}</Descriptions.Item>
              <Descriptions.Item label="Occurrence 数">{previewData.occurrence_count}</Descriptions.Item>
              <Descriptions.Item label="是否可激活">
                <Tag color={previewData.can_activate ? 'success' : 'warning'}>
                  {previewData.can_activate ? 'YES' : 'NO'}
                </Tag>
              </Descriptions.Item>
            </Descriptions>
            <Table
              rowKey="occurrence_id"
              dataSource={previewData.rows}
              pagination={{ pageSize: 8 }}
              columns={[
                {
                  title: '日期',
                  dataIndex: 'date',
                },
                {
                  title: '班次',
                  render: (_: unknown, record: SpecialShiftWindowPreview['rows'][number]) => (
                    <Space>
                      <Typography.Text>{record.shift_name}</Typography.Text>
                      <Tag>{record.shift_id}</Tag>
                    </Space>
                  ),
                },
                {
                  title: '需求人数',
                  dataIndex: 'required_people',
                },
                {
                  title: '静态候选',
                  render: (_: unknown, record: SpecialShiftWindowPreview['rows'][number]) => (
                    <Space direction="vertical" size={0}>
                      <Typography.Text>{record.eligible_employee_count} 人</Typography.Text>
                      <Typography.Text type="secondary">
                        {record.eligible_employee_ids.join(', ') || '无'}
                      </Typography.Text>
                    </Space>
                  ),
                },
                {
                  title: '阻断项',
                  render: (_: unknown, record: SpecialShiftWindowPreview['rows'][number]) =>
                    record.blocking_issues.length > 0 ? (
                      <Space wrap>
                        {record.blocking_issues.map((issue) => (
                          <Tag color="error" key={issue}>
                            {issue}
                          </Tag>
                        ))}
                      </Space>
                    ) : (
                      <Tag color="success">无</Tag>
                    ),
                },
              ]}
            />
          </Space>
        ) : null}
      </Modal>

      <Drawer
        title="Occurrence 详情"
        open={occurrenceOpen}
        width={920}
        onClose={() => setOccurrenceOpen(false)}
      >
        <Table
          rowKey="occurrence_id"
          dataSource={occurrences}
          pagination={{ pageSize: 10 }}
          expandable={{
            expandedRowRender: (record) => (
              <Table
                rowKey="id"
                dataSource={record.assignments}
                pagination={false}
                size="small"
                columns={[
                  { title: '位置', dataIndex: 'position_number', width: 80 },
                  { title: '员工', render: (_: unknown, row) => `${row.employee_name} (${row.employee_code})` },
                  { title: 'ShiftPlan', dataIndex: 'shift_plan_id', width: 110 },
                  {
                    title: '状态',
                    dataIndex: 'assignment_status',
                    width: 120,
                    render: (status: string) => <Tag color={statusColorMap[status] || 'default'}>{status}</Tag>,
                  },
                  {
                    title: '锁定',
                    dataIndex: 'is_locked',
                    width: 100,
                    render: (isLocked: boolean) => <Tag color={isLocked ? 'success' : 'default'}>{isLocked ? 'LOCKED' : 'OPEN'}</Tag>,
                  },
                ]}
              />
            ),
          }}
          columns={[
            { title: '日期', dataIndex: 'date', width: 120 },
            { title: '班次', dataIndex: 'shift_name', width: 160 },
            {
              title: '覆盖',
              render: (_: unknown, record: SpecialShiftOccurrence) => `${record.filled_people} / ${record.required_people}`,
              width: 100,
            },
            {
              title: '状态',
              dataIndex: 'status',
              width: 140,
              render: (status: string) => <Tag color={statusColorMap[status] || 'default'}>{status}</Tag>,
            },
            {
              title: '最近运行',
              dataIndex: 'scheduling_run_id',
              render: (value?: number | null) => value || '-',
              width: 120,
            },
          ]}
        />
      </Drawer>
    </div>
  );
};

export default SpecialShiftWindowsPage;

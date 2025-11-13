import React, { useEffect, useMemo, useState } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Space,
  message,
  Popconfirm,
  Select,
  DatePicker,
  InputNumber,
  Tag,
  Drawer,
  List,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SafetyOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { Employee, Department, Team, EmployeeRole, EmployeeTeamRole } from '../types';
import { employeeApi, organizationApi } from '../services/api';
import EmployeeQualificationModal from './EmployeeQualificationModal';

const { Option } = Select;

interface EmployeeFormValues {
  employee_code: string;
  employee_name: string;
  department_id?: number | null;
  primary_team_id?: number | null;
  primary_role_id?: number | null;
  employment_status?: string;
  hire_date?: Dayjs | null;
  shopfloor_baseline_pct?: number | null;
  shopfloor_upper_pct?: number | null;
  org_role?: string;
}

const employmentStatusOptions = [
  { value: 'ACTIVE', label: '在职', color: 'green' },
  { value: 'ON_LEAVE', label: '休假', color: 'gold' },
  { value: 'INACTIVE', label: '停用', color: 'red' },
];

const orgRoleOptions = [
  { value: 'FRONTLINE', label: '一线人员' },
  { value: 'SHIFT_LEADER', label: '班组长 (Shift Leader)' },
  { value: 'GROUP_LEADER', label: '工段长 (Group Leader)' },
  { value: 'TEAM_LEADER', label: '生产团队长 (Team Leader)' },
  { value: 'DEPT_MANAGER', label: '部门负责人' },
];

const orgRoleLabelMap = orgRoleOptions.reduce<Record<string, string>>((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {});

const allowedSubordinateRoles: Record<string, string[]> = {
  DEPT_MANAGER: ['TEAM_LEADER', 'GROUP_LEADER', 'SHIFT_LEADER', 'FRONTLINE'],
  TEAM_LEADER: ['GROUP_LEADER', 'SHIFT_LEADER', 'FRONTLINE'],
  GROUP_LEADER: ['SHIFT_LEADER', 'FRONTLINE'],
  SHIFT_LEADER: ['FRONTLINE'],
  FRONTLINE: [],
};

const EmployeeTable: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [roles, setRoles] = useState<EmployeeRole[]>([]);
  const [assignments, setAssignments] = useState<EmployeeTeamRole[]>([]);

  const [loading, setLoading] = useState(false);
  const [orgLoading, setOrgLoading] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [qualificationModalVisible, setQualificationModalVisible] = useState(false);
  const [assignmentDrawerVisible, setAssignmentDrawerVisible] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [reportingModalVisible, setReportingModalVisible] = useState(false);
  const [reportingLeader, setReportingLeader] = useState<Employee | null>(null);
  const [reportingLoading, setReportingLoading] = useState(false);
  const [reportingSelectedIds, setReportingSelectedIds] = useState<number[]>([]);
  const [reportingLeaderIds, setReportingLeaderIds] = useState<number[]>([]);

  const [form] = Form.useForm<EmployeeFormValues>();

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const response = await employeeApi.getAll();
      const normalized = (response.data || []).map((item: any) => ({
        id: item.id,
        employee_code: item.employee_code ?? item.employeeCode,
        employee_name: item.employee_name ?? item.employeeName,
        department_id: item.department_id ?? item.departmentId ?? null,
        department_name: item.department_name ?? item.departmentName ?? null,
        primary_team_id: item.primary_team_id ?? item.primaryTeamId ?? null,
        primary_team_name: item.primary_team_name ?? item.primaryTeamName ?? null,
        primary_role_id: item.primary_role_id ?? item.primaryRoleId ?? null,
        primary_role_name: item.primary_role_name ?? item.primaryRoleName ?? null,
        employment_status: item.employment_status ?? item.employmentStatus ?? 'ACTIVE',
        hire_date: item.hire_date ?? item.hireDate ?? null,
        shopfloor_baseline_pct: item.shopfloor_baseline_pct ?? item.shopfloorBaselinePct ?? null,
        shopfloor_upper_pct: item.shopfloor_upper_pct ?? item.shopfloorUpperPct ?? null,
        qualifications: item.qualifications ?? item.qualificationNames ?? [],
        org_role: item.org_role ?? item.orgRole ?? 'FRONTLINE',
        direct_leader_ids: item.direct_leader_ids ?? item.directLeaderIds ?? [],
        direct_subordinate_ids: item.direct_subordinate_ids ?? item.directSubordinateIds ?? [],
        directLeaderIds: item.direct_leader_ids ?? item.directLeaderIds ?? [],
        directSubordinateIds: item.direct_subordinate_ids ?? item.directSubordinateIds ?? [],
      })) as Employee[];
      setEmployees(normalized);
    } catch (error) {
      message.error('获取人员数据失败');
    } finally {
      setLoading(false);
    }
  };

  const loadOrgData = async () => {
    setOrgLoading(true);
    try {
      const [deptData, teamData, roleData] = await Promise.all([
        organizationApi.getDepartments(),
        organizationApi.getTeams(),
        organizationApi.getRoles(),
      ]);
      setDepartments(deptData || []);
      setTeams(teamData || []);
      setRoles(roleData || []);
    } catch (error) {
      message.warning('加载组织数据失败');
    } finally {
      setOrgLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
    loadOrgData();
  }, []);

  const departmentMap = useMemo(() => {
    const map = new Map<number, string>();
    departments.forEach((dept) => {
      if (dept.id !== undefined) {
        const name =
          dept.deptName ??
          dept.dept_name ??
          dept.unitName ??
          dept.unit_name ??
          '';
        map.set(dept.id, name);
      }
    });
    return map;
  }, [departments]);

  const teamMap = useMemo(() => {
    const map = new Map<number, string>();
    teams.forEach((team) => {
      if (team.id !== undefined) {
        const name =
          team.teamName ??
          team.team_name ??
          team.unitName ??
          team.unit_name ??
          '';
        map.set(team.id, name);
      }
    });
    return map;
  }, [teams]);

  const roleMap = useMemo(() => {
    const map = new Map<number, string>();
    roles.forEach((role) => {
      if (role.id !== undefined) {
        map.set(role.id, role.role_name);
      }
    });
    return map;
  }, [roles]);

  const handleAdd = () => {
    setEditingEmployee(null);
    form.resetFields();
    form.setFieldsValue({ employment_status: 'ACTIVE', org_role: 'FRONTLINE' });
    setModalVisible(true);
  };

  const handleEdit = (record: Employee) => {
    setEditingEmployee(record);
    form.setFieldsValue({
      employee_code: record.employee_code,
      employee_name: record.employee_name,
      department_id: record.department_id ?? undefined,
      primary_team_id: record.primary_team_id ?? undefined,
      primary_role_id: record.primary_role_id ?? undefined,
      employment_status: record.employment_status ?? 'ACTIVE',
      hire_date: record.hire_date ? dayjs(record.hire_date) : undefined,
      shopfloor_baseline_pct: record.shopfloor_baseline_pct ?? undefined,
      shopfloor_upper_pct: record.shopfloor_upper_pct ?? undefined,
      org_role: record.org_role ?? 'FRONTLINE',
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await employeeApi.delete(id);
      message.success('删除成功');
      fetchEmployees();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleQualificationManage = (employee: Employee) => {
    setSelectedEmployee(employee);
    setQualificationModalVisible(true);
  };

  const loadAssignments = async (employeeId: number) => {
    try {
      const data = await employeeApi.getAssignments(employeeId);
      setAssignments(data || []);
    } catch (error) {
      message.error('加载岗位数据失败');
    }
  };

  const openAssignmentDrawer = (employee: Employee) => {
    setSelectedEmployee(employee);
    loadAssignments(employee.id!);
    setAssignmentDrawerVisible(true);
  };

  const openReportingModal = async (employee: Employee) => {
    if (!employee.id) {
      return;
    }
    setReportingLeader(employee);
    setReportingModalVisible(true);
    setReportingSelectedIds([]);
    setReportingLeaderIds([]);
    setReportingLoading(true);
    try {
      const data = await employeeApi.getReporting(employee.id);
      setReportingSelectedIds(data.directReportIds || []);
      setReportingLeaderIds(data.leaderIds || []);
    } catch (error) {
      console.error('Failed to load reporting info', error);
      message.error('加载汇报关系失败');
    } finally {
      setReportingLoading(false);
    }
  };

  const handleSubmit = async (values: EmployeeFormValues) => {
    try {
      const payload = {
        employeeCode: values.employee_code,
        employeeName: values.employee_name,
        departmentId: values.department_id ?? null,
        primaryTeamId: values.primary_team_id ?? null,
        primaryRoleId: values.primary_role_id ?? null,
        employmentStatus: values.employment_status ?? 'ACTIVE',
        hireDate: values.hire_date ? values.hire_date.format('YYYY-MM-DD') : null,
        shopfloorBaselinePct: values.shopfloor_baseline_pct ?? null,
        shopfloorUpperPct: values.shopfloor_upper_pct ?? null,
        orgRole: values.org_role ?? 'FRONTLINE',
      };
      if (editingEmployee) {
        await employeeApi.update(editingEmployee.id!, payload);
        message.success('更新成功');
      } else {
        await employeeApi.create(payload);
        message.success('创建成功');
      }
      setModalVisible(false);
      fetchEmployees();
    } catch (error) {
      message.error(editingEmployee ? '更新失败' : '创建失败');
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
    { title: '工号', dataIndex: 'employee_code', key: 'employee_code', width: 120 },
    { title: '姓名', dataIndex: 'employee_name', key: 'employee_name', width: 120 },
    {
      title: '部门',
      dataIndex: 'department_id',
      key: 'department_id',
      width: 160,
      render: (_: any, record: Employee) => departmentMap.get(record.department_id ?? -1) || record.department_name || '-',
    },
    {
      title: '主班组',
      dataIndex: 'primary_team_id',
      key: 'primary_team_id',
      width: 160,
      render: (_: any, record: Employee) => teamMap.get(record.primary_team_id ?? -1) || record.primary_team_name || '-',
    },
    {
      title: '主角色',
      dataIndex: 'primary_role_id',
      key: 'primary_role_id',
      width: 160,
      render: (_: any, record: Employee) => roleMap.get(record.primary_role_id ?? -1) || record.primary_role_name || '-',
    },
    {
      title: '状态',
      dataIndex: 'employment_status',
      key: 'employment_status',
      width: 120,
      render: (status?: string) => {
        if (!status) return '-';
        const option = employmentStatusOptions.find((item) => item.value === status);
        return <Tag color={option?.color || 'default'}>{option?.label || status}</Tag>;
      },
    },
    {
      title: '组织角色',
      dataIndex: 'org_role',
      key: 'org_role',
      width: 160,
      render: (role?: string) => orgRoleLabelMap[role || ''] || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 340,
      render: (_: any, record: Employee) => (
        <Space size="small">
          <Button type="link" icon={<SafetyOutlined />} onClick={() => handleQualificationManage(record)}>
            资质
          </Button>
          <Button type="link" icon={<TeamOutlined />} onClick={() => openAssignmentDrawer(record)}>
            岗位
          </Button>
          <Button
            type="link"
            onClick={() => openReportingModal(record)}
            disabled={!record.id || (record.org_role ?? 'FRONTLINE') === 'FRONTLINE'}
          >
            汇报关系
          </Button>
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这条记录吗？"
            onConfirm={() => record.id && handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} loading={orgLoading}>
            新增人员
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={employees}
        rowKey="id"
        loading={loading}
        pagination={{ showSizeChanger: true, showQuickJumper: true, showTotal: (total) => `共 ${total} 条记录` }}
      />

      <Modal
        title={editingEmployee ? '编辑人员' : '新增人员'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            label="工号"
            name="employee_code"
            rules={[{ required: true, message: '请输入工号' }]}
          >
            <Input placeholder="例如：EMP001" disabled={!!editingEmployee} />
          </Form.Item>
          <Form.Item
            label="姓名"
            name="employee_name"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="请输入姓名" />
          </Form.Item>
          <Form.Item label="部门" name="department_id">
            <Select placeholder="请选择部门" allowClear loading={orgLoading}>
              {departments.map((dept) => (
                <Option key={dept.id} value={dept.id}>
                  {dept.dept_name}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="主班组" name="primary_team_id">
            <Select placeholder="请选择班组" allowClear loading={orgLoading}>
              {teams.map((team) => (
                <Option key={team.id} value={team.id}>
                  {team.team_name}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="主角色" name="primary_role_id">
            <Select placeholder="请选择角色" allowClear loading={orgLoading}>
              {roles.map((role) => (
                <Option key={role.id} value={role.id}>
                  {role.role_name}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="状态" name="employment_status">
            <Select>
              {employmentStatusOptions.map((option) => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            label="组织角色"
            name="org_role"
            rules={[{ required: true, message: '请选择组织角色' }]}
          >
            <Select>
              {orgRoleOptions.map((option) => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="入职日期" name="hire_date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="车间工时基线比" name="shopfloor_baseline_pct">
            <InputNumber style={{ width: '100%' }} min={0} max={1} step={0.01} placeholder="例如 0.60" />
          </Form.Item>
          <Form.Item label="车间工时上限比" name="shopfloor_upper_pct">
            <InputNumber style={{ width: '100%' }} min={0} max={1} step={0.01} placeholder="例如 0.90" />
          </Form.Item>
        </Form>
      </Modal>

      <EmployeeQualificationModal
        visible={qualificationModalVisible}
        employee={selectedEmployee}
        onClose={() => {
          setQualificationModalVisible(false);
          setSelectedEmployee(null);
        }}
      />

      <Drawer
        title={selectedEmployee ? `${selectedEmployee.employee_name} - 岗位关联` : '岗位关联'}
        open={assignmentDrawerVisible}
        width={420}
        onClose={() => {
          setAssignmentDrawerVisible(false);
          setAssignments([]);
        }}
      >
        <List
          dataSource={assignments}
          renderItem={(item) => (
            <List.Item>
              <List.Item.Meta
                title={`${teamMap.get(item.team_id) || item.teamName || '-'} · ${roleMap.get(item.role_id) || item.roleName || '-'}`}
                description={`生效：${item.effective_from}${item.effective_to ? ` ~ ${item.effective_to}` : ''}`}
              />
              {item.is_primary ? <Tag color="blue">主岗</Tag> : <Tag>辅岗</Tag>}
            </List.Item>
          )}
        />
      </Drawer>

      <Modal
        title={reportingLeader ? `${reportingLeader.employee_name} - 管理直接下属` : '管理直接下属'}
        open={reportingModalVisible}
        onCancel={() => {
          setReportingModalVisible(false);
          setReportingLeader(null);
          setReportingSelectedIds([]);
          setReportingLeaderIds([]);
        }}
        confirmLoading={reportingLoading}
        onOk={async () => {
          if (!reportingLeader?.id) {
            setReportingModalVisible(false);
            return;
          }
          try {
            setReportingLoading(true);
            await employeeApi.updateReporting(reportingLeader.id, {
              directReportIds: reportingSelectedIds,
            });
            message.success('直接下属已更新');
            setReportingModalVisible(false);
            setReportingLeaderIds([]);
            await fetchEmployees();
          } catch (error) {
            console.error('Failed to update reporting', error);
            message.error('更新直接下属失败');
          } finally {
            setReportingLoading(false);
          }
        }}
        okText="保存"
        cancelText="取消"
        destroyOnHidden
      >
        {reportingLeader && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Tag color="blue">
                当前角色：{orgRoleLabelMap[reportingLeader.org_role || 'FRONTLINE'] || '未知'}
              </Tag>
            </div>
            {reportingLeaderIds.length > 0 && (
              <div>
                直接上级：
                {reportingLeaderIds
                  .map((leaderId) => employees.find((emp) => emp.id === leaderId)?.employee_name || `员工${leaderId}`)
                  .join('、')}
              </div>
            )}
            <Select
              mode="multiple"
              allowClear
              style={{ width: '100%' }}
              placeholder="选择直接下属"
              value={reportingSelectedIds}
              onChange={(ids) => setReportingSelectedIds(ids as number[])}
              disabled={(allowedSubordinateRoles[reportingLeader.org_role ?? 'FRONTLINE'] || []).length === 0}
            >
              {employees
                .filter((emp) => emp.id && emp.id !== reportingLeader.id)
                .filter((emp) => {
                  const leaderRole = reportingLeader.org_role ?? 'FRONTLINE';
                  const allowed = allowedSubordinateRoles[leaderRole] || [];
                  if (!allowed.length) {
                    return false;
                  }
                  const subordinateRole = emp.org_role ?? 'FRONTLINE';
                  return allowed.includes(subordinateRole);
                })
                .map((emp) => (
                  <Option key={emp.id} value={emp.id}>
                    {`${emp.employee_name}（${orgRoleLabelMap[emp.org_role || 'FRONTLINE'] || '未知'}）`}
                  </Option>
                ))}
            </Select>
            {(!allowedSubordinateRoles[reportingLeader.org_role ?? 'FRONTLINE'] ||
              allowedSubordinateRoles[reportingLeader.org_role ?? 'FRONTLINE'].length === 0) && (
              <Tag color="warning">该角色无需管理下一级人员</Tag>
            )}
          </Space>
        )}
      </Modal>
    </div>
  );
};

export default EmployeeTable;

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  DatePicker,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tabs,
  Typography,
  message,
  Popconfirm,
} from 'antd';
import {
  ApartmentOutlined,
  CalendarOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  UserOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import type {
  Department,
  Employee,
  EmployeeUnavailability,
  OrgHierarchyResponse,
  OrgUnitNode,
  Team,
  EmployeeRole,
} from '../types';
import {
  employeeApi,
  organizationApi,
  organizationStructureApi,
} from '../services/api';

const { Option } = Select;
const { RangePicker } = DatePicker;
const { TextArea } = Input;

const employmentStatusOptions = [
  { value: 'ACTIVE', label: '在职' },
  { value: 'ON_LEAVE', label: '休假' },
  { value: 'INACTIVE', label: '停用' },
];

const orgRoleOptions = [
  { value: 'FRONTLINE', label: 'Frontline' },
  { value: 'SHIFT_LEADER', label: 'Shift Leader' },
  { value: 'GROUP_LEADER', label: 'Group Leader' },
  { value: 'TEAM_LEADER', label: 'Team Leader' },
  { value: 'DEPT_MANAGER', label: 'Department Manager' },
];

const orgRoleLabelMap = orgRoleOptions.reduce<Record<string, string>>((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

const allowedLeaderRoles: Record<string, string[]> = {
  FRONTLINE: ['SHIFT_LEADER', 'GROUP_LEADER', 'TEAM_LEADER', 'DEPT_MANAGER'],
  SHIFT_LEADER: ['GROUP_LEADER', 'TEAM_LEADER', 'DEPT_MANAGER'],
  GROUP_LEADER: ['TEAM_LEADER', 'DEPT_MANAGER'],
  TEAM_LEADER: ['DEPT_MANAGER'],
  DEPT_MANAGER: [],
};

interface CreateEmployeeFormValues {
  employeeCode: string;
  employeeName: string;
  departmentId?: number | null;
  primaryTeamId?: number | null;
  primaryRoleId?: number | null;
  employmentStatus?: string;
  shopfloorBaselinePct?: number | null;
  shopfloorUpperPct?: number | null;
  orgRole?: string;
  directLeaderId?: number | null;
}

interface FlatUnit {
  node: OrgUnitNode;
  path: string[];
}

interface UnavailabilityRow {
  id?: number;
  employeeId: number;
  employeeName: string;
  start: string;
  end: string;
  reasonCode: string;
  reasonLabel: string;
  category?: string | null;
  notes?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface UnavailabilityFormValues {
  employeeId?: number;
  dateRange?: [Dayjs, Dayjs];
  reasonCode?: string;
  reasonLabel?: string;
  category?: string | null;
  notes?: string | null;
}

const OrganizationWorkbench: React.FC = () => {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [structure, setStructure] = useState<OrgHierarchyResponse | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [unavailability, setUnavailability] = useState<EmployeeUnavailability[]>([]);
  const [roles, setRoles] = useState<EmployeeRole[]>([]);
  const [loadingStructure, setLoadingStructure] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [loadingUnavailability, setLoadingUnavailability] = useState(false);
  const [unavailabilityDrawerVisible, setUnavailabilityDrawerVisible] = useState(false);
  const [createEmployeeVisible, setCreateEmployeeVisible] = useState(false);
  const [createEmployeeSubmitting, setCreateEmployeeSubmitting] = useState(false);
  const [createForm] = Form.useForm<CreateEmployeeFormValues>();
  const [editEmployeeVisible, setEditEmployeeVisible] = useState(false);
  const [editEmployeeSubmitting, setEditEmployeeSubmitting] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [originalLeaderId, setOriginalLeaderId] = useState<number | null>(null);
  const [editForm] = Form.useForm<CreateEmployeeFormValues & { directLeaderId?: number | null }>();
  const [manageOrgVisible, setManageOrgVisible] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [departmentSubmitting, setDepartmentSubmitting] = useState(false);
  const [departmentForm] = Form.useForm<{ deptCode?: string; deptName?: string; parentId?: number | null }>();
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [teamSubmitting, setTeamSubmitting] = useState(false);
  const [teamForm] = Form.useForm<{ teamCode?: string; teamName?: string; departmentId?: number; description?: string | null }>();
  const [deletingEmployeeId, setDeletingEmployeeId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'employees' | 'unavailability'>('employees');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [unavailabilityKeyword, setUnavailabilityKeyword] = useState('');
  const [unavailabilityDateRange, setUnavailabilityDateRange] = useState<[Dayjs | null, Dayjs | null]>([
    null,
    null,
  ]);
  const [unavailabilityModalVisible, setUnavailabilityModalVisible] = useState(false);
  const [unavailabilitySubmitting, setUnavailabilitySubmitting] = useState(false);
  const [editingUnavailabilityRecord, setEditingUnavailabilityRecord] = useState<UnavailabilityRow | null>(null);
  const [unavailabilityForm] = Form.useForm<UnavailabilityFormValues>();

  const refreshStructure = async () => {
    setLoadingStructure(true);
    try {
      const data = await organizationStructureApi.getTree();
      setStructure(data);
    } catch (error) {
      console.error('[OrganizationWorkbench] load structure failed', error);
    } finally {
      setLoadingStructure(false);
    }
  };

  const refreshEmployees = async () => {
    setLoadingEmployees(true);
    try {
      const res = await employeeApi.getAll();
      const normalized = (res.data || []).map((item: any) => ({
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
      })) as Employee[];
      setEmployees(normalized);
    } catch (error) {
      console.error('[OrganizationWorkbench] load employees failed', error);
    } finally {
      setLoadingEmployees(false);
    }
  };

  const refreshOrgMetadata = async () => {
    try {
      const [deptData, teamData, roleData] = await Promise.all([
        organizationApi.getDepartments(),
        organizationApi.getTeams(),
        organizationApi.getRoles(),
      ]);
      const normalizedDepartments = (deptData || []).map((item: any) => {
        const metadata =
          item.metadata && typeof item.metadata === 'string'
            ? (() => {
                try {
                  return JSON.parse(item.metadata);
                } catch (err) {
                  console.warn('[OrganizationWorkbench] failed to parse department metadata', err);
                  return null;
                }
              })()
            : item.metadata ?? null;
        const descriptionFromMetadata =
          metadata && typeof metadata.description === 'string'
            ? metadata.description
            : null;
        return {
          id: item.id,
          parent_id: item.parent_id ?? item.parentId ?? null,
          parentId: item.parentId ?? item.parent_id ?? null,
          unit_code: item.unit_code ?? item.unitCode ?? item.dept_code ?? item.deptCode ?? null,
          unitCode: item.unitCode ?? item.unit_code ?? item.deptCode ?? item.dept_code ?? null,
          unit_name: item.unit_name ?? item.unitName ?? item.dept_name ?? item.deptName ?? '',
          unitName: item.unitName ?? item.unit_name ?? item.deptName ?? item.dept_name ?? '',
          dept_code: item.dept_code ?? item.deptCode ?? item.unit_code ?? item.unitCode ?? null,
          deptCode: item.deptCode ?? item.dept_code ?? item.unitCode ?? item.unit_code ?? null,
          dept_name: item.dept_name ?? item.deptName ?? item.unit_name ?? item.unitName ?? '',
          deptName: item.deptName ?? item.dept_name ?? item.unitName ?? item.unit_name ?? '',
          description: item.description ?? descriptionFromMetadata ?? null,
          sort_order: item.sort_order ?? item.sortOrder ?? 0,
          sortOrder: item.sortOrder ?? item.sort_order ?? 0,
          is_active: item.is_active ?? item.isActive ?? 1,
          isActive: item.isActive ?? item.is_active ?? 1,
          metadata,
          created_at: item.created_at ?? item.createdAt ?? null,
          createdAt: item.createdAt ?? item.created_at ?? null,
          updated_at: item.updated_at ?? item.updatedAt ?? null,
          updatedAt: item.updatedAt ?? item.updated_at ?? null,
        };
      });
      const normalizedTeams = (teamData || []).map((item: any) => ({
        id: item.id,
        department_id:
          item.department_id ??
          item.departmentId ??
          (typeof item.parent_id === 'number' ? item.parent_id : item.parentId ?? null) ??
          (item.metadata && typeof item.metadata.departmentId === 'number'
            ? item.metadata.departmentId
            : null),
        departmentId:
          item.departmentId ??
          item.department_id ??
          (typeof item.parentId === 'number' ? item.parentId : item.parent_id ?? null) ??
          (item.metadata && typeof item.metadata.departmentId === 'number'
            ? item.metadata.departmentId
            : null),
        parent_id: item.parent_id ?? item.parentId ?? null,
        parentId: item.parentId ?? item.parent_id ?? null,
        unit_code: item.unit_code ?? item.unitCode ?? item.team_code ?? item.teamCode ?? null,
        unitCode: item.unitCode ?? item.unit_code ?? item.teamCode ?? item.team_code ?? null,
        unit_name: item.unit_name ?? item.unitName ?? item.team_name ?? item.teamName ?? '',
        unitName: item.unitName ?? item.unit_name ?? item.teamName ?? item.team_name ?? '',
        team_code: item.team_code ?? item.teamCode ?? item.unit_code ?? item.unitCode ?? null,
        teamCode: item.teamCode ?? item.team_code ?? item.unitCode ?? item.unit_code ?? null,
        team_name: item.team_name ?? item.teamName ?? item.unit_name ?? item.unitName ?? '',
        teamName: item.teamName ?? item.team_name ?? item.unitName ?? item.unit_name ?? '',
        description:
          item.description ??
          (item.metadata && typeof item.metadata.description === 'string'
            ? item.metadata.description
            : null),
        metadata:
          item.metadata && typeof item.metadata === 'string'
            ? (() => {
                try {
                  return JSON.parse(item.metadata);
                } catch (err) {
                  console.warn('[OrganizationWorkbench] failed to parse team metadata', err);
                  return null;
                }
              })()
            : item.metadata ?? null,
        is_active: item.is_active ?? item.isActive ?? 1,
        isActive: item.isActive ?? item.is_active ?? 1,
        default_shift_code: item.default_shift_code ?? item.defaultShiftCode ?? null,
        defaultShiftCode: item.defaultShiftCode ?? item.default_shift_code ?? null,
        departmentName: item.departmentName ?? null,
        created_at: item.created_at ?? item.createdAt ?? null,
        createdAt: item.createdAt ?? item.created_at ?? null,
        updated_at: item.updated_at ?? item.updatedAt ?? null,
        updatedAt: item.updatedAt ?? item.updated_at ?? null,
      }));
      setDepartments(normalizedDepartments);
      setTeams(normalizedTeams);
      setRoles(roleData || []);
    } catch (error) {
      console.warn('[OrganizationWorkbench] load org metadata failed', error);
    }
  };

  const refreshUnavailability = async () => {
    setLoadingUnavailability(true);
    try {
      const data = await organizationApi.getUnavailability();
      setUnavailability(data || []);
    } catch (error) {
      console.error('[OrganizationWorkbench] load unavailability failed', error);
    } finally {
      setLoadingUnavailability(false);
    }
  };

  useEffect(() => {
    refreshStructure();
    refreshEmployees();
    refreshOrgMetadata();
    refreshUnavailability();
  }, []);

  useEffect(() => {
    setTeamFilter('all');
  }, [departmentFilter]);

  const flattenUnits = (nodes: OrgUnitNode[], path: string[] = []): FlatUnit[] =>
    nodes.flatMap((node) => {
      const nextPath = [...path, node.unitName];
      const current: FlatUnit = { node, path: nextPath };
      const children = node.children?.length ? flattenUnits(node.children, nextPath) : [];
      return [current, ...children];
    });

  const flatUnits = useMemo<FlatUnit[]>(() => {
    if (!structure) {
      return [];
    }
    return flattenUnits(structure.units);
  }, [structure]);

  const employeeNameMap = useMemo(() => {
    const map = new Map<number, string>();
    employees.forEach((emp) => {
      if (emp.id !== undefined && emp.id !== null) {
        map.set(emp.id, emp.employee_name);
      }
    });
    return map;
  }, [employees]);

  const departmentNameMap = useMemo(() => {
    const map = new Map<number, string>();
    departments.forEach((dept) => {
      if (dept.id !== undefined) {
        map.set(dept.id, dept.deptName ?? dept.dept_name ?? '');
      }
    });
    return map;
  }, [departments]);

  const teamDepartmentMap = useMemo(() => {
    const map = new Map<number, number>();
    teams.forEach((team) => {
      if (team.id !== undefined) {
        const deptId = team.departmentId ?? team.department_id;
        if (typeof deptId === 'number') {
          map.set(team.id, deptId);
        }
      }
    });
    return map;
  }, [teams]);

  const filteredTeamOptions = useMemo(() => {
    if (departmentFilter === 'all') {
      return teams;
    }
    const targetDeptId = Number(departmentFilter);
    return teams.filter((team) => (team.departmentId ?? team.department_id) === targetDeptId);
  }, [departmentFilter, teams]);

  const normalizedUnavailability = useMemo<UnavailabilityRow[]>(() => {
    return (unavailability || []).map((item) => {
      const start = item.start_datetime ?? (item as unknown as { startDatetime?: string })?.startDatetime ?? '';
      const end = item.end_datetime ?? (item as unknown as { endDatetime?: string })?.endDatetime ?? '';
      const createdAt = item.created_at ?? (item as unknown as { createdAt?: string })?.createdAt ?? null;
      const updatedAt = item.updated_at ?? (item as unknown as { updatedAt?: string })?.updatedAt ?? null;
      return {
        id: item.id,
        employeeId: item.employee_id,
        employeeName: item.employeeName || employeeNameMap.get(item.employee_id) || `ID:${item.employee_id}`,
        start,
        end,
        reasonCode: item.reason_code,
        reasonLabel: item.reason_label,
        category: item.category ?? null,
        notes: item.notes ?? null,
        createdAt,
        updatedAt,
      };
    });
  }, [unavailability, employeeNameMap]);

  const summaryStats = useMemo(() => {
    const totalEmployees = employees.length;
    const unassigned = structure?.unassignedEmployees.length ?? 0;
    const upcoming = normalizedUnavailability.filter((item) => item.start && dayjs(item.start).isAfter(dayjs())).length;
    const activeUnits = flatUnits.filter((item) => item.node.isActive).length;
    const inactiveUnits = flatUnits.length - activeUnits;
    return {
      totalEmployees,
      unassigned,
      upcoming,
      activeUnits,
      inactiveUnits,
    };
  }, [employees, structure, normalizedUnavailability, flatUnits]);

  const handleDeleteEmployee = useCallback(
    async (record: Employee) => {
      if (!record?.id) {
        message.error('无法删除该人员：缺少人员ID');
        return;
      }
      try {
        setDeletingEmployeeId(record.id);
        await employeeApi.delete(record.id);
        if (editingEmployee?.id === record.id) {
          setEditEmployeeVisible(false);
          setEditingEmployee(null);
          setOriginalLeaderId(null);
        }
        message.success(`已删除 ${record.employee_name}`);
        await refreshEmployees();
        refreshStructure();
      } catch (error) {
        console.error('Failed to delete employee', error);
        message.error('删除人员失败，请稍后重试');
      } finally {
        setDeletingEmployeeId(null);
      }
    },
    [editingEmployee, refreshEmployees, refreshStructure],
  );

  const employeeColumns = useMemo<ColumnsType<Employee>>(
    () => [
      {
        title: 'Name',
        dataIndex: 'employee_name',
        key: 'employee_name',
        width: 160,
        ellipsis: true,
        sorter: (a, b) => a.employee_name.localeCompare(b.employee_name),
        sortDirections: ['ascend', 'descend'],
      },
      {
        title: 'Employee Code',
        dataIndex: 'employee_code',
        key: 'employee_code',
        width: 140,
        ellipsis: true,
        sorter: (a, b) => String(a.employee_code).localeCompare(String(b.employee_code)),
        sortDirections: ['ascend', 'descend'],
      },
      {
        title: 'Role',
        dataIndex: 'org_role',
        key: 'org_role',
        width: 160,
        ellipsis: true,
        sorter: (a, b) => (a.org_role ?? '').localeCompare(b.org_role ?? ''),
        render: (value: string) => orgRoleLabelMap[value] || value || '-',
      },
      {
        title: 'Direct Leader',
        key: 'direct_leaders',
        width: 200,
        render: (_: unknown, record: Employee) => {
          const leaderIds = record.direct_leader_ids ?? record.directLeaderIds ?? [];
          if (!leaderIds.length) {
            return '-';
          }
          const names = leaderIds
            .map((id) => employeeNameMap.get(id) || `ID:${id}`)
            .filter(Boolean);
          return names.length ? names.join(' / ') : '-';
        },
      },
      {
        title: 'Team',
        dataIndex: 'primary_team_name',
        key: 'primary_team_name',
        width: 180,
        ellipsis: true,
        sorter: (a, b) =>
          (a.primary_team_name ?? a.primaryTeamName ?? '').localeCompare(
            b.primary_team_name ?? b.primaryTeamName ?? '',
          ),
        render: (_: unknown, record: Employee) =>
          record.primary_team_name || record.primaryTeamName || '-',
      },
      {
        title: 'Department',
        dataIndex: 'department_name',
        key: 'department_name',
        width: 180,
        ellipsis: true,
        sorter: (a, b) =>
          (a.department_name ?? a.departmentName ?? '').localeCompare(
            b.department_name ?? b.departmentName ?? '',
          ),
        render: (_: unknown, record: Employee) => {
          const deptId =
            record.department_id ?? record.departmentId ?? null;
          if (!deptId) {
            return '-';
          }
          return departmentNameMap.get(deptId) || record.department_name || record.departmentName || '-';
        },
      },
      {
        title: '操作',
        key: 'actions',
        width: 120,
        fixed: 'right',
        render: (_: unknown, record: Employee) => (
          <Popconfirm
            title="确认删除该人员？"
            description={`删除后无法恢复：${record.employee_name}`}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true, loading: deletingEmployeeId === record.id }}
            onConfirm={(e) => {
              e?.stopPropagation?.();
              handleDeleteEmployee(record);
            }}
            onCancel={(e) => e?.stopPropagation?.()}
          >
            <Button type="link" danger onClick={(e) => e.stopPropagation()}>
              删除
            </Button>
          </Popconfirm>
        ),
      },
    ],
    [employeeNameMap, departmentNameMap, deletingEmployeeId, handleDeleteEmployee],
  );

  const openEditEmployeeModal = (record: Employee) => {
    setEditingEmployee(record);
    const leaderIds = record.direct_leader_ids ?? record.directLeaderIds ?? [];
    const currentLeaderId = leaderIds.length ? leaderIds[0] : null;
    setOriginalLeaderId(currentLeaderId);
    const mappedDepartmentId =
      record.primary_team_id && teamDepartmentMap.has(record.primary_team_id)
        ? teamDepartmentMap.get(record.primary_team_id) ?? null
        : record.department_id ?? record.departmentId ?? null;
    editForm.setFieldsValue({
      employeeCode: record.employee_code,
      employeeName: record.employee_name,
      departmentId: mappedDepartmentId,
      primaryTeamId: record.primary_team_id ?? record.primaryTeamId ?? null,
      primaryRoleId: record.primary_role_id ?? record.primaryRoleId ?? null,
      employmentStatus: record.employment_status ?? record.employmentStatus ?? 'ACTIVE',
      shopfloorBaselinePct: record.shopfloor_baseline_pct ?? record.shopfloorBaselinePct ?? null,
      shopfloorUpperPct: record.shopfloor_upper_pct ?? record.shopfloorUpperPct ?? null,
      orgRole: record.org_role ?? record.orgRole ?? 'FRONTLINE',
      directLeaderId: currentLeaderId ?? undefined,
    });
    setEditEmployeeVisible(true);
  };

  const updateLeaderAssignment = async (
    employeeId: number,
    nextLeaderId: number | null,
    prevLeaderId: number | null,
  ) => {
    const updateLeader = async (leaderId: number, updater: (ids: number[]) => number[]) => {
      const info = await employeeApi.getReporting(leaderId);
      const current = Array.isArray(info?.directReportIds) ? info.directReportIds.map(Number) : [];
      const updated = updater(current);
      await employeeApi.updateReporting(leaderId, { directReportIds: updated });
    };

    if (prevLeaderId && prevLeaderId !== nextLeaderId) {
      await updateLeader(prevLeaderId, (ids) => ids.filter((id) => id !== employeeId));
    }

    if (nextLeaderId && nextLeaderId !== prevLeaderId) {
      await updateLeader(nextLeaderId, (ids) => {
        const set = new Set(ids);
        set.add(employeeId);
        return Array.from(set);
      });
    }
  };

  const handleEditEmployee = async (values: CreateEmployeeFormValues & { directLeaderId?: number | null }) => {
    if (!editingEmployee?.id) {
      return;
    }

    const selectedOrgRole = (values.orgRole ?? editingEmployee.org_role ?? editingEmployee.orgRole ?? 'FRONTLINE') as string;
    const allowedRoles = allowedLeaderRoles[selectedOrgRole];
    const newLeaderId = values.directLeaderId ?? null;

    if (Array.isArray(allowedRoles) && !allowedRoles.length && newLeaderId) {
      message.error('当前角色不允许配置 Direct Leader');
      return;
    }

    if (newLeaderId) {
      const leader = employees.find((emp) => emp.id === newLeaderId);
      if (!leader) {
        message.error('所选 Direct Leader 不存在');
        return;
      }
      const leaderRole = (leader.org_role ?? leader.orgRole ?? '') as string;
      if (Array.isArray(allowedRoles) && allowedRoles.length && !allowedRoles.includes(leaderRole)) {
        const allowedRoleLabels = allowedRoles
          .map((role) => orgRoleLabelMap[role] ?? role)
          .join('、');
        message.error(
          allowedRoleLabels
            ? `当前角色的 Direct Leader 仅限：${allowedRoleLabels}`
            : '所选 Direct Leader 不符合角色层级要求',
        );
        return;
      }
    }

    try {
      setEditEmployeeSubmitting(true);
      const derivedDepartmentId = values.primaryTeamId
        ? teamDepartmentMap.get(values.primaryTeamId) ?? null
        : values.departmentId ?? editingEmployee.department_id ?? editingEmployee.departmentId ?? null;

      await employeeApi.update(editingEmployee.id, {
        employeeCode: values.employeeCode,
        employeeName: values.employeeName,
        departmentId: derivedDepartmentId,
        primaryTeamId: values.primaryTeamId ?? null,
        primaryRoleId: values.primaryRoleId ?? null,
        employmentStatus: values.employmentStatus ?? 'ACTIVE',
        shopfloorBaselinePct: values.shopfloorBaselinePct ?? null,
        shopfloorUpperPct: values.shopfloorUpperPct ?? null,
        orgRole: values.orgRole ?? 'FRONTLINE',
      });

      if (newLeaderId !== originalLeaderId) {
        await updateLeaderAssignment(editingEmployee.id, newLeaderId, originalLeaderId ?? null);
      }

      message.success('人员信息已更新');
      setEditEmployeeVisible(false);
      refreshEmployees();
    } catch (error) {
      console.error('Failed to update employee', error);
      message.error('更新人员信息失败');
    } finally {
      setEditEmployeeSubmitting(false);
    }
  };

  const filteredEmployeesForTable = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();

    return employees.filter((employee) => {
      if (departmentFilter !== 'all') {
        if ((employee.department_id ?? employee.departmentId) !== Number(departmentFilter)) {
          return false;
        }
      }

      if (teamFilter !== 'all') {
        if ((employee.primary_team_id ?? employee.primaryTeamId) !== Number(teamFilter)) {
          return false;
        }
      }

      if (roleFilter !== 'all') {
        const role = employee.org_role ?? employee.orgRole ?? '';
        if (role !== roleFilter) {
          return false;
        }
      }

      if (!keyword) {
        return true;
      }

      return (
        employee.employee_name.toLowerCase().includes(keyword) ||
        String(employee.employee_code).toLowerCase().includes(keyword) ||
        (employee.department_name && employee.department_name.toLowerCase().includes(keyword)) ||
        (employee.primary_team_name && employee.primary_team_name.toLowerCase().includes(keyword))
      );
    });
  }, [employees, searchKeyword, departmentFilter, teamFilter, roleFilter]);

  const filteredUnavailability = useMemo(() => {
    const keyword = unavailabilityKeyword.trim().toLowerCase();
    const [rangeStart, rangeEnd] = unavailabilityDateRange;

    return normalizedUnavailability.filter((record) => {
      if (keyword) {
        const haystack = [
          record.employeeName,
          record.reasonLabel,
          record.reasonCode,
          record.category ?? '',
          record.notes ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(keyword)) {
          return false;
        }
      }

      if (rangeStart && dayjs(record.start).isBefore(rangeStart, 'minute')) {
        return false;
      }
      if (rangeEnd && dayjs(record.end).isAfter(rangeEnd, 'minute')) {
        return false;
      }

      return true;
    });
  }, [normalizedUnavailability, unavailabilityKeyword, unavailabilityDateRange]);

  const openCreateUnavailabilityModal = useCallback(() => {
    setEditingUnavailabilityRecord(null);
    unavailabilityForm.resetFields();
    setUnavailabilityModalVisible(true);
  }, [unavailabilityForm]);

  const openEditUnavailabilityModal = useCallback(
    (record: UnavailabilityRow) => {
      setEditingUnavailabilityRecord(record);
      unavailabilityForm.setFieldsValue({
        employeeId: record.employeeId,
        dateRange:
          record.start && record.end
            ? ([dayjs(record.start), dayjs(record.end)] as [Dayjs, Dayjs])
            : undefined,
        reasonCode: record.reasonCode,
        reasonLabel: record.reasonLabel,
        category: record.category ?? undefined,
        notes: record.notes ?? undefined,
      });
      setUnavailabilityModalVisible(true);
    },
    [unavailabilityForm],
  );

  const handleUnavailabilitySubmit = useCallback(async () => {
    try {
      const values = await unavailabilityForm.validateFields();
      if (!values.employeeId) {
        message.warning('请选择员工');
        return;
      }
      if (!values.dateRange || values.dateRange.length !== 2) {
        message.warning('请选择起止时间');
        return;
      }

      const [start, end] = values.dateRange;
      const payload = {
        employeeId: values.employeeId,
        startDatetime: start.toISOString(),
        endDatetime: end.toISOString(),
        reasonCode: values.reasonCode?.trim() || values.reasonLabel?.trim() || 'UNAVAILABLE',
        reasonLabel: values.reasonLabel?.trim() || values.reasonCode?.trim() || '不可用',
        category: values.category?.trim() || undefined,
        notes: values.notes?.trim() || undefined,
      };

      setUnavailabilitySubmitting(true);
      if (editingUnavailabilityRecord?.id) {
        await organizationApi.updateUnavailability(editingUnavailabilityRecord.id, payload);
        message.success('不可用记录已更新');
      } else {
        await organizationApi.createUnavailability(payload);
        message.success('不可用记录已新增');
      }
      setUnavailabilityModalVisible(false);
      setEditingUnavailabilityRecord(null);
      unavailabilityForm.resetFields();
      refreshUnavailability();
    } catch (error: any) {
      if (error?.errorFields) {
        return;
      }
      console.error('Failed to save unavailability', error);
      message.error('保存不可用记录失败');
    } finally {
      setUnavailabilitySubmitting(false);
    }
  }, [editingUnavailabilityRecord, refreshUnavailability, unavailabilityForm]);

  const handleDeleteUnavailability = useCallback(
    async (record: UnavailabilityRow) => {
      if (!record.id) {
        message.error('无法删除该记录：缺少ID');
        return;
      }
      try {
        await organizationApi.deleteUnavailability(record.id);
        message.success('不可用记录已删除');
        refreshUnavailability();
      } catch (error) {
        console.error('Failed to delete unavailability', error);
        message.error('删除不可用记录失败');
      }
    },
    [refreshUnavailability],
  );

  const unavailabilityColumns = useMemo<ColumnsType<UnavailabilityRow>>(
    () => [
      {
        title: '员工',
        dataIndex: 'employeeName',
        key: 'employeeName',
        width: 180,
        ellipsis: true,
        sorter: (a, b) => a.employeeName.localeCompare(b.employeeName),
      },
      {
        title: '开始时间',
        dataIndex: 'start',
        key: 'start',
        width: 200,
        ellipsis: true,
        sorter: (a, b) => dayjs(a.start).valueOf() - dayjs(b.start).valueOf(),
        render: (value: string) => (value ? dayjs(value).format('YYYY/MM/DD HH:mm') : '-'),
      },
      {
        title: '结束时间',
        dataIndex: 'end',
        key: 'end',
        width: 200,
        ellipsis: true,
        sorter: (a, b) => dayjs(a.end).valueOf() - dayjs(b.end).valueOf(),
        render: (value: string) => (value ? dayjs(value).format('YYYY/MM/DD HH:mm') : '-'),
      },
      {
        title: '原因',
        dataIndex: 'reasonLabel',
        key: 'reasonLabel',
        width: 180,
        ellipsis: true,
        sorter: (a, b) => a.reasonLabel.localeCompare(b.reasonLabel),
      },
      {
        title: '类型',
        dataIndex: 'category',
        key: 'category',
        width: 140,
        ellipsis: true,
        sorter: (a, b) => (a.category ?? '').localeCompare(b.category ?? ''),
        render: (value: string | null | undefined) => value || '-',
      },
      {
        title: '备注',
        dataIndex: 'notes',
        key: 'notes',
        ellipsis: true,
        render: (value: string | null | undefined) => value || '-',
      },
      {
        title: '操作',
        key: 'actions',
        width: 160,
        fixed: 'right',
        render: (_: unknown, record: UnavailabilityRow) => (
          <Space size="small">
            <Button type="link" onClick={() => openEditUnavailabilityModal(record)}>
              编辑
            </Button>
            <Popconfirm
              title="删除不可用记录"
              description="确认删除该不可用记录吗？"
              okText="删除"
              cancelText="取消"
              onConfirm={() => handleDeleteUnavailability(record)}
            >
              <Button type="link" danger>
                删除
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [openEditUnavailabilityModal, handleDeleteUnavailability],
  );

  const upcomingUnavailability = useMemo(() => {
    return normalizedUnavailability
      .filter((item) => item.end && dayjs(item.end).isAfter(dayjs().subtract(1, 'day')))
      .sort((a, b) => dayjs(a.start).diff(dayjs(b.start)));
  }, [normalizedUnavailability]);

  const renderTableView = () => (
    <Table<Employee>
      className="fluent-table"
      rowKey={(record) => record.id ?? `${record.employee_code}`}
      dataSource={filteredEmployeesForTable}
      columns={employeeColumns}
      loading={loadingEmployees}
      pagination={{ pageSize: 10, showTotal: (total) => `共 ${total} 人`, position: ['bottomCenter'] }}
      size="middle"
      scroll={{ x: true, y: 520 }}
      onRow={(record) => ({
        onClick: () => openEditEmployeeModal(record),
        style: { cursor: 'pointer' },
      })}
    />
  );

  const renderEmployeesTab = () => (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          width: '100%',
        }}
      >
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索姓名 / 工号 / 部门 / 班组"
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          style={{ flex: '1 1 220px', minWidth: 200 }}
        />
        <Select
          value={departmentFilter}
          onChange={(value) => setDepartmentFilter(value)}
          style={{ width: 180 }}
        >
          <Option value="all">全部部门</Option>
          {departments
            .filter((dept) => typeof dept.id === 'number')
            .map((dept) => (
              <Option key={dept.id} value={`${dept.id}`}>
                {dept.deptName ?? dept.dept_name}
              </Option>
            ))}
        </Select>
        <Select
          value={teamFilter}
          onChange={(value) => setTeamFilter(value)}
          style={{ width: 180 }}
          placeholder="班组"
        >
          <Option value="all">全部班组</Option>
          {filteredTeamOptions
            .filter((team) => typeof team.id === 'number')
            .map((team) => (
              <Option key={team.id} value={`${team.id}`}>
                {team.teamName ?? team.team_name}
              </Option>
            ))}
        </Select>
        <Select
          value={roleFilter}
          onChange={(value) => setRoleFilter(value)}
          style={{ width: 180 }}
        >
          <Option value="all">全部角色</Option>
          {orgRoleOptions.map((option) => (
            <Option key={option.value} value={option.value}>
              {option.label}
            </Option>
          ))}
        </Select>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => {
            refreshStructure();
            refreshEmployees();
            refreshOrgMetadata();
            refreshUnavailability();
          }}
        >
          刷新
        </Button>
      </div>
      {renderTableView()}
    </Space>
  );

  const renderUnavailabilityTab = () => (
    <Card bordered={false}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            width: '100%',
          }}
        >
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索员工 / 原因 / 备注"
            value={unavailabilityKeyword}
            onChange={(e) => setUnavailabilityKeyword(e.target.value)}
            style={{ flex: '1 1 240px', minWidth: 220 }}
          />
          <RangePicker
            showTime
            value={unavailabilityDateRange}
            onChange={(values) => setUnavailabilityDateRange(values ?? [null, null])}
            allowClear
            style={{ flex: '0 1 280px', minWidth: 240 }}
          />
          <Space style={{ flexWrap: 'wrap' }}>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                refreshUnavailability();
                refreshEmployees();
              }}
            >
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateUnavailabilityModal}>
              新增记录
            </Button>
            <Button type="link" icon={<CalendarOutlined />} onClick={() => setUnavailabilityDrawerVisible(true)}>
              查看近期
            </Button>
          </Space>
        </div>
        <Table<UnavailabilityRow>
          rowKey={(record) => String(record.id ?? `${record.employeeId}-${record.start}`)}
          dataSource={filteredUnavailability}
          columns={unavailabilityColumns}
          loading={loadingUnavailability}
          pagination={{ pageSize: 10, showTotal: (total) => `共 ${total} 条`, position: ['bottomCenter'] }}
          size="middle"
          scroll={{ x: true, y: 520 }}
        />
      </Space>
    </Card>
  );

  const openCreateEmployeeModal = () => {
    createForm.resetFields();
    createForm.setFieldsValue({ employmentStatus: 'ACTIVE', orgRole: 'FRONTLINE' });
    setCreateEmployeeVisible(true);
  };

  const handleCreateEmployee = async (values: CreateEmployeeFormValues) => {
    try {
      setCreateEmployeeSubmitting(true);
      const derivedDepartmentId = values.primaryTeamId
        ? teamDepartmentMap.get(values.primaryTeamId) ?? values.departmentId ?? null
        : values.departmentId ?? null;
      await employeeApi.create({
        employeeCode: values.employeeCode,
        employeeName: values.employeeName,
        departmentId: derivedDepartmentId,
        primaryTeamId: values.primaryTeamId ?? null,
        primaryRoleId: values.primaryRoleId ?? null,
        employmentStatus: values.employmentStatus ?? 'ACTIVE',
        shopfloorBaselinePct: values.shopfloorBaselinePct ?? null,
        shopfloorUpperPct: values.shopfloorUpperPct ?? null,
        orgRole: values.orgRole ?? 'FRONTLINE',
      });
      message.success('新增人员成功');
      setCreateEmployeeVisible(false);
      refreshEmployees();
    } catch (error) {
      console.error('Failed to create employee', error);
      message.error('新增人员失败，请检查工号是否重复');
    } finally {
      setCreateEmployeeSubmitting(false);
    }
  };
  const openManageOrgModal = () => {
    setEditingDepartment(null);
    setEditingTeam(null);
    departmentForm.resetFields();
    teamForm.resetFields();
    setManageOrgVisible(true);
  };

  const startEditDepartment = (dept: Department) => {
    setEditingDepartment(dept);
    departmentForm.setFieldsValue({
      deptCode:
        dept.deptCode ??
        dept.dept_code ??
        dept.unitCode ??
        dept.unit_code ??
        undefined,
      deptName:
        dept.deptName ??
        dept.dept_name ??
        dept.unitName ??
        dept.unit_name ??
        undefined,
      parentId: dept.parentId ?? dept.parent_id ?? null,
    });
  };

  const handleDepartmentCancel = () => {
    setEditingDepartment(null);
    departmentForm.resetFields();
  };

  const handleDepartmentSubmit = async (values: { deptCode?: string; deptName?: string; parentId?: number | null }) => {
    if (!values.deptCode || !values.deptName) {
      message.warning('请填写 Department Code 和 Name');
      return;
    }
    try {
      setDepartmentSubmitting(true);
      if (editingDepartment?.id) {
        await organizationApi.updateDepartment(editingDepartment.id, {
          deptCode: values.deptCode.trim(),
          deptName: values.deptName.trim(),
          parentId: values.parentId ?? null,
        });
        message.success('Department updated');
      } else {
        await organizationApi.createDepartment({
          deptCode: values.deptCode.trim(),
          deptName: values.deptName.trim(),
          parentId: values.parentId ?? null,
        });
        message.success('Department created');
      }
      handleDepartmentCancel();
      refreshOrgMetadata();
    } catch (error) {
      console.error('Failed to save department', error);
      message.error('保存 Department 失败，请检查编码是否重复');
    } finally {
      setDepartmentSubmitting(false);
    }
  };

  const handleDeleteDepartment = async (dept: Department) => {
    if (!dept.id) {
      return;
    }
    try {
      await organizationApi.deleteDepartment(dept.id);
      message.success('Department deleted');
      refreshOrgMetadata();
    } catch (error) {
      console.error('Failed to delete department', error);
      message.error('删除 Department 失败，可能仍有关联 Team');
    }
  };

  const startEditTeam = (team: Team) => {
    setEditingTeam(team);
    teamForm.setFieldsValue({
      teamCode:
        team.teamCode ??
        team.team_code ??
        team.unitCode ??
        team.unit_code ??
        undefined,
      teamName:
        team.teamName ??
        team.team_name ??
        team.unitName ??
        team.unit_name ??
        undefined,
      departmentId:
        (team.departmentId ??
          team.department_id ??
          (typeof team.parentId === 'number'
            ? team.parentId
            : typeof team.parent_id === 'number'
            ? team.parent_id
            : undefined)) ?? undefined,
      description:
        team.description ??
        (team.metadata && typeof team.metadata.description === 'string'
          ? (team.metadata.description as string)
          : null),
    });
  };

  const handleTeamCancel = () => {
    setEditingTeam(null);
    teamForm.resetFields();
  };

  const handleTeamSubmit = async (values: { teamCode?: string; teamName?: string; departmentId?: number; description?: string | null }) => {
    if (!values.teamCode || !values.teamName || !values.departmentId) {
      message.warning('请填写 Team Code/Name，并选择 Department');
      return;
    }
    try {
      setTeamSubmitting(true);
      if (editingTeam?.id) {
        await organizationApi.updateTeam(editingTeam.id, {
          teamCode: values.teamCode.trim(),
          teamName: values.teamName.trim(),
          departmentId: values.departmentId,
          description: values.description ?? null,
        });
        message.success('Team updated');
      } else {
        await organizationApi.createTeam({
          teamCode: values.teamCode.trim(),
          teamName: values.teamName.trim(),
          departmentId: values.departmentId,
          description: values.description ?? null,
        });
        message.success('Team created');
      }
      handleTeamCancel();
      refreshOrgMetadata();
    } catch (error) {
      console.error('Failed to save team', error);
      message.error('保存 Team 失败，请检查编码是否重复');
    } finally {
      setTeamSubmitting(false);
    }
  };

  const handleDeleteTeam = async (team: Team) => {
    if (!team.id) {
      return;
    }
    try {
      await organizationApi.deleteTeam(team.id);
      message.success('Team deleted');
      refreshOrgMetadata();
    } catch (error) {
      console.error('Failed to delete team', error);
      message.error('删除 Team 失败，可能仍有关联人员');
    }
  };

  const departmentColumns = useMemo(
    () => [
      {
        title: 'Code',
        dataIndex: 'deptCode',
        key: 'deptCode',
      },
      {
        title: 'Name',
        dataIndex: 'deptName',
        key: 'deptName',
      },
      {
        title: 'Parent Department',
        dataIndex: 'parentId',
        key: 'parentId',
        render: (parentId: number | null) => {
          if (!parentId) {
            return '-';
          }
          const parent = departments.find((dept) => dept.id === parentId);
          return parent ? parent.deptName ?? parent.dept_name ?? '-' : '-';
        },
      },
      {
        title: 'Actions',
        key: 'actions',
        render: (_: unknown, record: Department) => (
          <Space size="small">
            <Button type="link" onClick={() => startEditDepartment(record)}>
              Edit
            </Button>
            <Popconfirm
              title="Delete Department"
              description="确认删除该 Department 吗？"
              onConfirm={() => handleDeleteDepartment(record)}
              okText="Yes"
              cancelText="No"
            >
              <Button type="link" danger>
                Delete
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [departments],
  );

  const teamColumns = useMemo(
    () => [
      {
        title: 'Code',
        dataIndex: 'teamCode',
        key: 'teamCode',
      },
      {
        title: 'Name',
        dataIndex: 'teamName',
        key: 'teamName',
      },
      {
        title: 'Department',
        dataIndex: 'departmentId',
        key: 'departmentId',
        render: (deptId: number) => departmentNameMap.get(deptId) || '-',
      },
      {
        title: 'Actions',
        key: 'actions',
        render: (_: unknown, record: Team) => (
          <Space size="small">
            <Button type="link" onClick={() => startEditTeam(record)}>
              Edit
            </Button>
            <Popconfirm
              title="Delete Team"
              description="确认删除该 Team 吗？"
              onConfirm={() => handleDeleteTeam(record)}
              okText="Yes"
              cancelText="No"
            >
              <Button type="link" danger>
                Delete
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [departmentNameMap],
  );

  return (
    <div style={{ padding: '0 24px 24px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <Typography.Title level={4} style={{ margin: 0 }}>
          组织与人员总览
        </Typography.Title>
        <Space>
          <Button onClick={openManageOrgModal}>Manage Departments / Teams</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateEmployeeModal}>
            新增人员
          </Button>
        </Space>
      </div>

      <Card
        bordered={false}
        style={{ marginBottom: 24 }}
        bodyStyle={{ padding: '24px 24px 8px' }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 16,
          }}
        >
          <Card size="small">
            <Statistic title="人员总数" value={summaryStats.totalEmployees} prefix={<UserOutlined />} />
          </Card>
          <Card size="small">
            <Statistic title="未分配人员" value={summaryStats.unassigned} prefix={<ExclamationCircleOutlined />} />
          </Card>
          <Card size="small">
            <Statistic title="启用单元" value={summaryStats.activeUnits} prefix={<ApartmentOutlined />} />
          </Card>
          <Card size="small">
            <Statistic
              title="禁用单元"
              value={summaryStats.inactiveUnits}
              prefix={<ApartmentOutlined />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
          <Card size="small">
            <Statistic title="即将不可用" value={summaryStats.upcoming} prefix={<CalendarOutlined />} />
          </Card>
        </div>
      </Card>

      <Card bordered={false} bodyStyle={{ padding: 0 }}>
        <Tabs
          tabBarGutter={32}
          size="large"
          tabBarStyle={{ padding: '0 24px' }}
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'employees' | 'unavailability')}
          items={[
            {
              key: 'employees',
              label: '人员列表',
              children: <div style={{ padding: '24px' }}>{renderEmployeesTab()}</div>,
            },
            {
              key: 'unavailability',
              label: '不可用提醒',
              children: <div style={{ padding: '24px' }}>{renderUnavailabilityTab()}</div>,
            },
          ]}
        />
      </Card>

      <Modal
        title={editingUnavailabilityRecord ? '编辑不可用记录' : '新增不可用记录'}
        open={unavailabilityModalVisible}
        okText="保存"
        cancelText="取消"
        confirmLoading={unavailabilitySubmitting}
        onCancel={() => {
          setUnavailabilityModalVisible(false);
          setEditingUnavailabilityRecord(null);
          unavailabilityForm.resetFields();
        }}
        onOk={handleUnavailabilitySubmit}
      >
        <Form form={unavailabilityForm} layout="vertical">
          <Form.Item name="employeeId" label="员工" rules={[{ required: true, message: '请选择员工' }]}> 
            <Select
              showSearch
              placeholder="请选择员工"
              optionFilterProp="children"
              filterOption={(input, option) => {
                const child = option?.children;
                let label = '';
                if (typeof child === 'string') {
                  label = child;
                } else if (Array.isArray(child)) {
                  label = child.join(' ');
                }
                return label ? label.toLowerCase().includes(input.toLowerCase()) : false;
              }}
            >
              {employees
                .filter((emp) => typeof emp.id === 'number')
                .map((emp) => (
                  <Option key={emp.id} value={emp.id!}>
                    {emp.employee_name}（{emp.employee_code}）
                  </Option>
                ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="dateRange"
            label="不可用时间"
            rules={[{ required: true, message: '请选择开始和结束时间' }]}
          >
            <RangePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="reasonLabel"
            label="原因描述"
            rules={[{ required: true, message: '请输入原因描述' }]}
          >
            <Input placeholder="例如：年假 / 培训" />
          </Form.Item>
          <Form.Item name="reasonCode" label="原因编码">
            <Input placeholder="可选，如：ANNUAL_LEAVE" />
          </Form.Item>
          <Form.Item name="category" label="类别">
            <Input placeholder="可选，如：休假 / 培训" />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <TextArea rows={3} placeholder="补充说明，可选" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        open={unavailabilityDrawerVisible}
        title="不可用日程"
        width={520}
        onClose={() => setUnavailabilityDrawerVisible(false)}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Button icon={<ReloadOutlined />} onClick={refreshUnavailability} disabled={loadingUnavailability}>
            刷新
          </Button>
          <List
            dataSource={upcomingUnavailability}
            locale={{ emptyText: '暂无记录' }}
            renderItem={(item) => (
              <List.Item>
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Typography.Text strong>
                    {item.employeeName} · {item.reasonLabel}
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    {dayjs(item.start).format('YYYY/MM/DD HH:mm')} - {dayjs(item.end).format('YYYY/MM/DD HH:mm')}
                  </Typography.Text>
                  {item.notes ? (
                    <Typography.Text type="secondary">备注：{item.notes}</Typography.Text>
                  ) : null}
                </Space>
              </List.Item>
            )}
          />
        </Space>
      </Drawer>

      <Modal
        title="新增人员"
        open={createEmployeeVisible}
        onCancel={() => setCreateEmployeeVisible(false)}
        onOk={() => createForm.submit()}
        okText="保存"
        cancelText="取消"
        confirmLoading={createEmployeeSubmitting}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreateEmployee}>
          <Form.Item
            label="Employee Code"
            name="employeeCode"
            rules={[{ required: true, message: '请输入工号' }]}
          >
            <Input placeholder="例如：EMP001" />
          </Form.Item>
          <Form.Item
            label="Employee Name"
            name="employeeName"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="请输入姓名" />
          </Form.Item>
          <Form.Item name="departmentId" hidden />
          <Form.Item shouldUpdate={(prev, next) => prev.primaryTeamId !== next.primaryTeamId || prev.departmentId !== next.departmentId || prev.primaryTeamId !== next.primaryTeamId}>
            {({ getFieldValue, setFieldsValue }) => {
              const teamId = getFieldValue('primaryTeamId');
              const currentDepartmentId = getFieldValue('departmentId');
              const derivedDeptId = teamId ? teamDepartmentMap.get(teamId) ?? currentDepartmentId : currentDepartmentId;
              if (derivedDeptId !== currentDepartmentId) {
                setFieldsValue({ departmentId: derivedDeptId ?? null });
              }
              const departmentName = derivedDeptId ? departmentNameMap.get(derivedDeptId) || '-' : '-';
              return (
                <Form.Item label="Department">
                  <Typography.Text>{departmentName || '-'}</Typography.Text>
                </Form.Item>
              );
            }}
          </Form.Item>
          <Form.Item label="Team" name="primaryTeamId">
            <Select placeholder="请选择 Team" allowClear>
              {teams.map((team) => (
                <Option key={team.id} value={team.id}>
                  {team.team_name}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="Primary Role" name="primaryRoleId">
            <Select placeholder="请选择 Primary Role" allowClear>
              {roles.map((role) => (
                <Option key={role.id} value={role.id}>
                  {role.role_name}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="Employment Status" name="employmentStatus">
            <Select placeholder="请选择 Employment Status">
              {employmentStatusOptions.map((option) => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="Org Role" name="orgRole">
            <Select placeholder="请选择 Org Role">
              {orgRoleOptions.map((option) => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="Shopfloor Baseline" name="shopfloorBaselinePct">
            <InputNumber style={{ width: '100%' }} min={0} max={1} step={0.01} placeholder="例如 0.60" />
          </Form.Item>
          <Form.Item label="Shopfloor Upper Limit" name="shopfloorUpperPct">
            <InputNumber style={{ width: '100%' }} min={0} max={1} step={0.01} placeholder="例如 0.90" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingEmployee ? `Edit Employee · ${editingEmployee.employee_name}` : 'Edit Employee'}
        open={editEmployeeVisible}
        onCancel={() => setEditEmployeeVisible(false)}
        onOk={() => editForm.submit()}
        okText="保存"
        cancelText="取消"
        confirmLoading={editEmployeeSubmitting}
      >
        <Form form={editForm} layout="vertical" onFinish={handleEditEmployee}>
          <Form.Item
            label="Employee Code"
            name="employeeCode"
            rules={[{ required: true, message: '请输入工号' }]}
          >
            <Input disabled />
          </Form.Item>
          <Form.Item
            label="Employee Name"
            name="employeeName"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="departmentId" hidden />
          <Form.Item shouldUpdate={(prev, next) => prev.primaryTeamId !== next.primaryTeamId || prev.departmentId !== next.departmentId}>
            {({ getFieldValue, setFieldsValue }) => {
              const teamId = getFieldValue('primaryTeamId');
              const currentDepartmentId = getFieldValue('departmentId');
              const derivedDeptId = teamId && teamDepartmentMap.has(teamId)
                ? teamDepartmentMap.get(teamId) ?? null
                : currentDepartmentId;
              if (derivedDeptId !== currentDepartmentId) {
                setFieldsValue({ departmentId: derivedDeptId ?? null });
              }
              const departmentName = derivedDeptId ? departmentNameMap.get(derivedDeptId) || '-' : '-';
              return (
                <Form.Item label="Department">
                  <Typography.Text>{departmentName || '-'}</Typography.Text>
                </Form.Item>
              );
            }}
          </Form.Item>
          <Form.Item label="Team" name="primaryTeamId">
            <Select placeholder="请选择 Team" allowClear>
              {teams.map((team) => (
                <Option key={team.id} value={team.id}>
                  {team.team_name}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="Primary Role" name="primaryRoleId">
            <Select placeholder="请选择 Primary Role" allowClear>
              {roles.map((role) => (
                <Option key={role.id} value={role.id}>
                  {role.role_name}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="Employment Status" name="employmentStatus">
            <Select placeholder="请选择 Employment Status">
              {employmentStatusOptions.map((option) => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="Org Role" name="orgRole">
            <Select placeholder="请选择 Org Role">
              {orgRoleOptions.map((option) => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, next) => prev.orgRole !== next.orgRole || prev.directLeaderId !== next.directLeaderId}
          >
            {({ getFieldValue, setFieldsValue }) => {
              const selectedOrgRole = (
                getFieldValue('orgRole') ??
                editingEmployee?.org_role ??
                editingEmployee?.orgRole ??
                'FRONTLINE'
              ) as string;
              const allowedRoles = allowedLeaderRoles[selectedOrgRole];
              const candidateLeaders = employees.filter((emp) => {
                if (!emp.id || emp.id === editingEmployee?.id) {
                  return false;
                }
                const leaderRole = (emp.org_role ?? emp.orgRole ?? 'FRONTLINE') as string;
                if (!allowedRoles) {
                  return true;
                }
                if (!allowedRoles.length) {
                  return false;
                }
                return allowedRoles.includes(leaderRole);
              });

              const currentLeaderId = getFieldValue('directLeaderId');
              if (currentLeaderId && !candidateLeaders.some((emp) => emp.id === currentLeaderId)) {
                setFieldsValue({ directLeaderId: undefined });
              }

              const disabled = Array.isArray(allowedRoles) && allowedRoles.length === 0;
              const notFoundContent = disabled ? '该角色无需配置 Direct Leader' : undefined;

              return (
                <Form.Item label="Direct Leader" name="directLeaderId">
                  <Select
                    placeholder="请选择 Direct Leader"
                    allowClear
                    disabled={disabled}
                    notFoundContent={notFoundContent}
                  >
                    {candidateLeaders.map((emp) => {
                      const leaderRole = (emp.org_role ?? emp.orgRole ?? '') as string;
                      const roleLabel = orgRoleLabelMap[leaderRole] ?? (leaderRole || '未知');
                      return (
                        <Option key={emp.id} value={emp.id!}>
                          {emp.employee_name}（{roleLabel}）
                        </Option>
                      );
                    })}
                  </Select>
                </Form.Item>
              );
            }}
          </Form.Item>
          <Form.Item label="Shopfloor Baseline" name="shopfloorBaselinePct">
            <InputNumber style={{ width: '100%' }} min={0} max={1} step={0.01} placeholder="例如 0.60" />
          </Form.Item>
          <Form.Item label="Shopfloor Upper Limit" name="shopfloorUpperPct">
            <InputNumber style={{ width: '100%' }} min={0} max={1} step={0.01} placeholder="例如 0.90" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Manage Departments / Teams"
        open={manageOrgVisible}
        onCancel={() => setManageOrgVisible(false)}
        footer={null}
        width={760}
        destroyOnClose
      >
        <Tabs
          defaultActiveKey="departments"
          items={[
            {
              key: 'departments',
              label: 'Departments',
              children: (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Table
                    rowKey={(record) => record.id ?? record.deptCode ?? String(Math.random())}
                    dataSource={departments}
                    columns={departmentColumns}
                    size="small"
                    pagination={false}
                  />
                  <Form form={departmentForm} layout="vertical" onFinish={handleDepartmentSubmit}>
                    <Form.Item
                      label="Department Code"
                      name="deptCode"
                      rules={[{ required: true, message: '请输入 Department Code' }]}
                    >
                      <Input placeholder="如：MFG" disabled={!!editingDepartment} />
                    </Form.Item>
                    <Form.Item
                      label="Department Name"
                      name="deptName"
                      rules={[{ required: true, message: '请输入 Department Name' }]}
                    >
                      <Input placeholder="请输入名称" />
                    </Form.Item>
                    <Form.Item label="Parent Department" name="parentId">
                      <Select allowClear placeholder="可选">
                        {departments
                          .filter((dept) => dept.id !== editingDepartment?.id)
                          .map((dept) => (
                            <Option key={dept.id} value={dept.id}>
                              {dept.deptName ?? dept.dept_name}
                            </Option>
                          ))}
                      </Select>
                    </Form.Item>
                    <Space>
                      <Button type="primary" htmlType="submit" loading={departmentSubmitting}>
                        {editingDepartment ? '保存修改' : '新增 Department'}
                      </Button>
                      {editingDepartment && (
                        <Button onClick={handleDepartmentCancel}>取消编辑</Button>
                      )}
                    </Space>
                  </Form>
                </Space>
              ),
            },
            {
              key: 'teams',
              label: 'Teams',
              children: (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <Table
                    rowKey={(record) => record.id ?? record.teamCode ?? String(Math.random())}
                    dataSource={teams}
                    columns={teamColumns}
                    size="small"
                    pagination={false}
                  />
                  <Form form={teamForm} layout="vertical" onFinish={handleTeamSubmit}>
                    <Form.Item
                      label="Team Code"
                      name="teamCode"
                      rules={[{ required: true, message: '请输入 Team Code' }]}
                    >
                      <Input placeholder="如：USP" disabled={!!editingTeam} />
                    </Form.Item>
                    <Form.Item
                      label="Team Name"
                      name="teamName"
                      rules={[{ required: true, message: '请输入 Team Name' }]}
                    >
                      <Input placeholder="请输入名称" />
                    </Form.Item>
                    <Form.Item
                      label="Department"
                      name="departmentId"
                      rules={[{ required: true, message: '请选择 Department' }]}
                    >
                      <Select placeholder="请选择 Department">
                        {departments.map((dept) => (
                          <Option key={dept.id} value={dept.id}>
                            {dept.deptName ?? dept.dept_name}
                          </Option>
                        ))}
                      </Select>
                    </Form.Item>
                    <Form.Item label="Description" name="description">
                      <Input placeholder="可选" />
                    </Form.Item>
                    <Space>
                      <Button type="primary" htmlType="submit" loading={teamSubmitting}>
                        {editingTeam ? '保存修改' : '新增 Team'}
                      </Button>
                      {editingTeam && (
                        <Button onClick={handleTeamCancel}>取消编辑</Button>
                      )}
                    </Space>
                  </Form>
                </Space>
              ),
            },
          ]}
        />
      </Modal>
    </div>
  );
};

export default OrganizationWorkbench;

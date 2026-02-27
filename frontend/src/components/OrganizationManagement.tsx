import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Table,
  Space,
  Tag,
  Button,
  Input,
  Typography,
  Drawer,
  Empty,
  List,
  message,
  Statistic,
  Row,
  Col,
  Spin,
} from 'antd';
import {
  SearchOutlined,
  ApartmentOutlined,
  TeamOutlined,
  UserSwitchOutlined,
  IdcardOutlined,
} from '@ant-design/icons';
import {
  OrgHierarchyResponse,
  OrgLeaderNode,
  OrgUnitNode,
  UnassignedEmployeeSummary,
} from '../types';
import { organizationStructureApi, organizationEmployeeApi } from '../services/api';
import type { EmployeeOrgContext } from '../types';

const { Text } = Typography;

type NodeType = 'UNIT' | 'LEADER';

interface OrganizationTableRow {
  key: string;
  nodeType: NodeType;
  title: string;
  descriptor: string;
  parentName?: string;
  memberInfo?: string;
  statusTag?: { color: string; text: string };
  gapTag?: { color: string; text: string } | null;
  unit?: OrgUnitNode;
  leader?: OrgLeaderNode;
  children?: OrganizationTableRow[];
}

const ORG_ROLE_LABELS: Record<string, string> = {
  FRONTLINE: '一线人员',
  SHIFT_LEADER: '班组长',
  GROUP_LEADER: '工段长',
  TEAM_LEADER: '团队长',
  DEPT_MANAGER: '部门负责人',
};

const UNIT_TYPE_LABELS: Record<string, string> = {
  DEPARTMENT: '部门',
  TEAM: '团队',
  GROUP: '工段',
  SHIFT: '班组',
};

const OrganizationManagement: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [hierarchy, setHierarchy] = useState<OrgHierarchyResponse | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const [selectedRow, setSelectedRow] = useState<OrganizationTableRow | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [leaderContext, setLeaderContext] = useState<EmployeeOrgContext | null>(null);
  const [leaderContextLoading, setLeaderContextLoading] = useState(false);

  const loadHierarchy = async () => {
    try {
      setLoading(true);
      const data = await organizationStructureApi.getTree();
      setHierarchy(data);
    } catch (error) {
      console.error('Failed to load organization hierarchy', error);
      message.error('加载组织架构失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHierarchy();
  }, []);

  const buildLeaderRow = (leader: OrgLeaderNode, unit: OrgUnitNode): OrganizationTableRow => {
    const descriptor = ORG_ROLE_LABELS[leader.orgRole] || leader.orgRole;
    let info = `直属 ${leader.directSubordinateCount} 人`;
    if (leader.orgRole === 'GROUP_LEADER') {
      info += leader.shiftLeaderCount > 0
        ? `，班组长 ${leader.shiftLeaderCount} 人`
        : '，班组长缺失';
    }

    return {
      key: `leader-${leader.employeeId}-${unit.id}`,
      nodeType: 'LEADER',
      title: leader.employeeName,
      descriptor,
      parentName: unit.unitName,
      memberInfo: info,
      statusTag:
        leader.employmentStatus === 'ACTIVE'
          ? undefined
          : {
            color: 'red',
            text: '停用',
          },
      gapTag: leader.hasShiftLeaderGap
        ? {
          color: 'warning',
          text: '缺少班组长层级',
        }
        : null,
      leader,
    };
  };

  const buildUnitRow = React.useCallback(
    (unit: OrgUnitNode, parents: string[] = []): OrganizationTableRow => {
      const leaderChildren = unit.leaders.map((leader) => buildLeaderRow(leader, unit));
      const childUnits = unit.children.map((child) => buildUnitRow(child, [...parents, unit.unitName]));
      const children = [...leaderChildren, ...childUnits];

      return {
        key: `unit-${unit.id}`,
        nodeType: 'UNIT',
        title: unit.unitName,
        descriptor: UNIT_TYPE_LABELS[unit.unitType] || unit.unitType,
        parentName: parents[parents.length - 1],
        memberInfo:
          leaderChildren.length > 0
            ? `领导 ${leaderChildren.length} 人 · 成员 ${unit.memberCount} 人`
            : `成员 ${unit.memberCount} 人`,
        statusTag: unit.isActive
          ? undefined
          : {
            color: 'red',
            text: '禁用',
          },
        unit,
        children: children.length ? children : undefined,
      };
    },
    [],
  );

  const tableData = useMemo<OrganizationTableRow[]>(() => {
    if (!hierarchy) {
      return [];
    }
    const rows = hierarchy.units.map((unit) => buildUnitRow(unit));
    if (!searchValue.trim()) {
      return rows;
    }
    const keyword = searchValue.trim().toLowerCase();

    const filterRows = (data: OrganizationTableRow[]): OrganizationTableRow[] =>
      data
        .map((row) => {
          const children = row.children ? filterRows(row.children) : [];
          const hit =
            row.title.toLowerCase().includes(keyword) ||
            row.descriptor.toLowerCase().includes(keyword) ||
            (row.memberInfo && row.memberInfo.toLowerCase().includes(keyword));
          if (hit || children.length) {
            return { ...row, children: children.length ? children : row.children };
          }
          return null;
        })
        .filter(Boolean) as OrganizationTableRow[];

    return filterRows(rows);
  }, [hierarchy, searchValue, buildUnitRow]);

  const columns = useMemo(
    () => [
      {
        title: '名称',
        dataIndex: 'title',
        key: 'title',
        width: '32%',
        render: (_: unknown, record: OrganizationTableRow) => (
          <Space size="small">
            <span>{record.title}</span>
            <Tag color={record.nodeType === 'UNIT' ? 'processing' : 'purple'}>{record.descriptor}</Tag>
            {record.gapTag && <Tag color={record.gapTag.color}>{record.gapTag.text}</Tag>}
          </Space>
        ),
      },
      {
        title: '上级',
        dataIndex: 'parentName',
        key: 'parentName',
        width: '20%',
        render: (value: string | undefined) => value || '-',
      },
      {
        title: '成员信息',
        dataIndex: 'memberInfo',
        key: 'memberInfo',
        width: '26%',
        render: (value: string | undefined) => value || '-',
      },
      {
        title: '状态',
        dataIndex: 'statusTag',
        key: 'status',
        width: '10%',
        render: (tag: OrganizationTableRow['statusTag']) =>
          tag ? <Tag color={tag.color}>{tag.text}</Tag> : <Tag color="blue">正常</Tag>,
      },
      {
        title: '操作',
        key: 'actions',
        width: '12%',
        render: (_: unknown, record: OrganizationTableRow) => (
          <Button type="link" onClick={() => handleRowClick(record)}>
            查看详情
          </Button>
        ),
      },
    ],
    [],
  );

  const handleRowClick = (record: OrganizationTableRow) => {
    setSelectedRow(record);
    setDrawerVisible(true);
  };

  useEffect(() => {
    const loadContext = async () => {
      if (!selectedRow || selectedRow.nodeType !== 'LEADER' || !selectedRow.leader) {
        setLeaderContext(null);
        return;
      }
      try {
        setLeaderContextLoading(true);
        const data = await organizationEmployeeApi.getContext(selectedRow.leader.employeeId);
        setLeaderContext(data);
      } catch (error) {
        console.error('Failed to load leader context', error);
        message.error('加载人员详情失败');
        setLeaderContext(null);
      } finally {
        setLeaderContextLoading(false);
      }
    };

    loadContext();
  }, [selectedRow]);

  const renderUnitDetail = (unit: OrgUnitNode) => (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <div>
        <Text type="secondary">单元类型</Text>
        <div>{UNIT_TYPE_LABELS[unit.unitType] || unit.unitType}</div>
      </div>
      <div>
        <Text type="secondary">单元编码</Text>
        <div>{unit.unitCode || '-'}</div>
      </div>
      <div>
        <Text type="secondary">默认班次</Text>
        <div>{unit.defaultShiftCode || '-'}</div>
      </div>
      <div>
        <Text type="secondary">启用状态</Text>
        <div>{unit.isActive ? '启用' : '停用'}</div>
      </div>
      <div>
        <Text type="secondary">领导节点</Text>
        <div>
          {unit.leaders.length > 0 ? (
            <List
              size="small"
              bordered
              dataSource={unit.leaders}
              renderItem={(leader) => (
                <List.Item>
                  {leader.employeeName}（{ORG_ROLE_LABELS[leader.orgRole] || leader.orgRole}）
                </List.Item>
              )}
            />
          ) : (
            <Text>暂无领导</Text>
          )}
        </div>
      </div>
      <div>
        <Text type="secondary">成员数量</Text>
        <div>{unit.memberCount}</div>
      </div>
    </Space>
  );

  const renderLeaderDetail = (leader: OrgLeaderNode) => (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <div>
        <Text type="secondary">角色</Text>
        <div>{ORG_ROLE_LABELS[leader.orgRole] || leader.orgRole}</div>
      </div>
      <div>
        <Text type="secondary">工号</Text>
        <div>{leader.employeeCode}</div>
      </div>
      <div>
        <Text type="secondary">在岗状态</Text>
        <div>{leader.employmentStatus}</div>
      </div>
      <div>
        <Text type="secondary">直属下属</Text>
        <div>{leader.directSubordinateCount}</div>
      </div>
      {leader.orgRole === 'GROUP_LEADER' && (
        <div>
          <Text type="secondary">班组长数量</Text>
          <div>{leader.shiftLeaderCount}</div>
        </div>
      )}
      {leader.hasShiftLeaderGap && <Tag color="warning">缺少班组长层级，请尽快补充</Tag>}
    </Space>
  );

  const renderDetail = () => {
    if (!selectedRow) {
      return <Empty description="请选择左侧节点" />;
    }
    if (selectedRow.nodeType === 'UNIT' && selectedRow.unit) {
      return renderUnitDetail(selectedRow.unit);
    }
    if (selectedRow.nodeType === 'LEADER' && selectedRow.leader) {
      return (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {renderLeaderDetail(selectedRow.leader)}
          <div>
            <Text strong>所属组织</Text>
            {leaderContextLoading ? (
              <Spin size="small" />
            ) : leaderContext && leaderContext.memberships.length > 0 ? (
              <List
                size="small"
                bordered
                dataSource={leaderContext.memberships}
                renderItem={(item) => (
                  <List.Item>
                    {item.unitName}（{UNIT_TYPE_LABELS[item.unitType] || item.unitType} · {item.assignmentType === 'PRIMARY' ? '主属' : '辅属'}）
                  </List.Item>
                )}
              />
            ) : (
              <Text>暂无组织归属信息</Text>
            )}
          </div>
          <div>
            <Text strong>直接上级</Text>
            {leaderContextLoading ? (
              <Spin size="small" />
            ) : leaderContext && leaderContext.directLeaders.length > 0 ? (
              <List
                size="small"
                dataSource={leaderContext.directLeaders}
                renderItem={(leader) => (
                  <List.Item>
                    {leader.employeeName}（{ORG_ROLE_LABELS[leader.orgRole] || leader.orgRole}）
                  </List.Item>
                )}
              />
            ) : (
              <Text>暂无上级</Text>
            )}
          </div>
          <div>
            <Text strong>直接下属</Text>
            {leaderContextLoading ? (
              <Spin size="small" />
            ) : leaderContext && leaderContext.directSubordinates.length > 0 ? (
              <List
                size="small"
                dataSource={leaderContext.directSubordinates}
                renderItem={(sub) => (
                  <List.Item>
                    {sub.employeeName}（{ORG_ROLE_LABELS[sub.orgRole] || sub.orgRole}）
                  </List.Item>
                )}
              />
            ) : (
              <Text>暂无直接下属</Text>
            )}
          </div>
          <div>
            <Text strong>向上汇报链</Text>
            {leaderContextLoading ? (
              <Spin size="small" />
            ) : leaderContext && leaderContext.reportingChain.length > 0 ? (
              <Space direction="vertical">
                {leaderContext.reportingChain.map((item) => (
                  <Tag key={item.employeeId} color="processing">
                    {item.employeeName}（{ORG_ROLE_LABELS[item.orgRole] || item.orgRole}）
                  </Tag>
                ))}
              </Space>
            ) : (
              <Text>暂无汇报链</Text>
            )}
          </div>
        </Space>
      );
    }
    return <Empty description="暂无详情" />;
  };

  const stats = hierarchy?.stats;
  const unassigned = hierarchy?.unassignedEmployees || [];

  return (
    <Card bordered={false} style={{ minHeight: '100%' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="组织单元"
              value={stats?.totalUnits ?? 0}
              prefix={<ApartmentOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="领导节点"
              value={stats?.totalLeaders ?? 0}
              prefix={<UserSwitchOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="根节点数量"
              value={stats?.orphanUnits ?? 0}
              prefix={<TeamOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="缺少班组长层级"
              value={stats?.emptyLeadershipNodes ?? 0}
              prefix={<IdcardOutlined />}
            />
          </Col>
        </Row>

        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Input
            placeholder="搜索组织或人员"
            value={searchValue}
            allowClear
            onChange={(e) => setSearchValue(e.target.value)}
            prefix={<SearchOutlined />}
            style={{ maxWidth: 320 }}
          />
          <Space>
            <Button disabled>新增组织单元</Button>
            <Button disabled>批量导入</Button>
          </Space>
        </Space>

        <Table
          columns={columns}
          dataSource={tableData}
          rowKey="key"
          loading={loading}
          pagination={false}
          expandable={{ defaultExpandAllRows: true }}
          onRow={(record) => ({ onClick: () => handleRowClick(record) })}
          locale={{ emptyText: loading ? <Spin /> : '暂无组织数据' }}
        />

        {unassigned.length > 0 && (
          <Card title="未分配组织的人员" size="small">
            <Space wrap>
              {unassigned.map((item: UnassignedEmployeeSummary) => (
                <Tag key={item.employeeId} color="warning">
                  {item.employeeName}（{ORG_ROLE_LABELS[item.orgRole] || item.orgRole}）
                </Tag>
              ))}
            </Space>
          </Card>
        )}
      </Space>

      <Drawer
        width={420}
        title={selectedRow ? `${selectedRow.title} - 详情` : '详情'}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        destroyOnClose
      >
        {renderDetail()}
      </Drawer>
    </Card>
  );
};

export default OrganizationManagement;

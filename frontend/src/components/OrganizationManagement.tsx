import React, { useEffect, useMemo, useState } from 'react';
import {
  Table,
  Space,
  Typography,
  Empty,
  message,
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
import { 
  WxbCard, 
  WxbKpiCard, 
  WxbButton, 
  WxbInput, 
  WxbTableWrapper, 
  WxbModal, 
  WxbBadge 
} from './wxb-ui';

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
            <WxbBadge 
              variant="outline" 
              status={record.nodeType === 'UNIT' ? 'info' : 'neutral'} 
              label={record.descriptor} 
            />
            {record.gapTag && (
              <WxbBadge 
                variant="outline" 
                status={record.gapTag.color === 'warning' ? 'warning' : 'error'} 
                label={record.gapTag.text} 
              />
            )}
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
          tag ? (
            <WxbBadge variant="outline" status={tag.color === 'red' ? 'error' : 'neutral'} label={tag.text} />
          ) : (
            <WxbBadge variant="outline" status="success" label="正常" />
          ),
      },
      {
        title: '操作',
        key: 'actions',
        width: '12%',
        render: (_: unknown, record: OrganizationTableRow) => (
          <WxbButton variant="ghost" size="sm" onClick={() => handleRowClick(record)}>
            查看详情
          </WxbButton>
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
    <Space direction="vertical" size="middle" style={{ width: '100%' }} className="wxb-body">
      <div>
        <div style={{ color: 'var(--wx-fg-3)', marginBottom: 4 }}>单元类型</div>
        <div>{UNIT_TYPE_LABELS[unit.unitType] || unit.unitType}</div>
      </div>
      <div>
        <div style={{ color: 'var(--wx-fg-3)', marginBottom: 4 }}>单元编码</div>
        <div>{unit.unitCode || '-'}</div>
      </div>
      <div>
        <div style={{ color: 'var(--wx-fg-3)', marginBottom: 4 }}>默认班次</div>
        <div>{unit.defaultShiftCode || '-'}</div>
      </div>
      <div>
        <div style={{ color: 'var(--wx-fg-3)', marginBottom: 4 }}>启用状态</div>
        <div>{unit.isActive ? '启用' : '停用'}</div>
      </div>
      <div>
        <div style={{ color: 'var(--wx-fg-3)', marginBottom: 8 }}>领导节点</div>
        <div>
          {unit.leaders.length > 0 ? (
            <Space wrap>
              {unit.leaders.map(leader => (
                <WxbBadge 
                  key={leader.employeeId} 
                  variant="outline" 
                  status="info" 
                  label={`${leader.employeeName} (${ORG_ROLE_LABELS[leader.orgRole] || leader.orgRole})`} 
                />
              ))}
            </Space>
          ) : (
            <span style={{ color: 'var(--wx-fg-4)' }}>暂无领导</span>
          )}
        </div>
      </div>
      <div>
        <div style={{ color: 'var(--wx-fg-3)', marginBottom: 4 }}>成员数量</div>
        <div>{unit.memberCount} 人</div>
      </div>
    </Space>
  );

  const renderLeaderDetail = (leader: OrgLeaderNode) => (
    <Space direction="vertical" size="middle" style={{ width: '100%' }} className="wxb-body">
      <div>
        <div style={{ color: 'var(--wx-fg-3)', marginBottom: 4 }}>角色</div>
        <div>{ORG_ROLE_LABELS[leader.orgRole] || leader.orgRole}</div>
      </div>
      <div>
        <div style={{ color: 'var(--wx-fg-3)', marginBottom: 4 }}>工号</div>
        <div>{leader.employeeCode}</div>
      </div>
      <div>
        <div style={{ color: 'var(--wx-fg-3)', marginBottom: 4 }}>在岗状态</div>
        <div>{leader.employmentStatus}</div>
      </div>
      <div>
        <div style={{ color: 'var(--wx-fg-3)', marginBottom: 4 }}>直属下属</div>
        <div>{leader.directSubordinateCount} 人</div>
      </div>
      {leader.orgRole === 'GROUP_LEADER' && (
        <div>
          <div style={{ color: 'var(--wx-fg-3)', marginBottom: 4 }}>班组长数量</div>
          <div>{leader.shiftLeaderCount} 人</div>
        </div>
      )}
      {leader.hasShiftLeaderGap && <WxbBadge variant="outline" status="warning" label="缺少班组长层级，请尽快补充" />}
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
        <Space direction="vertical" size="large" style={{ width: '100%' }} className="wxb-body">
          {renderLeaderDetail(selectedRow.leader)}
          <div>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>所属组织</div>
            {leaderContextLoading ? (
              <Spin size="small" />
            ) : leaderContext && leaderContext.memberships.length > 0 ? (
              <Space wrap>
                {leaderContext.memberships.map((item, idx) => (
                  <WxbBadge 
                    key={idx} 
                    variant="outline" 
                    status={item.assignmentType === 'PRIMARY' ? 'success' : 'neutral'} 
                    label={`${item.unitName} (${UNIT_TYPE_LABELS[item.unitType] || item.unitType} · ${item.assignmentType === 'PRIMARY' ? '主属' : '辅属'})`} 
                  />
                ))}
              </Space>
            ) : (
              <span style={{ color: 'var(--wx-fg-4)' }}>暂无组织归属信息</span>
            )}
          </div>
          <div>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>直接上级</div>
            {leaderContextLoading ? (
              <Spin size="small" />
            ) : leaderContext && leaderContext.directLeaders.length > 0 ? (
              <Space wrap>
                {leaderContext.directLeaders.map((leader, idx) => (
                  <WxbBadge 
                    key={idx} 
                    variant="outline" 
                    status="info" 
                    label={`${leader.employeeName} (${ORG_ROLE_LABELS[leader.orgRole] || leader.orgRole})`} 
                  />
                ))}
              </Space>
            ) : (
              <span style={{ color: 'var(--wx-fg-4)' }}>暂无上级</span>
            )}
          </div>
          <div>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>直接下属</div>
            {leaderContextLoading ? (
              <Spin size="small" />
            ) : leaderContext && leaderContext.directSubordinates.length > 0 ? (
              <Space wrap>
                {leaderContext.directSubordinates.map((sub, idx) => (
                  <WxbBadge 
                    key={idx} 
                    variant="outline" 
                    status="neutral" 
                    label={`${sub.employeeName} (${ORG_ROLE_LABELS[sub.orgRole] || sub.orgRole})`} 
                  />
                ))}
              </Space>
            ) : (
              <span style={{ color: 'var(--wx-fg-4)' }}>暂无直接下属</span>
            )}
          </div>
          <div>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>向上汇报链</div>
            {leaderContextLoading ? (
              <Spin size="small" />
            ) : leaderContext && leaderContext.reportingChain.length > 0 ? (
              <Space size={4} wrap>
                {leaderContext.reportingChain.map((item, idx) => (
                  <React.Fragment key={item.employeeId}>
                    <WxbBadge 
                      variant="outline" 
                      status="info" 
                      label={`${item.employeeName} (${ORG_ROLE_LABELS[item.orgRole] || item.orgRole})`} 
                    />
                    {idx < leaderContext.reportingChain.length - 1 && (
                      <span style={{ color: 'var(--wx-fg-4)' }}>→</span>
                    )}
                  </React.Fragment>
                ))}
              </Space>
            ) : (
              <span style={{ color: 'var(--wx-fg-4)' }}>暂无汇报链</span>
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
    <div className="dashboard-page" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Row gutter={16}>
        <Col span={6}>
          <WxbKpiCard title="组织单元" value={stats?.totalUnits ?? 0} trend="neutral" />
        </Col>
        <Col span={6}>
          <WxbKpiCard title="领导节点" value={stats?.totalLeaders ?? 0} trend="neutral" />
        </Col>
        <Col span={6}>
          <WxbKpiCard title="根节点数量" value={stats?.orphanUnits ?? 0} trend="down" />
        </Col>
        <Col span={6}>
          <WxbKpiCard title="缺少班组长层级" value={stats?.emptyLeadershipNodes ?? 0} trend="down" />
        </Col>
      </Row>

      <WxbCard>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <WxbInput
            placeholder="搜索组织或人员"
            value={searchValue}
            onChange={(e: any) => setSearchValue(e.target.value)}
            style={{ maxWidth: 320 }}
          />
          <Space>
            <WxbButton variant="secondary" disabled>新增组织单元</WxbButton>
            <WxbButton variant="secondary" disabled>批量导入</WxbButton>
          </Space>
        </div>

        <WxbTableWrapper>
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
        </WxbTableWrapper>
      </WxbCard>

      {unassigned.length > 0 && (
        <WxbCard>
          <div style={{ fontWeight: 500, marginBottom: 12 }}>未分配组织的人员</div>
          <Space wrap>
            {unassigned.map((item: UnassignedEmployeeSummary) => (
              <WxbBadge 
                key={item.employeeId} 
                variant="outline" 
                status="warning" 
                label={`${item.employeeName}（${ORG_ROLE_LABELS[item.orgRole] || item.orgRole}）`} 
              />
            ))}
          </Space>
        </WxbCard>
      )}

      <WxbModal
        title={selectedRow ? `${selectedRow.title} - 详情` : '详情'}
        open={drawerVisible}
        onCancel={() => setDrawerVisible(false)}
        width={600}
        footer={null}
      >
        {renderDetail()}
      </WxbModal>
    </div>
  );
};

export default OrganizationManagement;

/**
 * UserManagementPage —— 用户授权（/governance/users）。
 *
 * 用户列表（用户名 / 显示名 / 状态 / 已有角色）+ 新建用户（用户名 / 显示名 / 初始密码）
 * + 重置密码 + 授权抽屉（选角色 + 组织树范围选择器：全局 / 部门 / 团队，对应 scopeUnitId=null/节点 id）
 * + 撤销授权 + 启停 / 锁定账号。
 *
 * 数据层统一走 governanceApi；权限门禁用 useAuth().hasPermission；颜色用 CSS 变量；无 emoji。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  WxbPageShell,
  WxbPageHeader,
  WxbButton,
  WxbDataTable,
  WxbTableActionCell,
  WxbTag,
  WxbBadge,
  WxbModal,
  WxbDrawer,
  WxbInput,
  WxbSelect,
  WxbTreeSelect,
  WxbSpinner,
  WxbEmpty,
  WxbTextarea,
  WxbPopconfirm,
} from '../../components/wxb-ui';
import type { WxbTagColor } from '../../components/wxb-ui/Tag/Tag';
import { wxbToast } from '../../components/wxb-ui/Toast/Toast';
import { useAuth } from '../../contexts/AuthContext';
import {
  governanceApi,
  UserSummary,
  UserStatus,
  RoleListItem,
  RoleAssignmentView,
  OrgUnitNode,
} from '../../services/governanceApi';

const STATUS_META: Record<UserStatus, { label: string; color: WxbTagColor }> = {
  ACTIVE: { label: '启用', color: 'green' },
  INACTIVE: { label: '停用', color: 'amber' },
  LOCKED: { label: '锁定', color: 'red' },
  RETIRED: { label: '已退役', color: 'neutral' },
};

const UNIT_TYPE_LABELS: Record<string, string> = {
  DEPARTMENT: '部门',
  TEAM: '团队',
  GROUP: '组',
  SHIFT: '班次',
};

const GLOBAL_SCOPE_VALUE = '__GLOBAL__';

const mapUserError = (err: unknown, fallback: string): string => {
  const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
  switch (code) {
    case 'USERNAME_EXISTS':
      return '用户名已存在，请更换';
    case 'WEAK_PASSWORD':
      return '密码强度不足（至少 8 位，含字母与数字）';
    case 'LAST_ADMIN_PROTECTED':
      return '不能撤销最后一个系统管理员的授权';
    case 'ROLE_PROTECTED':
      return '该角色受保护，无法执行此操作';
    case 'USER_NOT_FOUND':
      return '用户不存在或已被删除';
    case 'ROLE_NOT_FOUND':
      return '角色不存在或已被删除';
    case 'BAD_REQUEST':
      return '请求参数不合法';
    default:
      return fallback;
  }
};

/** 把组织单元树转换成 AntD TreeSelect 的 treeData（顶部加「全局范围」选项）。 */
const toTreeData = (nodes: OrgUnitNode[]): any[] => {
  const mapNode = (node: OrgUnitNode): any => ({
    title: `${node.unitName}${UNIT_TYPE_LABELS[node.unitType] ? `（${UNIT_TYPE_LABELS[node.unitType]}）` : ''}`,
    value: String(node.id),
    selectable: node.isActive,
    children: node.children?.length ? node.children.map(mapNode) : undefined,
  });
  return nodes.map(mapNode);
};

/** 受保护角色码（与后端 PROTECTED_ROLE_CODE 一致）。 */
const PROTECTED_ROLE_CODE = 'GOVERNANCE_ADMIN';

const UserManagementPage: React.FC = () => {
  const { hasPermission, user } = useAuth();
  const canWrite = hasPermission('GOVERNANCE_USER_WRITE');
  const canOperate = hasPermission('GOVERNANCE_USER_OPERATE');
  const canGrant = hasPermission('GOVERNANCE_ROLE_GRANT');
  const currentUserId = user?.userId ?? null;

  const [users, setUsers] = useState<UserSummary[]>([]);
  const [roles, setRoles] = useState<RoleListItem[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnitNode[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  // 新建用户
  const [createOpen, setCreateOpen] = useState<boolean>(false);
  const [createForm, setCreateForm] = useState({ username: '', displayName: '', email: '', password: '' });
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState<boolean>(false);

  // 重置密码
  const [resetTarget, setResetTarget] = useState<UserSummary | null>(null);
  const [resetPwd, setResetPwd] = useState<string>('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetting, setResetting] = useState<boolean>(false);

  // 授权抽屉
  const [grantUser, setGrantUser] = useState<UserSummary | null>(null);
  const [grantRoleId, setGrantRoleId] = useState<number | undefined>(undefined);
  const [grantScope, setGrantScope] = useState<string>(GLOBAL_SCOPE_VALUE);
  const [grantReason, setGrantReason] = useState<string>('');
  const [granting, setGranting] = useState<boolean>(false);
  const [grantError, setGrantError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await governanceApi.listUsers();
      setUsers(data);
    } catch (err) {
      setError(true);
      wxbToast.error('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRolesAndOrg = useCallback(async () => {
    try {
      const [roleList, units] = await Promise.all([governanceApi.listRoles(), governanceApi.listOrgUnits()]);
      setRoles(roleList);
      setOrgUnits(units);
    } catch (err) {
      // 授权依赖项失败时，抽屉里会提示无可选项。
      setRoles([]);
      setOrgUnits([]);
    }
  }, []);

  useEffect(() => {
    loadUsers();
    loadRolesAndOrg();
  }, [loadUsers, loadRolesAndOrg]);

  const activeRoleOptions = useMemo(
    () =>
      roles
        .filter((r) => r.roleStatus === 'ACTIVE')
        .map((r) => ({ label: `${r.roleName}（${r.roleCode}）`, value: r.id })),
    [roles],
  );

  /** 判断某用户是否持有活跃 GOVERNANCE_ADMIN 授权。 */
  const isActiveAdmin = useCallback(
    (u: UserSummary) =>
      u.roles.some((r) => r.assignmentStatus === 'ACTIVE' && r.roleCode === PROTECTED_ROLE_CODE),
    [],
  );

  /** 全系统持有活跃 GOVERNANCE_ADMIN 的用户数（用于前端防止停用最后一个管理员；后端兜底）。 */
  const activeAdminCount = useMemo(() => users.filter(isActiveAdmin).length, [users, isActiveAdmin]);

  const treeData = useMemo(() => toTreeData(orgUnits), [orgUnits]);

  const refreshGrantUser = useCallback(async (userId: number) => {
    try {
      const fresh = await governanceApi.getUser(userId);
      setGrantUser(fresh);
      setUsers((prev) => prev.map((u) => (u.id === userId ? fresh : u)));
    } catch {
      /* 刷新失败不阻塞 */
    }
  }, []);

  // ── 新建用户 ──
  const handleCreate = async () => {
    setCreateError(null);
    const username = createForm.username.trim();
    const displayName = createForm.displayName.trim();
    if (!username) {
      setCreateError('请填写用户名');
      return;
    }
    if (!displayName) {
      setCreateError('请填写显示名');
      return;
    }
    if (!createForm.password) {
      setCreateError('请填写初始密码');
      return;
    }
    setCreating(true);
    try {
      await governanceApi.createUser({
        username,
        displayName,
        email: createForm.email.trim() || null,
        password: createForm.password,
      });
      wxbToast.success('用户已创建');
      setCreateOpen(false);
      setCreateForm({ username: '', displayName: '', email: '', password: '' });
      loadUsers();
    } catch (err) {
      setCreateError(mapUserError(err, '创建用户失败'));
    } finally {
      setCreating(false);
    }
  };

  // ── 重置密码 ──
  const handleReset = async () => {
    if (!resetTarget) return;
    setResetError(null);
    if (!resetPwd) {
      setResetError('请填写新密码');
      return;
    }
    setResetting(true);
    try {
      await governanceApi.resetUserPassword(resetTarget.id, resetPwd);
      wxbToast.success('密码已重置');
      setResetTarget(null);
      setResetPwd('');
    } catch (err) {
      setResetError(mapUserError(err, '重置密码失败'));
    } finally {
      setResetting(false);
    }
  };

  // ── 启停 / 锁定 ──
  const handleSetStatus = useCallback(
    async (user: UserSummary, status: UserStatus) => {
      try {
        await governanceApi.updateUser(user.id, { userStatus: status });
        wxbToast.success('账号状态已更新');
        loadUsers();
      } catch (err) {
        wxbToast.error(mapUserError(err, '更新账号状态失败'));
      }
    },
    [loadUsers],
  );

  // ── 授权抽屉 ──
  const openGrant = useCallback((user: UserSummary) => {
    setGrantUser(user);
    setGrantRoleId(undefined);
    setGrantScope(GLOBAL_SCOPE_VALUE);
    setGrantReason('');
    setGrantError(null);
  }, []);

  const handleAssign = async () => {
    if (!grantUser) return;
    setGrantError(null);
    if (grantRoleId == null) {
      setGrantError('请选择要授予的角色');
      return;
    }
    setGranting(true);
    try {
      await governanceApi.assignRole(grantUser.id, {
        roleId: grantRoleId,
        scopeUnitId: grantScope === GLOBAL_SCOPE_VALUE ? null : Number(grantScope),
        reasonText: grantReason.trim() || null,
      });
      wxbToast.success('授权已添加');
      setGrantRoleId(undefined);
      setGrantScope(GLOBAL_SCOPE_VALUE);
      setGrantReason('');
      await refreshGrantUser(grantUser.id);
    } catch (err) {
      setGrantError(mapUserError(err, '授权失败'));
    } finally {
      setGranting(false);
    }
  };

  const handleRevoke = async (assignment: RoleAssignmentView) => {
    if (!grantUser) return;
    try {
      await governanceApi.revokeRoleAssignment(grantUser.id, assignment.assignmentId);
      wxbToast.success('授权已撤销');
      await refreshGrantUser(grantUser.id);
    } catch (err) {
      wxbToast.error(mapUserError(err, '撤销授权失败'));
    }
  };

  const columns = useMemo(
    () => [
      {
        title: '用户',
        dataIndex: 'displayName',
        key: 'displayName',
        render: (_: unknown, record: UserSummary) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontWeight: 600, color: 'var(--wx-fg-1)' }}>{record.displayName}</span>
            <span style={{ fontSize: 'var(--wx-fs-12)', color: 'var(--wx-fg-3)' }}>@{record.username}</span>
          </div>
        ),
      },
      {
        title: '邮箱',
        dataIndex: 'email',
        key: 'email',
        render: (value: string | null) =>
          value ? <span style={{ color: 'var(--wx-fg-2)' }}>{value}</span> : <span style={{ color: 'var(--wx-fg-4)' }}>—</span>,
      },
      {
        title: '已有角色',
        key: 'roles',
        render: (_: unknown, record: UserSummary) => {
          const active = record.roles.filter((r) => r.assignmentStatus === 'ACTIVE');
          if (active.length === 0) {
            return <span style={{ color: 'var(--wx-fg-4)' }}>未授权</span>;
          }
          return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {active.map((r) => (
                <WxbTag key={r.assignmentId} color="cyan">
                  {r.roleName}
                  {r.scopeUnitName ? `·${r.scopeUnitName}` : ''}
                </WxbTag>
              ))}
            </div>
          );
        },
      },
      {
        title: '状态',
        dataIndex: 'userStatus',
        key: 'userStatus',
        render: (value: UserStatus) => {
          const meta = STATUS_META[value];
          return <WxbTag color={meta.color}>{meta.label}</WxbTag>;
        },
      },
      {
        title: '操作',
        key: 'actions',
        width: 220,
        render: (_: unknown, record: UserSummary) => {
          const actions = [];
          if (canGrant) {
            actions.push({ key: 'grant', label: '授权', onClick: () => openGrant(record) });
          }
          if (canWrite) {
            actions.push({
              key: 'reset',
              label: '重置密码',
              onClick: () => {
                setResetTarget(record);
                setResetPwd('');
                setResetError(null);
              },
            });
          }
          if (canOperate) {
            if (record.userStatus === 'ACTIVE') {
              // 防自锁 / 防停用最后一个管理员（后端 LAST_ADMIN_PROTECTED 兜底，前端先置灰）。
              const isSelf = currentUserId != null && record.id === currentUserId;
              const isLastAdmin = isActiveAdmin(record) && activeAdminCount <= 1;
              const blockReason = isSelf
                ? '不能停用/锁定自己的账号'
                : isLastAdmin
                  ? '不能停用最后一个系统管理员'
                  : undefined;
              const blocked = Boolean(blockReason);
              // blockReason 用于标签提示（置灰原因）；WxbTableActionItem 无 tooltip 字段，
              // 故把原因并入 label，hover 即可见。
              actions.push({
                key: 'disable',
                label: blocked ? `停用（${blockReason}）` : '停用',
                onClick: () => handleSetStatus(record, 'INACTIVE'),
                disabled: blocked,
                confirm: { title: '确认停用该账号？', description: '停用后该用户将无法登录。' },
              });
              actions.push({
                key: 'lock',
                label: blocked ? `锁定（${blockReason}）` : '锁定',
                variant: 'danger' as const,
                onClick: () => handleSetStatus(record, 'LOCKED'),
                disabled: blocked,
                confirm: { title: '确认锁定该账号？', description: '锁定后该用户将无法登录，直到解锁。' },
              });
            } else {
              actions.push({
                key: 'enable',
                label: '启用',
                onClick: () => handleSetStatus(record, 'ACTIVE'),
              });
            }
          }
          if (actions.length === 0) {
            return <span style={{ color: 'var(--wx-fg-4)' }}>—</span>;
          }
          return <WxbTableActionCell actions={actions} maxInline={2} />;
        },
      },
    ],
    [canGrant, canOperate, canWrite, handleSetStatus, openGrant, currentUserId, isActiveAdmin, activeAdminCount],
  );

  const activeGrantAssignments = useMemo(
    () => (grantUser ? grantUser.roles.filter((r) => r.assignmentStatus === 'ACTIVE') : []),
    [grantUser],
  );

  const renderBody = () => {
    if (loading) {
      return (
        <div style={{ minHeight: '40vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <WxbSpinner tip="加载用户列表中…" />
        </div>
      );
    }
    return (
      <WxbDataTable<UserSummary>
        rowKey="id"
        columns={columns}
        dataSource={users}
        pagination={false}
        errorState={error ? { title: '加载失败', description: '用户列表加载失败' } : undefined}
        emptyState={{
          description: '暂无用户',
          action: canWrite ? (
            <WxbButton variant="secondary" onClick={() => setCreateOpen(true)}>
              新建用户
            </WxbButton>
          ) : undefined,
        }}
      />
    );
  };

  return (
    <WxbPageShell>
      <WxbPageHeader
        eyebrow="权限治理"
        title="用户授权"
        description="管理系统账号及其角色授权。可为用户授予角色并限定组织范围，或撤销授权、启停 / 锁定账号。"
        meta={!loading && !error ? <WxbBadge variant="bar" status="info" label={`共 ${users.length} 个用户`} /> : undefined}
        actions={
          canWrite ? (
            <WxbButton variant="primary" onClick={() => setCreateOpen(true)}>
              新建用户
            </WxbButton>
          ) : undefined
        }
      />
      <div style={{ marginTop: 'var(--wx-space-16)' }}>{renderBody()}</div>

      {/* 新建用户 */}
      <WxbModal
        open={createOpen}
        title="新建用户"
        width={520}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={creating}
        okText="创建"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--wx-space-12)' }}>
          <WxbInput
            label="用户名"
            placeholder="登录用户名，唯一"
            value={createForm.username}
            onChange={(e) => setCreateForm((p) => ({ ...p, username: e.target.value }))}
          />
          <WxbInput
            label="显示名"
            placeholder="如 张三"
            value={createForm.displayName}
            onChange={(e) => setCreateForm((p) => ({ ...p, displayName: e.target.value }))}
          />
          <WxbInput
            label="邮箱（可选）"
            type="email"
            placeholder="name@example.com"
            value={createForm.email}
            onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
          />
          <WxbInput
            label="初始密码"
            type="password"
            placeholder="至少 8 位，含字母与数字"
            value={createForm.password}
            onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
          />
          {createError ? <div className="gv-form-error">{createError}</div> : null}
        </div>
      </WxbModal>

      {/* 重置密码 */}
      <WxbModal
        open={resetTarget !== null}
        title={resetTarget ? `重置「${resetTarget.displayName}」的密码` : '重置密码'}
        width={460}
        onCancel={() => setResetTarget(null)}
        onOk={handleReset}
        confirmLoading={resetting}
        okText="重置"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--wx-space-12)' }}>
          <WxbInput
            label="新密码"
            type="password"
            placeholder="至少 8 位，含字母与数字"
            value={resetPwd}
            onChange={(e) => setResetPwd(e.target.value)}
          />
          <div style={{ fontSize: 'var(--wx-fs-12)', color: 'var(--wx-fg-3)' }}>
            重置后用户下次登录将被要求修改密码。
          </div>
          {resetError ? <div className="gv-form-error">{resetError}</div> : null}
        </div>
      </WxbModal>

      {/* 授权抽屉 */}
      <WxbDrawer
        open={grantUser !== null}
        title={grantUser ? `授权 — ${grantUser.displayName}（@${grantUser.username}）` : '授权'}
        width={480}
        onClose={() => setGrantUser(null)}
        destroyOnClose
      >
        {grantUser ? (
          <div className="gv-grant-body">
            <section className="gv-grant-section">
              <h4 className="gv-grant-title">添加授权</h4>
              <div className="wxb-field">
                <label className="wxb-label">角色</label>
                <WxbSelect
                  placeholder={activeRoleOptions.length ? '选择角色' : '暂无可用角色'}
                  value={grantRoleId}
                  options={activeRoleOptions}
                  disabled={!canGrant || activeRoleOptions.length === 0}
                  onChange={(value) => setGrantRoleId(value as number)}
                  style={{ width: '100%' }}
                  showSearch
                  optionFilterProp="label"
                />
              </div>
              <div className="wxb-field">
                <label className="wxb-label">组织范围</label>
                <WxbTreeSelect
                  value={grantScope}
                  disabled={!canGrant}
                  treeData={[
                    { title: '全局范围（全部组织）', value: GLOBAL_SCOPE_VALUE },
                    ...treeData,
                  ]}
                  onChange={(value) => setGrantScope((value as string) ?? GLOBAL_SCOPE_VALUE)}
                  treeDefaultExpandAll
                  style={{ width: '100%' }}
                  placeholder="选择组织范围"
                />
                <span className="wxb-help">不选具体单元即为全局范围，授权对全部组织生效。</span>
              </div>
              <div className="wxb-field">
                <label className="wxb-label">授权原因（可选）</label>
                <WxbTextarea
                  rows={2}
                  placeholder="便于审计的授权说明"
                  value={grantReason}
                  disabled={!canGrant}
                  onChange={(e) => setGrantReason(e.target.value)}
                />
              </div>
              {grantError ? <div className="gv-form-error">{grantError}</div> : null}
              <WxbButton
                variant="primary"
                onClick={handleAssign}
                disabled={!canGrant || granting}
              >
                {granting ? '授权中…' : '添加授权'}
              </WxbButton>
            </section>

            <section className="gv-grant-section">
              <h4 className="gv-grant-title">当前授权（{activeGrantAssignments.length}）</h4>
              {activeGrantAssignments.length === 0 ? (
                <WxbEmpty description="该用户暂无生效授权" />
              ) : (
                <ul className="gv-grant-list">
                  {activeGrantAssignments.map((assignment) => (
                    <li className="gv-grant-item" key={assignment.assignmentId}>
                      <div className="gv-grant-item-main">
                        <span className="gv-grant-item-role">{assignment.roleName}</span>
                        <WxbTag color="cyan">{assignment.scopeUnitName ?? '全局范围'}</WxbTag>
                      </div>
                      <WxbPopconfirm
                        title="确认撤销该授权？"
                        okText="撤销"
                        onConfirm={() => handleRevoke(assignment)}
                        disabled={!canGrant}
                      >
                        <WxbButton variant="ghost" size="sm" disabled={!canGrant}>
                          撤销
                        </WxbButton>
                      </WxbPopconfirm>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </WxbDrawer>
      <UserManagementStyles />
    </WxbPageShell>
  );
};

const UserManagementStyles: React.FC = () => (
  <style>{`
    .gv-form-error { color: var(--wx-red-600, #C92A2A); font-size: var(--wx-fs-13, 13px); }
    .gv-grant-body { display: flex; flex-direction: column; gap: var(--wx-space-24, 24px); }
    .gv-grant-section { display: flex; flex-direction: column; gap: var(--wx-space-12, 12px); }
    .gv-grant-title { margin: 0; font-size: var(--wx-fs-14, 14px); font-weight: 600; color: var(--wx-fg-1, #1B2733); }
    .gv-grant-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--wx-space-8, 8px); }
    .gv-grant-item { display: flex; align-items: center; justify-content: space-between; padding: var(--wx-space-8, 8px) var(--wx-space-12, 12px); border: 1px solid var(--wx-border, #E2E8F0); border-radius: var(--wx-radius-md, 8px); background: var(--wx-surface-1, #FFFFFF); }
    .gv-grant-item-main { display: flex; align-items: center; gap: var(--wx-space-8, 8px); }
    .gv-grant-item-role { font-weight: 500; color: var(--wx-fg-1, #1B2733); }
  `}</style>
);

export default UserManagementPage;

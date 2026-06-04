/**
 * RoleManagementPage —— 角色管理（/governance/roles）。
 *
 * 角色列表（名称 / code / scope / 权限数 / 用户数 / 状态）+ 新建 / 编辑（WxbModal）
 * + 权限选择器（按 permissionCatalog 的 域 → 资源 → 动作 树用 WxbCheckbox 勾选，
 *   支持按域全选 / 折叠），保存整体覆盖角色权限（PUT /roles/:id/permissions）。
 *
 * 受保护角色 GOVERNANCE_ADMIN：不可改 / 不可删 / 不可停用（UI 置灰，后端也会回 409 ROLE_PROTECTED 兜底）。
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
  WxbInput,
  WxbTextarea,
  WxbSelect,
  WxbSegmented,
  WxbCheckbox,
  WxbSpinner,
  WxbEmpty,
  WxbTooltip,
} from '../../components/wxb-ui';
import type { WxbTagColor } from '../../components/wxb-ui/Tag/Tag';
import { wxbToast } from '../../components/wxb-ui/Toast/Toast';
import { useAuth } from '../../contexts/AuthContext';
import {
  governanceApi,
  RoleListItem,
  RoleScope,
  RoleStatus,
  PermissionDomainGroup,
} from '../../services/governanceApi';

/** 受保护角色码（不可改 / 删 / 停用）。 */
const PROTECTED_ROLE_CODE = 'GOVERNANCE_ADMIN';

const SCOPE_OPTIONS: { label: string; value: RoleScope }[] = [
  { label: '系统', value: 'SYSTEM' },
  { label: '排程', value: 'APS' },
  { label: '排班', value: 'ROSTER' },
  { label: '主数据', value: 'MASTER_DATA' },
  { label: '权限治理', value: 'GOVERNANCE' },
  { label: '集成', value: 'INTEGRATION' },
];

const SCOPE_LABELS = SCOPE_OPTIONS.reduce<Record<string, string>>((acc, o) => {
  acc[o.value] = o.label;
  return acc;
}, {});

const STATUS_META: Record<RoleStatus, { label: string; color: WxbTagColor }> = {
  ACTIVE: { label: '启用', color: 'green' },
  INACTIVE: { label: '停用', color: 'amber' },
  RETIRED: { label: '已退役', color: 'neutral' },
};

const STATUS_OPTIONS = [
  { label: '启用', value: 'ACTIVE' },
  { label: '停用', value: 'INACTIVE' },
];

/** 把后端错误码映射为中文文案（403/401 已由拦截器统一处理，此处只管业务码）。 */
const mapRoleError = (err: unknown, fallback: string): string => {
  const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
  switch (code) {
    case 'ROLE_CODE_EXISTS':
      return '角色编码已存在，请更换';
    case 'ROLE_PROTECTED':
      return '该角色受保护，不可修改或删除';
    case 'PERMISSION_UNKNOWN':
      return '包含未知权限码，请刷新后重试';
    case 'ROLE_NOT_FOUND':
      return '角色不存在或已被删除';
    case 'BAD_REQUEST':
      return '请求参数不合法';
    default:
      return fallback;
  }
};

type EditorMode = 'create' | 'edit';

interface RoleFormState {
  roleCode: string;
  roleName: string;
  roleScope: RoleScope;
  roleStatus: RoleStatus;
  description: string;
  /** 当前勾选的权限码集合（编辑态用，新建后由二次保存权限）。 */
  permissionCodes: Set<string>;
}

const emptyForm = (): RoleFormState => ({
  roleCode: '',
  roleName: '',
  roleScope: 'APS',
  roleStatus: 'ACTIVE',
  description: '',
  permissionCodes: new Set(),
});

const RoleManagementPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('GOVERNANCE_ROLE_WRITE');

  const [roles, setRoles] = useState<RoleListItem[]>([]);
  const [catalog, setCatalog] = useState<PermissionDomainGroup[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  // 编辑器
  const [editorOpen, setEditorOpen] = useState<boolean>(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('create');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<RoleFormState>(emptyForm());
  const [saving, setSaving] = useState<boolean>(false);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  // 编辑态：角色详情（含已分配权限）是否成功加载。未成功时禁止保存，
  // 否则会把空 permissionCodes 当作"清空全部权限"下发，造成静默数据丢失。
  const [detailLoaded, setDetailLoaded] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadRoles = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await governanceApi.listRoles();
      setRoles(data);
    } catch (err) {
      setError(true);
      wxbToast.error('加载角色列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    try {
      const data = await governanceApi.getPermissionCatalog();
      setCatalog(data);
    } catch (err) {
      // 目录失败不阻塞列表，但编辑权限时会提示。
      setCatalog([]);
    }
  }, []);

  useEffect(() => {
    loadRoles();
    loadCatalog();
  }, [loadRoles, loadCatalog]);

  const isProtected = (role: RoleListItem) => role.roleCode === PROTECTED_ROLE_CODE;

  const openCreate = () => {
    setEditorMode('create');
    setEditingId(null);
    setForm(emptyForm());
    setFormError(null);
    setDetailLoaded(true); // 新建无既有权限可丢失，允许保存。
    setEditorOpen(true);
  };

  const openEdit = useCallback(async (role: RoleListItem) => {
    setEditorMode('edit');
    setEditingId(role.id);
    setFormError(null);
    setDetailLoaded(false); // 详情未到位前禁止保存，避免空权限覆盖。
    setForm({
      roleCode: role.roleCode,
      roleName: role.roleName,
      roleScope: role.roleScope,
      roleStatus: role.roleStatus === 'RETIRED' ? 'INACTIVE' : role.roleStatus,
      description: role.description ?? '',
      permissionCodes: new Set(),
    });
    setEditorOpen(true);
    // 拉详情拿当前勾选的 permissionCodes。
    setDetailLoading(true);
    try {
      const detail = await governanceApi.getRole(role.id);
      setForm((prev) => ({
        ...prev,
        roleName: detail.roleName,
        roleScope: detail.roleScope,
        roleStatus: detail.roleStatus === 'RETIRED' ? 'INACTIVE' : detail.roleStatus,
        description: detail.description ?? '',
        permissionCodes: new Set(detail.permissionCodes),
      }));
      setDetailLoaded(true);
    } catch (err) {
      wxbToast.error(mapRoleError(err, '加载角色详情失败，无法保存以免清空权限'));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleToggleStatus = useCallback(
    async (role: RoleListItem) => {
      const next: RoleStatus = role.roleStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      try {
        await governanceApi.updateRole(role.id, { roleStatus: next });
        wxbToast.success(next === 'ACTIVE' ? '角色已启用' : '角色已停用');
        loadRoles();
      } catch (err) {
        wxbToast.error(mapRoleError(err, '更新角色状态失败'));
      }
    },
    [loadRoles],
  );

  const handleDelete = useCallback(
    async (role: RoleListItem) => {
      try {
        await governanceApi.deleteRole(role.id);
        wxbToast.success('角色已退役');
        loadRoles();
      } catch (err) {
        wxbToast.error(mapRoleError(err, '删除角色失败'));
      }
    },
    [loadRoles],
  );

  const handleSave = async () => {
    setFormError(null);
    const roleName = form.roleName.trim();
    const roleCode = form.roleCode.trim();
    if (!roleName) {
      setFormError('请填写角色名称');
      return;
    }
    if (editorMode === 'create' && !roleCode) {
      setFormError('请填写角色编码');
      return;
    }
    // 编辑态：详情（含已分配权限）未成功加载时拦截保存，否则会用空权限覆盖现有权限。
    if (editorMode === 'edit' && !detailLoaded) {
      setFormError('权限未加载，无法保存以免清空已有权限。请关闭后重试。');
      return;
    }
    setSaving(true);
    try {
      if (editorMode === 'create') {
        const created = await governanceApi.createRole({
          roleCode,
          roleName,
          roleScope: form.roleScope,
          description: form.description.trim() || null,
        });
        // 新建后若勾选了权限，二次提交整体覆盖。
        if (form.permissionCodes.size > 0) {
          await governanceApi.setRolePermissions(created.id, Array.from(form.permissionCodes));
        }
        wxbToast.success('角色已创建');
      } else if (editingId != null) {
        await governanceApi.updateRole(editingId, {
          roleName,
          roleScope: form.roleScope,
          roleStatus: form.roleStatus,
          description: form.description.trim() || null,
        });
        await governanceApi.setRolePermissions(editingId, Array.from(form.permissionCodes));
        wxbToast.success('角色已更新');
      }
      setEditorOpen(false);
      loadRoles();
    } catch (err) {
      setFormError(mapRoleError(err, '保存角色失败'));
    } finally {
      setSaving(false);
    }
  };

  const togglePermission = useCallback((code: string, checked: boolean) => {
    setForm((prev) => {
      const next = new Set(prev.permissionCodes);
      if (checked) next.add(code);
      else next.delete(code);
      return { ...prev, permissionCodes: next };
    });
  }, []);

  const toggleCodes = useCallback((codes: string[], checked: boolean) => {
    setForm((prev) => {
      const next = new Set(prev.permissionCodes);
      codes.forEach((c) => (checked ? next.add(c) : next.delete(c)));
      return { ...prev, permissionCodes: next };
    });
  }, []);

  const columns = useMemo(
    () => [
      {
        title: '角色名称',
        dataIndex: 'roleName',
        key: 'roleName',
        render: (_: unknown, record: RoleListItem) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontWeight: 600, color: 'var(--wx-fg-1)' }}>{record.roleName}</span>
            {record.description ? (
              <span style={{ fontSize: 'var(--wx-fs-12)', color: 'var(--wx-fg-3)' }}>{record.description}</span>
            ) : null}
          </div>
        ),
      },
      {
        title: '角色编码',
        dataIndex: 'roleCode',
        key: 'roleCode',
        render: (value: string) => <WxbBadge variant="code" label={value} status="info" />,
      },
      {
        title: '业务域',
        dataIndex: 'roleScope',
        key: 'roleScope',
        render: (value: RoleScope) => <WxbTag color="cyan">{SCOPE_LABELS[value] ?? value}</WxbTag>,
      },
      {
        title: '权限数',
        dataIndex: 'permissionCount',
        key: 'permissionCount',
        align: 'center' as const,
        render: (value: number) => <span style={{ color: 'var(--wx-fg-2)' }}>{value}</span>,
      },
      {
        title: '用户数',
        dataIndex: 'userCount',
        key: 'userCount',
        align: 'center' as const,
        render: (value: number) => <span style={{ color: 'var(--wx-fg-2)' }}>{value}</span>,
      },
      {
        title: '状态',
        dataIndex: 'roleStatus',
        key: 'roleStatus',
        render: (value: RoleStatus) => {
          const meta = STATUS_META[value];
          return <WxbTag color={meta.color}>{meta.label}</WxbTag>;
        },
      },
      {
        title: '操作',
        key: 'actions',
        width: 180,
        render: (_: unknown, record: RoleListItem) => {
          const protectedRole = isProtected(record);
          return (
            <WxbTableActionCell
              actions={[
                {
                  key: 'edit',
                  label: protectedRole || !canWrite ? '查看' : '编辑',
                  onClick: () => openEdit(record),
                },
                {
                  key: 'toggle',
                  label: record.roleStatus === 'ACTIVE' ? '停用' : '启用',
                  onClick: () => handleToggleStatus(record),
                  disabled: protectedRole || !canWrite,
                  confirm: {
                    title: record.roleStatus === 'ACTIVE' ? '确认停用该角色？' : '确认启用该角色？',
                    description:
                      record.roleStatus === 'ACTIVE'
                        ? '停用后该角色将不可被新授予。'
                        : undefined,
                  },
                },
                {
                  key: 'delete',
                  label: '退役',
                  variant: 'danger' as const,
                  onClick: () => handleDelete(record),
                  disabled: protectedRole || !canWrite,
                  confirm: {
                    title: '确认退役该角色？',
                    description: '退役为软删除，已授予该角色的用户授权将失效。',
                    okText: '退役',
                  },
                },
              ]}
            />
          );
        },
      },
    ],
    [canWrite, handleDelete, handleToggleStatus, openEdit],
  );

  const editingRoleProtected = editorMode === 'edit' && form.roleCode === PROTECTED_ROLE_CODE;
  // 受保护角色或无写权限 → 编辑器只读。
  const editorReadOnly = editingRoleProtected || !canWrite;

  const renderBody = () => {
    if (loading) {
      return (
        <div style={{ minHeight: '40vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <WxbSpinner tip="加载角色列表中…" />
        </div>
      );
    }
    return (
      <WxbDataTable<RoleListItem>
        rowKey="id"
        columns={columns}
        dataSource={roles}
        pagination={false}
        errorState={error ? { title: '加载失败', description: '角色列表加载失败' } : undefined}
        emptyState={{
          description: '暂无角色',
          action: canWrite ? (
            <WxbButton variant="secondary" onClick={openCreate}>
              新建角色
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
        title="角色管理"
        description="定义角色及其权限组合。受保护的系统管理员角色不可修改。修改后影响范围以授权用户为准。"
        meta={!loading && !error ? <WxbBadge variant="bar" status="info" label={`共 ${roles.length} 个角色`} /> : undefined}
        actions={
          canWrite ? (
            <WxbButton variant="primary" onClick={openCreate}>
              新建角色
            </WxbButton>
          ) : undefined
        }
      />
      <div style={{ marginTop: 'var(--wx-space-16)' }}>{renderBody()}</div>

      <WxbModal
        open={editorOpen}
        title={editorMode === 'create' ? '新建角色' : editorReadOnly ? '查看角色' : '编辑角色'}
        width={760}
        onCancel={() => setEditorOpen(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText={editorMode === 'create' ? '创建' : '保存'}
        footer={
          editorReadOnly ? (
            <div className="wxb-modal-footer">
              <WxbButton variant="ghost" onClick={() => setEditorOpen(false)}>
                关闭
              </WxbButton>
            </div>
          ) : editorMode === 'edit' && !detailLoaded ? (
            // 详情未加载（加载中或失败）：禁用保存，避免空权限覆盖。
            <div className="wxb-modal-footer">
              <WxbButton variant="ghost" onClick={() => setEditorOpen(false)}>
                取消
              </WxbButton>
              <WxbTooltip title={detailLoading ? '权限加载中…' : '权限未加载，无法保存'}>
                <span>
                  <WxbButton variant="primary" disabled>
                    保存
                  </WxbButton>
                </span>
              </WxbTooltip>
            </div>
          ) : undefined
        }
      >
        <RoleEditorBody
          form={form}
          setForm={setForm}
          mode={editorMode}
          readOnly={editorReadOnly}
          catalog={catalog}
          detailLoading={detailLoading}
          formError={formError}
          protectedNote={editingRoleProtected}
          onTogglePermission={togglePermission}
          onToggleCodes={toggleCodes}
        />
      </WxbModal>
      <RoleManagementStyles />
    </WxbPageShell>
  );
};

// ── 编辑器主体（基础字段 + 权限选择器） ─────────────────────────────
interface RoleEditorBodyProps {
  form: RoleFormState;
  setForm: React.Dispatch<React.SetStateAction<RoleFormState>>;
  mode: EditorMode;
  readOnly: boolean;
  catalog: PermissionDomainGroup[];
  detailLoading: boolean;
  formError: string | null;
  protectedNote: boolean;
  onTogglePermission: (code: string, checked: boolean) => void;
  onToggleCodes: (codes: string[], checked: boolean) => void;
}

const RoleEditorBody: React.FC<RoleEditorBodyProps> = ({
  form,
  setForm,
  mode,
  readOnly,
  catalog,
  detailLoading,
  formError,
  protectedNote,
  onTogglePermission,
  onToggleCodes,
}) => {
  const allCodes = useMemo(
    () => catalog.flatMap((d) => d.resources.flatMap((r) => r.actions.map((a) => a.permissionCode))),
    [catalog],
  );
  const selectedCount = form.permissionCodes.size;

  return (
    <div className="gv-role-editor">
      {protectedNote ? (
        <div className="gv-role-protected-note">
          系统管理员（GOVERNANCE_ADMIN）为受保护角色，拥有全部权限且不可修改。
        </div>
      ) : null}

      <div className="gv-role-fields">
        <WxbInput
          label="角色编码"
          placeholder="如 APS_PLANNER（创建后不可改）"
          value={form.roleCode}
          disabled={mode === 'edit' || readOnly}
          onChange={(e) => setForm((p) => ({ ...p, roleCode: e.target.value }))}
        />
        <WxbInput
          label="角色名称"
          placeholder="如 排程计划员"
          value={form.roleName}
          disabled={readOnly}
          onChange={(e) => setForm((p) => ({ ...p, roleName: e.target.value }))}
        />
      </div>

      <div className="gv-role-fields">
        <div className="wxb-field">
          <label className="wxb-label">业务域</label>
          <WxbSelect
            value={form.roleScope}
            disabled={readOnly}
            options={SCOPE_OPTIONS}
            onChange={(value) => setForm((p) => ({ ...p, roleScope: value as RoleScope }))}
            style={{ width: '100%' }}
          />
        </div>
        {mode === 'edit' ? (
          <div className="wxb-field">
            <label className="wxb-label">状态</label>
            <WxbSegmented
              options={STATUS_OPTIONS}
              value={form.roleStatus === 'RETIRED' ? 'INACTIVE' : form.roleStatus}
              onChange={(value) => setForm((p) => ({ ...p, roleStatus: value as RoleStatus }))}
            />
          </div>
        ) : (
          <div />
        )}
      </div>

      <div className="wxb-field">
        <label className="wxb-label">描述</label>
        <WxbTextarea
          placeholder="角色用途说明（可选）"
          value={form.description}
          disabled={readOnly}
          rows={2}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
        />
      </div>

      <div className="gv-role-perm-head">
        <span className="gv-role-perm-title">权限分配</span>
        <span className="gv-role-perm-count">
          已选 {selectedCount} / {allCodes.length}
        </span>
        {!readOnly && allCodes.length > 0 ? (
          <div className="gv-role-perm-bulk">
            <WxbButton
              variant="ghost"
              size="sm"
              onClick={() => onToggleCodes(allCodes, true)}
            >
              全选
            </WxbButton>
            <WxbButton
              variant="ghost"
              size="sm"
              onClick={() => onToggleCodes(allCodes, false)}
            >
              清空
            </WxbButton>
          </div>
        ) : null}
      </div>

      {detailLoading ? (
        <div style={{ padding: 'var(--wx-space-24)', display: 'flex', justifyContent: 'center' }}>
          <WxbSpinner tip="加载已分配权限…" />
        </div>
      ) : catalog.length === 0 ? (
        <WxbEmpty description="权限目录加载失败，无法编辑权限" />
      ) : (
        <PermissionTreeSelector
          catalog={catalog}
          selected={form.permissionCodes}
          readOnly={readOnly}
          onTogglePermission={onTogglePermission}
          onToggleCodes={onToggleCodes}
        />
      )}

      {formError ? <div className="gv-role-form-error">{formError}</div> : null}
    </div>
  );
};

// ── 权限树选择器（域 → 资源 → 动作，可折叠 + 按域全选） ───────────────
interface PermissionTreeSelectorProps {
  catalog: PermissionDomainGroup[];
  selected: Set<string>;
  readOnly: boolean;
  onTogglePermission: (code: string, checked: boolean) => void;
  onToggleCodes: (codes: string[], checked: boolean) => void;
}

const PermissionTreeSelector: React.FC<PermissionTreeSelectorProps> = ({
  catalog,
  selected,
  readOnly,
  onTogglePermission,
  onToggleCodes,
}) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = (domain: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  };

  return (
    <div className="gv-perm-tree">
      {catalog.map((domain) => {
        const domainCodes = domain.resources.flatMap((r) => r.actions.map((a) => a.permissionCode));
        const checkedCount = domainCodes.filter((c) => selected.has(c)).length;
        const allChecked = checkedCount === domainCodes.length && domainCodes.length > 0;
        const someChecked = checkedCount > 0 && !allChecked;
        const isCollapsed = collapsed.has(domain.domain);

        return (
          <div className="gv-perm-domain" key={domain.domain}>
            <div className="gv-perm-domain-head">
              <button
                type="button"
                className="gv-perm-collapse-btn"
                aria-label={isCollapsed ? '展开' : '折叠'}
                aria-expanded={!isCollapsed}
                onClick={() => toggleCollapse(domain.domain)}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="none"
                  style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s' }}
                >
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <WxbCheckbox
                checked={allChecked}
                indeterminate={someChecked}
                disabled={readOnly}
                onChange={(checked) => onToggleCodes(domainCodes, checked)}
              >
                <span className="gv-perm-domain-name">{domain.label}</span>
              </WxbCheckbox>
              <span className="gv-perm-domain-count">
                {checkedCount}/{domainCodes.length}
              </span>
            </div>

            {!isCollapsed ? (
              <div className="gv-perm-resources">
                {domain.resources.map((resource) => {
                  const resourceCodes = resource.actions.map((a) => a.permissionCode);
                  const resChecked = resourceCodes.filter((c) => selected.has(c)).length;
                  const resAll = resChecked === resourceCodes.length && resourceCodes.length > 0;
                  const resSome = resChecked > 0 && !resAll;
                  return (
                    <div className="gv-perm-resource" key={`${domain.domain}-${resource.resourceCode}`}>
                      <div className="gv-perm-resource-head">
                        <WxbCheckbox
                          checked={resAll}
                          indeterminate={resSome}
                          disabled={readOnly}
                          onChange={(checked) => onToggleCodes(resourceCodes, checked)}
                        >
                          <span className="gv-perm-resource-name">{resource.label}</span>
                        </WxbCheckbox>
                      </div>
                      <div className="gv-perm-actions">
                        {resource.actions.map((action) => (
                          <WxbTooltip key={action.permissionCode} title={action.permissionCode}>
                            <span className="gv-perm-action">
                              <WxbCheckbox
                                checked={selected.has(action.permissionCode)}
                                disabled={readOnly}
                                onChange={(checked) => onTogglePermission(action.permissionCode, checked)}
                              >
                                {action.permissionName}
                              </WxbCheckbox>
                            </span>
                          </WxbTooltip>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

const RoleManagementStyles: React.FC = () => (
  <style>{`
    .gv-role-editor { display: flex; flex-direction: column; gap: var(--wx-space-16, 16px); }
    .gv-role-protected-note { padding: var(--wx-space-8, 8px) var(--wx-space-12, 12px); border-radius: var(--wx-radius-sm, 6px); background: var(--wx-amber-50, #FFF7E6); color: var(--wx-amber-700, #8A6100); font-size: var(--wx-fs-13, 13px); }
    .gv-role-fields { display: grid; grid-template-columns: 1fr 1fr; gap: var(--wx-space-16, 16px); }
    .gv-role-perm-head { display: flex; align-items: center; gap: var(--wx-space-12, 12px); margin-top: var(--wx-space-8, 8px); }
    .gv-role-perm-title { font-weight: 600; color: var(--wx-fg-1, #1B2733); }
    .gv-role-perm-count { font-size: var(--wx-fs-12, 12px); color: var(--wx-fg-3, #5A6B7B); }
    .gv-role-perm-bulk { margin-left: auto; display: flex; gap: var(--wx-space-4, 4px); }
    .gv-role-form-error { color: var(--wx-red-600, #C92A2A); font-size: var(--wx-fs-13, 13px); }
    .gv-perm-tree { max-height: 360px; overflow-y: auto; border: 1px solid var(--wx-border, #E2E8F0); border-radius: var(--wx-radius-md, 8px); padding: var(--wx-space-8, 8px); display: flex; flex-direction: column; gap: var(--wx-space-4, 4px); }
    .gv-perm-domain { border-bottom: 1px solid var(--wx-border-subtle, #EDF1F6); padding-bottom: var(--wx-space-8, 8px); }
    .gv-perm-domain:last-child { border-bottom: none; padding-bottom: 0; }
    .gv-perm-domain-head { display: flex; align-items: center; gap: var(--wx-space-8, 8px); padding: var(--wx-space-4, 4px) var(--wx-space-8, 8px); }
    .gv-perm-collapse-btn { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border: none; background: transparent; color: var(--wx-fg-3, #5A6B7B); cursor: pointer; padding: 0; }
    .gv-perm-domain-name { font-weight: 600; color: var(--wx-fg-1, #1B2733); }
    .gv-perm-domain-count { font-size: var(--wx-fs-12, 12px); color: var(--wx-fg-3, #5A6B7B); margin-left: auto; }
    .gv-perm-resources { padding-left: var(--wx-space-24, 24px); display: flex; flex-direction: column; gap: var(--wx-space-8, 8px); margin-top: var(--wx-space-4, 4px); }
    .gv-perm-resource-head { margin-bottom: var(--wx-space-4, 4px); }
    .gv-perm-resource-name { font-weight: 500; color: var(--wx-fg-2, #344150); }
    .gv-perm-actions { padding-left: var(--wx-space-24, 24px); display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--wx-space-4, 4px) var(--wx-space-12, 12px); }
    .gv-perm-action { display: inline-flex; }
  `}</style>
);

export default RoleManagementPage;

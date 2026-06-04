/**
 * PermissionCatalogPage —— 只读权限目录（/governance/permissions）。
 *
 * 按 域 → 资源 → 动作 三级分组展示全部 ACTIVE 权限（63 条），供管理员查阅。
 * 数据走 governanceApi.getPermissionCatalog()（已按 sort_order 排好序、仅含 ACTIVE）。
 * 全部用 wxb-ui 组件、CSS 变量配色、无 emoji（图标用内联 SVG / WxbIcon）。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  WxbPageShell,
  WxbPageHeader,
  WxbButton,
  WxbSearchInput,
  WxbSpinner,
  WxbEmpty,
  WxbBadge,
  WxbTag,
  WxbCollapse,
} from '../../components/wxb-ui';
import { governanceApi, PermissionDomainGroup } from '../../services/governanceApi';
import { wxbToast } from '../../components/wxb-ui/Toast/Toast';

const RefreshMark: React.FC = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5V5H11"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PermissionCatalogPage: React.FC = () => {
  const [catalog, setCatalog] = useState<PermissionDomainGroup[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const [keyword, setKeyword] = useState<string>('');

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await governanceApi.getPermissionCatalog();
      setCatalog(data);
    } catch (err) {
      setError(true);
      wxbToast.error('加载权限目录失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const totalCount = useMemo(
    () =>
      catalog.reduce(
        (sum, domain) =>
          sum + domain.resources.reduce((rSum, resource) => rSum + resource.actions.length, 0),
        0,
      ),
    [catalog],
  );

  // 关键词过滤：匹配权限中文名 / 权限码 / 资源标签 / 域标签。
  const filtered = useMemo<PermissionDomainGroup[]>(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return catalog;
    return catalog
      .map((domain) => {
        const domainHit = domain.label.toLowerCase().includes(kw) || domain.domain.toLowerCase().includes(kw);
        const resources = domain.resources
          .map((resource) => {
            const resourceHit =
              resource.label.toLowerCase().includes(kw) || resource.resourceCode.toLowerCase().includes(kw);
            const actions = resource.actions.filter(
              (action) =>
                action.permissionName.toLowerCase().includes(kw) ||
                action.permissionCode.toLowerCase().includes(kw) ||
                action.actionCode.toLowerCase().includes(kw),
            );
            if (domainHit || resourceHit) return resource;
            if (actions.length > 0) return { ...resource, actions };
            return null;
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);
        if (domainHit) return domain;
        if (resources.length > 0) return { ...domain, resources };
        return null;
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);
  }, [catalog, keyword]);

  const collapseItems = useMemo(
    () =>
      filtered.map((domain) => {
        const domainCount = domain.resources.reduce((sum, r) => sum + r.actions.length, 0);
        return {
          key: domain.domain,
          label: (
            <span className="gv-catalog-domain-label">
              <span className="gv-catalog-domain-name">{domain.label}</span>
              <WxbBadge variant="code" label={domain.domain} status="info" />
              <span className="gv-catalog-domain-count">{domainCount} 项权限</span>
            </span>
          ),
          children: (
            <div className="gv-catalog-resources">
              {domain.resources.map((resource) => (
                <div className="gv-catalog-resource" key={`${domain.domain}-${resource.resourceCode}`}>
                  <div className="gv-catalog-resource-head">
                    <span className="gv-catalog-resource-name">{resource.label}</span>
                    <WxbBadge variant="outline" code="资源" label={resource.resourceCode} status="neutral" />
                  </div>
                  <div className="gv-catalog-actions">
                    {resource.actions.map((action) => (
                      <div className="gv-catalog-action" key={action.permissionCode}>
                        <div className="gv-catalog-action-main">
                          <span className="gv-catalog-action-name">{action.permissionName}</span>
                          <WxbTag color="blue">{action.actionCode}</WxbTag>
                        </div>
                        <code className="gv-catalog-action-code">{action.permissionCode}</code>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ),
        };
      }),
    [filtered],
  );

  const renderBody = () => {
    if (loading) {
      return (
        <div style={{ minHeight: '40vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <WxbSpinner tip="加载权限目录中…" />
        </div>
      );
    }
    if (error) {
      return (
        <WxbEmpty
          description="加载权限目录失败"
          action={
            <WxbButton variant="secondary" onClick={loadCatalog}>
              重试
            </WxbButton>
          }
        />
      );
    }
    if (filtered.length === 0) {
      return <WxbEmpty description={keyword ? '没有匹配的权限' : '暂无权限数据'} />;
    }
    return (
      <WxbCollapse
        key={keyword.trim()}
        items={collapseItems}
        defaultActiveKeys={filtered.map((d) => d.domain)}
      />
    );
  };

  return (
    <WxbPageShell>
      <WxbPageHeader
        eyebrow="权限治理"
        title="权限目录"
        description="系统全部可授予权限的只读视图，按业务域 → 资源 → 动作分组展示，供管理员查阅与配置角色时参照。"
        meta={!loading && !error ? <WxbBadge variant="bar" status="info" label={`共 ${totalCount} 项权限`} /> : undefined}
        actions={
          <>
            <div style={{ width: 240 }}>
              <WxbSearchInput
                placeholder="搜索权限名 / 权限码 / 资源"
                value={keyword}
                onChange={setKeyword}
                allowClear
              />
            </div>
            <WxbButton variant="secondary" onClick={loadCatalog} disabled={loading}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <RefreshMark />
                刷新
              </span>
            </WxbButton>
          </>
        }
      />
      <div style={{ marginTop: 'var(--wx-space-16)' }}>{renderBody()}</div>
      <PermissionCatalogStyles />
    </WxbPageShell>
  );
};

/** 页内局部样式：仅用 CSS 变量，不写死 hex。 */
const PermissionCatalogStyles: React.FC = () => (
  <style>{`
    .gv-catalog-domain-label { display: inline-flex; align-items: center; gap: var(--wx-space-12, 12px); }
    .gv-catalog-domain-name { font-weight: 600; color: var(--wx-fg-1, #1B2733); }
    .gv-catalog-domain-count { font-size: var(--wx-fs-12, 12px); color: var(--wx-fg-3, #5A6B7B); }
    .gv-catalog-resources { display: flex; flex-direction: column; gap: var(--wx-space-16, 16px); padding: var(--wx-space-8, 8px) 0; }
    .gv-catalog-resource { border: 1px solid var(--wx-border, #E2E8F0); border-radius: var(--wx-radius-md, 8px); padding: var(--wx-space-12, 12px) var(--wx-space-16, 16px); background: var(--wx-surface-1, #FFFFFF); }
    .gv-catalog-resource-head { display: flex; align-items: center; gap: var(--wx-space-8, 8px); margin-bottom: var(--wx-space-12, 12px); }
    .gv-catalog-resource-name { font-weight: 600; color: var(--wx-fg-2, #344150); }
    .gv-catalog-actions { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: var(--wx-space-8, 8px); }
    .gv-catalog-action { display: flex; flex-direction: column; gap: 4px; padding: var(--wx-space-8, 8px) var(--wx-space-12, 12px); border-radius: var(--wx-radius-sm, 6px); background: var(--wx-surface-2, #F5F8FB); }
    .gv-catalog-action-main { display: flex; align-items: center; gap: var(--wx-space-8, 8px); justify-content: space-between; }
    .gv-catalog-action-name { font-size: var(--wx-fs-14, 14px); color: var(--wx-fg-1, #1B2733); }
    .gv-catalog-action-code { font-size: var(--wx-fs-12, 12px); color: var(--wx-fg-3, #5A6B7B); font-family: var(--wx-font-mono, ui-monospace, monospace); }
  `}</style>
);

export default PermissionCatalogPage;

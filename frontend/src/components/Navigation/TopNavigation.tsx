import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ApartmentOutlined,
  AreaChartOutlined,
  BellOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  DownOutlined,
  ExperimentOutlined,
  ProjectOutlined,
  RocketOutlined,
  SafetyOutlined,
  ScheduleOutlined,
  SearchOutlined,
  SettingOutlined,
  TableOutlined,
  LogoutOutlined,
  TeamOutlined,
  KeyOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import { WxbDropdown } from '../wxb-ui/Dropdown/Dropdown';
import { useAuth } from '../../contexts/AuthContext';
import { isAuthEnforced } from '../auth/ProtectedRoute';
import './TopNavigation.css';

type NavLeaf = {
  key: string;
  label: string;
  path: string;
  icon: React.ReactNode;
  /** 需要的权限码（permission_code）；不传则所有人可见。 */
  requiredPermission?: string;
};

type NavGroup = {
  key: string;
  label: string;
  subtitle: string;
  path?: string;
  icon: React.ReactNode;
  children?: NavLeaf[];
  /** 顶层入口需要的权限码（无 children 的组用）。 */
  requiredPermission?: string;
};

const navGroups: NavGroup[] = [
  {
    key: 'dashboard',
    label: '调度中心',
    subtitle: 'Overview',
    path: '/dashboard',
    icon: <DashboardOutlined />,
    requiredPermission: 'SYSTEM_DASHBOARD_READ',
  },
  {
    key: 'operations-overview',
    label: '运营总览',
    subtitle: 'Ops Overview',
    path: '/operations-overview',
    icon: <AreaChartOutlined />,
    requiredPermission: 'SYSTEM_DASHBOARD_READ',
  },
  {
    key: 'my-schedule',
    label: '我的排班',
    subtitle: 'My Shifts',
    path: '/my-schedule',
    icon: <ClockCircleOutlined />,
    requiredPermission: 'ROSTER_SCHEDULE_READ',
  },
  {
    key: 'base-data',
    label: '基础数据',
    subtitle: 'Master Data',
    icon: <SettingOutlined />,
    children: [
      { key: 'equipment-management', icon: <SettingOutlined />, label: '资源节点管理', path: '/equipment-management', requiredPermission: 'MASTER_RESOURCE_READ' },
      { key: 'qualifications', icon: <SafetyOutlined />, label: '资质管理', path: '/qualifications', requiredPermission: 'MASTER_QUALIFICATION_READ' },
      { key: 'qualification-matrix', icon: <TableOutlined />, label: '资质矩阵', path: '/qualification-matrix', requiredPermission: 'MASTER_QUALIFICATION_READ' },
      { key: 'operations', icon: <SettingOutlined />, label: '操作管理', path: '/operations', requiredPermission: 'MASTER_OPERATION_READ' },
      { key: 'operation-types', icon: <ProjectOutlined />, label: '操作类型', path: '/operation-types', requiredPermission: 'MASTER_OPERATION_READ' },
    ],
  },
  {
    key: 'production',
    label: '生产计划',
    subtitle: 'Operations',
    icon: <ProjectOutlined />,
    children: [
      { key: 'process-templates', icon: <ProjectOutlined />, label: '工艺模版', path: '/process-templates', requiredPermission: 'APS_TEMPLATE_READ' },
      { key: 'batch-management-v4', icon: <ProjectOutlined />, label: '批次管理 V4', path: '/batch-management-v4', requiredPermission: 'APS_BATCH_READ' },
      { key: 'batch-management-workbench-v2', icon: <ProjectOutlined />, label: '批次管理工作台 V2', path: '/batch-management-workbench-v2', requiredPermission: 'APS_BATCH_READ' },
    ],
  },
  {
    key: 'personnel',
    label: '人员与排班',
    subtitle: 'Workforce',
    icon: <ApartmentOutlined />,
    children: [
      { key: 'organization-workbench', icon: <ApartmentOutlined />, label: '组织与人员', path: '/organization-workbench', requiredPermission: 'MASTER_EMPLOYEE_READ' },
      { key: 'personnel-scheduling', icon: <ClockCircleOutlined />, label: '人员排班', path: '/personnel-scheduling', requiredPermission: 'ROSTER_SCHEDULE_READ' },
      { key: 'roster-triage', icon: <TeamOutlined />, label: '排班分诊台', path: '/roster/triage', requiredPermission: 'ROSTER_SCHEDULE_READ' },
      { key: 'roster-leadership-cockpit', icon: <DashboardOutlined />, label: '工厂人力韧性驾驶舱', path: '/roster/leadership-cockpit', requiredPermission: 'ROSTER_COCKPIT_READ' },
      { key: 'roster-exceptions', icon: <ScheduleOutlined />, label: '异常排班快速修复', path: '/roster/exceptions', requiredPermission: 'ROSTER_EXCEPTION_PREVIEW' },
      { key: 'solver-v4', icon: <RocketOutlined />, label: 'V4 自动排班', path: '/solver-v4', requiredPermission: 'SOLVER_RUN_READ' },
      { key: 'solver-v5', icon: <ExperimentOutlined />, label: 'V5 自动排班（增强可视化）', path: '/solver-v5', requiredPermission: 'SOLVER_RUN_READ' },
      { key: 'shift-definitions', icon: <ScheduleOutlined />, label: '班次定义', path: '/shift-definitions', requiredPermission: 'MASTER_SHIFT_DEF_READ' },
    ],
  },
  {
    key: 'governance',
    label: '权限治理',
    subtitle: 'Governance',
    icon: <SafetyOutlined />,
    children: [
      { key: 'governance-roles', icon: <KeyOutlined />, label: '角色管理', path: '/governance/roles', requiredPermission: 'GOVERNANCE_ROLE_READ' },
      { key: 'governance-users', icon: <UserSwitchOutlined />, label: '用户授权', path: '/governance/users', requiredPermission: 'GOVERNANCE_USER_READ' },
      { key: 'governance-permissions', icon: <TeamOutlined />, label: '权限目录', path: '/governance/permissions', requiredPermission: 'GOVERNANCE_ROLE_READ' },
    ],
  },
  {
    key: 'ui-kit',
    label: 'UI 组件库',
    subtitle: 'Design System',
    icon: <RocketOutlined />,
    children: [
      { key: 'ui-kit-home', icon: <RocketOutlined />, label: 'wxb-ui 组件库', path: '/ui-kit' },
      // ↓ 排产新系统「原型 / Mock」——尚未接后端、仅 mock 数据,放此处供 UI 评审,
      //   明确与「生产计划」下的上线功能区隔,避免测试用户误判为可用功能。
      { key: 'process-flow-builder', icon: <ExperimentOutlined />, label: '排产原型 · 主工艺构建', path: '/process-flow-builder', requiredPermission: 'APS_TEMPLATE_READ' },
      { key: 'production-scheduling', icon: <ExperimentOutlined />, label: '排产原型 · 排产结果', path: '/production-scheduling', requiredPermission: 'APS_TEMPLATE_READ' },
      { key: 'process-flow-templates', icon: <ExperimentOutlined />, label: '排产原型 · 工艺模板列表', path: '/process-flow-templates', requiredPermission: 'APS_TEMPLATE_READ' },
      { key: 'equipment-state-machine', icon: <ExperimentOutlined />, label: '排产原型 · 设备状态机', path: '/equipment-state-machine', requiredPermission: 'APS_TEMPLATE_READ' },
      { key: 'derivable-library', icon: <ExperimentOutlined />, label: '排产原型 · 派生库', path: '/derivable-library', requiredPermission: 'APS_TEMPLATE_READ' },
      { key: 'ps-resource-master', icon: <ExperimentOutlined />, label: '排产原型 · 资源主数据', path: '/ps-resource-master', requiredPermission: 'APS_TEMPLATE_READ' },
      { key: 'factory-sandtable', icon: <ExperimentOutlined />, label: '排产原型 · 工厂沙盘', path: '/factory-sandtable', requiredPermission: 'APS_TEMPLATE_READ' },
    ],
  },
];

const normalize = (value: string) => value.trim().toLowerCase();

const matchesPath = (pathname: string, path: string) => {
  if (path === '/dashboard') {
    return pathname === '/' || pathname === '/dashboard';
  }

  return pathname === path || pathname.startsWith(`${path}/`);
};

const getGroupSelection = (pathname: string, groups: NavGroup[]) => {
  for (const group of groups) {
    if (group.path && matchesPath(pathname, group.path)) {
      return { group, child: undefined };
    }

    const child = group.children?.find((item) => matchesPath(pathname, item.path));
    if (child) {
      return { group, child };
    }
  }

  return { group: groups[0], child: undefined };
};

const getAvatarInitials = (displayName?: string): string => {
  if (!displayName) return 'APS';
  const trimmed = displayName.trim();
  if (!trimmed) return 'APS';
  // 中文取末两字，英文取前两字符。
  if (/[一-龥]/.test(trimmed)) {
    return trimmed.slice(-2);
  }
  return trimmed.slice(0, 2).toUpperCase();
};

export default function TopNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, hasPermission } = useAuth();

  // 按权限过滤导航：隐藏无权限的菜单项；过滤后子项为空的分组整组隐藏。
  // 影子模式（REACT_APP_AUTH_ENFORCE !== 'true'）下匿名用户放行全部菜单，
  // 与 ProtectedRoute 的 allowAnonymousInShadow 语义对齐——避免未登录的现有前端看到空导航。
  // 一旦登录（即便仍在影子模式），便按权限过滤，与路由守卫对 requiredPermission 的把关一致。
  const canSee = useCallback(
    (requiredPermission?: string) => {
      if (!requiredPermission) return true;
      if (!user && !isAuthEnforced()) return true;
      return hasPermission(requiredPermission);
    },
    [user, hasPermission],
  );

  const visibleGroups = useMemo(
    () =>
      navGroups.reduce<NavGroup[]>((acc, group) => {
        if (group.children) {
          const children = group.children.filter((child) => canSee(child.requiredPermission));
          if (children.length > 0) {
            acc.push({ ...group, children });
          }
          return acc;
        }
        if (canSee(group.requiredPermission)) {
          acc.push(group);
        }
        return acc;
      }, []),
    [canSee],
  );

  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);
  const navRef = useRef<HTMLElement | null>(null);
  const linksRef = useRef<HTMLDivElement | null>(null);
  const linkRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pillStyle, setPillStyle] = useState({ left: 0, width: 0, opacity: 0 });
  const [searchTerm, setSearchTerm] = useState('');
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0, minWidth: 220 });

  const { group: activeGroup, child: activeChild } = useMemo(
    () => getGroupSelection(location.pathname, visibleGroups),
    [location.pathname, visibleGroups],
  );

  const searchableRoutes = useMemo(
    () => visibleGroups.reduce<Array<{ key: string; label: string; path: string; group: string }>>(
      (routes, group) => {
        if (group.path) {
          routes.push({ key: group.key, label: group.label, path: group.path, group: group.label });
          return routes;
        }

        (group.children ?? []).forEach((child) => {
          routes.push({
            key: child.key,
            label: child.label,
            path: child.path,
            group: group.label,
          });
        });

        return routes;
      },
      [],
    ),
    [visibleGroups],
  );

  const movePill = useCallback((key: string) => {
    const links = linksRef.current;
    const target = linkRefs.current[key];

    if (!links || !target) {
      setPillStyle((current) => ({ ...current, opacity: 0 }));
      return;
    }

    const linksRect = links.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    setPillStyle({
      left: targetRect.left - linksRect.left,
      width: targetRect.width,
      opacity: 1,
    });
  }, []);

  const openMenu = useCallback((key: string) => {
    const target = linkRefs.current[key];

    if (target) {
      const rect = target.getBoundingClientRect();
      setMenuPosition({
        left: rect.left,
        top: rect.bottom + 8,
        minWidth: Math.max(220, rect.width),
      });
    }

    setOpenGroupKey(key);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => movePill(activeGroup?.key ?? ''));
    const handleResize = () => {
      movePill(activeGroup?.key ?? '');

      if (openGroupKey) {
        const target = linkRefs.current[openGroupKey];
        if (target) {
          const rect = target.getBoundingClientRect();
          setMenuPosition({
            left: rect.left,
            top: rect.bottom + 8,
            minWidth: Math.max(220, rect.width),
          });
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', handleResize);
    };
  }, [activeGroup?.key, movePill, openGroupKey]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (target instanceof Node && navRef.current?.contains(target)) {
        return;
      }

      setOpenGroupKey(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenGroupKey(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleNavigate = useCallback(
    (path: string) => {
      navigate(path);
      setSearchTerm('');
      setOpenGroupKey(null);
    },
    [navigate],
  );

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = normalize(searchTerm);

    if (!query) return;

    const match = searchableRoutes.find((route) =>
      normalize(`${route.label} ${route.group} ${route.path}`).includes(query),
    );

    if (match) {
      handleNavigate(match.path);
    }
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`);
  };

  return (
    <header className="wxb-topnav-shell">
      <nav
        aria-label="主导航"
        className="wxb-topnav"
        onMouseMove={handleMouseMove}
        ref={navRef}
      >
        <button
          aria-label="返回调度中心"
          className="wxb-topnav-logo"
          onClick={() => handleNavigate('/dashboard')}
          type="button"
        >
          <span className="wxb-topnav-mark">
            <img alt="" src="/wuxibio-icon.svg" />
          </span>
          <span className="wxb-topnav-name">
            <span className="wxb-topnav-name-main">MFG8 APS</span>
            <span className="wxb-topnav-name-sub">WuXi Biologics</span>
          </span>
        </button>

        <div
          className="wxb-topnav-links"
          onMouseLeave={() => movePill(activeGroup?.key ?? '')}
          ref={linksRef}
        >
          <span
            aria-hidden="true"
            className="wxb-topnav-pill"
            style={{
              left: pillStyle.left,
              opacity: pillStyle.opacity,
              width: pillStyle.width,
            }}
          />

          {visibleGroups.map((item) => {
            const active = item.key === activeGroup?.key;
            const childItems = item.children;
            const menuOpen = openGroupKey === item.key;

            const linkButton = (
              <button
                aria-current={active ? 'page' : undefined}
                aria-expanded={childItems ? menuOpen : undefined}
                aria-haspopup={childItems ? 'menu' : undefined}
                className={`wxb-topnav-link${active ? ' is-active' : ''}`}
                onClick={(event) => {
                  event.stopPropagation();

                  if (item.path) {
                    handleNavigate(item.path);
                    return;
                  }

                  openMenu(item.key);
                }}
                onFocus={() => movePill(item.key)}
                onKeyDown={(event) => {
                  if (childItems && event.key === 'ArrowDown') {
                    event.preventDefault();
                    openMenu(item.key);
                  }
                }}
                onMouseEnter={() => movePill(item.key)}
                ref={(node) => {
                  linkRefs.current[item.key] = node;
                }}
                type="button"
              >
                <span className="wxb-topnav-link-icon">{item.icon}</span>
                <span className="wxb-topnav-link-copy">
                  <span className="wxb-topnav-link-label">{item.label}</span>
                  <span className="wxb-topnav-link-subtitle">{item.subtitle}</span>
                </span>
                {childItems ? <DownOutlined className="wxb-topnav-link-caret" /> : null}
              </button>
            );

            return childItems ? (
              <div
                className="wxb-topnav-menu-wrap"
                key={item.key}
                onBlur={(event) => {
                  const nextFocus = event.relatedTarget;
                  if (!(nextFocus instanceof Node) || !event.currentTarget.contains(nextFocus)) {
                    setOpenGroupKey(null);
                  }
                }}
              >
                {linkButton}
                {menuOpen ? (
                  <div
                    className="wxb-topnav-menu"
                    role="menu"
                    style={{
                      left: menuPosition.left,
                      minWidth: menuPosition.minWidth,
                      top: menuPosition.top,
                    }}
                  >
                    <div className="wxb-topnav-menu-title">{item.label}</div>
                    {childItems.map((child) => {
                      const childActive = activeChild?.key === child.key;

                      return (
                        <button
                          className={`wxb-topnav-menu-item${childActive ? ' is-active' : ''}`}
                          key={child.key}
                          onClick={() => handleNavigate(child.path)}
                          role="menuitem"
                          type="button"
                        >
                          <span className="wxb-topnav-menu-icon">{child.icon}</span>
                          <span>{child.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : (
              <React.Fragment key={item.key}>{linkButton}</React.Fragment>
            );
          })}
        </div>

        <div className="wxb-topnav-spacer" />

        <div className="wxb-topnav-right">
          <form className="wxb-topnav-search" onSubmit={handleSearchSubmit}>
            <input
              aria-label="搜索页面"
              list="wxb-topnav-route-options"
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search pages..."
              value={searchTerm}
            />
            <SearchOutlined className="wxb-topnav-search-icon" />
            <span className="wxb-topnav-search-kbd">Ctrl K</span>
            <datalist id="wxb-topnav-route-options">
              {searchableRoutes.map((route) => (
                <option key={route.key} value={route.label} />
              ))}
            </datalist>
          </form>

          <button aria-label="通知" className="wxb-topnav-icon-button" type="button">
            <BellOutlined className="wxb-topnav-bell" />
            <span className="wxb-topnav-notification-dot" />
          </button>

          <WxbDropdown
            trigger={['click']}
            placement="bottomRight"
            menu={{
              items: [
                {
                  key: 'user-info',
                  label: (
                    <div style={{ padding: '4px 0', lineHeight: 1.4 }}>
                      <div style={{ fontWeight: 600, color: 'var(--wx-fg-1)' }}>
                        {user?.displayName || '未登录'}
                      </div>
                      {user?.username ? (
                        <div style={{ fontSize: 'var(--wx-fs-12)', color: 'var(--wx-fg-3)' }}>
                          @{user.username}
                        </div>
                      ) : null}
                    </div>
                  ),
                  disabled: true,
                },
                { type: 'divider' as const },
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: '退出登录',
                  onClick: handleLogout,
                },
              ],
            }}
          >
            <button aria-label="当前用户" className="wxb-topnav-avatar" type="button">
              {getAvatarInitials(user?.displayName)}
              <span className="wxb-topnav-presence" />
            </button>
          </WxbDropdown>
        </div>
      </nav>
    </header>
  );
}

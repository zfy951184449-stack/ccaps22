import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ApartmentOutlined,
  BellOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  DownOutlined,
  ProjectOutlined,
  RocketOutlined,
  SafetyOutlined,
  ScheduleOutlined,
  SearchOutlined,
  SettingOutlined,
  TableOutlined,
} from '@ant-design/icons';
import './TopNavigation.css';

type NavLeaf = {
  key: string;
  label: string;
  path: string;
  icon: React.ReactNode;
};

type NavGroup = {
  key: string;
  label: string;
  subtitle: string;
  path?: string;
  icon: React.ReactNode;
  children?: NavLeaf[];
};

const navGroups: NavGroup[] = [
  {
    key: 'dashboard',
    label: '调度中心',
    subtitle: 'Overview',
    path: '/dashboard',
    icon: <DashboardOutlined />,
  },
  {
    key: 'base-data',
    label: '基础数据',
    subtitle: 'Master Data',
    icon: <SettingOutlined />,
    children: [
      { key: 'equipment-management', icon: <SettingOutlined />, label: '资源节点管理', path: '/equipment-management' },
      { key: 'qualifications', icon: <SafetyOutlined />, label: '资质管理', path: '/qualifications' },
      { key: 'qualification-matrix', icon: <TableOutlined />, label: '资质矩阵', path: '/qualification-matrix' },
      { key: 'operations', icon: <SettingOutlined />, label: '操作管理', path: '/operations' },
      { key: 'operation-types', icon: <ProjectOutlined />, label: '操作类型', path: '/operation-types' },
    ],
  },
  {
    key: 'production',
    label: '生产计划',
    subtitle: 'Operations',
    icon: <ProjectOutlined />,
    children: [
      { key: 'process-templates', icon: <ProjectOutlined />, label: '工艺模版', path: '/process-templates' },
      { key: 'process-templates-v2', icon: <ProjectOutlined />, label: '工艺模版 V2', path: '/process-templates-v2' },
      { key: 'process-templates-v3', icon: <ProjectOutlined />, label: '工艺模版 V3', path: '/process-templates-v3' },
      { key: 'batch-management-v4', icon: <ProjectOutlined />, label: '批次管理 V4', path: '/batch-management-v4' },
    ],
  },
  {
    key: 'personnel',
    label: '人员与排班',
    subtitle: 'Workforce',
    icon: <ApartmentOutlined />,
    children: [
      { key: 'organization-workbench', icon: <ApartmentOutlined />, label: '组织与人员', path: '/organization-workbench' },
      { key: 'personnel-scheduling', icon: <ClockCircleOutlined />, label: '人员排班', path: '/personnel-scheduling' },
      { key: 'solver-v4', icon: <RocketOutlined />, label: 'V4 自动排班', path: '/solver-v4' },
      { key: 'shift-definitions', icon: <ScheduleOutlined />, label: '班次定义', path: '/shift-definitions' },
    ],
  },
  {
    key: 'ui-kit',
    label: 'UI 组件库',
    subtitle: 'Design System',
    path: '/ui-kit',
    icon: <RocketOutlined />,
  },
];

const normalize = (value: string) => value.trim().toLowerCase();

const matchesPath = (pathname: string, path: string) => {
  if (path === '/dashboard') {
    return pathname === '/' || pathname === '/dashboard';
  }

  return pathname === path || pathname.startsWith(`${path}/`);
};

const getGroupSelection = (pathname: string) => {
  for (const group of navGroups) {
    if (group.path && matchesPath(pathname, group.path)) {
      return { group, child: undefined };
    }

    const child = group.children?.find((item) => matchesPath(pathname, item.path));
    if (child) {
      return { group, child };
    }
  }

  return { group: navGroups[0], child: undefined };
};

export default function TopNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const navRef = useRef<HTMLElement | null>(null);
  const linksRef = useRef<HTMLDivElement | null>(null);
  const linkRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pillStyle, setPillStyle] = useState({ left: 0, width: 0, opacity: 0 });
  const [searchTerm, setSearchTerm] = useState('');
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0, minWidth: 220 });

  const { group: activeGroup, child: activeChild } = useMemo(
    () => getGroupSelection(location.pathname),
    [location.pathname],
  );

  const searchableRoutes = useMemo(
    () => navGroups.reduce<Array<{ key: string; label: string; path: string; group: string }>>(
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
    [],
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
    const frame = window.requestAnimationFrame(() => movePill(activeGroup.key));
    const handleResize = () => {
      movePill(activeGroup.key);

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
  }, [activeGroup.key, movePill, openGroupKey]);

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
          onMouseLeave={() => movePill(activeGroup.key)}
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

          {navGroups.map((item) => {
            const active = item.key === activeGroup.key;
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

          <span aria-label="当前用户" className="wxb-topnav-avatar" role="img">
            APS
            <span className="wxb-topnav-presence" />
          </span>
        </div>
      </nav>
    </header>
  );
}

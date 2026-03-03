import React, { useState } from 'react';
import { Popover } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    SafetyOutlined,
    SettingOutlined,
    ProjectOutlined,
    LinkOutlined,
    TableOutlined,
    ClockCircleOutlined,
    ApartmentOutlined,
    ScheduleOutlined,
    AppstoreOutlined,
    DashboardOutlined,
    ControlOutlined,
    BugOutlined,
    RobotOutlined,
    RocketOutlined,
} from '@ant-design/icons';

interface CommandRailProps {
    width?: number;
}

const CommandRail: React.FC<CommandRailProps> = ({ width = 64 }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [hoveredKey, setHoveredKey] = useState<string | null>(null);

    // Reusing the menu logic from App.tsx but adapted for the rail
    // Grouping top-level items for the rail icons
    const railItems = [
        {
            key: 'dashboard',
            icon: <DashboardOutlined />,
            label: '调度中心',
            path: '/dashboard',
        },
        {
            key: 'platform',
            icon: <AppstoreOutlined />,
            label: '平台协同',
            children: [
                { key: 'platform-overview', icon: <DashboardOutlined />, label: '平台总览', path: '/platform-overview' },
                { key: 'resource-center', icon: <SettingOutlined />, label: '资源中心', path: '/resource-center' },
                { key: 'project-planning-center', icon: <ProjectOutlined />, label: '项目排产中心', path: '/project-planning-center' },
                { key: 'maintenance-windows', icon: <ControlOutlined />, label: '维护窗口', path: '/maintenance-windows' },
                { key: 'business-rules-center', icon: <LinkOutlined />, label: '业务规则中心', path: '/business-rules-center' },
                { key: 'platform-run-monitor', icon: <BugOutlined />, label: '运行监控', path: '/platform-run-monitor' },
            ],
        },
        {
            key: 'base-data',
            icon: <SettingOutlined />,
            label: '基础数据',
            children: [
                { key: 'qualifications', icon: <SafetyOutlined />, label: '资质管理', path: '/qualifications' },
                { key: 'qualification-matrix', icon: <TableOutlined />, label: '资质矩阵', path: '/qualification-matrix' },
                { key: 'operations', icon: <SettingOutlined />, label: '操作管理', path: '/operations' },
                { key: 'operation-types', icon: <AppstoreOutlined />, label: '操作类型', path: '/operation-types' },
            ],
        },
        {
            key: 'production',
            icon: <ProjectOutlined />,
            label: '生产计划',
            children: [
                { key: 'process-templates', icon: <ProjectOutlined />, label: '工艺模版', path: '/process-templates' },
                { key: 'process-templates-v2', icon: <ProjectOutlined />, label: '工艺模版 V2', path: '/process-templates-v2' },
                { key: 'batch-management', icon: <AppstoreOutlined />, label: '批次管理', path: '/batch-management' },
                { key: 'batch-management-v4', icon: <AppstoreOutlined />, label: '批次管理 V4', path: '/batch-management-v4' },
                { key: 'task-pool', icon: <AppstoreOutlined />, label: '任务池', path: '/task-pool' },
                { key: 'schedule-overview', icon: <AppstoreOutlined />, label: '排班总览', path: '/schedule-overview' },
            ],
        },
        {
            key: 'personnel',
            icon: <ApartmentOutlined />,
            label: '人员管理',
            children: [
                { key: 'organization-workbench', icon: <ApartmentOutlined />, label: '组织与人员', path: '/organization-workbench' },
                { key: 'personnel-scheduling', icon: <ClockCircleOutlined />, label: '人员排班', path: '/personnel-scheduling' },
                { key: 'special-shift-windows', icon: <ScheduleOutlined />, label: '专项班次窗口', path: '/special-shift-windows' },
                { key: 'auto-scheduling', icon: <RobotOutlined />, label: '自动排班', path: '/auto-scheduling' },
                { key: 'modular-scheduling', icon: <RobotOutlined />, label: '自动排班（模块化）', path: '/modular-scheduling' },
                { key: 'scheduling-v3', icon: <RocketOutlined />, label: 'V3 自动排班', path: '/scheduling-v3' },
                { key: 'solver-v4', icon: <RocketOutlined />, label: 'V4 自动排班', path: '/solver-v4' },
                { key: 'shift-definitions', icon: <ScheduleOutlined />, label: '班次定义', path: '/shift-definitions' },
            ],
        },
        {
            key: 'constraints',
            icon: <LinkOutlined />,
            label: '约束配置',
            children: [
                { key: 'operation-constraints', icon: <LinkOutlined />, label: '操作约束', path: '/operation-constraints' },
            ],
        },
        {
            key: 'system',
            icon: <ControlOutlined />,
            label: '系统管理',
            children: [
                { key: 'system-monitor', icon: <DashboardOutlined />, label: '系统监控', path: '/system-monitor' },
                { key: 'system-settings', icon: <ControlOutlined />, label: '系统设置', path: '/system-settings' },
                { key: 'auto-scheduling-debug', icon: <BugOutlined />, label: '排班调试', path: '/auto-scheduling-debug' },
            ],
        },
    ];

    const handleMenuClick = (path: string) => {
        navigate(path);
        setHoveredKey(null); // Close popover on click
    };

    const isSelected = (item: any) => {
        // Simple check if current path starts with item path or if any child is selected
        if (item.path && location.pathname === item.path) return true;
        if (item.children) {
            return item.children.some((child: any) => child.path && location.pathname === child.path);
        }
        return false;
    }

    const isChildSelected = (childPath: string) => {
        return location.pathname === childPath;
    }


    return (
        <div
            className="fixed left-0 top-0 bottom-0 z-50 flex flex-col items-center py-4 bg-white/40 backdrop-blur-2xl border-r border-white/20 transition-all duration-300 ease-in-out"
            style={{ width }}
        >
            {/* Logo Area */}
            <div className="mb-8 w-10 h-10 flex items-center justify-center">
                <img src="/wuxibio-icon.svg" alt="Logo" className="w-8 h-8 opacity-90 hover:opacity-100 transition-opacity" />
            </div>

            {/* Navigation Items */}
            <div className="flex flex-col gap-4 w-full px-2">
                {railItems.map((item) => (
                    <Popover
                        key={item.key}
                        placement="rightTop"
                        trigger="hover"
                        open={hoveredKey === item.key && !!item.children}
                        onOpenChange={(visible) => setHoveredKey(visible ? item.key : null)}
                        overlayInnerStyle={{ padding: 0, borderRadius: '12px', background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.3)', boxShadow: '0 8px 32px rgba(0,0,0,0.1)' }}
                        content={
                            item.children ? (
                                <div className="py-2 min-w-[200px]">
                                    <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                                        {item.label}
                                    </div>
                                    {item.children.map((child: any) => (
                                        <div
                                            key={child.key}
                                            className={`
                                mx-2 px-3 py-2 rounded-lg cursor-pointer flex items-center gap-3 transition-all duration-200
                                ${isChildSelected(child.path)
                                                    ? 'bg-sky-50 text-sky-600 font-medium'
                                                    : 'text-slate-600 hover:bg-slate-100/50 hover:text-slate-900'}
                            `}
                                            onClick={() => handleMenuClick(child.path)}
                                        >
                                            <span className="text-lg">{child.icon}</span>
                                            <span className="text-sm">{child.label}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-1 px-2 text-sm text-slate-700 font-medium">
                                    {item.label}
                                </div>
                            )
                        }
                    >
                        <div
                            className={`
                w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-300
                mx-auto
                ${isSelected(item)
                                    ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/30'
                                    : 'text-slate-500 hover:text-sky-600 hover:bg-white/50'}
              `}
                            onClick={() => !item.children && handleMenuClick(item.path!)}
                        >
                            <span className="text-xl">{item.icon}</span>
                        </div>
                    </Popover>
                ))}
            </div>
        </div>
    );
};

export default CommandRail;

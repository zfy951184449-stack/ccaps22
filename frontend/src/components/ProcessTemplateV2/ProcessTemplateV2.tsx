import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
    ApartmentOutlined,
    ArrowRightOutlined,
    CalendarOutlined
} from '@ant-design/icons';
import { Empty, Tabs } from 'antd';
import ProcessTemplateResourceTimeline from './ProcessTemplateResourceTimeline';

export interface Team {
    id: number;
    unit_code: string;
    unit_name: string;
}

export interface Template {
    id: number;
    template_code: string;
    template_name: string;
    team_id: number | null;
    team_code: string | null;
    team_name: string | null;
    description: string;
    total_days: number;
    created_at: string;
    updated_at: string;
}

const API_BASE_URL = 'http://localhost:3001/api';

const formatTemplateDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '未知';
    }

    return new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
    }).format(date);
};

const ProcessTemplateV2: React.FC = () => {
    const [templates, setTemplates] = useState<Template[]>([]);
    const [teams, setTeams] = useState<Team[]>([]);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
    const [activeTeamId, setActiveTeamId] = useState<string>('all');

    const fetchTeams = useCallback(async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/organization/teams`);
            setTeams(response.data);
        } catch (error) {
            console.error('Error fetching teams:', error);
        }
    }, []);

    const fetchTemplates = useCallback(async (teamId?: string) => {
        setLoading(true);
        setErrorMessage(null);
        try {
            const params = teamId && teamId !== 'all' ? { team_id: teamId } : {};
            const response = await axios.get(`${API_BASE_URL}/process-templates`, { params });
            setTemplates(response.data);
        } catch (error) {
            console.error('Error fetching templates:', error);
            setTemplates([]);
            setErrorMessage('工艺模版加载失败，请稍后重试。');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTeams();
    }, [fetchTeams]);

    useEffect(() => {
        fetchTemplates(activeTeamId);
    }, [activeTeamId, fetchTemplates]);

    const tabItems = useMemo(() => [
        { key: 'all', label: '全部' },
        ...teams.map(t => ({ key: t.id.toString(), label: t.unit_name }))
    ], [teams]);

    const activeTeamName = useMemo(() => {
        if (activeTeamId === 'all') {
            return '全部单元';
        }

        return teams.find(team => team.id.toString() === activeTeamId)?.unit_name || '当前单元';
    }, [activeTeamId, teams]);

    const summaryCards = useMemo(() => {
        const totalDays = templates.reduce((sum, item) => sum + item.total_days, 0);
        const avgDays = templates.length > 0 ? (totalDays / templates.length).toFixed(1).replace('.0', '') : '0';
        const maxDays = templates.reduce((max, item) => Math.max(max, item.total_days), 0);
        const linkedTeams = templates.filter(item => item.team_id !== null).length;

        return [
            { label: '当前模板', value: `${templates.length}`, accent: 'text-slate-900' },
            { label: '平均周期', value: `${avgDays} 天`, accent: 'text-sky-700' },
            { label: '最长周期', value: `${maxDays} 天`, accent: 'text-emerald-700' },
            { label: '已绑单元', value: `${linkedTeams}`, accent: 'text-amber-700' },
        ];
    }, [templates]);

    if (selectedTemplate) {
        return (
            <ProcessTemplateResourceTimeline
                template={selectedTemplate}
                onBack={() => setSelectedTemplate(null)}
            />
        );
    }

    return (
        <div className="h-full flex flex-col gap-4 pb-4" style={{ minHeight: 'calc(100vh - 120px)' }}>
            <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-sky-50 px-5 py-5 shadow-sm">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                    <div className="max-w-3xl">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold tracking-wide text-white">
                                Process Template V2
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
                                当前筛选: {activeTeamName}
                            </span>
                        </div>
                        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
                            工艺模版
                        </h1>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                            入口、筛选和摘要收紧到一屏内，减少空白区和重复容器。点击任一模版进入资源时间轴视图。
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 xl:min-w-[440px]">
                        {summaryCards.map(card => (
                            <div
                                key={card.label}
                                className="rounded-2xl border border-white bg-white/85 px-4 py-3 shadow-sm"
                            >
                                <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
                                    {card.label}
                                </div>
                                <div className={`mt-2 text-2xl font-semibold ${card.accent}`}>
                                    {card.value}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
                <Tabs
                    activeKey={activeTeamId}
                    onChange={setActiveTeamId}
                    items={tabItems}
                    tabBarStyle={{ marginBottom: 0 }}
                />
            </section>

            {errorMessage && (
                <section className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <span>{errorMessage}</span>
                        <button
                            type="button"
                            onClick={() => fetchTemplates(activeTeamId)}
                            className="rounded-full border border-rose-200 bg-white px-3 py-1 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100"
                        >
                            重新加载
                        </button>
                    </div>
                </section>
            )}

            {loading ? (
                <section className="flex min-h-[260px] items-center justify-center rounded-3xl border border-slate-200 bg-white text-sm text-slate-500 shadow-sm">
                    正在加载工艺模版...
                </section>
            ) : templates.length === 0 ? (
                <section className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16 shadow-sm">
                    <Empty
                        description={`当前筛选“${activeTeamName}”下暂无工艺模版`}
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                    />
                </section>
            ) : (
                <section className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
                    {templates.map(template => (
                        <button
                            key={template.id}
                            type="button"
                            onClick={() => setSelectedTemplate(template)}
                            className="group rounded-3xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-sky-700">
                                        {template.template_code}
                                    </div>
                                    <h3 className="mt-3 truncate text-lg font-semibold text-slate-900 transition-colors group-hover:text-sky-700">
                                        {template.template_name}
                                    </h3>
                                </div>
                                <div className="shrink-0 rounded-2xl bg-slate-900 px-3 py-2 text-right text-white">
                                    <div className="text-[10px] uppercase tracking-wide text-slate-300">周期</div>
                                    <div className="text-sm font-semibold">{template.total_days} 天</div>
                                </div>
                            </div>

                            <p className="mt-3 min-h-[44px] text-sm leading-6 text-slate-500 line-clamp-2">
                                {template.description || '暂无工艺描述'}
                            </p>

                            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-500">
                                <div className="rounded-2xl bg-slate-50 px-3 py-2">
                                    <div className="flex items-center gap-2">
                                        <ApartmentOutlined className="text-slate-400" />
                                        <span>{template.team_name || '未分配单元'}</span>
                                    </div>
                                </div>
                                <div className="rounded-2xl bg-slate-50 px-3 py-2">
                                    <div className="flex items-center gap-2">
                                        <CalendarOutlined className="text-slate-400" />
                                        <span>更新于 {formatTemplateDate(template.updated_at)}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
                                <span className="font-medium text-slate-600">查看资源时间轴</span>
                                <ArrowRightOutlined className="text-slate-400 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-sky-600" />
                            </div>
                        </button>
                    ))}
                </section>
            )}
        </div>
    );
};

export default ProcessTemplateV2;

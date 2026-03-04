import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApartmentOutlined,
  ArrowRightOutlined,
  CalendarOutlined,
  CopyOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { Button, Empty, Space, Tabs, message } from 'antd';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { processTemplateV2Api } from '../../services';
import TemplateCreateDraftModal from './TemplateCreateDraftModal';
import { TeamSummary, TemplateSummary } from './types';

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
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTeamId, setActiveTeamId] = useState<string>('all');

  const loadTeams = useCallback(async () => {
    try {
      const response = await axios.get('/api/organization/teams');
      setTeams(response.data ?? []);
    } catch (error) {
      console.error('Failed to load teams:', error);
      setTeams([]);
    }
  }, []);

  const loadTemplates = useCallback(async (teamId?: string) => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const data = await processTemplateV2Api.listTemplates(teamId);
      setTemplates(data);
    } catch (error) {
      console.error('Failed to load templates:', error);
      setTemplates([]);
      setErrorMessage('工艺模版加载失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);

  useEffect(() => {
    void loadTemplates(activeTeamId);
  }, [activeTeamId, loadTemplates]);

  const tabItems = useMemo(
    () => [
      { key: 'all', label: '全部' },
      ...teams.map((team) => ({
        key: String(team.id),
        label: team.unit_name,
      })),
    ],
    [teams],
  );

  const activeTeamName = useMemo(() => {
    if (activeTeamId === 'all') {
      return '全部单元';
    }

    return teams.find((team) => String(team.id) === activeTeamId)?.unit_name || '当前单元';
  }, [activeTeamId, teams]);

  const summaryCards = useMemo(() => {
    const totalDays = templates.reduce((sum, item) => sum + item.total_days, 0);
    const avgDays = templates.length > 0 ? (totalDays / templates.length).toFixed(1).replace('.0', '') : '0';
    const maxDays = templates.reduce((max, item) => Math.max(max, item.total_days), 0);
    const linkedTeams = templates.filter((item) => item.team_id !== null).length;

    return [
      { label: '当前模板', value: `${templates.length}`, accent: 'text-slate-900' },
      { label: '平均周期', value: `${avgDays} 天`, accent: 'text-sky-700' },
      { label: '最长周期', value: `${maxDays} 天`, accent: 'text-emerald-700' },
      { label: '已绑团队', value: `${linkedTeams}`, accent: 'text-amber-700' },
    ];
  }, [templates]);

  const handleCreateTemplate = async (payload: {
    templateName: string;
    teamId?: number | null;
    description?: string;
  }) => {
    try {
      setCreating(true);
      const createdTemplate = await processTemplateV2Api.createTemplate(payload);
      message.success('工艺模版已创建');
      setCreateOpen(false);
      navigate(`/process-templates-v2/${createdTemplate.id}`);
    } catch (error: any) {
      console.error('Failed to create template:', error);
      message.error(error?.response?.data?.error || '创建工艺模版失败');
    } finally {
      setCreating(false);
    }
  };

  const handleCopyTemplate = async (template: TemplateSummary, event?: React.MouseEvent) => {
    event?.stopPropagation();

    try {
      const result = await processTemplateV2Api.copyTemplate(template.id);
      message.success('模版复制成功，已进入新编辑器');
      navigate(`/process-templates-v2/${result.newTemplateId}`);
    } catch (error: any) {
      console.error('Failed to copy template:', error);
      message.error(error?.response?.data?.error || '复制模版失败');
    }
  };

  return (
    <>
      <div className="flex h-full flex-col gap-4 pb-4" style={{ minHeight: 'calc(100vh - 120px)' }}>
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
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">工艺模版统一编辑器</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                列表页负责新建、复制和进入编辑器；详情页统一承载工艺时间轴、资源节点视图和节点管理。
              </p>
            </div>

            <div className="flex flex-col gap-3 xl:min-w-[480px]">
              <div className="grid grid-cols-2 gap-3">
                {summaryCards.map((card) => (
                  <div
                    key={card.label}
                    className="rounded-2xl border border-white bg-white/85 px-4 py-3 shadow-sm"
                  >
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{card.label}</div>
                    <div className={`mt-2 text-2xl font-semibold ${card.accent}`}>{card.value}</div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                  新建工艺模版
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
          <Tabs activeKey={activeTeamId} onChange={setActiveTeamId} items={tabItems} tabBarStyle={{ marginBottom: 0 }} />
        </section>

        {errorMessage ? (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{errorMessage}</span>
              <Button type="default" size="small" onClick={() => void loadTemplates(activeTeamId)}>
                重新加载
              </Button>
            </div>
          </section>
        ) : null}

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
            {templates.map((template) => (
              <article
                key={template.id}
                onClick={() => navigate(`/process-templates-v2/${template.id}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(`/process-templates-v2/${template.id}`);
                  }
                }}
                role="button"
                tabIndex={0}
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

                <p className="mt-3 min-h-[44px] line-clamp-2 text-sm leading-6 text-slate-500">
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
                  <span className="font-medium text-slate-600">进入统一编辑器</span>
                  <Space size="small">
                    <Button
                      icon={<CopyOutlined />}
                      size="small"
                      onClick={(event) => void handleCopyTemplate(template, event)}
                    >
                      复制
                    </Button>
                    <ArrowRightOutlined className="text-slate-400 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-sky-600" />
                  </Space>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>

      <TemplateCreateDraftModal
        open={createOpen}
        teams={teams}
        loading={creating}
        onCancel={() => setCreateOpen(false)}
        onSubmit={handleCreateTemplate}
      />
    </>
  );
};

export default ProcessTemplateV2;

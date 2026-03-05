import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PlusOutlined } from '@ant-design/icons';
import { Button, Empty, Skeleton, Tabs, message } from 'antd';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { processTemplateV2Api } from '../../services';
import TemplateCreateDraftModal from './TemplateCreateDraftModal';
import TemplateCardV2 from './TemplateCardV2';
import TemplateListToolbar, { TemplateDensity, TemplateSortBy, TemplateStatusFilter } from './TemplateListToolbar';
import { TemplateRiskFocus } from './TemplateRiskBadges';
import { TeamSummary, TemplateSummary } from './types';

const RECENT_DAYS = 14;

const normalizeText = (value: string) => value.trim().toLowerCase();

const getRiskCount = (value?: number) => (value && value > 0 ? value : 0);

const templateHasRisk = (template: TemplateSummary) =>
  getRiskCount(template.unbound_count) > 0 ||
  getRiskCount(template.constraint_conflict_count) > 0 ||
  getRiskCount(template.invalid_binding_count) > 0;

const isRecentTemplate = (template: TemplateSummary) => {
  const timestamp = new Date(template.updated_at).getTime();
  if (Number.isNaN(timestamp)) {
    return false;
  }
  const diffDays = Math.abs(Date.now() - timestamp) / (24 * 60 * 60 * 1000);
  return diffDays <= RECENT_DAYS;
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

  const [searchValue, setSearchValue] = useState('');
  const [statusFilter, setStatusFilter] = useState<TemplateStatusFilter>('all');
  const [sortBy, setSortBy] = useState<TemplateSortBy>('updated');
  const [density, setDensity] = useState<TemplateDensity>('card');

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

  const displayedTemplates = useMemo(() => {
    const query = normalizeText(searchValue);

    const next = templates
      .filter((template) => {
        if (!query) {
          return true;
        }

        return [
          template.template_code,
          template.template_name,
          template.description,
          template.team_name,
        ]
          .filter(Boolean)
          .some((value) => normalizeText(String(value)).includes(query));
      })
      .filter((template) => {
        if (statusFilter === 'all') {
          return true;
        }

        if (statusFilter === 'risk') {
          return templateHasRisk(template);
        }

        return isRecentTemplate(template);
      })
      .sort((left, right) => {
        if (sortBy === 'name') {
          return left.template_name.localeCompare(right.template_name, 'zh-CN');
        }

        if (sortBy === 'cycle') {
          return Number(right.total_days ?? 0) - Number(left.total_days ?? 0);
        }

        return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
      });

    return next;
  }, [searchValue, sortBy, statusFilter, templates]);

  const summaryCards = useMemo(() => {
    const totalDays = displayedTemplates.reduce((sum, item) => sum + item.total_days, 0);
    const avgDays = displayedTemplates.length > 0 ? (totalDays / displayedTemplates.length).toFixed(1).replace('.0', '') : '0';
    const maxDays = displayedTemplates.reduce((max, item) => Math.max(max, item.total_days), 0);
    const linkedTeams = displayedTemplates.filter((item) => item.team_id !== null).length;

    return [
      { label: '当前模板', value: `${displayedTemplates.length}`, accent: 'text-slate-900' },
      { label: '平均周期', value: `${avgDays} 天`, accent: 'text-sky-700' },
      { label: '最长周期', value: `${maxDays} 天`, accent: 'text-emerald-700' },
      { label: '已绑团队', value: `${linkedTeams}`, accent: 'text-amber-700' },
    ];
  }, [displayedTemplates]);

  const handleCreateTemplate = async (payload: {
    templateName: string;
    teamId?: number | null;
    description?: string;
  }) => {
    try {
      setCreating(true);
      const createdTemplate = await processTemplateV2Api.createTemplate(payload);
      setCreateOpen(false);
      navigate(`/process-templates-v2/${createdTemplate.id}`, {
        state: {
          flashMessage: '工艺模版已创建',
        },
      });
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
      navigate(`/process-templates-v2/${result.newTemplateId}`, {
        state: {
          flashMessage: '模版复制成功，已进入新编辑器',
        },
      });
    } catch (error: any) {
      console.error('Failed to copy template:', error);
      message.error(error?.response?.data?.error || '复制模版失败');
    }
  };

  const handleContinueEdit = useCallback(
    (template: TemplateSummary) => {
      navigate(`/process-templates-v2/${template.id}`);
    },
    [navigate],
  );

  const handleFocusRisk = useCallback(
    (template: TemplateSummary, focus: TemplateRiskFocus) => {
      navigate(`/process-templates-v2/${template.id}?focus=${focus}`);
    },
    [navigate],
  );

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

        <TemplateListToolbar
          searchValue={searchValue}
          onSearchValueChange={setSearchValue}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          density={density}
          onDensityChange={setDensity}
          resultCount={displayedTemplates.length}
        />

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
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={`template-skeleton-${index}`} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <Skeleton active title={{ width: '60%' }} paragraph={{ rows: 4 }} />
              </div>
            ))}
          </section>
        ) : displayedTemplates.length === 0 ? (
          <section className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16 shadow-sm">
            <Empty
              description={
                searchValue || statusFilter !== 'all'
                  ? '当前筛选条件下没有匹配模版，建议调整搜索词或状态筛选。'
                  : `当前筛选“${activeTeamName}”下暂无工艺模版`
              }
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          </section>
        ) : density === 'card' ? (
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {displayedTemplates.map((template) => (
              <TemplateCardV2
                key={template.id}
                template={template}
                density={density}
                onContinue={handleContinueEdit}
                onCopy={handleCopyTemplate}
                onFocus={handleFocusRisk}
              />
            ))}
          </section>
        ) : (
          <section className="space-y-3">
            {displayedTemplates.map((template) => (
              <TemplateCardV2
                key={template.id}
                template={template}
                density={density}
                onContinue={handleContinueEdit}
                onCopy={handleCopyTemplate}
                onFocus={handleFocusRisk}
              />
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

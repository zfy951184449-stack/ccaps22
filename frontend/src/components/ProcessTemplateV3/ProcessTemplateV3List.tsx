/**
 * ProcessTemplateV3List — 全新列表页 (Wxb Design System)
 *
 * 功能对齐 V2 列表页，UI 全部使用 wxb-ui 组件。
 * API 层直接复用 processTemplateV2Api。
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { message } from 'antd';
import { processTemplateV2Api } from '../../services';
import { exportTemplateWorkbook } from '../../services/templateWorkbookApi';
import { exportTemplateToExcel, TemplateExportData } from '../../utils/exportTemplateExcel';
import { TemplateSummary, TeamSummary } from '../ProcessTemplateV2/types';
import TemplateWorkbookImportModal from '../TemplateWorkbookImportModal';
import MfgTemplatePackagePanel from '../MfgTemplatePackagePanel';
import {
  WxbButton,
  WxbCard,
  WxbSelect,
  WxbTabs,
  WxbTag,
  WxbEmpty,
  WxbSkeleton,
  WxbModal,
  WxbFormField,
  WxbDropdown,
  WxbInput,
  WxbTextarea,
  WxbCheckbox,
  WxbPageShell,
  WxbPageHeader,
  WxbPageSection,
  WxbFilterBar,
  WxbSelectionSummary,
  WxbToolbarActions,
} from '../wxb-ui';
import type { WxbTabItem } from '../wxb-ui/Tabs/Tabs';
import './ProcessTemplateV3List.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StatusFilter = 'all' | 'risk' | 'recent';
type SortBy = 'updated' | 'cycle' | 'name';
type WorkspaceMode = 'templates' | 'packages';

const RECENT_DAYS = 14;

const getInitialWorkspaceMode = (): WorkspaceMode => {
  if (typeof window === 'undefined') return 'templates';
  return new URLSearchParams(window.location.search).get('workspace') === 'packages'
    ? 'packages'
    : 'templates';
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const normalize = (v: string) => v.trim().toLowerCase();

const getRisk = (v?: number) => (v && v > 0 ? v : 0);

const hasRisk = (t: TemplateSummary) =>
  getRisk(t.unbound_count) > 0 ||
  getRisk(t.constraint_conflict_count) > 0 ||
  getRisk(t.invalid_binding_count) > 0;

const isRecent = (t: TemplateSummary) => {
  const ts = new Date(t.updated_at).getTime();
  if (Number.isNaN(ts)) return false;
  return Math.abs(Date.now() - ts) / 86_400_000 <= RECENT_DAYS;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ProcessTemplateV3List: React.FC = () => {
  const navigate = useNavigate();

  // ---- State ----
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTeamId, setActiveTeamId] = useState<string>('all');
  const [searchValue, setSearchValue] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('updated');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(getInitialWorkspaceMode);
  const [packageTemplates, setPackageTemplates] = useState<TemplateSummary[]>([]);
  const [packageTemplateLoading, setPackageTemplateLoading] = useState(false);

  // ---- Create modal ----
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createTeamId, setCreateTeamId] = useState<number | null>(null);
  const [createDesc, setCreateDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // ---- Import / Export ----
  const [importOpen, setImportOpen] = useState(false);
  const [exportingWb, setExportingWb] = useState(false);
  const [exportingOv, setExportingOv] = useState(false);

  // ---- Data loading ----
  const loadTeams = useCallback(async () => {
    try {
      const res = await axios.get('/api/organization/teams');
      setTeams(res.data ?? []);
    } catch {
      setTeams([]);
    }
  }, []);

  const loadTemplates = useCallback(async (teamId?: string) => {
    try {
      setLoading(true);
      const data = await processTemplateV2Api.listTemplates(teamId);
      setTemplates(data);
    } catch {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadTeams(); }, [loadTeams]);
  useEffect(() => { void loadTemplates(activeTeamId); }, [activeTeamId, loadTemplates]);
  useEffect(() => {
    if (workspaceMode !== 'packages' || packageTemplates.length > 0) return;

    let cancelled = false;
    const loadPackageTemplates = async () => {
      try {
        setPackageTemplateLoading(true);
        const data = await processTemplateV2Api.listTemplates('all');
        if (!cancelled) setPackageTemplates(data);
      } catch {
        if (!cancelled) {
          setPackageTemplates([]);
          message.error('加载总包可选模板失败');
        }
      } finally {
        if (!cancelled) setPackageTemplateLoading(false);
      }
    };

    void loadPackageTemplates();
    return () => { cancelled = true; };
  }, [packageTemplates.length, workspaceMode]);
  useEffect(() => {
    setSelectedId((cur) => (cur !== null && templates.some((t) => t.id === cur) ? cur : null));
  }, [templates]);

  // ---- Derived ----
  const tabItems: WxbTabItem[] = useMemo(
    () => [
      { key: 'all', label: '全部' },
      ...teams.map((t) => ({ key: String(t.id), label: t.unit_name })),
    ],
    [teams],
  );

  const displayed = useMemo(() => {
    const q = normalize(searchValue);
    return templates
      .filter((t) => {
        if (!q) return true;
        return [t.template_code, t.template_name, t.description, t.team_name]
          .filter(Boolean)
          .some((v) => normalize(String(v)).includes(q));
      })
      .filter((t) => {
        if (statusFilter === 'risk') return hasRisk(t);
        if (statusFilter === 'recent') return isRecent(t);
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.template_name.localeCompare(b.template_name, 'zh-CN');
        if (sortBy === 'cycle') return Number(b.total_days ?? 0) - Number(a.total_days ?? 0);
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
  }, [searchValue, sortBy, statusFilter, templates]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [selectedId, templates],
  );

  // ---- Actions ----
  const goEditor = useCallback((t: TemplateSummary) => navigate(`/process-templates/${t.id}`), [navigate]);

  const handleCopy = useCallback(async (t: TemplateSummary, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const res = await processTemplateV2Api.copyTemplate(t.id);
      navigate(`/process-templates/${res.newTemplateId}`, { state: { flashMessage: '模版复制成功' } });
    } catch (err: any) {
      message.error(err?.response?.data?.error || '复制模版失败');
    }
  }, [navigate]);

  const handleCreate = useCallback(async () => {
    if (!createName.trim()) return;
    try {
      setCreating(true);
      const created = await processTemplateV2Api.createTemplate({
        templateName: createName.trim(),
        teamId: createTeamId,
        description: createDesc,
      });
      setCreateOpen(false);
      setCreateName('');
      setCreateTeamId(null);
      setCreateDesc('');
      navigate(`/process-templates/${created.id}`, { state: { flashMessage: '工艺模版已创建' } });
    } catch (err: any) {
      message.error(err?.response?.data?.error || '创建工艺模版失败');
    } finally {
      setCreating(false);
    }
  }, [createName, createTeamId, createDesc, navigate]);

  const handleExportWorkbook = useCallback(async () => {
    if (!selectedTemplate) { message.warning('请先选中一个模板'); return; }
    try {
      setExportingWb(true);
      await exportTemplateWorkbook(selectedTemplate.id);
      message.success(`已导出 ${selectedTemplate.template_code}`);
    } catch { message.error('导出 Excel 失败'); }
    finally { setExportingWb(false); }
  }, [selectedTemplate]);

  const handleExportOverview = useCallback(async () => {
    try {
      setExportingOv(true);
      const params: Record<string, string> = {};
      if (activeTeamId && activeTeamId !== 'all') params.team_id = activeTeamId;
      const res = await axios.get('/api/process-templates/export-data', { params });
      const data: TemplateExportData = {
        templates: res.data.templates ?? [],
        stages: res.data.stages ?? [],
        operations: (res.data.operations ?? []).map((op: any) => ({
          id: Number(op.id),
          template_code: op.template_code,
          stage_name: op.stage_name,
          stage_code: op.stage_code,
          operation_code: op.operation_code,
          operation_name: op.operation_name,
          operation_day: Number(op.operation_day),
          recommended_time: Number(op.recommended_time),
          standard_time: op.standard_time != null ? Number(op.standard_time) : undefined,
          required_people: op.required_people != null ? Number(op.required_people) : undefined,
          resource_node_name: op.resource_node_name || null,
          binding_status: op.binding_status,
          operation_order: Number(op.operation_order),
        })),
      };
      await exportTemplateToExcel(data);
      message.success('模版总览导出成功');
    } catch { message.error('导出模版总览失败'); }
    finally { setExportingOv(false); }
  }, [activeTeamId]);

  // ---- Render helpers ----
  const riskBadges = (t: TemplateSummary) => {
    const badges: React.ReactNode[] = [];
    if (getRisk(t.unbound_count) > 0)
      badges.push(<WxbTag key="ub" color="amber">{t.unbound_count} 未绑定</WxbTag>);
    if (getRisk(t.constraint_conflict_count) > 0)
      badges.push(<WxbTag key="cc" color="red">{t.constraint_conflict_count} 约束冲突</WxbTag>);
    if (getRisk(t.invalid_binding_count) > 0)
      badges.push(<WxbTag key="ib" color="red">{t.invalid_binding_count} 无效绑定</WxbTag>);
    return badges;
  };

  // ---- Render compact row ----
  const renderRow = (t: TemplateSummary) => (
    <WxbCard
      key={t.id}
      noPadding
      className={`v3-template-row ${selectedId === t.id ? 'is-selected' : ''}`}
      onClick={() => goEditor(t)}
    >
      <div className="v3-template-row-inner">
        <WxbCheckbox
          checked={selectedId === t.id}
          onChange={() => setSelectedId(t.id)}
        />
        <WxbTag color="blue">{t.template_code}</WxbTag>
        <span className="v3-template-row-title">{t.template_name}</span>
        <span className="v3-template-row-subtle">{t.team_name || '未分配'}</span>
        <span className="v3-template-row-muted">{t.total_days} 天</span>
        {hasRisk(t) && riskBadges(t)}
        <div className="v3-template-row-spacer" />
        <WxbButton size="sm" onClick={(e) => { e.stopPropagation(); goEditor(t); }}>编辑</WxbButton>
        <WxbButton variant="ghost" size="sm" onClick={(e) => handleCopy(t, e)}>复制</WxbButton>
      </div>
    </WxbCard>
  );

  // ---- Export dropdown items ----
  const exportMenu = {
    items: [
      { key: 'overview', label: '导出模版总览', disabled: exportingOv, onClick: handleExportOverview },
      { key: 'workbook', label: '导出 Workbook', disabled: !selectedTemplate || exportingWb, onClick: handleExportWorkbook },
    ],
  };

  // ---- Main render ----
  return (
    <>
      <WxbPageShell size="full" minHeight="calc(100vh - 120px)">
        <WxbPageHeader
          title="工艺模版"
          description={workspaceMode === 'templates' ? '甘特图可视化编辑器' : '按关键操作发生日期串联多个模板，保存为可生成批次的总包。'}
          actions={(
            <div className="v3-header-actions">
              <div className="v3-workspace-switch">
                <WxbButton
                  type="button"
                  size="sm"
                  variant={workspaceMode === 'templates' ? 'primary' : 'secondary'}
                  onClick={() => setWorkspaceMode('templates')}
                >
                  标准模板
                </WxbButton>
                <WxbButton
                  type="button"
                  size="sm"
                  variant={workspaceMode === 'packages' ? 'primary' : 'secondary'}
                  onClick={() => setWorkspaceMode('packages')}
                >
                  总包设计
                </WxbButton>
              </div>
              {workspaceMode === 'templates' && (
                <WxbButton onClick={() => setCreateOpen(true)}>+ 新建模板</WxbButton>
              )}
            </div>
          )}
        />

        {workspaceMode === 'templates' ? (
          <>
            {/* Team Tabs */}
            <WxbTabs items={tabItems} activeKey={activeTeamId} onChange={setActiveTeamId} />

            {/* Toolbar */}
            <WxbFilterBar
              sticky
              stickyTop={80}
              search={{
                className: 'v3-list-filter-search',
                placeholder: '搜索模板名 / 编码',
                value: searchValue,
                onChange: setSearchValue,
              }}
              filters={(
                <>
                  <WxbSelect
                    className="v3-list-filter-select"
                    value={statusFilter}
                    onChange={(v) => setStatusFilter(v as StatusFilter)}
                    options={[
                      { value: 'all', label: '状态：全部' },
                      { value: 'risk', label: '状态：有风险' },
                      { value: 'recent', label: '状态：最近更新' },
                    ]}
                  />
                </>
              )}
              sort={(
                <WxbSelect
                  className="v3-list-filter-select"
                  value={sortBy}
                  onChange={(v) => setSortBy(v as SortBy)}
                  options={[
                    { value: 'updated', label: '排序：最近更新' },
                    { value: 'cycle', label: '排序：周期最长' },
                    { value: 'name', label: '排序：名称' },
                  ]}
                />
              )}
              selection={(
                <WxbSelectionSummary
                  selectedCount={selectedTemplate ? 1 : 0}
                  label={selectedTemplate?.template_code}
                  onClear={() => setSelectedId(null)}
                />
              )}
              resultCount={displayed.length}
              resultLabel="个"
              actions={(
                <WxbToolbarActions
                  items={[
                    { key: 'import', label: '导入', onClick: () => setImportOpen(true) },
                    {
                      key: 'export',
                      render: (
                        <WxbDropdown menu={exportMenu} placement="bottomRight">
                          <WxbButton variant="ghost" size="sm">导出 ▾</WxbButton>
                        </WxbDropdown>
                      ),
                    },
                  ]}
                />
              )}
            />

            {/* Content */}
            {loading ? (
              <WxbPageSection density="compact">
                {Array.from({ length: 6 }, (_, i) => (
                  <WxbCard key={`sk-${i}`} noPadding className="v3-template-row">
                    <div className="v3-template-row-inner">
                      <WxbSkeleton rows={1} />
                    </div>
                  </WxbCard>
                ))}
              </WxbPageSection>
            ) : displayed.length === 0 ? (
              <WxbPageSection variant="framed" className="v3-list-empty">
                <WxbEmpty
                  description={searchValue || statusFilter !== 'all' ? '当前筛选无匹配模版' : '暂无工艺模版'}
                  action={<WxbButton onClick={() => setCreateOpen(true)}>新建第一个模板</WxbButton>}
                />
              </WxbPageSection>
            ) : (
              <WxbPageSection density="compact">
                {displayed.map(renderRow)}
              </WxbPageSection>
            )}
          </>
        ) : (
          packageTemplateLoading ? (
            <WxbPageSection density="compact">
              <WxbSkeleton rows={6} />
            </WxbPageSection>
          ) : (
            <MfgTemplatePackagePanel templates={packageTemplates.length > 0 ? packageTemplates : templates} />
          )
        )}
      </WxbPageShell>

      {/* Create Modal */}
      <WxbModal
        open={createOpen}
        title="新建工艺模版"
        okText="创建"
        confirmLoading={creating}
        onOk={handleCreate}
        onCancel={() => { setCreateOpen(false); setCreateName(''); setCreateTeamId(null); setCreateDesc(''); }}
      >
        <div className="v3-create-form">
          <WxbInput
            label="模板名称"
            placeholder="输入模板名称"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
          />
          <WxbFormField label="所属团队">
            <WxbSelect
              value={createTeamId ?? undefined}
              onChange={(v) => setCreateTeamId(v as number | null)}
              placeholder="选择团队（可选）"
              allowClear
              options={teams.map((t) => ({ value: t.id, label: t.unit_name }))}
            />
          </WxbFormField>
          <WxbTextarea
            label="描述"
            placeholder="可选描述"
            value={createDesc}
            onChange={(e) => setCreateDesc(e.target.value)}
            rows={3}
          />
        </div>
      </WxbModal>

      {/* Import Modal (Antd fallback) */}
      <TemplateWorkbookImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => { setSelectedId(null); void loadTemplates(activeTeamId); }}
        title="导入 Excel"
      />
    </>
  );
};

export default ProcessTemplateV3List;

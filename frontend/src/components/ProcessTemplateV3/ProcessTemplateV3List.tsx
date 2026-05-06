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
import {
  WxbButton,
  WxbCard,
  WxbSearchInput,
  WxbSelect,
  WxbSegmented,
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
} from '../wxb-ui';
import type { WxbTabItem } from '../wxb-ui/Tabs/Tabs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StatusFilter = 'all' | 'risk' | 'recent';
type SortBy = 'updated' | 'cycle' | 'name';
type ViewDensity = 'card' | 'compact';

const RECENT_DAYS = 14;

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

const fmtDate = (v: string) => {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(d);
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
  const [density, setDensity] = useState<ViewDensity>('card');
  const [selectedId, setSelectedId] = useState<number | null>(null);

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
  const goEditor = useCallback((t: TemplateSummary) => navigate(`/process-templates-v3/${t.id}`), [navigate]);

  const handleCopy = useCallback(async (t: TemplateSummary, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const res = await processTemplateV2Api.copyTemplate(t.id);
      navigate(`/process-templates-v3/${res.newTemplateId}`, { state: { flashMessage: '模版复制成功' } });
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
      navigate(`/process-templates-v3/${created.id}`, { state: { flashMessage: '工艺模版已创建' } });
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

  // ---- Render card ----
  const renderCard = (t: TemplateSummary) => (
    <WxbCard
      key={t.id}
      style={{
        cursor: 'pointer',
        transition: 'box-shadow 200ms, transform 200ms',
        border: selectedId === t.id ? '1px solid var(--wx-blue-500, #1F6FEB)' : undefined,
      }}
      className="v3-template-card"
      onClick={() => goEditor(t)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <WxbTag color="blue" style={{ marginBottom: 8 }}>{t.template_code}</WxbTag>
          <h3 style={{
            margin: '8px 0 0', fontSize: 16, fontWeight: 600,
            color: 'var(--wx-ink, #0F1B2D)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {t.template_name}
          </h3>
        </div>
        <div style={{
          textAlign: 'right', background: 'var(--wx-bg-alt, #FAFCFE)',
          borderRadius: 8, padding: '6px 10px', flexShrink: 0,
        }}>
          <div style={{ fontSize: 10, color: 'var(--wx-fg-4, #8898A8)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            周期
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--wx-ink, #0F1B2D)' }}>
            {t.total_days} 天
          </div>
        </div>
      </div>

      <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--wx-fg-3, #5A6B7E)', lineHeight: 1.5, minHeight: 40 }}>
        {t.description || '暂无工艺描述'}
      </p>

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--wx-fg-3, #5A6B7E)' }}>
        <span>{t.team_name || '未分配单元'}</span>
        <span>·</span>
        <span>更新 {fmtDate(t.updated_at)}</span>
        {Number(t.stage_count ?? 0) > 0 && <><span>·</span><span>{t.stage_count} 阶段</span></>}
      </div>

      {hasRisk(t) && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {riskBadges(t)}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14, borderTop: '1px solid var(--wx-border, #E4EAF1)', paddingTop: 12 }}>
        <WxbButton size="sm" onClick={(e) => { e.stopPropagation(); goEditor(t); }}>
          进入编辑器
        </WxbButton>
        <WxbButton variant="ghost" size="sm" onClick={(e) => handleCopy(t, e)}>
          复制
        </WxbButton>
        <div style={{ flex: 1 }} />
        <WxbCheckbox
          checked={selectedId === t.id}
          onChange={() => setSelectedId(t.id)}
        />
      </div>
    </WxbCard>
  );

  // ---- Render compact row ----
  const renderRow = (t: TemplateSummary) => (
    <WxbCard
      key={t.id}
      noPadding
      style={{ cursor: 'pointer', border: selectedId === t.id ? '1px solid var(--wx-blue-500, #1F6FEB)' : undefined }}
      onClick={() => goEditor(t)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' }}>
        <WxbCheckbox
          checked={selectedId === t.id}
          onChange={() => setSelectedId(t.id)}
        />
        <WxbTag color="blue">{t.template_code}</WxbTag>
        <span style={{ fontWeight: 600, color: 'var(--wx-ink, #0F1B2D)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {t.template_name}
        </span>
        <span style={{ fontSize: 12, color: 'var(--wx-fg-3, #5A6B7E)' }}>{t.team_name || '未分配'}</span>
        <span style={{ fontSize: 12, color: 'var(--wx-fg-4, #8898A8)' }}>{t.total_days} 天</span>
        {hasRisk(t) && riskBadges(t)}
        <div style={{ flex: 1 }} />
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 'calc(100vh - 120px)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: 'var(--wx-ink, #0F1B2D)' }}>
              工艺模版 V3
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--wx-fg-3, #5A6B7E)' }}>
              甘特图可视化编辑器
            </p>
          </div>
          <WxbButton onClick={() => setCreateOpen(true)}>+ 新建模板</WxbButton>
        </div>

        {/* Team Tabs */}
        <WxbTabs items={tabItems} activeKey={activeTeamId} onChange={setActiveTeamId} />

        {/* Toolbar */}
        <WxbCard noPadding style={{ position: 'sticky', top: 80, zIndex: 20, backdropFilter: 'blur(8px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', flexWrap: 'wrap' }}>
            <WxbSearchInput
              placeholder="搜索模板名 / 编码"
              value={searchValue}
              onChange={setSearchValue}
              style={{ width: 240 }}
            />
            <WxbSelect
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as StatusFilter)}
              style={{ width: 160 }}
              options={[
                { value: 'all', label: '状态：全部' },
                { value: 'risk', label: '状态：有风险' },
                { value: 'recent', label: '状态：最近更新' },
              ]}
            />
            <WxbSelect
              value={sortBy}
              onChange={(v) => setSortBy(v as SortBy)}
              style={{ width: 160 }}
              options={[
                { value: 'updated', label: '排序：最近更新' },
                { value: 'cycle', label: '排序：周期最长' },
                { value: 'name', label: '排序：名称' },
              ]}
            />
            <WxbSegmented
              value={density}
              onChange={(v) => setDensity(v as ViewDensity)}
              options={[
                { label: '卡片', value: 'card' },
                { label: '紧凑', value: 'compact' },
              ]}
            />
            <div style={{ flex: 1 }} />
            {selectedTemplate && (
              <WxbTag color="blue" closable onClose={() => setSelectedId(null)}>
                已选: {selectedTemplate.template_code}
              </WxbTag>
            )}
            <span style={{ fontSize: 12, color: 'var(--wx-fg-3, #5A6B7E)' }}>共 {displayed.length} 个</span>
            <WxbButton variant="ghost" size="sm" onClick={() => setImportOpen(true)}>导入</WxbButton>
            <WxbDropdown menu={exportMenu} placement="bottomRight">
              <WxbButton variant="ghost" size="sm">导出 ▾</WxbButton>
            </WxbDropdown>
          </div>
        </WxbCard>

        {/* Content */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {Array.from({ length: 6 }, (_, i) => (
              <WxbCard key={`sk-${i}`}><WxbSkeleton rows={4} /></WxbCard>
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <WxbCard style={{ padding: 64 }}>
            <WxbEmpty
              description={searchValue || statusFilter !== 'all' ? '当前筛选无匹配模版' : '暂无工艺模版'}
              action={<WxbButton onClick={() => setCreateOpen(true)}>新建第一个模板</WxbButton>}
            />
          </WxbCard>
        ) : density === 'card' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {displayed.map(renderCard)}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {displayed.map(renderRow)}
          </div>
        )}
      </div>

      {/* Create Modal */}
      <WxbModal
        open={createOpen}
        title="新建工艺模版"
        okText="创建"
        confirmLoading={creating}
        onOk={handleCreate}
        onCancel={() => { setCreateOpen(false); setCreateName(''); setCreateTeamId(null); setCreateDesc(''); }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <WxbInput
            label="模板名称"
            placeholder="输入模板名称"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            style={{ width: '100%' }}
          />
          <WxbFormField label="所属团队">
            <WxbSelect
              value={createTeamId ?? undefined}
              onChange={(v) => setCreateTeamId(v as number | null)}
              placeholder="选择团队（可选）"
              allowClear
              style={{ width: '100%' }}
              options={teams.map((t) => ({ value: t.id, label: t.unit_name }))}
            />
          </WxbFormField>
          <WxbTextarea
            label="描述"
            placeholder="可选描述"
            value={createDesc}
            onChange={(e) => setCreateDesc(e.target.value)}
            rows={3}
            style={{ width: '100%' }}
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

      <style>{`
        .v3-template-card:hover {
          box-shadow: 0 4px 16px rgba(15, 27, 45, 0.10) !important;
          transform: translateY(-1px);
        }
      `}</style>
    </>
  );
};

export default ProcessTemplateV3List;

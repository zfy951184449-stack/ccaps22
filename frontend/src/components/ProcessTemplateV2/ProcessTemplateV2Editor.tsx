import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Drawer, Empty, Grid, Modal, Spin, Tabs, Tag, message } from 'antd';
import axios from 'axios';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { processTemplateV2Api } from '../../services';
import TemplateEditorDiagnosticBar, { EditorFocusFilter } from './TemplateEditorDiagnosticBar';
import TemplateEditorHeader from './TemplateEditorHeader';
import TemplateResourceEditorTab from './TemplateResourceEditorTab';
import TemplateResourceNodeManagementTab from './TemplateResourceNodeManagementTab';
import { PlannerOperation, TeamSummary, TemplateSummary } from './types';

interface ProcessTemplateV2EditorProps {
  templateId: number;
}

type EditorFocusRequest = {
  focus: EditorFocusFilter;
  scheduleId?: number | null;
  token: number;
} | null;

type EditorWorkspaceTabKey = 'resource-editor' | 'node-management';

const statusColorMap: Record<string, string> = {
  BOUND: 'green',
  UNBOUND: 'orange',
  INVALID_NODE: 'red',
  NODE_INACTIVE: 'red',
  RESOURCE_UNBOUND: 'orange',
  RESOURCE_INACTIVE: 'red',
  RESOURCE_RULE_MISMATCH: 'gold',
};

const resolveFocusFilter = (value: string | null): EditorFocusFilter | null => {
  if (!value) {
    return null;
  }

  if (value === 'unbound' || value === 'conflict' || value === 'invalid' || value === 'all') {
    return value;
  }

  return null;
};

const ProcessTemplateV2Editor: React.FC<ProcessTemplateV2EditorProps> = ({ templateId }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const screens = Grid.useBreakpoint();
  const showInlineInspector = Boolean(screens.xl);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [template, setTemplate] = useState<TemplateSummary | null>(null);
  const [draft, setDraft] = useState<TemplateSummary | null>(null);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [focusRequest, setFocusRequest] = useState<EditorFocusRequest>(null);
  const [activeFocus, setActiveFocus] = useState<EditorFocusFilter>('all');
  const [validateRequestToken, setValidateRequestToken] = useState<number | undefined>(undefined);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<EditorWorkspaceTabKey>('resource-editor');
  const [inspectorDrawerOpen, setInspectorDrawerOpen] = useState(false);
  const [selectedOperation, setSelectedOperation] = useState<PlannerOperation | null>(null);
  const [editorMetrics, setEditorMetrics] = useState({
    nodeCount: 0,
    operationCount: 0,
    unplacedCount: 0,
    invalidCount: 0,
    conflictCount: 0,
  });

  const loadEditorData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage(null);

      const [templateResponse, teamsResponse] = await Promise.all([
        processTemplateV2Api.getTemplate(templateId),
        axios.get('/api/organization/teams').then((response) => response.data as TeamSummary[]),
      ]);

      setTemplate(templateResponse);
      setDraft(templateResponse);
      setTeams(teamsResponse ?? []);
    } catch (error) {
      console.error('Failed to load template editor:', error);
      setTemplate(null);
      setDraft(null);
      setTeams([]);
      setErrorMessage('工艺模版编辑器加载失败，请确认模版存在且接口正常。');
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    void loadEditorData();
  }, [loadEditorData]);

  useEffect(() => {
    const flashMessage = (location.state as { flashMessage?: string } | null)?.flashMessage;
    if (!flashMessage) {
      return;
    }

    message.success(flashMessage);
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    const focusFromUrl = resolveFocusFilter(searchParams.get('focus'));
    if (!focusFromUrl) {
      return;
    }

    const scheduleRaw = searchParams.get('scheduleId');
    const scheduleId = scheduleRaw ? Number(scheduleRaw) : null;

    setActiveFocus(focusFromUrl);
    setFocusRequest({
      focus: focusFromUrl,
      scheduleId: Number.isInteger(scheduleId) && scheduleId && scheduleId > 0 ? scheduleId : null,
      token: Date.now(),
    });

    const next = new URLSearchParams(searchParams);
    next.delete('focus');
    next.delete('scheduleId');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const dirty = useMemo(() => {
    if (!template || !draft) {
      return false;
    }

    return (
      template.template_name !== draft.template_name ||
      (template.description ?? '') !== (draft.description ?? '') ||
      Number(template.team_id ?? 0) !== Number(draft.team_id ?? 0)
    );
  }, [draft, template]);

  const triggerFocus = useCallback((focus: EditorFocusFilter, scheduleId?: number | null) => {
    setActiveWorkspaceTab('resource-editor');
    setActiveFocus(focus);
    setFocusRequest({
      focus,
      scheduleId: scheduleId ?? null,
      token: Date.now(),
    });
  }, []);

  const handleOpenNodeManagement = useCallback(() => {
    setActiveWorkspaceTab('node-management');
    setInspectorDrawerOpen(false);
  }, []);

  useEffect(() => {
    if (activeWorkspaceTab !== 'resource-editor') {
      setInspectorDrawerOpen(false);
    }
  }, [activeWorkspaceTab]);

  const handleBack = useCallback(() => {
    if (!dirty) {
      navigate('/process-templates-v2');
      return;
    }

    Modal.confirm({
      title: '还有未保存的模板基础信息',
      content: '返回列表会丢失顶部基础信息改动，是否继续？',
      okText: '继续返回',
      cancelText: '留在当前页',
      onOk: () => navigate('/process-templates-v2'),
    });
  }, [dirty, navigate]);

  const handleSave = useCallback(async () => {
    if (!draft) {
      return;
    }

    if (!draft.template_name.trim()) {
      message.error('模板名称不能为空');
      return;
    }

    try {
      setSaving(true);
      await processTemplateV2Api.updateTemplate(draft.id, {
        templateName: draft.template_name.trim(),
        teamId: draft.team_id ?? null,
        description: draft.description ?? '',
      });

      const next = {
        ...draft,
        template_name: draft.template_name.trim(),
      };

      setTemplate(next);
      setDraft(next);
      message.success('模板基础信息已保存');
    } catch (error: any) {
      console.error('Failed to save template metadata:', error);
      message.error(error?.response?.data?.error || '保存模板基础信息失败');
    } finally {
      setSaving(false);
    }
  }, [draft]);

  const handleCopy = useCallback(async () => {
    if (!draft) {
      return;
    }

    try {
      const result = await processTemplateV2Api.copyTemplate(draft.id);
      navigate(`/process-templates-v2/${result.newTemplateId}`, {
        state: {
          flashMessage: '模版已复制，已进入新编辑器',
        },
      });
    } catch (error: any) {
      console.error('Failed to copy template from editor:', error);
      message.error(error?.response?.data?.error || '复制模版失败');
    }
  }, [draft, navigate]);

  const handleDelete = useCallback(async () => {
    if (!draft) {
      return;
    }

    try {
      setDeleting(true);
      await processTemplateV2Api.deleteTemplate(draft.id);
      message.success('模版已删除');
      navigate('/process-templates-v2');
    } catch (error: any) {
      console.error('Failed to delete template:', error);
      message.error(error?.response?.data?.error || '删除模版失败');
    } finally {
      setDeleting(false);
    }
  }, [draft, navigate]);

  const renderInspector = () => (
    <div className="space-y-3">
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">选中工序 Inspector</div>
        {!selectedOperation ? (
          <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">
            请在左侧或时间轴中选中工序
          </div>
        ) : (
          <div className="mt-3 space-y-3 text-sm">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="text-xs text-slate-500">工序编码</div>
              <div className="mt-1 font-medium text-slate-900">{selectedOperation.operation_code}</div>
              <div className="mt-2 text-xs text-slate-500">工序名称</div>
              <div className="mt-1 font-medium text-slate-900">{selectedOperation.operation_name}</div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">阶段</span>
                <Tag color="blue" style={{ marginInlineEnd: 0 }}>{selectedOperation.stage_name}</Tag>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-slate-500">绑定状态</span>
                <Tag color={statusColorMap[selectedOperation.bindingStatus] || 'default'} style={{ marginInlineEnd: 0 }}>
                  {selectedOperation.bindingStatus}
                </Tag>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-slate-500">默认节点</span>
                <span className="text-xs text-slate-700">{selectedOperation.defaultResourceNodeName || '未绑定'}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button size="small" onClick={() => triggerFocus('unbound', selectedOperation.id)}>
                看未绑定
              </Button>
              <Button size="small" onClick={() => triggerFocus('conflict', selectedOperation.id)}>
                看冲突
              </Button>
            </div>

            {selectedOperation.bindingReason ? (
              <div className="rounded-2xl border border-orange-200 bg-orange-50 px-3 py-3 text-xs text-orange-700">
                {selectedOperation.bindingReason}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex min-h-[600px] items-center justify-center rounded-3xl border border-slate-200 bg-white">
        <Spin size="large" />
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="space-y-4">
        <Alert type="error" showIcon message={errorMessage} />
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16">
          <Empty description="未能加载工艺模版编辑器" />
        </div>
      </div>
    );
  }

  if (!template || !draft) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16">
        <Empty description="当前工艺模版不存在" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 pb-4" style={{ minHeight: 'calc(100vh - 120px)' }}>
      <TemplateEditorHeader
        template={draft}
        teams={teams}
        dirty={dirty}
        saving={saving}
        deleting={deleting}
        onBack={handleBack}
        onSave={handleSave}
        onCopy={handleCopy}
        onDelete={handleDelete}
        onChange={(patch) => setDraft((prev) => (prev ? { ...prev, ...patch } : prev))}
      />

      <TemplateEditorDiagnosticBar
        nodeCount={editorMetrics.nodeCount}
        operationCount={editorMetrics.operationCount}
        unplacedCount={editorMetrics.unplacedCount}
        conflictCount={editorMetrics.conflictCount}
        invalidCount={editorMetrics.invalidCount}
        activeFocus={activeFocus}
        validating={false}
        onFocusChange={(focus) => triggerFocus(focus)}
        onValidate={() => {
          setActiveWorkspaceTab('resource-editor');
          setValidateRequestToken(Date.now());
        }}
        onOpenNodes={handleOpenNodeManagement}
      />

      <Tabs
        activeKey={activeWorkspaceTab}
        onChange={(key) => setActiveWorkspaceTab(key as EditorWorkspaceTabKey)}
        items={[
          {
            key: 'resource-editor',
            label: '资源主编辑',
            children: (
              <div className="space-y-4">
                {!showInlineInspector ? (
                  <div className="flex justify-end">
                    <Button onClick={() => setInspectorDrawerOpen(true)}>查看选中工序</Button>
                  </div>
                ) : null}

                <div className={showInlineInspector ? 'grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]' : 'space-y-4'}>
                  <TemplateResourceEditorTab
                    templateId={templateId}
                    templateTeamId={draft.team_id}
                    active={activeWorkspaceTab === 'resource-editor'}
                    onOpenNodes={handleOpenNodeManagement}
                    focusRequest={focusRequest}
                    validateRequestToken={validateRequestToken}
                    onFocusHandled={() => {
                      setFocusRequest(null);
                    }}
                    onEditorMetricsChange={setEditorMetrics}
                    onOperationSelectionChange={setSelectedOperation}
                  />

                  {showInlineInspector ? <aside>{renderInspector()}</aside> : null}
                </div>
              </div>
            ),
          },
          {
            key: 'node-management',
            label: '节点管理',
            children: (
              <TemplateResourceNodeManagementTab
                templateId={templateId}
                active={activeWorkspaceTab === 'node-management'}
              />
            ),
          },
        ]}
      />

      <Drawer
        title="选中工序 Inspector"
        width={420}
        open={activeWorkspaceTab === 'resource-editor' && !showInlineInspector && inspectorDrawerOpen}
        onClose={() => setInspectorDrawerOpen(false)}
      >
        {renderInspector()}
      </Drawer>
    </div>
  );
};

export default ProcessTemplateV2Editor;

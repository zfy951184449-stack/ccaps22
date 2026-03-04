import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Empty, Modal, Spin, Tabs, message } from 'antd';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { processTemplateV2Api } from '../../services';
import TemplateEditorHeader from './TemplateEditorHeader';
import TemplateResourceEditorTab from './TemplateResourceEditorTab';
import TemplateResourceNodeManagementTab from './TemplateResourceNodeManagementTab';
import { TeamSummary, TemplateSummary } from './types';

interface ProcessTemplateV2EditorProps {
  templateId: number;
}

type EditorTabKey = 'resource' | 'nodes';

const ProcessTemplateV2Editor: React.FC<ProcessTemplateV2EditorProps> = ({ templateId }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<EditorTabKey>('resource');
  const [template, setTemplate] = useState<TemplateSummary | null>(null);
  const [draft, setDraft] = useState<TemplateSummary | null>(null);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      message.success('模版已复制，已进入新编辑器');
      navigate(`/process-templates-v2/${result.newTemplateId}`);
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

      <Tabs
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as EditorTabKey)}
        destroyInactiveTabPane={false}
        items={[
          {
            key: 'resource',
            label: '资源主编辑视图',
            children: (
              <TemplateResourceEditorTab
                templateId={templateId}
                templateTeamId={draft.team_id}
                active={activeTab === 'resource'}
                onOpenNodes={() => setActiveTab('nodes')}
              />
            ),
          },
          {
            key: 'nodes',
            label: '节点管理',
            children: (
              <TemplateResourceNodeManagementTab
                templateId={templateId}
                active={activeTab === 'nodes'}
              />
            ),
          },
        ]}
      />
    </div>
  );
};

export default ProcessTemplateV2Editor;

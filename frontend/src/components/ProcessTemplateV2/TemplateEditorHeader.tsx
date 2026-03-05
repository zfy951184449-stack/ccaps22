import React, { useMemo, useState } from 'react';
import {
  ArrowLeftOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { Button, Drawer, Input, Popconfirm, Select, Space, Tag } from 'antd';
import { TeamSummary, TemplateSummary } from './types';

interface TemplateEditorHeaderProps {
  template: TemplateSummary;
  teams: TeamSummary[];
  dirty: boolean;
  saving?: boolean;
  deleting?: boolean;
  onBack: () => void;
  onSave: () => Promise<void> | void;
  onCopy: () => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  onChange: (patch: Partial<TemplateSummary>) => void;
}

const TemplateEditorHeader: React.FC<TemplateEditorHeaderProps> = ({
  template,
  teams,
  dirty,
  saving,
  deleting,
  onBack,
  onSave,
  onCopy,
  onDelete,
  onChange,
}) => {
  const [descriptionOpen, setDescriptionOpen] = useState(false);

  const selectedTeamName = useMemo(() => {
    if (!template.team_id) {
      return '未分配团队';
    }
    return teams.find((team) => Number(team.id) === Number(template.team_id))?.unit_name || '当前团队';
  }, [teams, template.team_id]);

  return (
    <>
      <section className="sticky top-2 z-30 rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-sky-50 px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="large" icon={<ArrowLeftOutlined />} onClick={onBack}>
                返回列表
              </Button>
              <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold tracking-wide text-white">
                {template.template_code}
              </span>
              <Tag color={dirty ? 'orange' : 'green'}>{dirty ? '未保存' : '已保存'}</Tag>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
              <div className="min-w-0">
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                  模板名称
                </label>
                <Input
                  size="large"
                  value={template.template_name}
                  onChange={(event) => onChange({ template_name: event.target.value })}
                  placeholder="输入模板名称"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>团队：{selectedTeamName}</span>
                  <button
                    type="button"
                    onClick={() => setDescriptionOpen(true)}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 transition-colors hover:border-sky-300 hover:text-sky-700"
                  >
                    <EditOutlined />
                    编辑描述
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                  所属团队
                </label>
                <Select
                  allowClear
                  size="large"
                  value={template.team_id ?? undefined}
                  onChange={(value) => onChange({ team_id: value ?? null })}
                  placeholder="选择团队"
                  options={teams.map((team) => ({
                    value: Number(team.id),
                    label: team.unit_name,
                  }))}
                  style={{ width: '100%' }}
                />
                <div className="mt-2 text-xs text-slate-500">
                  周期 {template.total_days} 天
                </div>
              </div>
            </div>
          </div>

          <Space wrap>
            <Button size="large" icon={<CopyOutlined />} onClick={() => void onCopy()}>
              另存为
            </Button>
            <Button
              type="primary"
              size="large"
              icon={<SaveOutlined />}
              onClick={() => void onSave()}
              loading={saving}
              disabled={!dirty}
            >
              保存
            </Button>
            <Popconfirm
              title="确定删除当前工艺模版吗？"
              description="删除后将移除模板、阶段和工序安排。"
              okText="删除"
              cancelText="取消"
              onConfirm={() => onDelete()}
            >
              <Button size="large" danger icon={<DeleteOutlined />} loading={deleting}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        </div>
      </section>

      <Drawer
        title="编辑模板描述"
        open={descriptionOpen}
        width={520}
        onClose={() => setDescriptionOpen(false)}
        extra={
          <Button type="primary" onClick={() => setDescriptionOpen(false)}>
            完成
          </Button>
        }
      >
        <Input.TextArea
          rows={10}
          value={template.description}
          onChange={(event) => onChange({ description: event.target.value })}
          placeholder="说明模板适用的工艺范围、阶段边界和资源语义"
        />
      </Drawer>
    </>
  );
};

export default TemplateEditorHeader;

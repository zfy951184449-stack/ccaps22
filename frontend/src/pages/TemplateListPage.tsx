/**
 * 工艺模板列表(新)—— 排产 · 模板层目录 / 版本视图(无时间无实例)。
 *
 * 权威设计:docs/production_scheduling/50_end_to_end_flow.md(① 模板层 = 规划域)。
 * 第一刀:真实 WBP2486 mock + 真实布局 + 可点选查看(明细抽屉)。
 *   - 「编辑」跳 /process-flow-builder(主工艺构建,模板层无时间)。
 *   - 「新建 / 复制 / 版本化」第一刀仅 wxbToast 占位(TODO:接后端 CRUD + 版本化)。
 * 不连后端:页面直接 import mock(对齐 ProcessFlowBuilderPage)。
 */
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  WxbButton,
  WxbCard,
  WxbDataTable,
  WxbDrawer,
  WxbEmpty,
  WxbSearchInput,
  WxbSegmented,
  WxbTableActionCell,
  WxbTag,
  wxbToast,
} from '../components/wxb-ui';
import type { WxbDataTableProps } from '../components/wxb-ui';
import {
  TEMPLATE_STATUS_LABEL,
  TEMPLATE_STATUS_TAG_COLOR,
  buildTemplateListMock,
} from '../mock/templateListMock';
import type { TemplateListRow, TemplateListStatus } from '../mock/templateListMock';
import './TemplateListPage.css';

type StatusFilter = 'all' | TemplateListStatus;

const STATUS_FILTER_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: '全部', value: 'all' },
  { label: TEMPLATE_STATUS_LABEL.active, value: 'active' },
  { label: TEMPLATE_STATUS_LABEL.draft, value: 'draft' },
  { label: TEMPLATE_STATUS_LABEL.archived, value: 'archived' },
];

const StatusTag: React.FC<{ status: TemplateListStatus; isCurrent?: boolean }> = ({
  status,
  isCurrent,
}) => (
  <span className="tpl-status-cell">
    <WxbTag color={TEMPLATE_STATUS_TAG_COLOR[status]}>{TEMPLATE_STATUS_LABEL[status]}</WxbTag>
    {isCurrent && status === 'active' && <span className="tpl-current-flag">当前版本</span>}
  </span>
);

const PencilIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
    <path
      d="M11.5 1.5a1.414 1.414 0 0 1 2 2L5 12l-3 .5.5-3L11.5 1.5Z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
  </svg>
);

const TemplateListPage: React.FC = () => {
  const navigate = useNavigate();
  const rows = useMemo(() => buildTemplateListMock(), []);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<TemplateListRow | null>(null);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!kw) return true;
      return (
        r.code.toLowerCase().includes(kw) ||
        r.name.toLowerCase().includes(kw) ||
        r.product.toLowerCase().includes(kw) ||
        r.owner.toLowerCase().includes(kw)
      );
    });
  }, [rows, statusFilter, keyword]);

  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => r.status === 'active').length;
    const draft = rows.filter((r) => r.status === 'draft').length;
    const products = new Set(rows.map((r) => r.product)).size;
    return { total, active, draft, products };
  }, [rows]);

  const goEdit = (row: TemplateListRow) => {
    // 编辑 = 进主工艺构建(模板层无时间)。第一刀统一进构建页;接线阶段可带 ?id=row.id。
    // TODO:版本化/编辑按 row.id 携带上下文。
    void row.id;
    navigate('/process-flow-builder');
  };

  const columns: WxbDataTableProps<TemplateListRow>['columns'] = [
    {
      title: '编码',
      dataIndex: 'code',
      key: 'code',
      width: 150,
      render: (code: string) => <span className="tpl-code">{code}</span>,
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, row) => (
        <div className="tpl-name-cell">
          <span className="tpl-name">{name}</span>
          {row.note && <span className="tpl-name-note">{row.note}</span>}
        </div>
      ),
    },
    {
      title: '产品',
      dataIndex: 'product',
      key: 'product',
      width: 110,
      render: (product: string) => <WxbTag color="cyan">{product}</WxbTag>,
    },
    {
      title: '阶段数',
      dataIndex: 'stageCount',
      key: 'stageCount',
      width: 90,
      align: 'right',
      render: (n: number, row) => (
        <span className="tpl-num">
          {n} <span className="tpl-num-unit">阶段</span>
          <span className="tpl-num-sub">· {row.opCount} 操作</span>
        </span>
      ),
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 90,
      render: (v: string) => <span className="tpl-version">{v}</span>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: TemplateListStatus, row) => (
        <StatusTag status={status} isCurrent={row.isCurrent} />
      ),
    },
    {
      title: '更新日期',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 120,
      render: (d: string, row) => (
        <div className="tpl-updated-cell">
          <span>{d}</span>
          <span className="tpl-owner">{row.owner}</span>
        </div>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      fixed: 'right',
      render: (_: unknown, row) => (
        <WxbTableActionCell
          maxInline={2}
          actions={[
            { key: 'edit', label: '编辑', onClick: () => goEdit(row) },
            {
              key: 'copy',
              label: '复制',
              onClick: () => wxbToast.info(`TODO:复制「${row.code}」为新草稿(待接后端)`),
            },
            {
              key: 'version',
              label: '版本化',
              onClick: () =>
                wxbToast.info(`TODO:基于「${row.code}」派生新版本(待接版本化逻辑)`),
            },
            {
              key: 'archive',
              label: row.status === 'archived' ? '恢复' : '归档',
              variant: row.status === 'archived' ? 'default' : 'danger',
              onClick: () =>
                wxbToast.info(
                  `TODO:${row.status === 'archived' ? '恢复' : '归档'}「${row.code}」(待接后端)`,
                ),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="tpl-list-page">
      <header className="tpl-header">
        <div className="tpl-header-main">
          <div className="tpl-eyebrow">排产 · 模板层(无时间 · 无实例)</div>
          <h1 className="tpl-title">工艺模板列表(新)</h1>
          <p className="tpl-description">
            工艺流模板的目录与版本管理:人只编「主工艺链」(钉子序列 + 操作=需求+产出),CIP/SIP/配液/房间放行 等辅助由引擎在批次层按需求自动派生。点击行查看明细,「编辑」进入主工艺构建。
          </p>
          <span className="tpl-meta">
            {stats.total} 个模板 · {stats.products} 个产品 · {stats.active} 启用 / {stats.draft} 草稿
          </span>
        </div>
        <div className="tpl-header-actions">
          <WxbButton
            variant="primary"
            onClick={() => wxbToast.info('TODO:新建工艺流模板(待接后端 CRUD)')}
          >
            + 新建模板
          </WxbButton>
        </div>
      </header>

      <div className="tpl-kpi-row">
        <WxbCard className="tpl-kpi">
          <div className="tpl-kpi-value">{stats.total}</div>
          <div className="tpl-kpi-label">模板总数</div>
        </WxbCard>
        <WxbCard className="tpl-kpi">
          <div className="tpl-kpi-value tpl-kpi-active">{stats.active}</div>
          <div className="tpl-kpi-label">启用中</div>
        </WxbCard>
        <WxbCard className="tpl-kpi">
          <div className="tpl-kpi-value tpl-kpi-draft">{stats.draft}</div>
          <div className="tpl-kpi-label">草稿</div>
        </WxbCard>
        <WxbCard className="tpl-kpi">
          <div className="tpl-kpi-value">{stats.products}</div>
          <div className="tpl-kpi-label">覆盖产品</div>
        </WxbCard>
      </div>

      <section className="tpl-section">
        <div className="tpl-toolbar">
          <WxbSegmented
            options={STATUS_FILTER_OPTIONS}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
          />
          <WxbSearchInput
            className="tpl-search"
            placeholder="搜编码 / 名称 / 产品 / 维护人"
            value={keyword}
            onChange={(v) => setKeyword(v)}
            allowClear
          />
        </div>

        <WxbDataTable<TemplateListRow>
          rowKey="id"
          density="compact"
          columns={columns}
          dataSource={filtered}
          pagination={false}
          scroll={{ x: 980 }}
          onRow={(row) => ({
            onClick: () => setSelected(row),
            style: { cursor: 'pointer' },
          })}
          emptyState={{
            description: keyword ? `没有匹配「${keyword}」的模板` : '暂无工艺流模板',
          }}
        />
      </section>

      <WxbDrawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.code} · 模板明细` : ''}
        width={460}
      >
        {selected ? (
          <div className="tpl-detail">
            <div className="tpl-detail-head">
              <div className="tpl-detail-name">{selected.name}</div>
              <StatusTag status={selected.status} isCurrent={selected.isCurrent} />
            </div>

            <dl className="tpl-detail-dl">
              <dt>编码</dt>
              <dd className="tpl-code">{selected.code}</dd>
              <dt>产品</dt>
              <dd>
                <WxbTag color="cyan">{selected.product}</WxbTag>
              </dd>
              <dt>版本</dt>
              <dd>
                <span className="tpl-version">{selected.version}</span>
              </dd>
              <dt>规模</dt>
              <dd>
                {selected.stageCount} 阶段 · {selected.opCount} 主链操作
              </dd>
              <dt>更新</dt>
              <dd>
                {selected.updatedAt} · {selected.owner}
              </dd>
              <dt>说明</dt>
              <dd>{selected.note || '—'}</dd>
            </dl>

            <div className="tpl-detail-hint">
              本明细为模板层(无时间无实例)轻量视图。CIP/SIP/配液/房间放行 等辅助不在模板中编排，由引擎在批次层按各操作 demands 用目标回归自动派生。
            </div>

            <div className="tpl-detail-actions">
              <WxbButton variant="primary" onClick={() => goEdit(selected)}>
                <span className="tpl-btn-icon">
                  <PencilIcon />
                </span>
                进入主工艺构建
              </WxbButton>
              <WxbButton
                variant="secondary"
                onClick={() => wxbToast.info(`TODO:复制「${selected.code}」为新草稿`)}
              >
                复制
              </WxbButton>
              <WxbButton
                variant="ghost"
                onClick={() => wxbToast.info(`TODO:基于「${selected.code}」派生新版本`)}
              >
                版本化
              </WxbButton>
            </div>
          </div>
        ) : (
          <WxbEmpty description="未选中模板" />
        )}
      </WxbDrawer>
    </div>
  );
};

export default TemplateListPage;

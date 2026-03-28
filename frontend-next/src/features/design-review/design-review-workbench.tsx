"use client";

import { useRef, useState } from "react";
import { DataTablePattern, type DataTableColumn } from "@/design-system/patterns/data-table-pattern";
import { FilterBar } from "@/design-system/patterns/filter-bar";
import { OverviewStrip } from "@/design-system/patterns/overview-strip";
import { PageHeader } from "@/design-system/patterns/page-header";
import { StatCard } from "@/design-system/patterns/stat-card";
import { Badge } from "@/design-system/primitives/badge";
import { Button } from "@/design-system/primitives/button";
import { ConfirmDialog } from "@/design-system/primitives/confirm-dialog";
import { EmptyState } from "@/design-system/primitives/empty-state";
import { ErrorState } from "@/design-system/primitives/error-state";
import { SelectInput, TextInput } from "@/design-system/primitives/field";
import { Loader } from "@/design-system/primitives/loader";
import { Panel } from "@/design-system/primitives/panel";
import { SideSheet } from "@/design-system/primitives/side-sheet";
import { StatusBadge } from "@/design-system/primitives/status-badge";
import { TableShell } from "@/design-system/primitives/table-shell";
import { TabOption, Tabs } from "@/design-system/primitives/tabs";
import { ToastItem, ToastStack } from "@/design-system/primitives/toast";
import { precisionLabTokens } from "@/design-system/tokens/precision-lab";
import {
  designReviewCoverage,
  designReviewIssues,
  designReviewSectionIssueIds,
  surfaceAuditTargets,
  type DesignReviewIssue,
} from "./design-review-data";
import {
  MetricGrid,
  ReviewSection,
  SectionNotesPanel,
  ShowcaseCard,
  SpecimenCard,
  SwatchGrid,
} from "./design-review-sections";

type DemoTab = "overview" | "operations" | "risk";

type MatrixRow = {
  assignees: string;
  level: string;
  qualification: string;
  risk: string;
};

type IssueLedgerRow = DesignReviewIssue;

const demoTabOptions: TabOption<DemoTab>[] = [
  { value: "overview", label: "总览", description: "共享结构、状态和主动作" },
  { value: "operations", label: "操作面", description: "高频 CRUD 与排查面板" },
  { value: "risk", label: "风险面", description: "高密度告警、矩阵和时间轴" },
];

const matrixRows: MatrixRow[] = [
  {
    qualification: "上游无菌配液",
    level: "L3 / 关键",
    assignees: "12",
    risk: "本周新增 2 个轮班缺口",
  },
  {
    qualification: "层析柱切换",
    level: "L2 / 常规",
    assignees: "8",
    risk: "供需平衡，但说明文案层级偏重",
  },
];

const issueLedgerColumns: DataTableColumn<IssueLedgerRow>[] = [
  {
    key: "category",
    header: "类别 / 优先级",
    render: (issue) => (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Badge tone="neutral">{issue.category}</Badge>
          <Badge
            tone={
              issue.severity === "critical"
                ? "danger"
                : issue.severity === "warning"
                  ? "warning"
                  : "accent"
            }
          >
            {issue.severity}
          </Badge>
        </div>
      </div>
    ),
  },
  {
    key: "issue",
    header: "问题",
    className: "min-w-[240px]",
    render: (issue) => (
      <div>
        <div className="font-semibold text-[var(--pl-text-primary)]">
          {issue.title}
        </div>
        <p className="mt-1 text-sm leading-6 text-[var(--pl-text-secondary)]">
          {issue.symptom}
        </p>
      </div>
    ),
  },
  {
    key: "evidence",
    header: "证据",
    className: "min-w-[220px]",
    render: (issue) => (
      <ul className="space-y-1 text-xs leading-5 text-[var(--pl-text-tertiary)]">
        {issue.evidence.map((path) => (
          <li key={path}>{path}</li>
        ))}
      </ul>
    ),
  },
  {
    key: "recommendation",
    header: "建议方向",
    className: "min-w-[240px]",
    render: (issue) => (
      <p className="text-sm leading-6 text-[var(--pl-text-secondary)]">
        {issue.recommendation}
      </p>
    ),
  },
];

const showcaseCount =
  designReviewCoverage.primitives.length + designReviewCoverage.patterns.length;

const tokenCount = Object.values(precisionLabTokens).reduce(
  (count, group) => count + Object.keys(group).length,
  0,
);

const reviewDebtLabel = `${designReviewCoverage.stories.length} stories / ${designReviewCoverage.tests.length} tests`;

const densityBaseline = [
  {
    label: "Typography",
    value: "IBM Plex Sans / Mono",
    hint: "全局字体来自 RootLayout，但字号和 tracking 还没有单独 token 化。",
  },
  {
    label: "Control height",
    value: "44px",
    hint: "Button、Field、Tabs 大体围绕 40-48px 运作，适合桌面高频操作。",
  },
  {
    label: "Panel spacing",
    value: "24px / 16px",
    hint: "大多数 card 和 section 采用 24px 外层节奏，局部 feature 仍有自定义回流。",
  },
  {
    label: "Radius",
    value: "10 / 16 / 24",
    hint: "已建立 token，但 pill 与 control 语义仍不稳定。",
  },
  {
    label: "Shadow",
    value: "Soft / Strong",
    hint: "Shadow 已归拢到 token，但使用范围仍偏宽。",
  },
  {
    label: "Motion",
    value: "160ms / 240ms",
    hint: "有 reduced-motion 兜底，但动效规范还没有细化到 pattern 层。",
  },
];

function getSectionIssues(
  sectionKey: keyof typeof designReviewSectionIssueIds,
) {
  const issueIds = new Set(designReviewSectionIssueIds[sectionKey]);
  return designReviewIssues.filter((issue) => issueIds.has(issue.id));
}

function DashboardSpecimen() {
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Dashboard specimen"
        subtitle="展示 route header、overview strip 和 filter bar 在一张轻量工作台里的组合关系。"
        title="调度中心基线"
      />
      <OverviewStrip className="md:grid-cols-3 xl:grid-cols-3">
        <StatCard label="Shell" tone="accent" value="稳定结构" />
        <StatCard label="Signal" tone="success" value="状态显式" />
        <StatCard label="Risk" tone="warning" value="装饰偏重" />
      </OverviewStrip>
      <FilterBar className="xl:grid-cols-3">
        <TextInput
          defaultValue="Wave 0 / design review"
          hint="诊断页不挂真实数据"
          label="Current focus"
          readOnly
        />
        <SelectInput
          defaultValue="desktop"
          hint="工业工作台仍以桌面密度为主"
          label="Viewport"
        >
          <option value="desktop">Desktop 1080p / 2K</option>
          <option value="review">Review mode</option>
        </SelectInput>
        <TextInput
          defaultValue="Background ornament still noticeable"
          hint="这是体检页要持续揭示的问题"
          label="Shell note"
          readOnly
        />
      </FilterBar>
    </div>
  );
}

function QualificationsSpecimen({
  demoTab,
  onChangeTab,
}: {
  demoTab: DemoTab;
  onChangeTab: (value: DemoTab) => void;
}) {
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Qualifications specimen"
        subtitle="演示 tabs、filters、table 和状态标签在 CRUD 工作台里的组合。"
        title="资质工作台"
      />
      <Tabs onChange={onChangeTab} options={demoTabOptions} value={demoTab} />
      <FilterBar className="xl:grid-cols-3">
        <TextInput defaultValue="关键资质" hint="模拟高频搜索" label="Search" />
        <SelectInput defaultValue="risk" hint="按运营重点筛选" label="Focus">
          <option value="risk">高风险</option>
          <option value="coverage">覆盖率</option>
          <option value="cleanup">清理债务</option>
        </SelectInput>
        <TextInput
          defaultValue="StatusBadge 和局部 pill 混用"
          hint="这是当前 specimen 想暴露的问题"
          label="Observed drift"
          readOnly
        />
      </FilterBar>
      <DataTablePattern
        columns={[
          {
            key: "qualification",
            header: "资质",
            render: (row: MatrixRow) => (
              <div>
                <div className="font-semibold text-[var(--pl-text-primary)]">
                  {row.qualification}
                </div>
                <div className="text-xs text-[var(--pl-text-tertiary)]">
                  {row.level}
                </div>
              </div>
            ),
          },
          {
            key: "assignees",
            header: "持有人",
            align: "center",
            render: (row: MatrixRow) => (
              <span className="font-semibold text-[var(--pl-text-primary)]">
                {row.assignees}
              </span>
            ),
          },
          {
            key: "risk",
            header: "风险提示",
            render: (row: MatrixRow) => (
              <StatusBadge
                label={row.risk}
                tone={row.risk.includes("缺口") ? "warning" : "info"}
              />
            ),
          },
        ]}
        emptyDescription="Specimen data is static for review."
        emptyTitle="No specimen rows"
        errorDescription="Issue ledger route should stay static."
        getRowKey={(row) => row.qualification}
        rows={matrixRows}
        title="Qualification audit table"
      />
    </div>
  );
}

function V3Specimen() {
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Resource-planning-v3 specimen"
        subtitle="用一个静态时间轴片段检查高密度 APS 场景下的层级、状态和 ornament 压力。"
        title="风险沙盘 / 时间轴样本"
      />
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Panel
          description="保持说明、筛选和诊断并排可见，比追求沉浸式视觉更重要。"
          eyebrow="Workbench focus"
          title="设备上下文"
        >
          <div className="space-y-3 text-sm leading-6 text-[var(--pl-text-secondary)]">
            <div className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-3">
              Main + auxiliary bars share one timeline.
            </div>
            <div className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-3">
              状态带和风险标记要优先保证可读，而不是视觉层次花样。
            </div>
            <div className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-3">
              当前 feature 里仍有渐变条、条纹底和自定义 pill 回流。
            </div>
          </div>
        </Panel>
        <Panel
          description="静态 specimen 不试图复刻整套 V3 逻辑，只暴露视觉语言在高密度场景中的承压点。"
          eyebrow="Timeline specimen"
          title="Equipment timeline"
        >
          <div className="space-y-3">
            {[
              {
                bars: [
                  {
                    width: "36%",
                    left: "4%",
                    label: "Main batch",
                    className:
                      "border-[rgba(11,106,162,0.22)] bg-[rgba(11,106,162,0.18)]",
                  },
                  {
                    width: "18%",
                    left: "46%",
                    label: "CIP",
                    className:
                      "border-[rgba(154,103,0,0.22)] bg-[rgba(154,103,0,0.16)]",
                  },
                ],
                code: "DS-301",
              },
              {
                bars: [
                  {
                    width: "24%",
                    left: "10%",
                    label: "Media hold",
                    className:
                      "border-[rgba(24,121,78,0.22)] bg-[rgba(24,121,78,0.16)]",
                  },
                  {
                    width: "14%",
                    left: "42%",
                    label: "Risk flag",
                    className:
                      "border-[rgba(180,35,24,0.24)] bg-[rgba(180,35,24,0.12)]",
                  },
                ],
                code: "UFDF-07",
              },
            ].map((row) => (
              <div
                key={row.code}
                className="grid gap-3 rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-4 md:grid-cols-[100px_minmax(0,1fr)]"
              >
                <div className="text-sm font-semibold text-[var(--pl-text-primary)]">
                  {row.code}
                </div>
                <div className="relative h-14 rounded-[var(--pl-radius-sm)] border border-[var(--pl-border)] bg-[linear-gradient(90deg,rgba(172,185,199,0.08)_1px,transparent_1px)] [background-size:56px_56px]">
                  {row.bars.map((bar) => (
                    <div
                      key={`${row.code}-${bar.label}`}
                      className={`absolute top-3 inline-flex h-8 items-center rounded-[12px] border px-3 text-xs font-medium text-[var(--pl-text-primary)] shadow-[var(--pl-shadow-soft)] ${bar.className}`}
                      style={{ left: bar.left, width: bar.width }}
                    >
                      {bar.label}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function DesignReviewWorkbench() {
  const [demoTab, setDemoTab] = useState<DemoTab>("overview");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextToastIdRef = useRef(0);

  function pushToast(
    tone: ToastItem["tone"],
    title: string,
    description: string,
  ) {
    nextToastIdRef.current += 1;
    setToasts((items) => [
      ...items,
      {
        id: `design-review-toast-${nextToastIdRef.current}`,
        tone,
        title,
        description,
      },
    ]);
  }

  const storyDebt = showcaseCount - designReviewCoverage.stories.length;
  const testDebt = showcaseCount - designReviewCoverage.tests.length;

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Design review route"
          subtitle="这是 Precision Lab 设计系统的常驻体检页。它在真实工作区壳层内同时展示 token、primitive、pattern 和业务样本，并把当前风格漂移显式列出来，帮助后续收敛。"
          title="组件库与 UI 风格体检"
          actions={
            <>
              <Badge tone="accent">Internal governance</Badge>
              <Button
                onClick={() =>
                  pushToast(
                    "accent",
                    "Design review note",
                    "Toast 展示证明交互型 pattern 可以在静态诊断页里被安全演示。",
                  )
                }
                size="sm"
                variant="secondary"
              >
                预览 Toast
              </Button>
              <Button onClick={() => setSheetOpen(true)} size="sm" variant="ghost">
                预览 SideSheet
              </Button>
              <Button onClick={() => setDialogOpen(true)} size="sm">
                预览 ConfirmDialog
              </Button>
            </>
          }
        />

        <OverviewStrip>
          <StatCard
            label="Token baseline"
            tone="accent"
            value={`${tokenCount} tokens`}
          />
          <StatCard
            label="Showcase coverage"
            tone="success"
            value={`${designReviewCoverage.primitives.length} primitives / ${designReviewCoverage.patterns.length} patterns`}
          />
          <StatCard
            label="Issues visible"
            tone="warning"
            value={`${designReviewIssues.length} findings`}
          />
          <StatCard
            label="Review debt"
            tone="danger"
            value={reviewDebtLabel}
          />
        </OverviewStrip>

        <ReviewSection
          notes={
            <SectionNotesPanel
              description="先看 token 和基线，再看组件展示。这里的提醒定义了后面所有诊断的观察角度。"
              issues={getSectionIssues("tokenBaseline")}
              title="Token baseline notes"
            />
          }
        >
          <Panel
            description="Token baseline 负责把颜色、密度和表面层级放在一张桌面工作台语境里检查，而不是只看 isolated story。"
            eyebrow="Token baseline"
            title="Token Baseline"
          >
            <div className="space-y-6">
              <ShowcaseCard
                subtitle="颜色层次已经形成 canvas / surface / text / status 体系，但 shell ornament 仍偏重。"
                title="Color system"
              >
                <SwatchGrid entries={Object.entries(precisionLabTokens.colors)} />
              </ShowcaseCard>
              <ShowcaseCard
                subtitle="密度、圆角和阴影已经有 baseline，但还没有把所有视觉决定全部收束到 token。"
                title="Density and semantics"
              >
                <MetricGrid items={densityBaseline} />
              </ShowcaseCard>
            </div>
          </Panel>
        </ReviewSection>

        <ReviewSection
          notes={
            <SectionNotesPanel
              description="Primitive gallery 不是为了堆满所有状态，而是让最关键的形态和语义冲突并排可见。"
              issues={getSectionIssues("primitiveGallery")}
              title="Primitive gallery notes"
            />
          }
        >
          <Panel
            description="原子组件展示区覆盖高频控件、反馈状态和标签语义，用来观察 token 和组件 API 是否一致。"
            eyebrow="Component inventory"
            title="Primitive Gallery"
          >
            <div className="grid gap-4 xl:grid-cols-2">
              <ShowcaseCard
                subtitle="按钮已经形成主要动作层级，但 pill 形态和 control 形态还没完全分开。"
                title="Buttons"
              >
                <div className="flex flex-wrap gap-3">
                  <Button>Primary</Button>
                  <Button variant="secondary">Secondary</Button>
                  <Button variant="ghost">Ghost</Button>
                  <Button variant="danger">Danger</Button>
                  <Button disabled>Disabled</Button>
                </div>
              </ShowcaseCard>

              <ShowcaseCard
                subtitle="Badge 与 StatusBadge 都承担状态展示，需要在此对比语义边界。"
                title="Badge semantics"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone="accent">Route label</Badge>
                  <Badge tone="warning">Needs review</Badge>
                  <StatusBadge label="运行中" tone="info" />
                  <StatusBadge label="高风险" tone="warning" />
                  <StatusBadge label="阻塞" tone="danger" />
                </div>
              </ShowcaseCard>

              <ShowcaseCard
                subtitle="Field 负责高频筛选和编辑，错误状态要和正常状态并排检查。"
                title="Field states"
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <TextInput
                    defaultValue="Batch quality review"
                    hint="正常编辑态"
                    label="Text input"
                  />
                  <SelectInput
                    defaultValue="review"
                    hint="正常筛选态"
                    label="Select input"
                  >
                    <option value="review">Design review</option>
                    <option value="migration">Migration</option>
                  </SelectInput>
                  <TextInput
                    defaultValue="Rounded full still present"
                    error="这个说明用来模拟组件级错误反馈。"
                    label="Error state"
                  />
                </div>
              </ShowcaseCard>

              <ShowcaseCard
                subtitle="Panel 是当前 design system 的默认 elevated surface，需要配合标题和说明检查节奏。"
                title="Panel"
              >
                <Panel
                  description="This nested specimen keeps the same border, radius, and spacing semantics as a real workbench section."
                  eyebrow="Nested specimen"
                  title="Panel within the gallery"
                >
                  <div className="text-sm leading-6 text-[var(--pl-text-secondary)]">
                    如果 panel 作为默认容器成立，后续 feature 页就不需要反复长出新的 one-off card。
                  </div>
                </Panel>
              </ShowcaseCard>

              <ShowcaseCard
                subtitle="Tabs 与 loader 代表高频切换和显式 loading，这两类状态不应该藏在 feature 自定义里。"
                title="Tabs and loader"
              >
                <div className="space-y-4">
                  <Tabs
                    onChange={setDemoTab}
                    options={demoTabOptions}
                    value={demoTab}
                  />
                  <Loader label="Preparing shared review surface" />
                </div>
              </ShowcaseCard>

              <ShowcaseCard
                subtitle="空态和错误态是显式诊断的基础，后续 feature 页应该复用而不是重画。"
                title="Empty and error states"
              >
                <div className="space-y-4">
                  <EmptyState
                    description="Static review route intentionally avoids backend dependencies."
                    eyebrow="Empty"
                    title="No live data required"
                  />
                  <ErrorState
                    description="When a review surface fails, the user still needs enough context to diagnose the failure."
                    title="Unable to load specimen"
                  />
                </div>
              </ShowcaseCard>
            </div>
          </Panel>
        </ReviewSection>

        <ReviewSection
          notes={
            <SectionNotesPanel
              description="Pattern gallery 关注的是页面组合、状态壳层和交互容器是否形成了稳定复用面。"
              issues={getSectionIssues("patternGallery")}
              title="Pattern gallery notes"
            />
          }
        >
          <Panel
            description="Pattern 区把 page-level 组合和交互壳层放到一起检查，避免 design system 只停留在原子层。"
            eyebrow="Page patterns"
            title="Pattern Gallery"
          >
            <div className="space-y-4">
              <ShowcaseCard
                subtitle="PageHeader、OverviewStrip 和 FilterBar 共同定义了大多数桌面工作台的上半屏节奏。"
                title="Page composition"
              >
                <div className="space-y-4">
                  <PageHeader
                    eyebrow="Pattern specimen"
                    subtitle="说明、动作和筛选先于表格进入视线，帮助用户先建立上下文。"
                    title="Composition baseline"
                  />
                  <OverviewStrip className="md:grid-cols-4 xl:grid-cols-4">
                    <StatCard label="Primary action" tone="accent" value="Visible" />
                    <StatCard label="State language" tone="success" value="Explicit" />
                    <StatCard label="Density" tone="neutral" value="Desktop-first" />
                    <StatCard label="Risk" tone="warning" value="Copy overstyled" />
                  </OverviewStrip>
                  <FilterBar>
                    <TextInput
                      defaultValue="Page shell"
                      hint="Context before content"
                      label="Focus"
                    />
                    <SelectInput
                      defaultValue="design-system"
                      hint="Feature pages should compose patterns"
                      label="Scope"
                    >
                      <option value="design-system">Design system</option>
                      <option value="surface-audit">Surface audit</option>
                    </SelectInput>
                    <TextInput
                      defaultValue="Minimal ornament"
                      hint="Rules baseline"
                      label="Visual direction"
                      readOnly
                    />
                    <TextInput
                      defaultValue="No backend dependency"
                      hint="Static diagnostic route"
                      label="Runtime"
                      readOnly
                    />
                  </FilterBar>
                </div>
              </ShowcaseCard>

              <div className="grid gap-4 xl:grid-cols-2">
                <ShowcaseCard
                  subtitle="DataTablePattern 负责高信息密度表格的主视图，并显式承载 loading / empty / error。"
                  title="Data table pattern"
                >
                  <DataTablePattern
                    columns={[
                      {
                        key: "surface",
                        header: "Surface",
                        render: (row: {
                          detail: string;
                          drift: string;
                          surface: string;
                        }) => (
                          <div>
                            <div className="font-semibold text-[var(--pl-text-primary)]">
                              {row.surface}
                            </div>
                            <div className="text-xs text-[var(--pl-text-tertiary)]">
                              {row.detail}
                            </div>
                          </div>
                        ),
                      },
                      {
                        key: "drift",
                        header: "Observed drift",
                        render: (row) => row.drift,
                      },
                    ]}
                    emptyDescription="Static specimens keep this route deterministic."
                    emptyTitle="No table rows"
                    errorDescription="Pattern showcase does not query the backend."
                    getRowKey={(row) => row.surface}
                    rows={[
                      {
                        surface: "Shell header",
                        detail: "top bar + badges",
                        drift: "Wave 0 routes need explicit null checks for wave labels.",
                      },
                      {
                        surface: "Dense admin desk",
                        detail: "filters + table + drawers",
                        drift: "Feature pages still reintroduce local pill and button shapes.",
                      },
                    ]}
                    title="Pattern review ledger"
                  />
                </ShowcaseCard>

                <ShowcaseCard
                  subtitle="TableShell 适合更轻量、无状态机的管理型表格，也方便并排展示设计治理清单。"
                  title="Table shell"
                >
                  <TableShell
                    columns={["Artifact", "Current", "Expected", "Owner"]}
                    title="Review support ledger"
                  >
                    <div className="contents text-sm text-[var(--pl-text-secondary)]">
                      <div className="bg-[var(--pl-surface-elevated)] px-4 py-4">
                        Story coverage
                      </div>
                      <div className="bg-[var(--pl-surface-elevated)] px-4 py-4">
                        {designReviewCoverage.stories.length} surfaces
                      </div>
                      <div className="bg-[var(--pl-surface-elevated)] px-4 py-4">
                        Component review baseline
                      </div>
                      <div className="bg-[var(--pl-surface-elevated)] px-4 py-4">
                        Design system
                      </div>
                      <div className="bg-[var(--pl-surface-elevated)] px-4 py-4">
                        Test coverage
                      </div>
                      <div className="bg-[var(--pl-surface-elevated)] px-4 py-4">
                        {designReviewCoverage.tests.length} surface
                      </div>
                      <div className="bg-[var(--pl-surface-elevated)] px-4 py-4">
                        Render and state smoke
                      </div>
                      <div className="bg-[var(--pl-surface-elevated)] px-4 py-4">
                        UI review route
                      </div>
                    </div>
                  </TableShell>
                </ShowcaseCard>
              </div>

              <ShowcaseCard
                subtitle="所有交互演示都由页面内局部 state 驱动，不依赖真实 mutation 或 API。"
                title="Interactive overlays"
              >
                <div className="flex flex-wrap gap-3">
                  <Button onClick={() => setSheetOpen(true)} variant="secondary">
                    Open SideSheet
                  </Button>
                  <Button onClick={() => setDialogOpen(true)} variant="ghost">
                    Open ConfirmDialog
                  </Button>
                  <Button
                    onClick={() =>
                      pushToast(
                        "warning",
                        "Pattern reminder",
                        "交互型 pattern 可以在本页演示，但后续仍应补 Storybook 或测试覆盖。",
                      )
                    }
                  >
                    Emit review toast
                  </Button>
                </div>
              </ShowcaseCard>
            </div>
          </Panel>
        </ReviewSection>

        <ReviewSection
          notes={
            <SectionNotesPanel
              description="业务样本不是为了复刻全量功能，而是为了暴露 pattern 在真实场景里哪里撑不住。"
              issues={getSectionIssues("surfaceAudit")}
              title="Surface audit notes"
            />
          }
        >
          <Panel
            description="这里选取三个最能暴露风格和 pattern 压力的样本。它们都只保留静态骨架，不挂真实服务。"
            eyebrow="Representative specimens"
            title="Surface Audit"
          >
            <div className="space-y-4">
              <SpecimenCard
                findings={[
                  "壳层渐变和 blur 在 overview 页仍较明显，容易抢过真正的运营信号。",
                  "Wave 标签这样的元信息应该保持客观，不应该因为 falsy 判断产生语义错误。",
                ]}
                summary={surfaceAuditTargets[0].summary}
                title={surfaceAuditTargets[0].title}
              >
                <DashboardSpecimen />
              </SpecimenCard>

              <SpecimenCard
                findings={[
                  "Tabs、filters 和 table 已经形成工作台主路径，但局部 one-off button 和 pill 仍在回流。",
                  "StatusBadge 能表达业务状态，但辅助标签与 badge 边界仍待收敛。",
                ]}
                summary={surfaceAuditTargets[1].summary}
                title={surfaceAuditTargets[1].title}
              >
                <QualificationsSpecimen
                  demoTab={demoTab}
                  onChangeTab={setDemoTab}
                />
              </SpecimenCard>

              <SpecimenCard
                findings={[
                  "高密度 timeline 是目前最容易逼出 token 和 pattern 不足的区域。",
                  "当前真实 feature 中已有渐变条、条纹背景和局部自定义 pill，需要继续回提成共享 pattern。",
                ]}
                summary={surfaceAuditTargets[2].summary}
                title={surfaceAuditTargets[2].title}
              >
                <V3Specimen />
              </SpecimenCard>
            </div>
          </Panel>
        </ReviewSection>

        <ReviewSection
          notes={
            <div className="space-y-6">
              <Panel
                description="Review debt 不会在这次页面里自动消失，但至少要变成一眼可见的治理面板。"
                eyebrow="Coverage"
                title="Coverage snapshot"
              >
                <div className="space-y-4 text-sm leading-6 text-[var(--pl-text-secondary)]">
                  <div>
                    <div className="font-semibold text-[var(--pl-text-primary)]">
                      Story coverage
                    </div>
                    <div>{designReviewCoverage.stories.join(", ")}</div>
                  </div>
                  <div>
                    <div className="font-semibold text-[var(--pl-text-primary)]">
                      Test coverage
                    </div>
                    <div>{designReviewCoverage.tests.join(", ")}</div>
                  </div>
                  <div className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-4">
                    当前仍有 {storyDebt} 个展示面缺 story，对应 {testDebt} 个展示面缺最基础 render/state coverage。
                  </div>
                </div>
              </Panel>
              <SectionNotesPanel
                description="Issue ledger 是本页的治理出口，后续每次发现新漂移都应先加进这里，而不是只留在聊天记录里。"
                issues={getSectionIssues("issueLedger")}
                title="Issue ledger notes"
              />
            </div>
          }
        >
          <DataTablePattern
            columns={issueLedgerColumns}
            emptyDescription="Issue ledger should never be empty while the system is still converging."
            emptyTitle="No design findings"
            errorDescription="This route keeps diagnostics local and static."
            getRowKey={(issue) => issue.id}
            rows={designReviewIssues}
            title="Issue Ledger"
          />
        </ReviewSection>
      </div>

      <SideSheet
        description="用同一张 review route 检查标题层级、overlay 处理、footer 节奏，以及它与工作台主内容的关系。"
        footer={
          <div className="flex justify-end gap-3">
            <Button onClick={() => setSheetOpen(false)} size="sm" variant="ghost">
              关闭
            </Button>
            <Button
              onClick={() => {
                setSheetOpen(false);
                pushToast(
                  "success",
                  "SideSheet reviewed",
                  "SideSheet specimen stays local to the design-review route.",
                );
              }}
              size="sm"
            >
              标记已检查
            </Button>
          </div>
        }
        onClose={() => setSheetOpen(false)}
        open={sheetOpen}
        title="SideSheet pattern review"
      >
        <div className="space-y-4 text-sm leading-6 text-[var(--pl-text-secondary)]">
          <div className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-4">
            Overlay blur 目前仍然偏重，这是 design-review route 想持续暴露的问题。
          </div>
          <div className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-4">
            标题、正文和 footer 动作的节奏已经稳定，后续应优先复用而不是 feature 内重画 drawer。
          </div>
        </div>
      </SideSheet>

      <ConfirmDialog
        confirmLabel="确认演示"
        description="这个对话框只做 pattern 诊断演示，不触发任何真实业务动作。"
        onCancel={() => setDialogOpen(false)}
        onConfirm={() => {
          setDialogOpen(false);
          pushToast(
            "warning",
            "ConfirmDialog reviewed",
            "Destructive and confirm flows should stay explicit and reusable.",
          );
        }}
        open={dialogOpen}
        title="确认检查这个 pattern"
      />

      <ToastStack
        onDismiss={(id) =>
          setToasts((items) => items.filter((toast) => toast.id !== id))
        }
        toasts={toasts}
      />
    </>
  );
}

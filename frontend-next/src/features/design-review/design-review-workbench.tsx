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
    className: "min-w-[160px]",
    render: (issue) => (
      <div className="space-y-1">
        <div className="flex flex-wrap gap-1.5">
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
    className: "min-w-[220px]",
    render: (issue) => (
      <div>
        <div className="font-semibold text-[var(--pl-text-primary)]">
          {issue.title}
        </div>
        <p className="mt-1 text-sm leading-5 text-[var(--pl-text-secondary)]">
          {issue.symptom}
        </p>
      </div>
    ),
  },
  {
    key: "evidence",
    header: "证据",
    className: "min-w-[180px]",
    render: (issue) => (
      <ul className="space-y-1 text-xs leading-5 text-[var(--pl-text-tertiary)]">
        {issue.evidence.map((path) => (
          <li className="break-all" key={path}>
            {path}
          </li>
        ))}
      </ul>
    ),
  },
  {
    key: "recommendation",
    header: "建议方向",
    className: "min-w-[220px]",
    render: (issue) => (
      <p className="text-sm leading-5 text-[var(--pl-text-secondary)]">
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
    value: "正文优先 / 低强调",
    hint: "默认正文、标签和辅助说明回到正常阅读节奏，不再依赖大量 uppercase 与 tracking。",
  },
  {
    label: "Control scale",
    value: "紧凑桌面 / 40-44px",
    hint: "高频筛选和主动作保持桌面密度优先，不为了“呼吸感”无故拉高控件。",
  },
  {
    label: "Spacing rhythm",
    value: "收紧 section / 强化分区",
    hint: "留白只服务扫描和分组，不允许用大片空白制造高级感。",
  },
  {
    label: "Radius",
    value: "低圆角 / 非 pill 默认",
    hint: "control、panel、status 采用更工程化的边界语言，pill 只保留给显式例外。",
  },
  {
    label: "Surface hierarchy",
    value: "边界优先 / 阴影克制",
    hint: "页面层级主要依赖 border、对比和布局分区，而不是 blur、厚阴影和发光表面。",
  },
  {
    label: "Overflow safety",
    value: "wrap / truncate / scroll",
    hint: "任何可能变长的文本、数字和路径都必须有明确容器策略，不能等溢出后再补救。",
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
    <div className="space-y-3">
      <PageHeader
        eyebrow="Dashboard specimen"
        subtitle="用更紧凑的 header、概览条和筛选区验证工作台上半屏的扫描效率。"
        title="调度中心基线"
      />
      <OverviewStrip className="md:grid-cols-3 xl:grid-cols-3">
        <StatCard label="Shell" tone="accent" value="稳定结构" />
        <StatCard label="Signal" tone="success" value="状态显式" />
        <StatCard label="Risk" tone="warning" value="装饰需收敛" />
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
    <div className="space-y-3">
      <PageHeader
        eyebrow="Qualifications specimen"
        subtitle="演示 tabs、filters、table 和状态标签在 CRUD 工作台里的紧凑组合。"
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
    <div className="space-y-3">
      <PageHeader
        eyebrow="Resource-planning-v3 specimen"
        subtitle="用一个静态时间轴片段检查高密度 APS 场景下的层级、状态和容器安全。"
        title="风险沙盘 / 时间轴样本"
      />
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Panel
          description="保持说明、筛选和诊断并排可见，比追求沉浸式视觉更重要。"
          eyebrow="Workbench focus"
          title="设备上下文"
        >
          <div className="space-y-2.5 text-sm leading-5 text-[var(--pl-text-secondary)]">
            <div className="rounded-[var(--pl-radius-sm)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3.5 py-2.5">
              Main + auxiliary bars share one timeline.
            </div>
            <div className="rounded-[var(--pl-radius-sm)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3.5 py-2.5">
              状态带和风险标记要优先保证可读，而不是视觉层次花样。
            </div>
            <div className="rounded-[var(--pl-radius-sm)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3.5 py-2.5">
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
                className="grid gap-3 rounded-[var(--pl-radius-sm)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3.5 py-3 md:grid-cols-[96px_minmax(0,1fr)]"
              >
                <div className="text-sm font-semibold leading-5 text-[var(--pl-text-primary)]">
                  {row.code}
                </div>
                <div className="relative h-12 overflow-hidden rounded-[var(--pl-radius-sm)] border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)]">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div
                      aria-hidden="true"
                      className="absolute inset-y-0 w-px bg-[var(--pl-border)]"
                      key={`${row.code}-marker-${index}`}
                      style={{ left: `${16 + index * 14}%` }}
                    />
                  ))}
                  {row.bars.map((bar) => (
                    <div
                      key={`${row.code}-${bar.label}`}
                      className={`absolute top-2.5 inline-flex h-7 items-center overflow-hidden rounded-[var(--pl-radius-sm)] border px-2.5 text-[11px] font-medium leading-4 text-[var(--pl-text-primary)] ${bar.className}`}
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
      <div className="space-y-5">
        <PageHeader
          eyebrow="Design review route"
          subtitle="这是 Precision Lab 设计系统的常驻体检页。它在真实工作区壳层里同时展示 token、primitive、pattern 和业务样本，并用更紧凑的桌面排版验证新的几何、密度和溢出规则。"
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

        <OverviewStrip className="md:grid-cols-2 xl:grid-cols-4">
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
            description="Token baseline 负责把颜色、密度和表面层级放在真实桌面工作台语境里检查，而不是只看 isolated story。"
            eyebrow="Token baseline"
            title="Token Baseline"
          >
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.18fr)_minmax(0,0.92fr)]">
              <ShowcaseCard
                subtitle="颜色层次已形成 canvas / surface / text / status 体系，但业务面应持续压低 ornament 感。"
                title="Color system"
              >
                <SwatchGrid entries={Object.entries(precisionLabTokens.colors)} />
              </ShowcaseCard>
              <ShowcaseCard
                subtitle="这里记录新的默认方向，让后续 token 和 primitive 收敛时有明确参照。"
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
            <div className="grid gap-4 md:grid-cols-2">
              <ShowcaseCard
                subtitle="按钮应优先表达动作层级和密度，不再默认采用 pill 几何。"
                title="Buttons"
              >
                <div className="flex flex-wrap gap-2">
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
                <div className="flex flex-wrap items-center gap-2">
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
                <div className="grid gap-3 md:grid-cols-2">
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
                <div className="space-y-3">
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
                <div className="space-y-3">
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
                <div className="space-y-3">
                  <PageHeader
                    eyebrow="Pattern specimen"
                    subtitle="说明、动作和筛选先于主体内容进入视线，帮助用户快速建立上下文。"
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
                      <div className="bg-[var(--pl-surface-elevated)] px-3 py-3">
                        Story coverage
                      </div>
                      <div className="bg-[var(--pl-surface-elevated)] px-3 py-3">
                        {designReviewCoverage.stories.length} surfaces
                      </div>
                      <div className="bg-[var(--pl-surface-elevated)] px-3 py-3">
                        Component review baseline
                      </div>
                      <div className="bg-[var(--pl-surface-elevated)] px-3 py-3">
                        Design system
                      </div>
                      <div className="bg-[var(--pl-surface-elevated)] px-3 py-3">
                        Test coverage
                      </div>
                      <div className="bg-[var(--pl-surface-elevated)] px-3 py-3">
                        {designReviewCoverage.tests.length} surface
                      </div>
                      <div className="bg-[var(--pl-surface-elevated)] px-3 py-3">
                        Render and state smoke
                      </div>
                      <div className="bg-[var(--pl-surface-elevated)] px-3 py-3">
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
                <div className="flex flex-wrap gap-2">
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
            <div className="space-y-5">
              <Panel
                description="Review debt 不会在这次页面里自动消失，但至少要变成一眼可见的治理面板。"
                eyebrow="Coverage"
                title="Coverage snapshot"
              >
                <div className="space-y-3">
                  <MetricGrid
                    items={[
                      {
                        label: "Story coverage",
                        value: `${designReviewCoverage.stories.length} / ${showcaseCount}`,
                        hint: designReviewCoverage.stories.join(", "),
                      },
                      {
                        label: "Test coverage",
                        value: `${designReviewCoverage.tests.length} / ${showcaseCount}`,
                        hint: designReviewCoverage.tests.join(", "),
                      },
                      {
                        label: "Missing baseline",
                        value: `${storyDebt} story / ${testDebt} test`,
                        hint: "治理页让缺口显性化，但后续仍需补基础 render 与 state coverage。",
                      },
                    ]}
                  />
                  <div className="rounded-[var(--pl-radius-sm)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3.5 py-3 text-sm leading-5 text-[var(--pl-text-secondary)]">
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
          <div className="rounded-[var(--pl-radius-sm)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3.5 py-3">
            Overlay blur 目前仍然偏重，这是 design-review route 想持续暴露的问题。
          </div>
          <div className="rounded-[var(--pl-radius-sm)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3.5 py-3">
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

export type DesignReviewCategory = "token" | "primitive" | "pattern" | "surface";
export type DesignReviewSeverity = "info" | "warning" | "critical";

export type DesignReviewIssue = {
  category: DesignReviewCategory;
  evidence: string[];
  id: string;
  recommendation: string;
  severity: DesignReviewSeverity;
  symptom: string;
  title: string;
};

export const designReviewCoverage = {
  patterns: [
    "PageHeader",
    "FilterBar",
    "OverviewStrip",
    "StatCard",
    "DataTablePattern",
    "TableShell",
    "SideSheet",
    "ConfirmDialog",
    "ToastStack",
  ],
  primitives: [
    "Button",
    "Badge",
    "StatusBadge",
    "Field",
    "Panel",
    "EmptyState",
    "ErrorState",
    "Loader",
    "Tabs",
  ],
  stories: ["Button", "Badge", "Panel", "StatCard"],
  tests: ["Button"],
} as const;

export const designReviewIssues: DesignReviewIssue[] = [
  {
    id: "decoration-pressure",
    category: "token",
    severity: "warning",
    title: "装饰性背景和 blur 仍然压过数据层",
    symptom:
      "工作区壳层已经建立了工业工作台基线，但渐变、磨砂和发光式表面仍然比数据块更抢视觉注意力。",
    evidence: [
      "src/app/globals.css",
      "src/design-system/patterns/app-shell.tsx",
      "src/design-system/patterns/command-rail.tsx",
      "src/design-system/primitives/side-sheet.tsx",
    ],
    recommendation:
      "把背景、blur 和 ornament 收敛为少量层级 token，优先保证 surface、border 和 state 的对比关系。",
  },
  {
    id: "radius-drift",
    category: "primitive",
    severity: "critical",
    title: "圆角语义在 token 和实现之间漂移",
    symptom:
      "设计 token 已定义小中大圆角，但按钮、徽标、局部标签和关闭按钮仍频繁使用 rounded-full，导致语义不稳定。",
    evidence: [
      "src/design-system/primitives/button.tsx",
      "src/design-system/primitives/badge.tsx",
      "src/design-system/primitives/side-sheet.tsx",
      "src/features/qualifications/qualifications-list-tab.tsx",
    ],
    recommendation:
      "明确 pill、control、card 的圆角等级，并优先通过 token 而不是局部原子类表达。",
  },
  {
    id: "copy-emphasis",
    category: "pattern",
    severity: "warning",
    title: "次级文案过度依赖 uppercase 和 tracking",
    symptom:
      "大量 section label、badge 和辅助说明采用全大写加宽字距，容易把生产型界面推向品牌展板而不是运维工作台。",
    evidence: [
      "src/design-system/primitives/panel.tsx",
      "src/design-system/primitives/field.tsx",
      "src/design-system/primitives/table-shell.tsx",
      "src/features/v3-bioprocess/v3-bioprocess-workbench.tsx",
    ],
    recommendation:
      "把 uppercase 限定在极少量导航编码或状态标识，其余次级文本改回正常中文阅读节奏。",
  },
  {
    id: "badge-overlap",
    category: "primitive",
    severity: "warning",
    title: "Badge 与 StatusBadge 语义边界重叠",
    symptom:
      "两套胶囊组件都承担状态展示，但一个偏通用，一个偏业务状态，目前边界对使用者并不清晰。",
    evidence: [
      "src/design-system/primitives/badge.tsx",
      "src/design-system/primitives/status-badge.tsx",
      "src/features/qualifications/qualifications-list-tab.tsx",
    ],
    recommendation:
      "定义 badge 负责信息标签、status badge 负责业务状态，后续页面只按语义使用其中一套。",
  },
  {
    id: "coverage-gap",
    category: "pattern",
    severity: "warning",
    title: "组件库 review 覆盖落后于实际设计系统面积",
    symptom:
      "现有 story 只覆盖少数组件，自动化测试只有 Button，导致很多视觉和交互漂移只能在业务页里被动发现。",
    evidence: [
      "src/design-system/primitives/button.stories.tsx",
      "src/design-system/primitives/panel.stories.tsx",
      "src/design-system/patterns/stat-card.stories.tsx",
      "src/design-system/primitives/button.test.tsx",
    ],
    recommendation:
      "把 design-review route 作为长期对照面，同时按优先级补 story 和最基础的 render/state coverage。",
  },
  {
    id: "local-style-return",
    category: "surface",
    severity: "critical",
    title: "业务页局部样式重新引入一批非 design-system 形态",
    symptom:
      "qualifications 和 v3 workbench 中已经出现局部按钮、标签、渐变条和时间轴样式，说明 pattern 抽象还没覆盖真实场景。",
    evidence: [
      "src/features/qualifications/qualifications-list-tab.tsx",
      "src/features/qualifications/qualification-matrix-tab.tsx",
      "src/features/v3-bioprocess/v3-bioprocess-workbench.tsx",
    ],
    recommendation:
      "优先从高频业务片段回提 pattern，而不是允许 feature 内继续长出 one-off 样式。",
  },
];

export const designReviewSectionIssueIds = {
  issueLedger: designReviewIssues.map((issue) => issue.id),
  patternGallery: ["copy-emphasis", "coverage-gap", "local-style-return"],
  primitiveGallery: ["radius-drift", "badge-overlap", "coverage-gap"],
  surfaceAudit: ["decoration-pressure", "local-style-return", "copy-emphasis"],
  tokenBaseline: ["decoration-pressure", "radius-drift", "copy-emphasis"],
} as const;

export const surfaceAuditTargets = [
  {
    id: "dashboard",
    summary:
      "壳层、概览卡片和筛选条已经形成了可复用骨架，但装饰强度和诊断层级仍需继续收敛。",
    title: "调度中心基线样本",
  },
  {
    id: "qualifications",
    summary:
      "资质工作台证明了新 pattern 能承载 CRUD + 监控，但也暴露了 feature 内部开始生长局部样式。",
    title: "资质工作台样本",
  },
  {
    id: "resource-planning-v3",
    summary:
      "高密度时间轴是最接近真实 APS 难题的样本，适合用来检查 token 和 pattern 是否足够支撑复杂场景。",
    title: "V3 风险沙盘样本",
  },
] as const;

import type { Route } from "next";

export type WorkspaceRouteKey =
  | "dashboard"
  | "design-review"
  | "organization-workbench"
  | "qualifications"
  | "qualification-matrix"
  | "operations"
  | "operation-types"
  | "shift-definitions"
  | "process-templates"
  | "process-templates-v2"
  | "resource-planning-v3"
  | "batch-management-v4"
  | "personnel-scheduling"
  | "solver-v4";

export type WorkspaceRouteDefinition = {
  checkpoints: string[];
  description: string;
  href: Route;
  key: WorkspaceRouteKey;
  label: string;
  railCode: string;
  status: "active" | "planned" | "legacy-hold";
  title: string;
  wave: number | null;
};

const routeDefinitions: WorkspaceRouteDefinition[] = [
  {
    key: "dashboard",
    href: "/dashboard",
    label: "调度中心",
    railCode: "DB",
    title: "调度中心",
    description:
      "Wave 0 dashboard shell for the Precision Lab migration. This screen validates the new app shell, design tokens, query layer, and APS desktop density baseline.",
    status: "active",
    wave: 0,
    checkpoints: [
      "Precision Lab shell is visible at desktop density.",
      "React Query provider and backend health probe are wired.",
      "Route and metadata behavior work without touching legacy runtime.",
    ],
  },
  {
    key: "design-review",
    href: "/design-review",
    label: "组件体检",
    railCode: "UI",
    title: "组件库与 UI 风格体检",
    description:
      "Persistent internal review surface for auditing Precision Lab tokens, primitives, patterns, and representative workbench compositions inside the live Next workspace shell.",
    status: "active",
    wave: 0,
    checkpoints: [
      "Token, primitive, and pattern baselines are visible in one workbench route.",
      "Current style drift is explicit instead of hidden in scattered stories and business pages.",
      "The review surface stays static and does not depend on backend contracts.",
    ],
  },
  {
    key: "organization-workbench",
    href: "/organization-workbench",
    label: "组织与人员",
    railCode: "ORG",
    title: "组织与人员",
    description:
      "Wave 2 target. This route will validate tree management, employee detail editing, and dense workbench side panels in the new design system.",
    status: "planned",
    wave: 2,
    checkpoints: [
      "Organization tree and employee tables move behind shared table patterns.",
      "Drawer and confirmation flows use first-party primitives.",
      "Desktop 2K density remains readable without Ant Design.",
    ],
  },
  {
    key: "qualifications",
    href: "/qualifications",
    label: "资质管理",
    railCode: "QF",
    title: "资质管理",
    description:
      "Wave 1 pilot workspace for the qualifications operations desk. This route consolidates qualification inventory, dependency visibility, and safe-delete behavior in the new design system.",
    status: "active",
    wave: 1,
    checkpoints: [
      "Qualification inventory, impact visibility, and safe deletion share a single operating surface.",
      "Create and edit flows use the shared side-sheet pattern instead of ad hoc modal flows.",
      "Cross-page links preserve the legacy route surface while upgrading the operating model.",
    ],
  },
  {
    key: "qualification-matrix",
    href: "/qualification-matrix",
    label: "资质矩阵",
    railCode: "QM",
    title: "资质矩阵",
    description:
      "Wave 1 matrix shortcut. In frontend-next this route resolves into the integrated qualifications workspace matrix tab while preserving the legacy URL surface.",
    status: "active",
    wave: 1,
    checkpoints: [
      "Qualification matrix lives inside the integrated qualifications operating desk.",
      "Legacy CRA route and backend contracts remain intact.",
      "Dense comparative coverage view stays readable at desktop density.",
    ],
  },
  {
    key: "operations",
    href: "/operations",
    label: "操作管理",
    railCode: "OP",
    title: "操作管理",
    description:
      "Wave 1 operations route. It anchors CRUD, validation, and dependency-aware action surfaces.",
    status: "planned",
    wave: 1,
    checkpoints: [
      "Entity editing follows a single inspect-edit-confirm pattern.",
      "Async error handling preserves diagnostic clarity.",
      "Action density stays efficient without visual noise.",
    ],
  },
  {
    key: "operation-types",
    href: "/operation-types",
    label: "操作类型",
    railCode: "OT",
    title: "操作类型",
    description:
      "Wave 1 supporting CRUD surface for validating smaller table-first pages against the new system.",
    status: "planned",
    wave: 1,
    checkpoints: [
      "Core table shell covers pagination-free admin views.",
      "Field components handle defaults and validation messaging.",
      "Legacy URL and terminology remain intact.",
    ],
  },
  {
    key: "shift-definitions",
    href: "/shift-definitions",
    label: "班次定义",
    railCode: "SD",
    title: "班次定义",
    description:
      "Wave 1 route for validating schedule configuration forms and state badges.",
    status: "planned",
    wave: 1,
    checkpoints: [
      "Form primitives support schedule-specific helper text.",
      "Badges separate status semantics from decorative color usage.",
      "Desktop-side panel patterns remain consistent with other CRUD flows.",
    ],
  },
  {
    key: "process-templates",
    href: "/process-templates",
    label: "工艺模版",
    railCode: "PV1",
    title: "工艺模版",
    description:
      "Legacy-hold route. V1 remains in the CRA app until there is an explicit business need to migrate it.",
    status: "legacy-hold",
    wave: null,
    checkpoints: [
      "No migration work starts without explicit business confirmation.",
      "frontend-next reserves the route so future decisions do not affect shell structure.",
      "Legacy frontend remains the source of truth for V1 behavior.",
    ],
  },
  {
    key: "process-templates-v2",
    href: "/process-templates-v2",
    label: "工艺模版 V2",
    railCode: "PV2",
    title: "工艺模版 V2",
    description:
      "Wave 5 route for the heaviest editor migration: resources, constraints, local persistence, and node-centric workspaces.",
    status: "planned",
    wave: 5,
    checkpoints: [
      "Editor workspace preserves deep-link behavior.",
      "Client-only boundaries are explicit for storage and drag interactions.",
      "Constraint diagnostics remain more important than decorative treatment.",
    ],
  },
  {
    key: "resource-planning-v3",
    href: "/resource-planning-v3" as Route,
    label: "资源规划 V3",
    railCode: "RP3",
    title: "资源规划 / 风险沙盘",
    description:
      "Wave 6 pilot route for the process-first V3 sandbox: main flow semantics, trigger-derived auxiliary operations, mirrored resource context, and a unified gantt surface.",
    status: "active",
    wave: 6,
    checkpoints: [
      "A single gantt surface shows main operations, auxiliary operations, and equipment state bands per resource row.",
      "Legacy APS contracts stay intact while V3 uses its own schema and preview endpoints.",
      "Overview and micro-adjustment share the same timeline through zoom presets instead of separate screens.",
    ],
  },
  {
    key: "batch-management-v4",
    href: "/batch-management-v4",
    label: "批次管理 V4",
    railCode: "BM",
    title: "批次管理 V4",
    description:
      "Wave 6 route for the most interaction-dense Gantt surface, including time-axis drag, full-screen, and bulk edit behavior.",
    status: "planned",
    wave: 6,
    checkpoints: [
      "Timeline performance is validated after all shell patterns stabilize.",
      "Full-screen behavior and browser APIs stay inside explicit client boundaries.",
      "High-density planning views remain legible on 2K desktop layouts.",
    ],
  },
  {
    key: "personnel-scheduling",
    href: "/personnel-scheduling",
    label: "人员排班",
    railCode: "PS",
    title: "人员排班",
    description:
      "Wave 4 route for dense grids, virtualized scheduling views, and keyboard-friendly allocation flows.",
    status: "planned",
    wave: 4,
    checkpoints: [
      "Virtualized views reuse shared table and status semantics.",
      "Filters remain visible before grid detail.",
      "Empty and infeasible states stay explicit.",
    ],
  },
  {
    key: "solver-v4",
    href: "/solver-v4",
    label: "V4 自动排班",
    railCode: "SV4",
    title: "V4 自动排班",
    description:
      "Wave 3 route for run monitoring, progress streaming, results review, and long-running diagnostics.",
    status: "planned",
    wave: 3,
    checkpoints: [
      "SSE lifecycle, stop/apply actions, and result states remain explicit.",
      "Diagnostics are preserved instead of smoothed into generic errors.",
      "Long-running operations keep actionable context visible.",
    ],
  },
];

type WorkspaceNavSection = {
  key: string;
  label: string;
  routes: WorkspaceRouteDefinition[];
};

export const workspaceNavSections: WorkspaceNavSection[] = [
  {
    key: "overview",
    label: "Overview",
    routes: routeDefinitions.filter((route) =>
      ["dashboard", "design-review"].includes(route.key),
    ),
  },
  {
    key: "master-data",
    label: "Master Data",
    routes: routeDefinitions.filter((route) =>
      [
        "organization-workbench",
        "qualifications",
        "qualification-matrix",
        "operations",
        "operation-types",
        "shift-definitions",
      ].includes(route.key),
    ),
  },
  {
    key: "planning",
    label: "Planning",
    routes: routeDefinitions.filter((route) =>
      [
        "process-templates",
        "process-templates-v2",
        "resource-planning-v3",
        "batch-management-v4",
      ].includes(route.key),
    ),
  },
  {
    key: "execution",
    label: "Execution",
    routes: routeDefinitions.filter((route) =>
      ["personnel-scheduling", "solver-v4"].includes(route.key),
    ),
  },
];

export const workspaceRouteMap = Object.fromEntries(
  routeDefinitions.map((route) => [route.key, route]),
) as Record<WorkspaceRouteKey, WorkspaceRouteDefinition>;

export function resolveRouteFromPath(pathname: string) {
  if (pathname === "/") {
    return workspaceRouteMap.dashboard;
  }

  const sortedRoutes = [...routeDefinitions].sort(
    (left, right) => right.href.length - left.href.length,
  );

  return sortedRoutes.find((route) => {
    if (pathname === route.href) {
      return true;
    }

    return pathname.startsWith(`${route.href}/`);
  });
}

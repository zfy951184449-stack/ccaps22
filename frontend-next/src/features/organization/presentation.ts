import type { OrganizationUnitNode, OrganizationWorkbenchTab } from "./contracts";
import type { StatusBadgeTone } from "@/design-system/primitives/status-badge";

// ─── Unit type labels ────────────────────────────────────────────

export const UNIT_TYPE_LABELS: Record<string, string> = {
  DEPARTMENT: "部门",
  TEAM: "团队",
  GROUP: "工段",
  SHIFT: "班组",
};

// ─── Org role labels ─────────────────────────────────────────────

export const ORG_ROLE_LABELS: Record<string, string> = {
  FRONTLINE: "一线人员",
  SHIFT_LEADER: "班组长",
  GROUP_LEADER: "工段长",
  TEAM_LEADER: "团队长",
  DEPT_MANAGER: "部门负责人",
};

// ─── Employment status ───────────────────────────────────────────

export const EMPLOYMENT_STATUS_OPTIONS = [
  { value: "ACTIVE", label: "在岗", tone: "accent" as StatusBadgeTone },
  { value: "VACATION", label: "休假", tone: "warning" as StatusBadgeTone },
  { value: "ON LEAVE", label: "请假", tone: "warning" as StatusBadgeTone },
  { value: "RESIGNED", label: "离职", tone: "danger" as StatusBadgeTone },
] as const;

export function resolveEmploymentStatusTone(status: string): StatusBadgeTone {
  switch (status?.toUpperCase()) {
    case "ACTIVE":
      return "accent";
    case "VACATION":
    case "ON LEAVE":
      return "warning";
    case "RESIGNED":
      return "danger";
    default:
      return "neutral";
  }
}

export function resolveEmploymentStatusLabel(status: string): string {
  const found = EMPLOYMENT_STATUS_OPTIONS.find(
    (opt) => opt.value === status?.toUpperCase(),
  );
  return found?.label ?? status;
}

// ─── Unavailability reason ───────────────────────────────────────

export const UNAVAILABILITY_REASONS = [
  { value: "AL", label: "年假 (Annual Leave)", tone: "accent" as StatusBadgeTone },
  { value: "SL", label: "病假 (Sick Leave)", tone: "danger" as StatusBadgeTone },
  { value: "PL", label: "事假 (Personal Leave)", tone: "warning" as StatusBadgeTone },
  { value: "OT", label: "其他 (Other)", tone: "neutral" as StatusBadgeTone },
] as const;

export function resolveReasonTone(code: string): StatusBadgeTone {
  const found = UNAVAILABILITY_REASONS.find((r) => r.value === code);
  return found?.tone ?? "neutral";
}

// ─── Tree utilities ──────────────────────────────────────────────

/**
 * Flatten a tree into a Map keyed by unit ID for O(1) lookups.
 */
export function flattenTree(
  units: OrganizationUnitNode[],
): Map<number, OrganizationUnitNode> {
  const map = new Map<number, OrganizationUnitNode>();

  function traverse(nodes: OrganizationUnitNode[]) {
    for (const node of nodes) {
      map.set(node.id, node);
      if (node.children.length > 0) {
        traverse(node.children);
      }
    }
  }

  traverse(units);
  return map;
}

/**
 * Collect all descendant IDs (including the given ID itself).
 */
export function getDescendantIds(
  unitId: number,
  map: Map<number, OrganizationUnitNode>,
): Set<number> {
  const ids = new Set<number>([unitId]);
  const node = map.get(unitId);

  if (node?.children) {
    for (const child of node.children) {
      for (const descendantId of getDescendantIds(child.id, map)) {
        ids.add(descendantId);
      }
    }
  }

  return ids;
}

/**
 * Build a breadcrumb path from root to the given unit.
 */
export function buildBreadcrumbPath(
  unitId: number,
  map: Map<number, OrganizationUnitNode>,
): OrganizationUnitNode[] {
  const path: OrganizationUnitNode[] = [];
  let currentId: number | null = unitId;

  while (currentId != null) {
    const node = map.get(currentId);
    if (node) {
      path.unshift(node);
      currentId = node.parentId;
    } else {
      break;
    }
  }

  return path;
}

/**
 * Collect all node IDs in the tree (used for default expand-all).
 */
export function getAllNodeIds(units: OrganizationUnitNode[]): number[] {
  const ids: number[] = [];

  function traverse(nodes: OrganizationUnitNode[]) {
    for (const node of nodes) {
      ids.push(node.id);
      if (node.children.length > 0) {
        traverse(node.children);
      }
    }
  }

  traverse(units);
  return ids;
}

// ─── Tab resolution ──────────────────────────────────────────────

const VALID_TABS: OrganizationWorkbenchTab[] = ["employees", "unavailability"];

export function resolveOrganizationWorkbenchTab(
  raw: string | null | undefined,
): OrganizationWorkbenchTab {
  if (raw && VALID_TABS.includes(raw as OrganizationWorkbenchTab)) {
    return raw as OrganizationWorkbenchTab;
  }
  return "employees";
}

// ─── Unit type icon indicator ────────────────────────────────────

export function resolveUnitTypeIndicator(unitType: string): {
  color: string;
  letter: string;
} {
  switch (unitType) {
    case "DEPARTMENT":
      return { color: "var(--pl-accent)", letter: "D" };
    case "TEAM":
      return { color: "#6366f1", letter: "T" };
    case "GROUP":
      return { color: "#8b5cf6", letter: "G" };
    case "SHIFT":
      return { color: "var(--pl-text-tertiary)", letter: "S" };
    default:
      return { color: "var(--pl-text-tertiary)", letter: "?" };
  }
}

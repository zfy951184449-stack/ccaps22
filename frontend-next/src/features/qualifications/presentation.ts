import type { StatusBadgeTone } from "@/design-system/primitives/status-badge";
import type {
  OrganizationUnitNode,
  OrganizationUnitType,
  QualificationMatrixAssignment,
  QualificationShortageRiskItem,
  QualificationOverviewItem,
  QualificationUsageState,
} from "./contracts";

export type QualificationUsageFilter =
  | "ALL"
  | "IN_USE"
  | "UNUSED"
  | QualificationUsageState;

export type QualificationSortOrder = "NAME_ASC" | "NAME_DESC";

export type QualificationWorkbenchTab = "list" | "matrix" | "shortages";
export type QualificationOrgFilterValue = "ALL" | `${number}`;

export function resolveQualificationWorkbenchTab(
  value: string | null | undefined,
): QualificationWorkbenchTab {
  switch (value) {
    case "matrix":
    case "shortages":
      return value;
    case "list":
    default:
      return "list";
  }
}

export function getUsageStatePresentation(usageState: QualificationUsageState): {
  label: string;
  tone: StatusBadgeTone;
} {
  switch (usageState) {
    case "EMPLOYEE_ONLY":
      return {
        label: "仅人员引用",
        tone: "info",
      };
    case "OPERATION_ONLY":
      return {
        label: "仅操作引用",
        tone: "warning",
      };
    case "MIXED":
      return {
        label: "人员+操作",
        tone: "accent",
      };
    case "UNUSED":
    default:
      return {
        label: "未使用",
        tone: "neutral",
      };
  }
}

export function filterAndSortQualifications(
  items: QualificationOverviewItem[],
  options: {
    searchTerm: string;
    sortOrder: QualificationSortOrder;
    usageFilter: QualificationUsageFilter;
  },
) {
  const normalizedSearch = options.searchTerm.trim().toLowerCase();

  return [...items]
    .filter((item) => {
      if (!normalizedSearch) {
        return true;
      }

      return item.qualification_name.toLowerCase().includes(normalizedSearch);
    })
    .filter((item) => {
      switch (options.usageFilter) {
        case "ALL":
          return true;
        case "IN_USE":
          return item.total_binding_count > 0;
        case "UNUSED":
          return item.total_binding_count === 0;
        default:
          return item.usage_state === options.usageFilter;
      }
    })
    .sort((left, right) => {
      const result = left.qualification_name.localeCompare(right.qualification_name);
      return options.sortOrder === "NAME_ASC" ? result : result * -1;
    });
}

export function buildMatrixAssignmentMap(
  assignments: QualificationMatrixAssignment[],
) {
  return new Map(
    assignments.map((assignment) => [
      `${assignment.qualification_id}:${assignment.employee_id}`,
      assignment,
    ]),
  );
}

export function buildQualificationRiskKey(item: {
  qualification_id: number;
  required_level: number;
}) {
  return `${item.qualification_id}:${item.required_level}`;
}

export function getQualificationLevelPresentation(level: number): {
  badgeClassName: string;
  ghostClassName: string;
  label: string;
  solidClassName: string;
} {
  const normalizedLevel = Math.min(5, Math.max(1, Math.round(level) || 1));

  switch (normalizedLevel) {
    case 1:
      return {
        badgeClassName:
          "border-[rgba(100,116,139,0.2)] bg-[rgba(100,116,139,0.1)] text-slate-700",
        ghostClassName:
          "border-[rgba(100,116,139,0.18)] bg-[rgba(100,116,139,0.04)] text-slate-700 hover:bg-[rgba(100,116,139,0.1)]",
        label: "1级",
        solidClassName:
          "border-[rgba(100,116,139,0.26)] bg-[rgba(100,116,139,0.16)] text-slate-800",
      };
    case 2:
      return {
        badgeClassName:
          "border-[rgba(14,165,233,0.22)] bg-[rgba(14,165,233,0.1)] text-sky-700",
        ghostClassName:
          "border-[rgba(14,165,233,0.18)] bg-[rgba(14,165,233,0.04)] text-sky-700 hover:bg-[rgba(14,165,233,0.1)]",
        label: "2级",
        solidClassName:
          "border-[rgba(14,165,233,0.28)] bg-[rgba(14,165,233,0.16)] text-sky-800",
      };
    case 3:
      return {
        badgeClassName:
          "border-[rgba(16,185,129,0.24)] bg-[rgba(16,185,129,0.1)] text-emerald-700",
        ghostClassName:
          "border-[rgba(16,185,129,0.18)] bg-[rgba(16,185,129,0.04)] text-emerald-700 hover:bg-[rgba(16,185,129,0.1)]",
        label: "3级",
        solidClassName:
          "border-[rgba(16,185,129,0.28)] bg-[rgba(16,185,129,0.16)] text-emerald-800",
      };
    case 4:
      return {
        badgeClassName:
          "border-[rgba(245,158,11,0.24)] bg-[rgba(245,158,11,0.1)] text-amber-700",
        ghostClassName:
          "border-[rgba(245,158,11,0.18)] bg-[rgba(245,158,11,0.04)] text-amber-700 hover:bg-[rgba(245,158,11,0.1)]",
        label: "4级",
        solidClassName:
          "border-[rgba(245,158,11,0.28)] bg-[rgba(245,158,11,0.16)] text-amber-800",
      };
    case 5:
    default:
      return {
        badgeClassName:
          "border-[rgba(244,63,94,0.24)] bg-[rgba(244,63,94,0.1)] text-rose-700",
        ghostClassName:
          "border-[rgba(244,63,94,0.18)] bg-[rgba(244,63,94,0.04)] text-rose-700 hover:bg-[rgba(244,63,94,0.1)]",
        label: "5级",
        solidClassName:
          "border-[rgba(244,63,94,0.28)] bg-[rgba(244,63,94,0.16)] text-rose-800",
      };
  }
}

export function getOrganizationUnitTypeLabel(unitType: OrganizationUnitType) {
  switch (unitType) {
    case "DEPARTMENT":
      return "部门";
    case "TEAM":
      return "团队";
    case "GROUP":
      return "班组";
    case "SHIFT":
      return "班次";
    default:
      return "节点";
  }
}

export function flattenOrganizationUnits(
  units: OrganizationUnitNode[],
  depth = 0,
): Array<{
  depth: number;
  id: number;
  label: string;
  unitName: string;
  unitType: OrganizationUnitType;
 }> {
  return units.flatMap((unit) => [
    {
      depth,
      id: unit.id,
      label: `${"　".repeat(depth)}${unit.unitName} · ${getOrganizationUnitTypeLabel(unit.unitType)}`,
      unitName: unit.unitName,
      unitType: unit.unitType,
    },
    ...flattenOrganizationUnits(unit.children, depth + 1),
  ]);
}

export function buildOrganizationDescendantMap(units: OrganizationUnitNode[]) {
  const descendants = new Map<number, Set<number>>();

  function visit(unit: OrganizationUnitNode) {
    const scoped = new Set<number>([unit.id]);

    for (const child of unit.children) {
      visit(child);
      const childScoped = descendants.get(child.id);
      if (!childScoped) {
        continue;
      }

      for (const unitId of childScoped) {
        scoped.add(unitId);
      }
    }

    descendants.set(unit.id, scoped);
  }

  units.forEach(visit);

  return descendants;
}

export function formatQualificationRiskItemLabel(item: {
  qualification_name: string;
  required_level: number;
}) {
  return `${item.qualification_name} ≥${item.required_level}级`;
}

export function getRiskScoreColor(score: number) {
  if (score >= 80) {
    return "#b42318";
  }

  if (score >= 60) {
    return "#d97706";
  }

  if (score >= 40) {
    return "#0b6aa2";
  }

  return "#5b6b7a";
}

export function getRiskScorePresentation(score: number): {
  badgeClassName: string;
  label: string;
  tone: StatusBadgeTone;
} {
  if (score >= 80) {
    return {
      badgeClassName:
        "border-[rgba(180,35,24,0.18)] bg-[var(--pl-danger-soft)] text-[var(--pl-danger)]",
      label: `硬短板 ${score}分`,
      tone: "danger",
    };
  }

  if (score >= 60) {
    return {
      badgeClassName:
        "border-[rgba(154,103,0,0.2)] bg-[rgba(245,158,11,0.12)] text-amber-800",
      label: `高风险 ${score}分`,
      tone: "warning",
    };
  }

  if (score >= 40) {
    return {
      badgeClassName:
        "border-[rgba(11,106,162,0.18)] bg-[var(--pl-accent-soft)] text-[var(--pl-accent-strong)]",
      label: `关注 ${score}分`,
      tone: "accent",
    };
  }

  return {
    badgeClassName:
      "border-[rgba(100,116,139,0.18)] bg-[rgba(100,116,139,0.08)] text-[var(--pl-text-tertiary)]",
    label: `可覆盖 ${score}分`,
    tone: "neutral",
  };
}

export function sortQualificationShortages(items: QualificationShortageRiskItem[]) {
  return [...items].sort((left, right) => {
    if (right.risk_score !== left.risk_score) {
      return right.risk_score - left.risk_score;
    }

    if (right.peak_gap_people !== left.peak_gap_people) {
      return right.peak_gap_people - left.peak_gap_people;
    }

    if (right.demand_hours !== left.demand_hours) {
      return right.demand_hours - left.demand_hours;
    }

    const qualificationComparison = left.qualification_name.localeCompare(
      right.qualification_name,
    );
    if (qualificationComparison !== 0) {
      return qualificationComparison;
    }

    return left.required_level - right.required_level;
  });
}

export function partitionQualificationShortages(
  items: QualificationShortageRiskItem[],
) {
  const sorted = sortQualificationShortages(items);

  return {
    coverable: sorted.filter(
      (item) => item.peak_gap_people === 0 && item.risk_score >= 40,
    ),
    shortages: sorted.filter((item) => item.peak_gap_people > 0),
  };
}

export function getShortagePresentation(item: QualificationShortageRiskItem): {
  label: string;
  tone: StatusBadgeTone;
} {
  if (item.peak_gap_people > 0) {
    return {
      label: `硬短板 ${item.risk_score}分`,
      tone: "danger",
    };
  }

  if (item.risk_score >= 40) {
    return {
      label: `高风险 ${item.risk_score}分`,
      tone: "warning",
    };
  }

  return {
    label: `可覆盖 ${item.risk_score}分`,
    tone: "accent",
  };
}

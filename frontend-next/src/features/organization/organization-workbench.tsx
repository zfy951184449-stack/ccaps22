"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MasterDetailLayout } from "@/design-system/patterns/master-detail-layout";
import { Tabs, type TabOption } from "@/design-system/primitives/tabs";
import { Badge } from "@/design-system/primitives/badge";
import { Loader } from "@/design-system/primitives/loader";
import {
  getOrganizationTree,
  getEmployees,
  organizationQueryKeys,
} from "./service";
import {
  flattenTree,
  getDescendantIds,
  buildBreadcrumbPath,
  getAllNodeIds,
  resolveOrganizationWorkbenchTab,
  UNIT_TYPE_LABELS,
} from "./presentation";
import type { OrganizationWorkbenchTab } from "./contracts";
import { OrgTreePanel } from "./org-tree-panel";
import { EmployeeListTab } from "./employee-list-tab";
import { UnavailabilityTab } from "./unavailability-tab";

const TAB_OPTIONS: TabOption<OrganizationWorkbenchTab>[] = [
  { label: "人员列表", value: "employees", description: "Employees" },
  { label: "不可用时段", value: "unavailability", description: "Unavailable Periods" },
];

export function OrganizationWorkbench({
  initialTab = "employees",
}: {
  initialTab?: OrganizationWorkbenchTab;
}) {
  const [activeTab, setActiveTab] = useState<OrganizationWorkbenchTab>(
    resolveOrganizationWorkbenchTab(initialTab),
  );
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<number>>(new Set());

  // ─── Data queries ────────────────────────────────────────────
  const treeQuery = useQuery({
    queryKey: organizationQueryKeys.tree,
    queryFn: getOrganizationTree,
  });

  const employeesQuery = useQuery({
    queryKey: organizationQueryKeys.employees,
    queryFn: getEmployees,
  });

  // ─── Derived state ──────────────────────────────────────────
  const units = useMemo(() => treeQuery.data?.units ?? [], [treeQuery.data]);
  const allEmployees = useMemo(() => employeesQuery.data ?? [], [employeesQuery.data]);

  const unitMap = useMemo(() => flattenTree(units), [units]);

  // Auto-expand all on first load
  const hasAutoExpanded = useMemo(() => {
    if (units.length > 0 && expandedKeys.size === 0) {
      return false;
    }
    return true;
  }, [units.length, expandedKeys.size]);

  // Effect equivalent: set expanded keys on first data load
  if (!hasAutoExpanded && units.length > 0) {
    const allIds = getAllNodeIds(units);
    setExpandedKeys(new Set(allIds));
    if (!selectedUnitId && units.length > 0) {
      setSelectedUnitId(units[0].id);
    }
  }

  const selectedUnit = selectedUnitId != null ? unitMap.get(selectedUnitId) : undefined;

  const filteredEmployees = useMemo(() => {
    if (selectedUnitId == null) return allEmployees;
    const descendantIds = getDescendantIds(selectedUnitId, unitMap);
    return allEmployees.filter(
      (e) => e.unit_id != null && descendantIds.has(e.unit_id),
    );
  }, [allEmployees, selectedUnitId, unitMap]);

  const breadcrumbPath = useMemo(() => {
    if (selectedUnitId == null) return [];
    return buildBreadcrumbPath(selectedUnitId, unitMap);
  }, [selectedUnitId, unitMap]);

  // ─── Handlers ────────────────────────────────────────────────
  const handleSelectUnit = useCallback((unitId: number) => {
    setSelectedUnitId(unitId);
  }, []);

  const handleToggleExpand = useCallback((unitId: number) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.add(unitId);
      }
      return next;
    });
  }, []);

  const handleTabChange = useCallback((tab: OrganizationWorkbenchTab) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    if (tab === "employees") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", tab);
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, []);

  // ─── Sidebar ─────────────────────────────────────────────────
  const sidebar = (
    <OrgTreePanel
      allEmployees={allEmployees}
      expandedKeys={expandedKeys}
      isLoading={treeQuery.isLoading}
      onRefresh={() => {
        treeQuery.refetch();
        employeesQuery.refetch();
      }}
      onSelectUnit={handleSelectUnit}
      onToggleExpand={handleToggleExpand}
      selectedUnitId={selectedUnitId}
      units={units}
    />
  );

  // ─── Main content ────────────────────────────────────────────
  return (
    <MasterDetailLayout
      className="-mx-6 -my-5 h-[calc(100vh-84px)]"
      sidebar={sidebar}
    >
      <div className="px-5 py-3 space-y-3">
        {/* Breadcrumb + Unit Header */}
        {selectedUnit ? (
          <div className="space-y-1.5">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--pl-text-tertiary)]">
              {breadcrumbPath.map((node, index) => (
                <span key={node.id} className="flex items-center gap-1.5">
                  {index > 0 && <span className="text-[var(--pl-border-strong)]">›</span>}
                  <button
                    className="transition-colors hover:text-[var(--pl-accent)]"
                    onClick={() => handleSelectUnit(node.id)}
                    type="button"
                  >
                    {node.unitName}
                  </button>
                </span>
              ))}
            </div>

            {/* Unit title */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold leading-7 tracking-[-0.03em] text-[var(--pl-text-primary)]">
                  {selectedUnit.unitName}
                </h1>
                <Badge tone="accent">
                  {UNIT_TYPE_LABELS[selectedUnit.unitType] ?? selectedUnit.unitType}
                </Badge>
                <Badge tone="neutral">{filteredEmployees.length} 成员</Badge>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-32 items-center justify-center text-sm text-[var(--pl-text-tertiary)]">
            {treeQuery.isLoading ? (
              <Loader label="加载组织数据..." />
            ) : (
              "请在左侧选择一个组织单元"
            )}
          </div>
        )}

        {/* Tabs */}
        {selectedUnit && (
          <>
            <Tabs
              onChange={handleTabChange}
              options={TAB_OPTIONS}
              value={activeTab}
            />

            {activeTab === "employees" && (
              <EmployeeListTab
                employees={filteredEmployees}
                isLoading={employeesQuery.isLoading}
                onRefresh={() => {
                  employeesQuery.refetch();
                  treeQuery.refetch();
                }}
                units={units}
              />
            )}

            {activeTab === "unavailability" && (
              <UnavailabilityTab
                allEmployees={allEmployees}
                onRefresh={() => employeesQuery.refetch()}
                selectedUnitId={selectedUnitId}
              />
            )}
          </>
        )}
      </div>
    </MasterDetailLayout>
  );
}

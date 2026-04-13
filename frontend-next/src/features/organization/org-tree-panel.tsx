"use client";

import { useMemo, useState } from "react";
import { Button } from "@/design-system/primitives/button";
import { Loader } from "@/design-system/primitives/loader";
import type { OrganizationUnitNode, Employee } from "./contracts";
import { resolveUnitTypeIndicator, UNIT_TYPE_LABELS } from "./presentation";
import { AddUnitSheet } from "./add-unit-sheet";

// ─── Props ───────────────────────────────────────────────────────

interface OrgTreePanelProps {
  allEmployees: Employee[];
  expandedKeys: Set<number>;
  isLoading: boolean;
  onRefresh: () => void;
  onSelectUnit: (unitId: number) => void;
  onToggleExpand: (unitId: number) => void;
  selectedUnitId: number | null;
  units: OrganizationUnitNode[];
}

// ─── Search filtering ────────────────────────────────────────────

/**
 * Returns the set of node IDs that should be visible when searching.
 * A node is visible if it (or any descendant) matches the query.
 * All ancestor nodes of any matched node are also visible.
 */
function getVisibleNodeIds(
  nodes: OrganizationUnitNode[],
  query: string,
): Set<number> | null {
  if (!query.trim()) return null; // null = show all

  const q = query.toLowerCase();
  const visible = new Set<number>();

  function walk(node: OrganizationUnitNode): boolean {
    const selfMatch = node.unitName.toLowerCase().includes(q);
    let childMatch = false;

    for (const child of node.children) {
      if (walk(child)) {
        childMatch = true;
      }
    }

    if (selfMatch || childMatch) {
      visible.add(node.id);
      return true;
    }
    return false;
  }

  for (const root of nodes) {
    walk(root);
  }

  return visible;
}

// ─── Component ───────────────────────────────────────────────────

export function OrgTreePanel({
  allEmployees,
  expandedKeys,
  isLoading,
  onRefresh,
  onSelectUnit,
  onToggleExpand,
  selectedUnitId,
  units,
}: OrgTreePanelProps) {
  const [addUnitOpen, setAddUnitOpen] = useState(false);
  const [searchText, setSearchText] = useState("");

  // Compute total counts for header stats
  const totalUnits = useMemo(() => {
    let count = 0;
    function walk(nodes: OrganizationUnitNode[]) {
      for (const n of nodes) {
        count++;
        walk(n.children);
      }
    }
    walk(units);
    return count;
  }, [units]);

  // Search filter: visible node IDs
  const visibleIds = useMemo(
    () => getVisibleNodeIds(units, searchText),
    [units, searchText],
  );

  return (
    <>
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="space-y-2.5 border-b border-[var(--pl-border)] px-3.5 py-3">
        {/* Title row */}
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold leading-4 tracking-wide text-[var(--pl-text-tertiary)] uppercase">
            组织架构
          </h2>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-[var(--pl-accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--pl-accent-strong)]">
              {totalUnits} 单元
            </span>
            <span className="rounded-full bg-[var(--pl-surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--pl-text-tertiary)]">
              {allEmployees.length} 人
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--pl-text-tertiary)]"
            fill="none"
            height="14"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="14"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" x2="16.65" y1="21" y2="16.65" />
          </svg>
          <input
            className="h-8 w-full rounded-[var(--pl-radius-sm)] border border-[var(--pl-border)] bg-[var(--pl-surface)] pl-8 pr-2.5 text-xs leading-4 text-[var(--pl-text-primary)] outline-none transition-colors placeholder:text-[var(--pl-text-tertiary)] focus:border-[var(--pl-accent)] focus:bg-[var(--pl-surface-elevated)]"
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="搜索组织..."
            type="search"
            value={searchText}
          />
        </div>
      </div>

      {/* ── Tree body ───────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-1.5 py-1.5">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader label="加载组织树..." />
          </div>
        ) : units.length === 0 ? (
          <div className="px-4 py-10 text-center text-xs text-[var(--pl-text-tertiary)]">
            暂无组织数据
          </div>
        ) : visibleIds !== null && visibleIds.size === 0 ? (
          <div className="px-4 py-10 text-center text-xs text-[var(--pl-text-tertiary)]">
            无匹配结果
          </div>
        ) : (
          <ul className="space-y-px">
            {units.map((node) => (
              <TreeNode
                expandedKeys={expandedKeys}
                key={node.id}
                level={0}
                node={node}
                onSelect={onSelectUnit}
                onToggleExpand={onToggleExpand}
                searchActive={searchText.trim().length > 0}
                selectedUnitId={selectedUnitId}
                visibleIds={visibleIds}
              />
            ))}
          </ul>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────── */}
      <div className="border-t border-[var(--pl-border)] px-3 py-2.5">
        <Button
          className="w-full"
          onClick={() => setAddUnitOpen(true)}
          size="sm"
          variant="secondary"
        >
          <svg
            className="mr-1"
            fill="none"
            height="14"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="14"
          >
            <line x1="12" x2="12" y1="5" y2="19" />
            <line x1="5" x2="19" y1="12" y2="12" />
          </svg>
          添加组织单元
        </Button>
      </div>

      {/* Add Unit Sheet */}
      <AddUnitSheet
        onClose={() => setAddUnitOpen(false)}
        onSuccess={() => {
          setAddUnitOpen(false);
          onRefresh();
        }}
        open={addUnitOpen}
        parentUnitId={selectedUnitId}
        units={units}
      />
    </>
  );
}

// ─── TreeNode ────────────────────────────────────────────────────

function TreeNode({
  expandedKeys,
  level,
  node,
  onSelect,
  onToggleExpand,
  searchActive,
  selectedUnitId,
  visibleIds,
}: {
  expandedKeys: Set<number>;
  level: number;
  node: OrganizationUnitNode;
  onSelect: (unitId: number) => void;
  onToggleExpand: (unitId: number) => void;
  searchActive: boolean;
  selectedUnitId: number | null;
  visibleIds: Set<number> | null;
}) {
  // If searching, skip invisible nodes
  if (visibleIds !== null && !visibleIds.has(node.id)) {
    return null;
  }

  const hasChildren = node.children.length > 0;
  const isExpanded = searchActive || expandedKeys.has(node.id);
  const isSelected = selectedUnitId === node.id;
  const indicator = resolveUnitTypeIndicator(node.unitType);
  const typeLabel = UNIT_TYPE_LABELS[node.unitType] ?? node.unitType;

  return (
    <li>
      <div
        className={`group relative flex items-center gap-1.5 rounded-[8px] py-[5px] pr-2 transition-all duration-150 cursor-pointer ${
          isSelected
            ? "bg-[var(--pl-accent-soft)] text-[var(--pl-accent-strong)]"
            : "text-[var(--pl-text-secondary)] hover:bg-[rgba(11,106,162,0.05)] hover:text-[var(--pl-text-primary)]"
        }`}
        onClick={() => onSelect(node.id)}
        style={{ paddingLeft: `${level * 18 + 8}px` }}
      >
        {/* Selected accent bar */}
        {isSelected && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-[var(--pl-accent)]" />
        )}

        {/* Indent guide lines */}
        {level > 0 && (
          <span
            className="absolute top-0 h-full border-l border-[var(--pl-border)]"
            style={{ left: `${(level - 1) * 18 + 17}px` }}
          />
        )}

        {/* Chevron */}
        <button
          className={`inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] transition-all duration-200 ${
            hasChildren
              ? "text-[var(--pl-text-tertiary)] hover:bg-[rgba(11,106,162,0.08)] hover:text-[var(--pl-accent)]"
              : "pointer-events-none"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggleExpand(node.id);
          }}
          tabIndex={-1}
          type="button"
        >
          {hasChildren ? (
            <svg
              className={`transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
              fill="none"
              height="12"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="12"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          ) : (
            <span className="h-1 w-1 rounded-full bg-current opacity-25" />
          )}
        </button>

        {/* Type indicator dot */}
        <span
          className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] text-[9px] font-bold text-white shadow-sm"
          style={{ backgroundColor: indicator.color }}
        >
          {indicator.letter}
        </span>

        {/* Name + type label */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-5">
            {node.unitName}
          </span>
          {/* Type label shown on hover or when selected */}
          <span
            className={`shrink-0 text-[10px] font-medium transition-opacity duration-150 ${
              isSelected
                ? "text-[var(--pl-accent)] opacity-100"
                : "text-[var(--pl-text-tertiary)] opacity-0 group-hover:opacity-70"
            }`}
          >
            {typeLabel}
          </span>
        </div>

        {/* Member count */}
        {node.memberCount > 0 && (
          <span
            className={`shrink-0 tabular-nums text-[10px] font-semibold transition-colors ${
              isSelected
                ? "text-[var(--pl-accent)]"
                : "text-[var(--pl-text-tertiary)]"
            }`}
          >
            {node.memberCount}
          </span>
        )}
      </div>

      {/* Children (with collapse animation) */}
      {hasChildren && isExpanded && (
        <ul className="relative space-y-px">
          {node.children.map((child) => (
            <TreeNode
              expandedKeys={expandedKeys}
              key={child.id}
              level={level + 1}
              node={child}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
              searchActive={searchActive}
              selectedUnitId={selectedUnitId}
              visibleIds={visibleIds}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

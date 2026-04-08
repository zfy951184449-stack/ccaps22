/* ── GanttSidebar ─────────────────────────────────────────────────
 *
 * Left panel: tree view of template → stages → operations.
 */

"use client";

import React from "react";
import type { FlattenedRow, GanttNode } from "../types";
import { GANTT_LAYOUT } from "../types";

interface GanttSidebarProps {
  virtualRows: FlattenedRow[];
  totalHeight: number;
  selectedNode: GanttNode | null;
  onSelectNode: (node: GanttNode | null) => void;
  onToggleExpand: (row: FlattenedRow) => void;
  onAddNode: (parentNode: GanttNode) => void;
  onEditNode: (node: GanttNode) => void;
  onDeleteNode: (node: GanttNode) => void;
  stageColorMap: Map<number, string>;
  onHoverRow: (id: string | null) => void;
  isShareGroupMode: boolean;
  selectedOperationIds: string[];
  onOperationCheck: (operationId: string, checked: boolean) => void;
  readOnly?: boolean;
}

const INDENT_PX = 20;

export function GanttSidebar({
  virtualRows,
  totalHeight,
  selectedNode,
  onSelectNode,
  onToggleExpand,
  onAddNode,
  onEditNode,
  onDeleteNode,
  stageColorMap,
  onHoverRow,
  isShareGroupMode,
  selectedOperationIds,
  onOperationCheck,
  readOnly,
}: GanttSidebarProps) {
  return (
    <div
      className="select-none"
      style={{ height: totalHeight, minHeight: "100%" }}
    >
      {virtualRows.map((row) => {
        const isSelected = selectedNode?.id === row.id;
        const depth = row.depth;
        const indent = depth * INDENT_PX;

        return (
          <div
            key={row.id}
            className={`group flex items-center border-b border-[var(--pl-border)] transition-colors ${
              isSelected
                ? "bg-[var(--pl-accent-soft)]"
                : "hover:bg-[var(--pl-canvas)]"
            }`}
            style={{ height: GANTT_LAYOUT.rowHeight, paddingLeft: indent + 8 }}
            onMouseEnter={() => onHoverRow(row.id)}
            onMouseLeave={() => onHoverRow(null)}
          >
            {/* Expand toggle */}
            {row.hasChildren ? (
              <button
                onClick={() => onToggleExpand(row)}
                className="mr-1 flex h-5 w-5 items-center justify-center rounded text-xs text-[var(--pl-text-tertiary)] transition-colors hover:bg-[var(--pl-border)]"
                aria-label={row.isExpanded ? "折叠" : "展开"}
              >
                {row.isExpanded ? "▾" : "▸"}
              </button>
            ) : (
              <span className="mr-1 inline-block h-5 w-5" />
            )}

            {/* Share group checkbox */}
            {isShareGroupMode && row.node.type === "operation" && (
              <input
                type="checkbox"
                className="mr-2 accent-[var(--pl-accent)]"
                checked={selectedOperationIds.includes(row.id)}
                onChange={(e) => onOperationCheck(row.id, e.target.checked)}
              />
            )}

            {/* Color dot for stages */}
            {row.node.type === "stage" && (
              <span
                className="mr-1.5 inline-block h-2 w-2 rounded-full"
                style={{
                  backgroundColor:
                    stageColorMap.get(
                      parseInt(row.id.replace("stage_", "")),
                    ) ?? "var(--pl-text-tertiary)",
                }}
              />
            )}

            {/* Label */}
            <span
              className={`flex-1 cursor-default truncate text-[13px] ${
                row.node.type === "template"
                  ? "font-semibold text-[var(--pl-text-primary)]"
                  : row.node.type === "stage"
                    ? "font-medium text-[var(--pl-text-primary)]"
                    : "text-[var(--pl-text-secondary)]"
              }`}
              onDoubleClick={() => !readOnly && onEditNode(row.node)}
            >
              {row.node.title}
            </span>

            {/* People badge */}
            {row.node.type === "operation" && row.node.requiredPeople && (
              <span className="mr-1 rounded bg-[var(--pl-canvas)] px-1 text-[11px] text-[var(--pl-text-tertiary)]">
                {row.node.requiredPeople}人
              </span>
            )}

            {/* Action buttons (visible on hover) */}
            {!readOnly && (
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                {row.node.type !== "operation" && (
                  <button
                    onClick={() => onAddNode(row.node)}
                    className="rounded p-0.5 text-xs text-[var(--pl-text-tertiary)] hover:bg-[var(--pl-border)] hover:text-[var(--pl-accent)]"
                    aria-label="添加"
                  >
                    +
                  </button>
                )}
                {row.node.editable && (
                  <>
                    <button
                      onClick={() => onEditNode(row.node)}
                      className="rounded p-0.5 text-xs text-[var(--pl-text-tertiary)] hover:bg-[var(--pl-border)] hover:text-[var(--pl-accent)]"
                      aria-label="编辑"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => onDeleteNode(row.node)}
                      className="rounded p-0.5 text-xs text-[var(--pl-text-tertiary)] hover:bg-[var(--pl-border)] hover:text-[var(--pl-danger)]"
                      aria-label="删除"
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

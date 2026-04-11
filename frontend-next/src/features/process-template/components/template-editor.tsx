/* ── Template Editor – Main Shell ────────────────────────────────────
 *
 * 3-tab editor: Stage Card Flow | Gantt by Phase | Gantt by Equipment
 * Plus: summary strip, staffing peak chart, share group management.
 */

"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import type { StageOperation } from "@/features/process-template-gantt/types";
import { Button } from "@/design-system/primitives/button";
import { Loader } from "@/design-system/primitives/loader";
import { useTemplateDetail } from "../hooks/use-template-detail";
import { useShareGroups } from "../hooks/use-share-groups";
import { TemplateSummaryStrip } from "./template-summary-strip";
import { StaffingPeakChart } from "./staffing-peak-chart";
import { PhaseTimeline } from "./phase-timeline";
import { GanttPhaseView } from "./gantt-phase-view";
import { GanttResourceView } from "./gantt-resource-view";
import { ShareGroupManager } from "./share-group-manager";

// ── Tab definitions ─────────────────────────────────────────────────

const TABS = [
  { id: "phase", label: "阶段编排" },
  { id: "gantt-phase", label: "甘特·按阶段" },
  { id: "gantt-resource", label: "甘特·按设备" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ── Component ───────────────────────────────────────────────────────

interface TemplateEditorProps {
  templateId: number;
}

export function TemplateEditor({ templateId }: TemplateEditorProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("phase");
  const [showShareGroups, setShowShareGroups] = useState(false);

  const {
    template,
    stages,
    operationsByStage,
    shareGroups,
    allOperations,
    isLoading,
    isError,
    createStage,
    addOperation,
    deleteOperation,
  } = useTemplateDetail(templateId);

  const {
    isSelectMode,
    selectedIds,
    newGroupMode,
    setNewGroupMode,
    enterSelectMode,
    exitSelectMode,
    toggleSelect,
    confirmCreate,
    deleteGroup,
    isCreating,
  } = useShareGroups(templateId);

  // ── Loading / Error ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader label="加载模版数据" />
      </div>
    );
  }

  if (isError || !template) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-[var(--pl-danger)]">加载失败</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => router.back()}
          >
            返回列表
          </Button>
        </div>
      </div>
    );
  }

  const typedOps = operationsByStage as Record<string, StageOperation[]>;

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-[var(--pl-border)] px-6 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/process-templates")}
            className="rounded-[var(--pl-radius-sm)] p-1 text-[var(--pl-text-tertiary)] transition-colors hover:bg-[var(--pl-surface)] hover:text-[var(--pl-text-primary)]"
            title="返回列表"
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-[15px] font-semibold leading-6 text-[var(--pl-text-primary)]">
              {template.templateName}
            </h1>
            <span className="text-[11px] font-mono text-[var(--pl-text-tertiary)]">
              {template.templateCode}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Share Group selection mode banner */}
          {isSelectMode ? (
            <div className="flex items-center gap-2 rounded-[var(--pl-radius-sm)] border border-[var(--pl-accent)] bg-[var(--pl-accent-soft)] px-3 py-1.5">
              <span className="text-[12px] text-[var(--pl-text-secondary)]">
                已选 {selectedIds.size} 个工序
              </span>
              <select
                value={newGroupMode}
                onChange={(e) => setNewGroupMode(e.target.value as "SAME_TEAM" | "DIFFERENT")}
                className="h-6 rounded border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] px-1.5 text-[11px]"
              >
                <option value="SAME_TEAM">同一团队</option>
                <option value="DIFFERENT">不同团队</option>
              </select>
              <Button
                variant="primary"
                size="sm"
                onClick={() => confirmCreate(`共享组-${Date.now()}`)}
                disabled={selectedIds.size < 2 || isCreating}
              >
                确认
              </Button>
              <Button variant="ghost" size="sm" onClick={exitSelectMode}>
                取消
              </Button>
            </div>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowShareGroups(true)}
              >
                🔗 共享组 {shareGroups.length > 0 ? `(${shareGroups.length})` : ""}
              </Button>
              <Button variant="primary" size="sm">
                保存
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Summary strip ──────────────────────────────────────────── */}
      <TemplateSummaryStrip
        template={template}
        stages={stages}
        allOperations={allOperations}
      />

      {/* ── Tabs ───────────────────────────────────────────────────── */}
      <div className="flex items-center border-b border-[var(--pl-border)] px-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              "relative px-4 py-2.5 text-[13px] font-medium transition-colors duration-150",
              activeTab === tab.id
                ? "text-[var(--pl-accent)]"
                : "text-[var(--pl-text-tertiary)] hover:text-[var(--pl-text-secondary)]",
            ].join(" ")}
          >
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute inset-x-0 bottom-0 h-[2px] rounded-t-full bg-[var(--pl-accent)]" />
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "phase" && (
          <div>
            <PhaseTimeline
              stages={stages}
              operationsByStage={typedOps}
              shareGroups={shareGroups}
              isSelectMode={isSelectMode}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onAddOperation={(payload) => addOperation.mutate(payload)}
              onDeleteOperation={(id) => deleteOperation.mutate(id)}
              onCreateStage={(payload) => createStage.mutate(payload)}
            />
            <div className="px-6 pb-6">
              <StaffingPeakChart
                stages={stages}
                operationsByStage={typedOps}
                teamId={template.teamId}
                totalDays={template.totalDays}
              />
            </div>
          </div>
        )}

        {activeTab === "gantt-phase" && (
          <GanttPhaseView
            stages={stages}
            operationsByStage={typedOps}
          />
        )}

        {activeTab === "gantt-resource" && (
          <GanttResourceView
            stages={stages}
            operationsByStage={typedOps}
          />
        )}
      </div>

      {/* ── Share Group SideSheet ───────────────────────────────────── */}
      <ShareGroupManager
        open={showShareGroups}
        onClose={() => setShowShareGroups(false)}
        shareGroups={shareGroups}
        onEnterSelectMode={enterSelectMode}
        onDeleteGroup={(id) => deleteGroup.mutate(id)}
        isDeletingGroup={deleteGroup.isPending}
      />
    </div>
  );
}

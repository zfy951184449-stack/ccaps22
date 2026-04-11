/* ── Share Group Manager – SideSheet ─────────────────────────────────
 *
 * Lists existing share groups with members, and provides
 * a flow to create new groups in selection mode.
 */

"use client";

import React, { useState } from "react";
import { SideSheet } from "@/design-system/primitives/side-sheet";
import { Button } from "@/design-system/primitives/button";
import type { ShareGroup } from "@/features/process-template-gantt/types";
import { SHARE_GROUP_COLORS } from "../constants";

interface ShareGroupManagerProps {
  open: boolean;
  onClose: () => void;
  shareGroups: ShareGroup[];
  onEnterSelectMode: () => void;
  onDeleteGroup: (groupId: number) => void;
  isDeletingGroup?: boolean;
}

export function ShareGroupManager({
  open,
  onClose,
  shareGroups,
  onEnterSelectMode,
  onDeleteGroup,
  isDeletingGroup = false,
}: ShareGroupManagerProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  return (
    <SideSheet open={open} onClose={onClose} title={`共享组 (${shareGroups.length})`}>
      <div className="flex h-full flex-col">
        {/* Group list */}
        <div className="flex-1 overflow-y-auto p-4">
          {shareGroups.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-lg">🔗</p>
              <p className="mt-2 text-sm text-[var(--pl-text-secondary)]">
                暂无共享组
              </p>
              <p className="mt-1 text-[12px] text-[var(--pl-text-tertiary)]">
                共享组用于约束操作间的人员分配关系
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {shareGroups.map((group, gi) => {
                const color =
                  group.color ??
                  SHARE_GROUP_COLORS[gi % SHARE_GROUP_COLORS.length];

                return (
                  <div
                    key={group.id}
                    className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface)] p-3"
                  >
                    {/* Group header */}
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-[13px] font-semibold text-[var(--pl-text-primary)]">
                          {group.groupName}
                        </span>
                      </div>
                      <span
                        className={[
                          "rounded-full px-2 py-0.5 text-[10px] font-medium",
                          group.shareMode === "SAME_TEAM"
                            ? "bg-[#ccfbf1] text-[#0d9488]"
                            : "bg-[#fee2e2] text-[#dc2626]",
                        ].join(" ")}
                      >
                        {group.shareMode === "SAME_TEAM"
                          ? "同一团队"
                          : "不同团队"}
                      </span>
                    </div>

                    {/* Members */}
                    <div className="flex flex-col gap-1">
                      {(group.members ?? []).map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center justify-between rounded-[var(--pl-radius-sm)] bg-[var(--pl-surface-elevated)] px-2.5 py-1.5"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-[12px] font-medium text-[var(--pl-text-primary)]">
                              {member.operationName}
                            </span>
                            <span className="text-[10px] text-[var(--pl-text-tertiary)]">
                              ({member.stageName})
                            </span>
                          </div>
                          <span className="text-[10px] text-[var(--pl-text-tertiary)]">
                            {member.requiredPeople}人
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Delete */}
                    <div className="mt-2 flex justify-end">
                      {confirmDeleteId === group.id ? (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setConfirmDeleteId(null)
                            }
                          >
                            取消
                          </Button>
                          <button
                            onClick={() => {
                              onDeleteGroup(group.id);
                              setConfirmDeleteId(null);
                            }}
                            disabled={isDeletingGroup}
                            className="rounded-[6px] bg-[var(--pl-danger)] px-2.5 py-1 text-[11px] font-medium text-white"
                          >
                            确认删除
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() =>
                            setConfirmDeleteId(group.id)
                          }
                          className="text-[11px] text-[var(--pl-text-tertiary)] hover:text-[var(--pl-danger)]"
                        >
                          删除组
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer: create button */}
        <div className="border-t border-[var(--pl-border)] p-4">
          <Button
            variant="primary"
            size="sm"
            className="w-full"
            onClick={() => {
              onClose();
              onEnterSelectMode();
            }}
          >
            + 创建共享组
          </Button>
        </div>
      </div>
    </SideSheet>
  );
}

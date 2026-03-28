"use client";

import { Button } from "@/design-system/primitives/button";
import { EmptyState } from "@/design-system/primitives/empty-state";
import { ErrorState } from "@/design-system/primitives/error-state";
import { Loader } from "@/design-system/primitives/loader";
import { SideSheet } from "@/design-system/primitives/side-sheet";
import { StatusBadge } from "@/design-system/primitives/status-badge";
import type { QualificationImpact } from "./contracts";

function ReferenceList({
  description,
  items,
  linkHref,
  linkLabel,
  title,
}: {
  description: string;
  items: string[];
  linkHref: string;
  linkLabel: string;
  title: string;
}) {
  return (
    <div className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--pl-text-primary)]">{title}</h3>
        <a
          className="text-sm font-medium text-[var(--pl-accent)] underline-offset-4 hover:underline"
          href={linkHref}
        >
          {linkLabel}
        </a>
      </div>
      {items.length ? (
        <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--pl-text-secondary)]">
          {items.slice(0, 5).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm leading-6 text-[var(--pl-text-secondary)]">
          {description}
        </p>
      )}
    </div>
  );
}

export function QualificationImpactSheet({
  errorMessage,
  impact,
  loading,
  mode,
  onClose,
  open,
}: {
  errorMessage?: string | null;
  impact?: QualificationImpact | null;
  loading: boolean;
  mode: "view" | "blocked";
  onClose: () => void;
  open: boolean;
}) {
  const title = impact
    ? mode === "blocked"
      ? `无法删除：${impact.qualification.qualification_name}`
      : `资质影响：${impact.qualification.qualification_name}`
    : mode === "blocked"
      ? "无法删除资质"
      : "资质影响";

  const description =
    mode === "blocked"
      ? "该资质仍在被使用，必须先清理关联后才能删除。"
      : "查看这个资质当前影响的人员与操作范围。";

  return (
    <SideSheet
      footer={
        <div className="flex justify-end">
          <Button onClick={onClose} size="sm" variant="ghost">
            {mode === "blocked" ? "知道了" : "关闭"}
          </Button>
        </div>
      }
      onClose={onClose}
      open={open}
      title={title}
      description={description}
    >
      {loading ? (
        <Loader label="正在加载资质影响..." />
      ) : errorMessage ? (
        <ErrorState
          description={errorMessage}
          title="无法加载资质影响"
        />
      ) : !impact ? (
        <EmptyState
          description="当前没有可展示的资质影响数据。"
          title="暂无影响信息"
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--pl-text-tertiary)]">
                影响摘要
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <StatusBadge
                  label={`人员引用 ${impact.counts.employees}`}
                  tone={impact.counts.employees > 0 ? "info" : "neutral"}
                />
                <StatusBadge
                  label={`操作引用 ${impact.counts.operations}`}
                  tone={impact.counts.operations > 0 ? "warning" : "neutral"}
                />
              </div>
            </div>
            <div className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--pl-text-tertiary)]">
                删除状态
              </div>
              <div className="mt-3">
                <StatusBadge
                  label={impact.deletable ? "可删除" : "已阻断"}
                  tone={impact.deletable ? "neutral" : "danger"}
                />
              </div>
            </div>
          </div>

          <ReferenceList
            description="当前没有人员引用这个资质。"
            items={impact.employee_refs.map(
              (employee) => `${employee.employee_code} ${employee.employee_name}`,
            )}
            linkHref="/organization-workbench"
            linkLabel="前往组织与人员"
            title="关联人员"
          />

          <ReferenceList
            description="当前没有操作引用这个资质。"
            items={impact.operation_refs.map(
              (operation) => `${operation.operation_code} ${operation.operation_name}`,
            )}
            linkHref="/operations"
            linkLabel="前往操作管理"
            title="关联操作"
          />
        </div>
      )}
    </SideSheet>
  );
}

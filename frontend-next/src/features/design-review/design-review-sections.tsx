import { Badge } from "@/design-system/primitives/badge";
import { Panel } from "@/design-system/primitives/panel";
import { cn } from "@/lib/cn";
import type {
  DesignReviewCategory,
  DesignReviewIssue,
  DesignReviewSeverity,
} from "./design-review-data";
import type { ReactNode } from "react";

const categoryLabelMap: Record<DesignReviewCategory, string> = {
  token: "Token",
  primitive: "Primitive",
  pattern: "Pattern",
  surface: "Surface",
};

const severityLabelMap: Record<DesignReviewSeverity, string> = {
  info: "观察项",
  warning: "需要收敛",
  critical: "高优先",
};

const severityToneMap: Record<
  DesignReviewSeverity,
  "accent" | "danger" | "warning"
> = {
  info: "accent",
  warning: "warning",
  critical: "danger",
};

export function ReviewSection({
  children,
  notes,
}: {
  children: ReactNode;
  notes: ReactNode;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.72fr)_minmax(280px,0.92fr)]">
      <div className="min-w-0">{children}</div>
      <div className="space-y-5">{notes}</div>
    </div>
  );
}

export function ShowcaseCard({
  children,
  className,
  subtitle,
  title,
}: {
  children: ReactNode;
  className?: string;
  subtitle: string;
  title: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--pl-radius-sm)] border border-[var(--pl-border)] bg-[var(--pl-surface)] p-3.5",
        className,
      )}
    >
      <div className="mb-3 space-y-1">
        <h3 className="text-sm font-semibold leading-5 text-[var(--pl-text-primary)]">
          {title}
        </h3>
        <p className="text-sm leading-5 text-[var(--pl-text-secondary)]">
          {subtitle}
        </p>
      </div>
      {children}
    </div>
  );
}

export function SectionNotesPanel({
  description,
  issues,
  title,
}: {
  description: string;
  issues: DesignReviewIssue[];
  title: string;
}) {
  return (
    <Panel description={description} eyebrow="Review notes" title={title}>
      <div className="space-y-3">
        {issues.map((issue) => (
          <div
            key={issue.id}
            className="rounded-[var(--pl-radius-sm)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3.5 py-3"
          >
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <Badge tone={severityToneMap[issue.severity]}>
                {severityLabelMap[issue.severity]}
              </Badge>
              <Badge tone="neutral">{categoryLabelMap[issue.category]}</Badge>
            </div>
            <div className="text-sm font-semibold text-[var(--pl-text-primary)]">
              {issue.title}
            </div>
            <p className="mt-1.5 text-sm leading-5 text-[var(--pl-text-secondary)]">
              {issue.symptom}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function SpecimenCard({
  children,
  findings,
  summary,
  title,
}: {
  children: ReactNode;
  findings: string[];
  summary: string;
  title: string;
}) {
  return (
    <Panel description={summary} eyebrow="Surface audit" title={title}>
      <div className="space-y-3">
        {children}
        <div className="rounded-[var(--pl-radius-sm)] border border-dashed border-[var(--pl-border-strong)] bg-[var(--pl-surface)] px-3.5 py-3">
          <div className="mb-2 text-sm font-semibold text-[var(--pl-text-primary)]">
            当前观察
          </div>
          <ul className="list-disc space-y-1.5 pl-4 text-sm leading-5 text-[var(--pl-text-secondary)]">
            {findings.map((finding) => (
              <li key={finding}>{finding}</li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}

export function SwatchGrid({
  entries,
}: {
  entries: Array<[string, string]>;
}) {
  return (
    <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
      {entries.map(([label, value]) => (
        <div
          key={label}
          className="rounded-[var(--pl-radius-sm)] border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] p-3"
        >
          <div
            className="mb-2.5 h-12 rounded-[var(--pl-radius-sm)] border border-[var(--pl-border)]"
            style={{ backgroundColor: value }}
          />
          <div className="text-sm font-semibold text-[var(--pl-text-primary)]">
            {label}
          </div>
          <div className="text-xs leading-5 text-[var(--pl-text-tertiary)]">
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MetricGrid({
  items,
}: {
  items: Array<{ hint: string; label: string; value: string }>;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-[var(--pl-radius-sm)] border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] px-3.5 py-3"
        >
          <div className="text-[11px] font-semibold leading-4 text-[var(--pl-text-tertiary)]">
            {item.label}
          </div>
          <div className="mt-1.5 text-base font-semibold leading-6 text-[var(--pl-text-primary)]">
            {item.value}
          </div>
          <div className="mt-1 text-sm leading-5 text-[var(--pl-text-secondary)]">
            {item.hint}
          </div>
        </div>
      ))}
    </div>
  );
}

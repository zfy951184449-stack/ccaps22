import { Badge } from "@/design-system/primitives/badge";
import { Panel } from "@/design-system/primitives/panel";

export function StatCard({
  label,
  tone = "neutral",
  value,
}: {
  label: string;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
  value: string;
}) {
  return (
    <Panel
      action={<Badge tone={tone}>{label}</Badge>}
      className="p-5"
      title={value}
    >
      <p className="text-sm leading-6 text-[var(--pl-text-secondary)]">
        {label}
      </p>
    </Panel>
  );
}

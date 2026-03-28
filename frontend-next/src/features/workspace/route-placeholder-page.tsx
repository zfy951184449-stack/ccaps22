import { Badge } from "@/design-system/primitives/badge";
import { EmptyState } from "@/design-system/primitives/empty-state";
import { Panel } from "@/design-system/primitives/panel";
import { TableShell } from "@/design-system/primitives/table-shell";
import {
  workspaceRouteMap,
  type WorkspaceRouteKey,
} from "@/features/navigation/workspace-routes";

const statusToneMap = {
  active: "accent",
  planned: "warning",
  "legacy-hold": "neutral",
} as const;

export function RoutePlaceholderPage({
  routeKey,
}: {
  routeKey: WorkspaceRouteKey;
}) {
  const route = workspaceRouteMap[routeKey];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,0.95fr)]">
      <Panel
        action={<Badge tone={statusToneMap[route.status]}>{route.status}</Badge>}
        description={route.description}
        eyebrow={route.wave != null ? `Wave ${route.wave}` : "Legacy hold"}
        title={route.title}
      >
        <div className="space-y-6">
          <div className="grid gap-3 md:grid-cols-2">
            {route.checkpoints.map((checkpoint) => (
              <div
                key={checkpoint}
                className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-4 text-sm leading-6 text-[var(--pl-text-secondary)]"
              >
                {checkpoint}
              </div>
            ))}
          </div>
          <EmptyState
            description="This route is intentionally implemented as a migration placeholder in Wave 0. The URL, metadata, shell, and visual system are already reserved so future page work does not need to revisit structural decisions."
            eyebrow="Migration note"
            title="Business surface is not migrated yet"
          />
        </div>
      </Panel>
      <div className="space-y-6">
        <Panel
          eyebrow="Guardrails"
          title="What stays fixed now"
          description="Wave 0 locks the structural decisions before any business-heavy page enters migration."
        >
          <ul className="space-y-3 text-sm leading-6 text-[var(--pl-text-secondary)]">
            <li>Legacy CRA frontend remains the default runtime and release path.</li>
            <li>Backend API contracts stay unchanged.</li>
            <li>Future page work must consume first-party design-system building blocks.</li>
          </ul>
        </Panel>
        <TableShell
          columns={["Decision", "Current", "Next wave", "Risk"]}
          title="Route migration ledger"
        >
          <div className="contents text-sm text-[var(--pl-text-secondary)]">
            <div className="bg-[var(--pl-surface-elevated)] px-4 py-4">
              URL and metadata
            </div>
            <div className="bg-[var(--pl-surface-elevated)] px-4 py-4">
              Reserved
            </div>
            <div className="bg-[var(--pl-surface-elevated)] px-4 py-4">
              None
            </div>
            <div className="bg-[var(--pl-surface-elevated)] px-4 py-4">
              Low
            </div>
            <div className="bg-[var(--pl-surface-elevated)] px-4 py-4">
              Business UI
            </div>
            <div className="bg-[var(--pl-surface-elevated)] px-4 py-4">
              Placeholder
            </div>
            <div className="bg-[var(--pl-surface-elevated)] px-4 py-4">
              Wave {route.wave ?? "TBD"}
            </div>
            <div className="bg-[var(--pl-surface-elevated)] px-4 py-4">
              Medium
            </div>
          </div>
        </TableShell>
      </div>
    </div>
  );
}

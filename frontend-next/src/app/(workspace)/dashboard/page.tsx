import { FilterBar } from "@/design-system/patterns/filter-bar";
import { StatCard } from "@/design-system/patterns/stat-card";
import { SelectInput, TextInput } from "@/design-system/primitives/field";
import { Badge } from "@/design-system/primitives/badge";
import { Panel } from "@/design-system/primitives/panel";
import { TableShell } from "@/design-system/primitives/table-shell";
import { StackHealthCard } from "@/features/dashboard/stack-health-card";
import { buildWorkspaceMetadata } from "@/features/navigation/metadata";

export const metadata = buildWorkspaceMetadata("dashboard");

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-4">
        <StatCard label="Wave 0 progress" tone="accent" value="Scaffold live" />
        <StatCard label="Design system" tone="success" value="Tokens + shell" />
        <StatCard label="API compatibility" tone="warning" value="Legacy `/api`" />
        <StatCard label="Release default" tone="neutral" value="CRA remains" />
      </div>

      <FilterBar>
        <SelectInput defaultValue="wave0" hint="Migration lane" label="Workspace mode">
          <option value="wave0">Wave 0 scaffold</option>
          <option value="waves1plus">Future waves</option>
        </SelectInput>
        <SelectInput
          defaultValue="desktop"
          hint="Viewport assumption"
          label="Target density"
        >
          <option value="desktop">Desktop high density</option>
          <option value="review">Review / Storybook</option>
        </SelectInput>
        <TextInput
          defaultValue="Precision Lab"
          hint="Current design archetype"
          label="Visual system"
          readOnly
        />
        <TextInput
          defaultValue="Legacy frontend preserved"
          hint="Release guardrail"
          label="Runtime policy"
          readOnly
        />
      </FilterBar>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,0.9fr)]">
        <Panel
          action={<Badge tone="accent">Workspace baseline</Badge>}
          description="The first dashboard focuses on structure, information hierarchy, and route-level semantics. It is intentionally light on business data so Wave 0 can lock shell quality before migrating heavy screens."
          eyebrow="Overview"
          title="Precision Lab migration cockpit"
        >
          <div className="grid gap-4 md:grid-cols-2">
            {[
              "Independent Next.js runtime at port 3002",
              "Client-safe API layer through legacy `/api` contracts",
              "First-party shell, filters, and card patterns",
              "Desktop-oriented density and diagnostics-first states",
            ].map((item) => (
              <div
                key={item}
                className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-4 text-sm leading-6 text-[var(--pl-text-secondary)]"
              >
                {item}
              </div>
            ))}
          </div>
        </Panel>

        <StackHealthCard />
      </div>

      <TableShell
        columns={["Surface", "Current state", "Wave owner", "Notes"]}
        title="Migration inventory snapshot"
      >
        <div className="contents text-sm text-[var(--pl-text-secondary)]">
          <div className="bg-[var(--pl-surface-elevated)] px-4 py-4">
            App shell and navigation
          </div>
          <div className="bg-[var(--pl-surface-elevated)] px-4 py-4">
            Complete
          </div>
          <div className="bg-[var(--pl-surface-elevated)] px-4 py-4">
            Wave 0
          </div>
          <div className="bg-[var(--pl-surface-elevated)] px-4 py-4">
            Precision Lab baseline established
          </div>
          <div className="bg-[var(--pl-surface-elevated)] px-4 py-4">
            CRUD pages
          </div>
          <div className="bg-[var(--pl-surface-elevated)] px-4 py-4">
            Reserved
          </div>
          <div className="bg-[var(--pl-surface-elevated)] px-4 py-4">
            Wave 1
          </div>
          <div className="bg-[var(--pl-surface-elevated)] px-4 py-4">
            Routes and metadata already mapped
          </div>
          <div className="bg-[var(--pl-surface-elevated)] px-4 py-4">
            Editor / Gantt surfaces
          </div>
          <div className="bg-[var(--pl-surface-elevated)] px-4 py-4">
            Deferred
          </div>
          <div className="bg-[var(--pl-surface-elevated)] px-4 py-4">
            Waves 5-6
          </div>
          <div className="bg-[var(--pl-surface-elevated)] px-4 py-4">
            Client boundary strategy fixed ahead of migration
          </div>
        </div>
      </TableShell>
    </div>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/design-system/primitives/badge";
import { Loader } from "@/design-system/primitives/loader";
import { Panel } from "@/design-system/primitives/panel";
import { getApiHealth } from "@/services/system/system-service";

export function StackHealthCard() {
  const { data, error, isLoading } = useQuery({
    queryKey: ["system", "api-health"],
    queryFn: getApiHealth,
  });

  const tone = error
    ? "danger"
    : isLoading
      ? "warning"
      : data?.status === "OK"
        ? "success"
        : "warning";

  return (
    <Panel
      action={
        <Badge tone={tone}>
          {error ? "offline" : isLoading ? "checking" : data?.status ?? "unknown"}
        </Badge>
      }
      description="A lightweight health probe against the existing backend validates that frontend-next can coexist without changing backend contracts or release wiring."
      eyebrow="Backend contract"
      title="API connectivity"
    >
      {isLoading ? (
        <Loader label="Probing existing backend" />
      ) : error ? (
        <div className="space-y-2 text-sm leading-6 text-[var(--pl-text-secondary)]">
          <p>
            Backend connection is currently unavailable from the independent Next
            workspace.
          </p>
          <p className="text-xs text-[var(--pl-text-tertiary)]">
            This is acceptable during shell validation. CRUD migration waves will
            still target the same `/api` contract.
          </p>
        </div>
      ) : (
        <div className="space-y-2 text-sm leading-6 text-[var(--pl-text-secondary)]">
          <p>{data?.message ?? "Backend health probe returned without details."}</p>
          <p className="text-xs text-[var(--pl-text-tertiary)]">
            The health probe is intentionally simple so the shell can verify API
            reachability without importing legacy frontend code.
          </p>
        </div>
      )}
    </Panel>
  );
}

"use client";

import { resolveRouteFromPath } from "@/features/navigation/workspace-routes";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Badge } from "../primitives/badge";
import { Button } from "../primitives/button";
import { CommandRail } from "./command-rail";

function TopBar() {
  const pathname = usePathname();
  const route = resolveRouteFromPath(pathname);
  const routeWaveLabel = route?.wave != null ? `Wave ${route.wave}` : "Legacy hold";
  const routeStatusTone =
    route?.status === "active"
      ? "success"
      : route?.status === "planned"
        ? "warning"
        : "neutral";

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] px-6 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">Precision Lab</Badge>
            <Badge tone="neutral">Desktop 1080p / 2K</Badge>
            <Badge tone={routeStatusTone}>{routeWaveLabel}</Badge>
          </div>
          <h1 className="break-words text-[22px] font-semibold leading-7 tracking-[-0.03em] text-[var(--pl-text-primary)]">
            {route?.title ?? "MFG8APS Next Workspace"}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button disabled size="sm" variant="ghost">
            Desktop baseline
          </Button>
        </div>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen grid-cols-[232px_minmax(0,1fr)]">
      <CommandRail />
      <div className="min-w-0">
        <TopBar />
        <main className="pl-scrollbar min-h-[calc(100vh-84px)] overflow-y-auto bg-[var(--pl-canvas)] px-6 py-5">
          <div className="mx-auto flex max-w-[1680px] flex-col gap-5">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

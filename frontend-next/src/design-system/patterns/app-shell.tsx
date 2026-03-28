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
    <header className="sticky top-0 z-20 border-b border-[var(--pl-border)] bg-[rgba(248,250,252,0.92)] px-8 py-4 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Badge tone="accent">Precision Lab</Badge>
            <Badge tone="neutral">Desktop 1080p / 2K</Badge>
            <Badge tone={routeStatusTone}>{routeWaveLabel}</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--pl-text-primary)]">
            {route?.title ?? "MFG8APS Next Workspace"}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Button disabled size="sm" variant="ghost">
            Legacy remains default
          </Button>
        </div>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen grid-cols-[96px_minmax(0,1fr)]">
      <CommandRail />
      <div className="min-w-0">
        <TopBar />
        <main className="pl-scrollbar min-h-[calc(100vh-112px)] overflow-auto bg-[linear-gradient(180deg,rgba(255,255,255,0.74),rgba(255,255,255,0.4))] px-8 py-8">
          <div className="mx-auto flex max-w-[1680px] flex-col gap-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

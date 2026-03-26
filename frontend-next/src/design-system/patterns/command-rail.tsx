"use client";

import { resolveRouteFromPath, workspaceNavSections } from "@/features/navigation/workspace-routes";
import { cn } from "@/lib/cn";
import Link from "next/link";
import { usePathname } from "next/navigation";

function AppMark() {
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[rgba(11,106,162,0.18)] bg-[var(--pl-accent-soft)] text-sm font-semibold tracking-[0.18em] text-[var(--pl-accent-strong)]">
      PL
    </div>
  );
}

export function CommandRail() {
  const pathname = usePathname();
  const activeRoute = resolveRouteFromPath(pathname);

  return (
    <aside className="pl-grid-bg sticky top-0 flex min-h-screen flex-col border-r border-[var(--pl-border)] bg-[rgba(244,247,251,0.9)] px-4 py-6 backdrop-blur-xl">
      <div className="flex items-center justify-center">
        <AppMark />
      </div>
      <div className="mt-8 flex flex-1 flex-col gap-7">
        {workspaceNavSections.map((section) => (
          <section key={section.key} className="space-y-3">
            <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pl-text-tertiary)]">
              {section.label}
            </div>
            <div className="flex flex-col gap-2">
              {section.routes.map((route) => {
                const active = activeRoute?.key === route.key;

                return (
                  <Link
                    key={route.key}
                    aria-label={route.label}
                    className={cn(
                      "group flex min-h-14 items-center gap-3 rounded-2xl border px-3 py-3 transition-colors duration-200",
                      active
                        ? "border-[rgba(11,106,162,0.24)] bg-[var(--pl-accent-soft)] text-[var(--pl-accent-strong)] shadow-[var(--pl-shadow-soft)]"
                        : "border-transparent bg-transparent text-[var(--pl-text-secondary)] hover:border-[var(--pl-border)] hover:bg-[var(--pl-surface)] hover:text-[var(--pl-text-primary)]",
                    )}
                    href={route.href}
                  >
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-current/15 bg-white/75 text-[11px] font-semibold uppercase tracking-[0.12em]">
                      {route.railCode}
                    </span>
                    <span className="min-w-0 text-sm font-medium leading-5">
                      {route.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}

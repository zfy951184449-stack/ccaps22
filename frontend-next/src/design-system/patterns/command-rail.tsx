"use client";

import { resolveRouteFromPath, workspaceNavSections } from "@/features/navigation/workspace-routes";
import { cn } from "@/lib/cn";
import Link from "next/link";
import { usePathname } from "next/navigation";

function AppMark() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-[var(--pl-radius-sm)] border border-[rgba(11,106,162,0.18)] bg-[var(--pl-accent-soft)] text-sm font-semibold tracking-[0.08em] text-[var(--pl-accent-strong)]">
      PL
    </div>
  );
}

export function CommandRail() {
  const pathname = usePathname();
  const activeRoute = resolveRouteFromPath(pathname);

  return (
    <aside className="sticky top-0 flex min-h-screen flex-col border-r border-[var(--pl-border)] bg-[var(--pl-surface)] px-3 py-4">
      <div className="flex items-center">
        <AppMark />
      </div>
      <div className="mt-6 flex flex-1 flex-col gap-5">
        {workspaceNavSections.map((section) => (
          <section key={section.key} className="space-y-2.5">
            <div className="px-2 text-[11px] font-medium leading-4 text-[var(--pl-text-tertiary)]">
              {section.label}
            </div>
            <div className="flex flex-col gap-1.5">
              {section.routes.map((route) => {
                const active = activeRoute?.key === route.key;

                return (
                  <Link
                    key={route.key}
                    aria-label={route.label}
                    className={cn(
                      "group flex min-h-11 items-center gap-2.5 rounded-[var(--pl-radius-sm)] border px-2.5 py-2.5 transition-colors duration-200",
                      active
                        ? "border-[rgba(11,106,162,0.24)] bg-[var(--pl-accent-soft)] text-[var(--pl-accent-strong)]"
                        : "border-transparent bg-transparent text-[var(--pl-text-secondary)] hover:border-[var(--pl-border)] hover:bg-[var(--pl-surface)] hover:text-[var(--pl-text-primary)]",
                    )}
                    href={route.href}
                  >
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--pl-radius-sm)] border border-current/15 bg-[var(--pl-surface-elevated)] text-[11px] font-semibold tracking-[0.08em]">
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

import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

/**
 * Master-Detail layout pattern used by workbenches that combine
 * a persistent sidebar (tree / filter panel) with a main content area.
 *
 * The sidebar has a fixed width and independent vertical scroll.
 * The main area fills the remaining space and scrolls independently.
 */
export function MasterDetailLayout({
  children,
  className,
  sidebar,
  sidebarWidth = 280,
}: {
  children: ReactNode;
  className?: string;
  sidebar: ReactNode;
  sidebarWidth?: number;
}) {
  return (
    <div className={cn("flex h-full min-h-0 gap-0", className)}>
      <aside
        className="shrink-0 border-r border-[var(--pl-border)] bg-[var(--pl-surface-elevated)]"
        style={{ width: sidebarWidth }}
      >
        <div className="pl-scrollbar flex h-full flex-col overflow-y-auto">
          {sidebar}
        </div>
      </aside>
      <main className="pl-scrollbar min-w-0 flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

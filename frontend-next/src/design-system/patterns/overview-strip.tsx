import { cn } from "@/lib/cn";
import type { PropsWithChildren } from "react";

export function OverviewStrip({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        "grid gap-4 xl:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

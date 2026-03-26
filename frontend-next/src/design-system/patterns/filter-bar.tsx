import { cn } from "@/lib/cn";
import type { HTMLAttributes } from "react";

export function FilterBar({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4",
        className,
      )}
      {...props}
    >
      <div className="grid gap-4 xl:grid-cols-4">{children}</div>
    </div>
  );
}

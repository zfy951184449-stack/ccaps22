import { cn } from "@/lib/cn";

export function Loader({
  className,
  label = "Loading",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      aria-label={label}
      className={cn("inline-flex items-center gap-3 text-sm", className)}
      role="status"
    >
      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[rgba(11,106,162,0.2)] border-t-[var(--pl-accent)]" />
      <span className="text-[var(--pl-text-secondary)]">{label}</span>
    </div>
  );
}

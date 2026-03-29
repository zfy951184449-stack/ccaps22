import { cn } from "@/lib/cn";

export type TabOption<T extends string> = {
  description?: string;
  label: string;
  value: T;
};

export function Tabs<T extends string>({
  className,
  onChange,
  options,
  value,
}: {
  className?: string;
  onChange: (value: T) => void;
  options: TabOption<T>[];
  value: T;
}) {
  return (
    <div
      aria-label="View tabs"
      className={cn(
        "inline-flex flex-wrap gap-1.5 rounded-[var(--pl-radius-sm)] border border-[var(--pl-border)] bg-[var(--pl-surface)] p-1.5",
        className,
      )}
      role="tablist"
    >
      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            aria-selected={active}
            className={cn(
              "max-w-full rounded-[var(--pl-radius-sm)] px-3 py-2 text-left transition-colors",
              active
                ? "bg-[var(--pl-surface-elevated)] text-[var(--pl-text-primary)]"
                : "text-[var(--pl-text-secondary)] hover:bg-[rgba(11,106,162,0.08)] hover:text-[var(--pl-text-primary)]",
            )}
            key={option.value}
            onClick={() => onChange(option.value)}
            role="tab"
            type="button"
          >
            <div className="text-sm font-semibold leading-5">{option.label}</div>
            {option.description ? (
              <div className="mt-0.5 text-[11px] leading-4 text-inherit/80">
                {option.description}
              </div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

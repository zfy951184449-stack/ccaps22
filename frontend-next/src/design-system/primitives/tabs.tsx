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
        "inline-flex flex-wrap gap-2 rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface)] p-2",
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
              "rounded-2xl px-4 py-3 text-left transition-colors",
              active
                ? "bg-[var(--pl-accent-soft)] text-[var(--pl-accent-strong)] shadow-[var(--pl-shadow-soft)]"
                : "text-[var(--pl-text-secondary)] hover:bg-[rgba(11,106,162,0.08)] hover:text-[var(--pl-text-primary)]",
            )}
            key={option.value}
            onClick={() => onChange(option.value)}
            role="tab"
            type="button"
          >
            <div className="text-sm font-semibold">{option.label}</div>
            {option.description ? (
              <div className="mt-1 text-xs leading-5 text-inherit/80">
                {option.description}
              </div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

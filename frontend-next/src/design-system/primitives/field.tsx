import { cn } from "@/lib/cn";
import type { InputHTMLAttributes, PropsWithChildren, SelectHTMLAttributes } from "react";

type FieldShellProps = {
  label: string;
  hint?: string;
};

function FieldShell({
  children,
  hint,
  label,
}: PropsWithChildren<FieldShellProps>) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--pl-text-tertiary)]">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="text-xs text-[var(--pl-text-tertiary)]">{hint}</span>
      ) : null}
    </label>
  );
}

const inputClassName =
  "h-11 w-full rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 text-sm text-[var(--pl-text-primary)] outline-none transition-colors duration-200 placeholder:text-[var(--pl-text-tertiary)] focus:border-[var(--pl-accent)]";

export type TextInputProps = InputHTMLAttributes<HTMLInputElement> & FieldShellProps;

export function TextInput({ hint, label, className, ...props }: TextInputProps) {
  return (
    <FieldShell hint={hint} label={label}>
      <input className={cn(inputClassName, className)} {...props} />
    </FieldShell>
  );
}

export type SelectInputProps = SelectHTMLAttributes<HTMLSelectElement> &
  FieldShellProps;

export function SelectInput({
  children,
  className,
  hint,
  label,
  ...props
}: PropsWithChildren<SelectInputProps>) {
  return (
    <FieldShell hint={hint} label={label}>
      <select className={cn(inputClassName, className)} {...props}>
        {children}
      </select>
    </FieldShell>
  );
}

import { cn } from "@/lib/cn";
import type { InputHTMLAttributes, PropsWithChildren, SelectHTMLAttributes } from "react";

type FieldShellProps = {
  error?: string;
  required?: boolean;
  label: string;
  hint?: string;
};

function FieldShell({
  children,
  error,
  hint,
  label,
  required,
}: PropsWithChildren<FieldShellProps>) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="text-[11px] font-medium leading-4 text-[var(--pl-text-tertiary)]">
        {label}
        {required ? (
          <span className="ml-1 text-[var(--pl-danger)]">*</span>
        ) : null}
      </span>
      {children}
      {error ? (
        <span className="text-xs text-[var(--pl-danger)]">{error}</span>
      ) : hint ? (
        <span className="text-xs text-[var(--pl-text-tertiary)]">{hint}</span>
      ) : null}
    </label>
  );
}

const inputClassName =
  "h-10 w-full rounded-[var(--pl-radius-sm)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3.5 text-sm leading-5 text-[var(--pl-text-primary)] outline-none transition-colors duration-200 placeholder:text-[var(--pl-text-tertiary)] focus:border-[var(--pl-accent)]";

export type TextInputProps = InputHTMLAttributes<HTMLInputElement> & FieldShellProps;

export function TextInput({
  error,
  hint,
  label,
  className,
  required,
  ...props
}: TextInputProps) {
  return (
    <FieldShell error={error} hint={hint} label={label} required={required}>
      <input
        className={cn(
          inputClassName,
          error && "border-[var(--pl-danger)] bg-[var(--pl-danger-soft)]",
          className,
        )}
        {...props}
      />
    </FieldShell>
  );
}

export type SelectInputProps = SelectHTMLAttributes<HTMLSelectElement> &
  FieldShellProps;

export function SelectInput({
  children,
  className,
  error,
  hint,
  label,
  required,
  ...props
}: PropsWithChildren<SelectInputProps>) {
  return (
    <FieldShell error={error} hint={hint} label={label} required={required}>
      <select
        className={cn(
          inputClassName,
          error && "border-[var(--pl-danger)] bg-[var(--pl-danger-soft)]",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
}

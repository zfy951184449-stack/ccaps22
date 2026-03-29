import { EmptyState } from "@/design-system/primitives/empty-state";
import { ErrorState } from "@/design-system/primitives/error-state";
import { Loader } from "@/design-system/primitives/loader";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export type DataTableColumn<T> = {
  key: string;
  header: string;
  align?: "left" | "center" | "right";
  className?: string;
  render: (row: T) => ReactNode;
};

export function DataTablePattern<T>({
  columns,
  emptyDescription,
  emptyTitle,
  errorAction,
  errorDescription,
  getRowKey,
  isError = false,
  isLoading = false,
  loadingLabel = "Loading table data",
  rows,
  title,
}: {
  columns: DataTableColumn<T>[];
  emptyDescription: string;
  emptyTitle: string;
  errorAction?: ReactNode;
  errorDescription: string;
  getRowKey: (row: T) => string;
  isError?: boolean;
  isLoading?: boolean;
  loadingLabel?: string;
  rows: T[];
  title: string;
}) {
  const colSpan = columns.length;

  return (
    <div className="overflow-hidden rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)]">
      <div className="border-b border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-3">
        <h3 className="text-xs font-semibold leading-4 text-[var(--pl-text-tertiary)]">
          {title}
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="border-b border-[var(--pl-border)] bg-[var(--pl-surface)]">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    "px-4 py-3 text-left text-[11px] font-semibold leading-4 text-[var(--pl-text-tertiary)]",
                    column.align === "center" && "text-center",
                    column.align === "right" && "text-right",
                  )}
                  scope="col"
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="px-4 py-10" colSpan={colSpan}>
                  <Loader label={loadingLabel} />
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td className="px-4 py-10" colSpan={colSpan}>
                  <ErrorState
                    action={errorAction}
                    description={errorDescription}
                    title="Unable to load data"
                  />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-4 py-10" colSpan={colSpan}>
                  <EmptyState
                    description={emptyDescription}
                    title={emptyTitle}
                  />
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={getRowKey(row)}
                  className="border-b border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] align-top transition-colors last:border-b-0 hover:bg-[var(--pl-surface)]"
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        "break-words px-4 py-3.5 text-sm leading-5 text-[var(--pl-text-secondary)]",
                        column.align === "center" && "text-center",
                        column.align === "right" && "text-right",
                        column.className,
                      )}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import { useState, type ReactNode } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// SortableTable — tabla de datos con orden por columna (click en el header cicla
// asc → desc → sin orden). Mantiene el estilo dark de uikit `Table/Th/Td`.
// Cada columna define `render` (contenido de celda) y, si es ordenable, un
// `sortAccessor` que devuelve el valor crudo por el que se ordena.
// ─────────────────────────────────────────────────────────────────────────────

export type SortDir = "asc" | "desc";

export type SortColumn<T> = {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** Valor crudo para ordenar. Si se omite, la columna no es ordenable. */
  sortAccessor?: (row: T) => string | number | null | undefined;
  align?: "left" | "right" | "center";
  /** Clase extra para las celdas de esta columna. */
  cellClassName?: string;
};

const alignCls = (a?: "left" | "right" | "center") =>
  a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

function compare(a: unknown, b: unknown): number {
  const an = a === null || a === undefined || a === "";
  const bn = b === null || b === undefined || b === "";
  if (an && bn) return 0;
  if (an) return 1;   // nulos al final
  if (bn) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "es", { numeric: true, sensitivity: "base" });
}

export function SortableTable<T>({
  columns, rows, getRowKey, initialSort, rowClassName, minWidth, emptyText = "Sin datos.",
}: {
  columns: SortColumn<T>[];
  rows: T[];
  getRowKey: (row: T, i: number) => string;
  initialSort?: { key: string; dir: SortDir };
  rowClassName?: (row: T) => string;
  minWidth?: number;
  emptyText?: string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(initialSort ?? null);

  const activeCol = sort ? columns.find((c) => c.key === sort.key) : undefined;
  const sorted = (() => {
    if (!sort || !activeCol?.sortAccessor) return rows;
    const acc = activeCol.sortAccessor;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows]
      .map((row, i) => ({ row, i }))
      .sort((x, y) => {
        const c = compare(acc(x.row), acc(y.row));
        return c !== 0 ? c * dir : x.i - y.i; // orden estable
      })
      .map((o) => o.row);
  })();

  // click header: asc → desc → sin orden
  const onHeader = (c: SortColumn<T>) => {
    if (!c.sortAccessor) return;
    setSort((prev) =>
      prev?.key !== c.key ? { key: c.key, dir: "asc" }
        : prev.dir === "asc" ? { key: c.key, dir: "desc" }
          : null,
    );
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
      <table className="eam-nums w-full border-collapse" style={minWidth ? { minWidth } : undefined}>
        <thead className="border-b border-[var(--border)] bg-[var(--muted)]/30">
          <tr>
            {columns.map((c) => {
              const sortable = !!c.sortAccessor;
              const isActive = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  className={cn(
                    "px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)] select-none",
                    alignCls(c.align),
                    sortable && "cursor-pointer hover:text-[var(--foreground)]",
                  )}
                  onClick={sortable ? () => onHeader(c) : undefined}
                  aria-sort={isActive ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                >
                  <span className={cn("inline-flex items-center gap-1", c.align === "right" && "flex-row-reverse")}>
                    {c.header}
                    {sortable && (
                      isActive
                        ? (sort!.dir === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)
                        : <ChevronsUpDown className="size-3 opacity-40" />
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {sorted.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-xs text-[var(--muted-foreground)]">{emptyText}</td></tr>
          ) : sorted.map((row, i) => (
            <tr key={getRowKey(row, i)} className={cn("hover:bg-[var(--muted)]/20", rowClassName?.(row))}>
              {columns.map((c) => (
                <td key={c.key} className={cn("px-3 py-2 text-xs text-[var(--foreground)]", alignCls(c.align), c.cellClassName)}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

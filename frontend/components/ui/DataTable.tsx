"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react";
import { useIsDesktop } from "@/lib/useMediaQuery";
import { formatRwf } from "@/lib/format";
import { listContainer, listItem, useReducedMotionSafe } from "@/lib/motion";
import { LoadingState } from "./LoadingState";

export interface DataColumn<T> {
  key: string;
  header: string;
  /** Cell content; defaults to row[key]. */
  render?: (row: T) => ReactNode;
  /** Makes the column sortable by this value. */
  sortValue?: (row: T) => string | number;
  align?: "left" | "right";
  /** Money column: formatted with formatRwf and right-aligned (unless `render` is given). */
  money?: boolean;
  /** The card title on phone, and the link target when rowHref is set. Defaults to the first column. */
  primary?: boolean;
  /**
   * Show on the phone card. When no column sets `mobile: true`, the first four non-primary
   * columns show; `mobile: false` always hides one.
   */
  mobile?: boolean;
}

export type SortDir = "asc" | "desc";

interface DataTableProps<T> {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Makes each row (desktop) / card (phone) a link. */
  rowHref?: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Shown instead of the table when there are no rows. */
  empty?: ReactNode;
  loading?: boolean;
  defaultSort?: { key: string; dir: SortDir };
  /** Accessible name for the table. */
  label?: string;
}

function rawValue<T>(row: T, key: string): unknown {
  return (row as Record<string, unknown>)[key];
}

function cellContent<T>(column: DataColumn<T>, row: T): ReactNode {
  if (column.render) return column.render(row);
  const value = rawValue(row, column.key);
  if (column.money) return formatRwf(value as string | number | null | undefined);
  return value === null || value === undefined ? "" : String(value);
}

function isRightAligned<T>(column: DataColumn<T>): boolean {
  return column.align === "right" || (column.align === undefined && column.money === true);
}

/**
 * The app's list view: a sortable table with a sticky header on desktop, and a list of
 * compact tappable cards on phone. Rows ease in on first load and fade out when removed.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  onRowClick,
  empty,
  loading = false,
  defaultSort,
  label,
}: DataTableProps<T>) {
  const isDesktop = useIsDesktop();
  const reduced = useReducedMotionSafe();
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(defaultSort ?? null);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    const value = column?.sortValue;
    if (!value) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const left = value(a);
      const right = value(b);
      if (typeof left === "number" && typeof right === "number") return (left - right) * factor;
      return String(left).localeCompare(String(right), undefined, { numeric: true }) * factor;
    });
  }, [rows, columns, sort]);

  if (loading) return <LoadingState variant={isDesktop ? "table" : "cards"} rows={isDesktop ? 6 : 4} />;
  if (rows.length === 0 && empty) return <>{empty}</>;

  const primaryKey = (columns.find((c) => c.primary) ?? columns[0])?.key;

  function toggleSort(key: string) {
    setSort((current) =>
      current?.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  }

  const motionProps = reduced
    ? { initial: false as const }
    : { variants: listContainer, initial: "hidden", animate: "show" };

  if (!isDesktop) {
    const explicit = columns.some((c) => c.mobile === true);
    const mobileColumns = columns
      .filter((c) => c.key !== primaryKey && c.mobile !== false && (!explicit || c.mobile === true))
      .slice(0, explicit ? undefined : 4);
    const primaryColumn = columns.find((c) => c.key === primaryKey);

    return (
      <motion.ul aria-label={label} className="m-0 flex list-none flex-col gap-2 p-0" {...motionProps}>
        <AnimatePresence initial={false}>
          {sortedRows.map((row) => {
            const href = rowHref?.(row);
            const body = (
              <>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {primaryColumn ? cellContent(primaryColumn, row) : null}
                  </span>
                  {(href || onRowClick) && <ChevronRight className="h-4 w-4 shrink-0 text-text/40" aria-hidden />}
                </div>
                {mobileColumns.length > 0 && (
                  <dl className="m-0 mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                    {mobileColumns.map((column) => (
                      <div key={column.key} className="min-w-0">
                        <dt className="text-xs text-text/50">{column.header}</dt>
                        <dd className="m-0 truncate">{cellContent(column, row)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </>
            );
            const cardClass =
              "block rounded-lg border border-divider bg-surface px-3.5 py-3 shadow-sm no-underline text-text";
            return (
              <motion.li key={rowKey(row)} layout={!reduced} variants={reduced ? undefined : listItem} exit={reduced ? undefined : "exit"}>
                {href ? (
                  <Link href={href} className={`${cardClass} active:bg-text/[0.04]`}>
                    {body}
                  </Link>
                ) : onRowClick ? (
                  <div
                    role="button"
                    tabIndex={0}
                    className={`${cardClass} cursor-pointer active:bg-text/[0.04]`}
                    onClick={() => onRowClick(row)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") onRowClick(row);
                    }}
                  >
                    {body}
                  </div>
                ) : (
                  <div className={cardClass}>{body}</div>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </motion.ul>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-divider bg-surface">
      <table aria-label={label} className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {columns.map((column) => {
              const active = sort?.key === column.key;
              const ariaSort = active ? (sort.dir === "asc" ? "ascending" : "descending") : column.sortValue ? "none" : undefined;
              const SortIcon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
              return (
                <th
                  key={column.key}
                  aria-sort={ariaSort}
                  className={[
                    "sticky top-0 z-[1] border-b border-divider bg-surface px-3 py-2 font-medium text-text/70",
                    isRightAligned(column) ? "text-right" : "text-left",
                  ].join(" ")}
                >
                  {column.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      className={[
                        "inline-flex items-center gap-1 hover:text-text",
                        isRightAligned(column) ? "flex-row-reverse" : "",
                      ].join(" ")}
                    >
                      {column.header}
                      <SortIcon className={`h-3.5 w-3.5 ${active ? "text-accent" : "text-text/30"}`} aria-hidden />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <motion.tbody {...motionProps}>
          <AnimatePresence initial={false}>
            {sortedRows.map((row) => {
              const href = rowHref?.(row);
              return (
                <motion.tr
                  key={rowKey(row)}
                  layout={!reduced}
                  variants={reduced ? undefined : listItem}
                  exit={reduced ? undefined : "exit"}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={[
                    "border-b border-divider last:border-b-0",
                    href || onRowClick ? "cursor-pointer hover:bg-accent/[0.04]" : "",
                  ].join(" ")}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={["px-3 py-2.5", isRightAligned(column) ? "text-right tabular-nums" : ""].join(" ")}
                    >
                      {href && column.key === primaryKey ? (
                        <Link href={href} className="font-medium text-text no-underline hover:text-accent">
                          {cellContent(column, row)}
                        </Link>
                      ) : (
                        cellContent(column, row)
                      )}
                    </td>
                  ))}
                </motion.tr>
              );
            })}
          </AnimatePresence>
        </motion.tbody>
      </table>
    </div>
  );
}

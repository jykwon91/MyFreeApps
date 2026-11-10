import type { ColumnDef } from "@platform/ui";
import { formatAppliedDate } from "@myjobhunter/api-client/utils/formatAppliedDate";
import type { Application } from "@myjobhunter/api-client/types/application";
import { compareAppliedAt } from "@/lib/compare-applied-at";

/**
 * The Applied column, sorted on the real date. Not-yet-applied reads as undefined
 * so `sortUndefined: "last"` keeps those rows last in both directions; TanStack
 * negates `sortFn` for descending, so nulls handled there would flip to the top.
 */
export const APPLIED_AT_COLUMN: ColumnDef<Application> = {
  id: "applied_at",
  header: "Applied",
  accessorFn: (row) => row.applied_at || undefined,
  sortUndefined: "last",
  sortFn: (rowA, rowB) => compareAppliedAt(rowA.original.applied_at, rowB.original.applied_at),
  cell: ({ row }) => formatAppliedDate(row.original.applied_at) ?? "—",
};

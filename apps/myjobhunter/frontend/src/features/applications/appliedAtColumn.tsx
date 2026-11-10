import type { ColumnDef } from "@platform/ui";
import { formatAppliedDate } from "@myjobhunter/api-client/utils/formatAppliedDate";
import type { Application } from "@myjobhunter/api-client/types/application";

/**
 * The Applied column. Sorted on the server on the real date (not the localized
 * text, which would put 10/2 before 9/30), with not-yet-applied last both ways;
 * newest first is the first click.
 */
export const APPLIED_AT_COLUMN: ColumnDef<Application> = {
  id: "applied_at",
  header: "Applied",
  accessorFn: (row) => row.applied_at || undefined,
  sortDescFirst: true,
  cell: ({ row }) => formatAppliedDate(row.original.applied_at) ?? "—",
};

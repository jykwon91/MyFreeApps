import type { ColumnDef } from "@platform/ui";
import type { Company } from "@myjobhunter/api-client/types/company";
import type { OptionalCompanyTextField } from "@/types/company/optional-company-text-field";

/**
 * A Companies table column for a field that may be missing. Missing (null or
 * blank) reads as undefined so `sortUndefined: "last"` keeps those rows last in
 * both directions; the cell shows "—".
 */
export function optionalCompanyTextColumn(field: OptionalCompanyTextField, header: string): ColumnDef<Company> {
  return {
    id: field,
    header,
    accessorFn: (row) => row[field] || undefined,
    sortUndefined: "last",
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground">{getValue<string | undefined>() ?? "—"}</span>
    ),
  };
}

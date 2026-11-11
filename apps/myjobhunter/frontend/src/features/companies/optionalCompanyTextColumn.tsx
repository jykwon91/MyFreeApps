import type { ColumnDef } from "@platform/ui";
import { companyFieldText } from "@myjobhunter/api-client/utils/companyFieldText";
import type { Company } from "@myjobhunter/api-client/types/company";
import type { OptionalCompanyTextField } from "@myjobhunter/api-client/types/company/optional-company-text-field";
import { companyTextSortFn } from "./companyTextSortFn";

/**
 * A Companies table column for a field that may be missing. Missing (null or
 * blank) reads as undefined so `sortUndefined: "last"` keeps those rows last in
 * both directions; the cell shows "—". The phone's list sorts with the same helpers.
 */
export function optionalCompanyTextColumn(field: OptionalCompanyTextField, header: string): ColumnDef<Company> {
  return {
    id: field,
    header,
    accessorFn: (row) => companyFieldText(row, field),
    sortUndefined: "last",
    sortFn: companyTextSortFn,
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground">{getValue<string | undefined>() ?? "—"}</span>
    ),
  };
}

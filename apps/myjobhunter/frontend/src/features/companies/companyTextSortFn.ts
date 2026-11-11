import type { ColumnDef } from "@platform/ui";
import { compareCompanyText } from "@myjobhunter/api-client/utils/compareCompanyText";
import type { Company } from "@myjobhunter/api-client/types/company";

type CompanyColumnSortFn = Exclude<NonNullable<ColumnDef<Company>["sortFn"]>, string>;

/** Sorts a Companies column A to Z the way the phone's list does. Missing values never reach it (`sortUndefined`). */
export const companyTextSortFn: CompanyColumnSortFn = (rowA, rowB, columnId) =>
  compareCompanyText(rowA.getValue<string>(columnId), rowB.getValue<string>(columnId));

import type { SortDirection } from "../sort/SortDirection";
import type { TransactionSortField } from "./TransactionSortField";

export interface TransactionListParams {
  property_id?: string;
  unassigned?: boolean;
  applicant_id?: string;
  status?: string;
  /** Pending, needs review or unverified: the rows someone still has to look at. */
  to_review?: boolean;
  transaction_type?: string;
  category?: string;
  vendor?: string;
  start_date?: string;
  end_date?: string;
  tax_year?: number;
  /** Only rows that count towards the tax report, or only rows that don't. */
  tax_relevant?: boolean;
  /** Only the categories the dashboard summary adds up as revenue, or as expenses. */
  summary_kind?: "revenue" | "expenses";
  /** Leave out rows of inactive properties, as the dashboard summary does. */
  active_properties_only?: boolean;
  /** The server orders newest first unless told otherwise. */
  sort_by?: TransactionSortField;
  sort_dir?: SortDirection;
  limit?: number;
}

import type { SortDirection } from "../sort/SortDirection";
import type { TransactionSortField } from "./TransactionSortField";
import type { TransactionSortKey } from "./TransactionSortKey";
import type { TransactionStatus } from "./TransactionStatus";
import type { TransactionType } from "./TransactionType";

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
  /**
   * Any-of filters (the website's column filters). Each narrows on top of the single-value filter
   * of the same column; property_ids takes UNASSIGNED_PROPERTY_ID for rows with no property.
   */
  statuses?: readonly TransactionStatus[];
  transaction_types?: readonly TransactionType[];
  categories?: readonly string[];
  property_ids?: readonly string[];
  /** The server orders newest first unless told otherwise. */
  sort_by?: TransactionSortField;
  sort_dir?: SortDirection;
  /** A multi-column order, most significant key first. When given it replaces sort_by/sort_dir. */
  sort?: readonly TransactionSortKey[];
  limit?: number;
}

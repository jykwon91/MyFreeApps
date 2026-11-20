import type { CustomerListItem } from "./customer";

/** One page of GET /customers (app/schemas/customer/customer_list_response.py). */
export interface CustomerListResponse {
  items: CustomerListItem[];
  /** How many customers match across every page. */
  total: number;
  has_more: boolean;
}

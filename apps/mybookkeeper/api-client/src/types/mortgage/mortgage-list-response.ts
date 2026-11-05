import type { Mortgage } from "./mortgage";

export interface MortgageListResponse {
  items: Mortgage[];
  total: number;
  has_more: boolean;
}

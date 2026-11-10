import type { Company } from "./company";

/**
 * Shape of `GET /companies`. Same `{items, total}` envelope as
 * `/applications` for symmetry / future pagination.
 */
export interface CompanyListResponse {
  items: Company[];
  total: number;
}

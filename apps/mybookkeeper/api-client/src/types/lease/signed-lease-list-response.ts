import type { SignedLeaseSummary } from "./signed-lease-summary";

export interface SignedLeaseListResponse {
  items: SignedLeaseSummary[];
  total: number;
  has_more: boolean;
}

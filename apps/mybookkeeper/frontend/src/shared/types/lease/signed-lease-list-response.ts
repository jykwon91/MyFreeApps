import type { SignedLeaseSummary } from "@/shared/types/lease/signed-lease-summary";

export interface SignedLeaseListResponse {
  items: SignedLeaseSummary[];
  total: number;
  has_more: boolean;
}

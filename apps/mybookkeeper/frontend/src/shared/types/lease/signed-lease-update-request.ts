import type { SignedLeaseStatus } from "@/shared/types/lease/signed-lease-status";

export interface SignedLeaseUpdateRequest {
  notes?: string | null;
  status?: SignedLeaseStatus;
  values?: Record<string, unknown>;
}

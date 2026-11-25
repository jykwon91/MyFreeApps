import type { SignedLeaseStatus } from "./signed-lease-status";

export interface SignedLeaseUpdateRequest {
  notes?: string | null;
  status?: SignedLeaseStatus;
  values?: Record<string, unknown>;
  /** Per-lease toggle for the auto-email-tenant-on-generate behavior. */
  auto_email_tenant?: boolean;
  /** Move the lease to another house, at any status. A listing for a different house is cleared. */
  property_id?: string;
}

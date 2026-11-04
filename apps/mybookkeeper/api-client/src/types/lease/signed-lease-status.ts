/**
 * Lease lifecycle states.
 *
 * Mirrors backend tuple ``SIGNED_LEASE_STATUSES`` in
 * ``app/core/lease_enums.py``.
 */
export type SignedLeaseStatus =
  | "draft"
  | "generated"
  | "sent"
  | "signed"
  | "active"
  | "ended"
  | "terminated";

export const SIGNED_LEASE_STATUSES: readonly SignedLeaseStatus[] = [
  "draft",
  "generated",
  "sent",
  "signed",
  "active",
  "ended",
  "terminated",
] as const;

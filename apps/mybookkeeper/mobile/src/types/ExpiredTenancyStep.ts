import type { SignedLeaseSummary } from "@mybookkeeper/api-client/types/lease/signed-lease-summary";

/** What brings back a tenant whose lease ran out, judged from their newest lease. */
export type ExpiredTenancyStep =
  /** Still signed or active, with an end date to push out. A new lease can follow it too. */
  | { kind: "extend"; lease: SignedLeaseSummary & { ends_on: string } }
  /** Over, so a new lease follows it. */
  | { kind: "follow"; leaseId: string }
  /** A new lease is already being made. */
  | { kind: "open"; leaseId: string }
  /** No lease to build on. */
  | { kind: "new" };

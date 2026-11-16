import type { SignedLeaseSummary } from "@mybookkeeper/api-client/types/lease/signed-lease-summary";
import type { ExpiredTenancyStep } from "../../types/ExpiredTenancyStep";
import { leaseCanHaveSuccessor, leaseIsInEffect } from "../leases/leaseDisplay";

const IN_PROGRESS: readonly SignedLeaseSummary["status"][] = ["draft", "generated", "sent"];

/**
 * `leases` newest first, as the server lists them. The newest has no successor: one would be newer
 * still. One in progress is finished rather than started again.
 */
export function expiredTenancyStep(leases: readonly SignedLeaseSummary[]): ExpiredTenancyStep {
  const newest = leases[0];
  if (!newest) return { kind: "new" };
  if (IN_PROGRESS.includes(newest.status)) return { kind: "open", leaseId: newest.id };
  if (leaseIsInEffect(newest.status) && newest.ends_on) return { kind: "extend", lease: { ...newest, ends_on: newest.ends_on } };
  if (leaseCanHaveSuccessor({ status: newest.status, successor_lease_id: null })) return { kind: "follow", leaseId: newest.id };
  return { kind: "new" };
}

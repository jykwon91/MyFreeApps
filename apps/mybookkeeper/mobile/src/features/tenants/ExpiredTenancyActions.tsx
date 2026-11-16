import type { SignedLeaseSummary } from "@mybookkeeper/api-client/types/lease/signed-lease-summary";
import { LoadingButton } from "@platform/mobile";
import { router } from "expo-router";
import { useState } from "react";
import { LEASE_MESSAGES } from "../../constants/leases";
import { NEW_LEASE_MESSAGES } from "../../constants/newLease";
import { TENANT_MESSAGES } from "../../constants/tenants";
import ExtendLeaseSheet from "../leases/ExtendLeaseSheet";
import { templatesPath } from "../newLease/newLeaseFlow";
import { expiredTenancyStep } from "./expiredTenancyStep";

interface ExpiredTenancyActionsProps {
  applicantId: string;
  tenantName: string | null;
  /** Newest first. */
  leases: readonly SignedLeaseSummary[];
}

/** The ways back for a tenant whose lease ran out: extend it, or a new lease that follows it. */
export default function ExpiredTenancyActions({ applicantId, tenantName, leases }: ExpiredTenancyActionsProps) {
  const [isExtending, setIsExtending] = useState(false);
  const step = expiredTenancyStep(leases);

  if (step.kind === "open") {
    return (
      <LoadingButton onPress={() => router.push(`/leases/${step.leaseId}`)} variant="secondary">
        {TENANT_MESSAGES.openLeaseInProgress}
      </LoadingButton>
    );
  }

  const parentLeaseId = step.kind === "extend" ? step.lease.id : step.kind === "follow" ? step.leaseId : undefined;
  return (
    <>
      {step.kind === "extend" ? (
        <LoadingButton onPress={() => setIsExtending(true)} variant="secondary">
          {LEASE_MESSAGES.extend}
        </LoadingButton>
      ) : null}
      <LoadingButton onPress={() => router.push(templatesPath({ applicantId, parentLeaseId }))} variant="secondary">
        {NEW_LEASE_MESSAGES.newLease}
      </LoadingButton>
      {isExtending && step.kind === "extend" ? (
        <ExtendLeaseSheet applicantId={applicantId} endsOn={step.lease.ends_on} leaseId={step.lease.id} onClose={() => setIsExtending(false)} tenantName={tenantName} />
      ) : null}
    </>
  );
}

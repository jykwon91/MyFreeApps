import { useLazyGetSignedLeaseByIdQuery } from "@mybookkeeper/api-client/store/signedLeasesApi";
import type { SignedLeaseAttachment } from "@mybookkeeper/api-client/types/lease/signed-lease-attachment";
import { LEASE_MESSAGES } from "../../constants/leases";
import { useOpenFreshAttachment } from "../documents/useOpenFreshAttachment";

export function useOpenLeaseFile(leaseId: string): {
  openingId: string | null;
  open: (file: SignedLeaseAttachment) => Promise<void>;
} {
  const [fetchLease] = useLazyGetSignedLeaseByIdQuery();
  return useOpenFreshAttachment<SignedLeaseAttachment>(
    async () => (await fetchLease(leaseId).unwrap()).attachments,
    LEASE_MESSAGES.couldntOpen,
  );
}

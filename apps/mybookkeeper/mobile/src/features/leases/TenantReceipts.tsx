import { useGetSignedLeasesQuery } from "@mybookkeeper/api-client/store/signedLeasesApi";
import { MOST_LEASES_ONE_PERSON_HAS } from "../../constants/leases";
import { TENANT_RECEIPT_MESSAGES } from "../../constants/tenantReceipts";
import InquirySection from "../inquiries/InquirySection";
import LeaseReceipts from "./LeaseReceipts";

/** Rent receipts from every lease they've had, so a renewal doesn't split the history. */
export default function TenantReceipts({ applicantId }: { applicantId: string }) {
  const { currentData } = useGetSignedLeasesQuery({ applicant_id: applicantId, limit: MOST_LEASES_ONE_PERSON_HAS });
  const leases = currentData?.items ?? [];

  if (leases.length === 0) return null;

  return (
    <InquirySection title={TENANT_RECEIPT_MESSAGES.section}>
      {leases.map((lease) => (
        <LeaseReceipts key={lease.id} leaseId={lease.id} />
      ))}
    </InquirySection>
  );
}

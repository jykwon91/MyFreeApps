import { useGetApplicantByIdQuery } from "@mybookkeeper/api-client/store/applicantsApi";
import { useEmailSignedLeaseToTenantMutation } from "@mybookkeeper/api-client/store/signedLeasesApi";
import { LoadingButton, useTheme, useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { Text } from "react-native";
import { emailingLease, emailLeaseLabel, emailLeaseTitle, LEASE_MESSAGES, noEmailForLease } from "../../constants/leases";
import { isMissingTenantEmail } from "./extendLeaseFailure";
import { askOnce } from "../../lib/askOnce";
import { emailLeaseFailure } from "./emailLeaseFailure";

interface EmailLeaseButtonProps {
  leaseId: string;
  applicantId: string;
  tenantName: string | null;
}

export default function EmailLeaseButton({ leaseId, applicantId, tenantName }: EmailLeaseButtonProps) {
  const { colors, fontSize } = useTheme();
  const { showToast } = useToast();
  const [emailLease] = useEmailSignedLeaseToTenantMutation();
  const { currentData: applicant, refetch: refetchApplicant } = useGetApplicantByIdQuery(applicantId);
  const [isBusy, setIsBusy] = useState(false);
  const asking = useRef(false);

  async function send(): Promise<void> {
    setIsBusy(true);
    try {
      await emailLease(leaseId).unwrap();
      showToast(emailingLease(tenantName));
    } catch (error) {
      if (isMissingTenantEmail(error)) void refetchApplicant();
      showToast(emailLeaseFailure(error, tenantName), "error");
    } finally {
      setIsBusy(false);
    }
  }

  if (applicant?.has_contact_email === false) {
    return <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{noEmailForLease(tenantName)}</Text>;
  }
  return (
    <LoadingButton
      accessibilityHint={LEASE_MESSAGES.emailLeaseHint}
      isLoading={isBusy}
      loadingText={LEASE_MESSAGES.emailing}
      onPress={() => askOnce(asking, emailLeaseTitle(tenantName), LEASE_MESSAGES.emailLeaseBody, { text: LEASE_MESSAGES.sendEmail, onPress: () => void send() })}
      variant="secondary"
    >
      {emailLeaseLabel(tenantName)}
    </LoadingButton>
  );
}

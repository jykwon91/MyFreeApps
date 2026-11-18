import { useGetSignedLeasesQuery } from "@mybookkeeper/api-client/store/signedLeasesApi";
import { LoadingButton, LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { Text } from "react-native";
import { LEASE_MESSAGES, MOST_LEASES_ONE_PERSON_HAS, noLeaseFor } from "../../constants/leases";
import InquirySection from "../inquiries/InquirySection";
import LeaseRow from "./LeaseRow";

interface TenantLeasesProps {
  applicantId: string;
  name: string;
  /** Someone still applying may have no lease, and that isn't worth a section. */
  isTenant: boolean;
}

export default function TenantLeases({ applicantId, name, isTenant }: TenantLeasesProps) {
  const { colors, fontSize } = useTheme();
  const { currentData, error, isLoading, refetch } = useGetSignedLeasesQuery({ applicant_id: applicantId, limit: MOST_LEASES_ONE_PERSON_HAS });
  const leases = currentData?.items ?? [];
  const mutedText = { fontSize: fontSize.sm, color: colors.mutedForeground };

  if (!isTenant && leases.length === 0 && !error) return null;

  return (
    <InquirySection title={LEASE_MESSAGES.section}>
      {isLoading ? (
        <LoadingRegion label={LEASE_MESSAGES.loadingTheirs}>
          <Skeleton height={64} width="100%" />
        </LoadingRegion>
      ) : null}
      {!isLoading && !currentData && error ? (
        <>
          <Text style={mutedText}>{LEASE_MESSAGES.couldntLoadTheirs}</Text>
          <LoadingButton onPress={() => void refetch()} variant="ghost">
            {LEASE_MESSAGES.tryAgain}
          </LoadingButton>
        </>
      ) : null}
      {currentData && leases.length === 0 ? <Text style={mutedText}>{noLeaseFor(name)}</Text> : null}
      {leases.map((lease) => (
        <LeaseRow
          endsOn={lease.ends_on}
          isInset
          key={lease.id}
          onPress={() => router.push(`/leases/${lease.id}`)}
          startsOn={lease.starts_on}
          status={lease.status}
        />
      ))}
    </InquirySection>
  );
}

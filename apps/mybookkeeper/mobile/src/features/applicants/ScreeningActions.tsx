import { useGetScreeningEligibilityQuery } from "@mybookkeeper/api-client/store/screeningApi";
import { Banner, LoadingButton, Skeleton, useTheme } from "@platform/mobile";
import { Text } from "react-native";
import { SCREENING_MESSAGES } from "../../constants/applicantScreening";
import CollapsibleSection from "../inquiries/CollapsibleSection";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import ScreeningProviders from "./ScreeningProviders";

export default function ScreeningActions({
  applicantId,
  hasPending,
  hasResults,
  onUpload,
}: {
  applicantId: string;
  hasPending: boolean;
  hasResults: boolean;
  onUpload: () => void;
}) {
  const { colors, fontSize } = useTheme();
  const { data: eligibility, error, isLoading, refetch } = useGetScreeningEligibilityQuery(applicantId, { skip: hasPending });
  const uploadButton = (
    <LoadingButton onPress={onUpload} variant="ghost">
      {hasResults ? SCREENING_MESSAGES.uploadAnother : SCREENING_MESSAGES.upload}
    </LoadingButton>
  );

  // A screening already started stays uploadable even if the applicant has
  // since lost the contact details needed to start a new one.
  if (hasPending || eligibility?.has_pending) {
    return (
      <>
        <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{SCREENING_MESSAGES.waitingOnReport}</Text>
        {uploadButton}
      </>
    );
  }
  if (isLoading) return <Skeleton height={48} />;
  if (error || !eligibility) {
    return (
      <Banner
        actions={[{ label: SCREENING_MESSAGES.tryAgain, onPress: () => void refetch() }]}
        message={httpStatus(error) === undefined ? SCREENING_MESSAGES.needsConnection : SCREENING_MESSAGES.couldntCheck}
      />
    );
  }
  if (!eligibility.eligible) {
    return (
      <>
        <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{SCREENING_MESSAGES.needsMoreDetails}</Text>
        {eligibility.missing_fields.map((field) => (
          <Text key={field} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{field}</Text>
        ))}
      </>
    );
  }
  return (
    <>
      {hasResults ? (
        <CollapsibleSection title={SCREENING_MESSAGES.runAnother}>
          <ScreeningProviders applicantId={applicantId} />
        </CollapsibleSection>
      ) : (
        <ScreeningProviders applicantId={applicantId} />
      )}
      {uploadButton}
    </>
  );
}

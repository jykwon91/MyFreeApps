import { useGetScreeningEligibilityQuery } from "@mybookkeeper/api-client/store/screeningApi";
import { Banner, LoadingButton, Skeleton, useTheme } from "@platform/mobile";
import { Text } from "react-native";
import { SCREENING_MESSAGES } from "../../constants/applicantScreening";
import CollapsibleSection from "../inquiries/CollapsibleSection";
import { httpStatus } from "../transactions/transactionMessages";
import ScreeningProviders from "./ScreeningProviders";

export default function ScreeningActions({
  applicantId,
  hasResults,
  onUpload,
}: {
  applicantId: string;
  hasResults: boolean;
  onUpload: () => void;
}) {
  const { colors, fontSize } = useTheme();
  const { data: eligibility, error, isLoading, refetch } = useGetScreeningEligibilityQuery(applicantId);

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
      {eligibility.has_pending ? (
        <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{SCREENING_MESSAGES.waitingOnReport}</Text>
      ) : hasResults ? (
        <CollapsibleSection title={SCREENING_MESSAGES.runAnother}>
          <ScreeningProviders applicantId={applicantId} />
        </CollapsibleSection>
      ) : (
        <ScreeningProviders applicantId={applicantId} />
      )}
      <LoadingButton onPress={onUpload} variant="ghost">
        {hasResults ? SCREENING_MESSAGES.uploadAnother : SCREENING_MESSAGES.upload}
      </LoadingButton>
    </>
  );
}

import { useGetApplicantByIdQuery } from "@mybookkeeper/api-client/store/applicantsApi";
import { Banner, EmptyState, LoadingButton, Skeleton, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import InquiryChip from "../inquiries/InquiryChip";
import InquirySection from "../inquiries/InquirySection";
import { useOpenLink } from "../inquiries/useOpenLink";
import TransactionFact from "../transactions/TransactionFact";
import { httpStatus } from "../transactions/transactionMessages";
import { applicantName, applicantStageLabel, contractDates, promotedAgo, smokerLabel } from "./applicantDisplay";
import ApplicantHistory from "./ApplicantHistory";

export default function ApplicantDetailScreen({ id }: { id: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const openLink = useOpenLink();
  const { currentData: applicant, error, isFetching, refetch } = useGetApplicantByIdQuery(id);
  const { refresh, refreshControl } = useRefresh(refetch, error);
  const isGone = httpStatus(error) === 404;

  if (!isGone && !applicant && (isFetching || !error)) {
    return (
      <View accessibilityLabel="Loading this applicant" style={{ gap: spacing.md, padding: spacing.lg }}>
        <Skeleton height={28} width="60%" />
        <Skeleton height={16} width="40%" />
        <Skeleton height={80} />
        <Skeleton height={160} />
      </View>
    );
  }
  if (isGone || !applicant) {
    return (
      <EmptyState
        action={isGone ? { label: "Back", onPress: () => router.back() } : { label: "Try again", onPress: refresh }}
        body={isGone ? "They may have been removed." : "Want me to try again?"}
        heading={isGone ? "I can't find that applicant." : "I couldn't load that applicant."}
      />
    );
  }

  const dates = contractDates(applicant.contract_start, applicant.contract_end);

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" refreshControl={refreshControl}>
      {error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
          {applicantName(applicant.legal_name)}
        </Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{`Promoted ${promotedAgo(applicant.created_at)}`}</Text>
        <InquiryChip label={applicantStageLabel(applicant.stage)} />
      </View>

      {applicant.inquiry_id ? (
        <LoadingButton onPress={() => router.push(`/inquiries/${applicant.inquiry_id}`)} variant="secondary">
          See the original inquiry
        </LoadingButton>
      ) : null}

      <InquirySection title="Details">
        {applicant.employer_or_hospital?.trim() ? <TransactionFact label="Employer" value={applicant.employer_or_hospital.trim()} /> : null}
        {dates ? <TransactionFact label="Contract" value={dates} /> : null}
        <TransactionFact label="Smoker" value={smokerLabel(applicant.smoker)} />
        {applicant.pets?.trim() ? <TransactionFact label="Pets" value={applicant.pets.trim()} /> : null}
        {applicant.referred_by?.trim() ? <TransactionFact label="Referred by" value={applicant.referred_by.trim()} /> : null}
      </InquirySection>

      <InquirySection title="Private details">
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          Date of birth, vehicle, contact details, ID and screening reports are on the website for now.
        </Text>
        <LoadingButton onPress={() => void openLink(`${WEB_BASE_URL}/applicants/${id}`)} variant="ghost">
          Open on the website
        </LoadingButton>
      </InquirySection>

      <ApplicantHistory applicant={applicant} />
    </ScrollView>
  );
}

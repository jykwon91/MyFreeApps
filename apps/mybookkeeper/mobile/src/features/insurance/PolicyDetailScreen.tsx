import { useGetInsurancePolicyByIdQuery, useLazyGetInsurancePolicyByIdQuery } from "@mybookkeeper/api-client/store/insurancePoliciesApi";
import type { InsurancePolicyAttachment } from "@mybookkeeper/api-client/types/insurance/insurance-policy-attachment";
import { Banner, EmptyState, LoadingButton, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { INSURANCE_MESSAGES } from "../../constants/insurance";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { useTodayIso } from "../../lib/useTodayIso";
import { useOpenFreshAttachment } from "../documents/useOpenFreshAttachment";
import InquiryChip from "../inquiries/InquiryChip";
import { useOpenLink } from "../inquiries/useOpenLink";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { expiryLabel, policyPlace } from "./policyDisplay";
import PolicyDetailSkeleton from "./PolicyDetailSkeleton";
import PolicyFacts from "./PolicyFacts";
import PolicyFileRow from "./PolicyFileRow";

export default function PolicyDetailScreen({ id }: { id: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const openLink = useOpenLink();
  const todayIso = useTodayIso();
  const { currentData: policy, error, isFetching, refetch } = useGetInsurancePolicyByIdQuery(id);
  const [fetchPolicy] = useLazyGetInsurancePolicyByIdQuery();
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);
  const { open, openingId } = useOpenFreshAttachment<InsurancePolicyAttachment>(
    async () => (await fetchPolicy(id).unwrap()).attachments,
    INSURANCE_MESSAGES.couldntOpen,
  );

  if (!policy && (isFetching || !error)) return <PolicyDetailSkeleton />;
  if (!policy) {
    const isGone = httpStatus(error) === 404;
    return (
      <EmptyState
        action={isGone ? { label: INSURANCE_MESSAGES.back, onPress: () => router.back() } : { label: INSURANCE_MESSAGES.tryAgain, onPress: refresh }}
        body={isGone ? INSURANCE_MESSAGES.maybeDeleted : INSURANCE_MESSAGES.tryAgainOffer}
        heading={isGone ? INSURANCE_MESSAGES.cantFind : INSURANCE_MESSAGES.couldntLoadOne}
      />
    );
  }

  const place = policyPlace(policy);
  const expiry = expiryLabel(policy.expiration_date, todayIso);
  const heading = { fontSize: fontSize.md, fontWeight: "600", color: colors.foreground } as const;

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" refreshControl={refreshControl}>
      {error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
          {policy.policy_name}
        </Text>
        {place ? <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{place}</Text> : null}
        {expiry ? (
          <View style={{ flexDirection: "row" }}>
            <InquiryChip label={expiry} />
          </View>
        ) : null}
      </View>
      <PolicyFacts policy={policy} />
      <View style={{ gap: spacing.md }}>
        <Text accessibilityRole="header" style={heading}>
          {INSURANCE_MESSAGES.documents}
        </Text>
        {policy.attachments.length === 0 ? (
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{INSURANCE_MESSAGES.noDocuments}</Text>
        ) : (
          policy.attachments.map((file) => (
            <PolicyFileRow
              file={file}
              isDisabled={openingId !== null}
              isOpening={openingId === file.id}
              key={file.id}
              onOpen={() => void open(file)}
            />
          ))
        )}
      </View>
      <View style={{ gap: spacing.sm }}>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{INSURANCE_MESSAGES.manageOnWebsite}</Text>
        <LoadingButton onPress={() => void openLink(`${WEB_BASE_URL}/insurance-policies/${policy.id}`)} variant="ghost">
          {INSURANCE_MESSAGES.openWebsite}
        </LoadingButton>
      </View>
    </ScrollView>
  );
}

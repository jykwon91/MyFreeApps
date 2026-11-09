import { useDeleteInsurancePolicyMutation, useGetInsurancePolicyByIdQuery } from "@mybookkeeper/api-client/store/insurancePoliciesApi";
import { Banner, EmptyState, LoadingButton, useRefresh, useTheme, useToast } from "@platform/mobile";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { INSURANCE_MESSAGES } from "../../constants/insurance";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { useTodayIso } from "../../lib/useTodayIso";
import InquiryChip from "../inquiries/InquiryChip";
import { useCanWrite } from "../workspace/useCanWrite";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { expiryLabel, policyPlace } from "./policyDisplay";
import PolicyDetailSkeleton from "./PolicyDetailSkeleton";
import PolicyFacts from "./PolicyFacts";
import PolicyAttachmentsSection from "./PolicyAttachmentsSection";
import { policyDeleteFailure } from "./policyFailure";

export default function PolicyDetailScreen({ id }: { id: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const canWrite = useCanWrite();
  const [deletePolicy] = useDeleteInsurancePolicyMutation();
  const [isDeleting, setIsDeleting] = useState(false);
  const todayIso = useTodayIso();
  const { currentData: policy, error, isFetching, refetch } = useGetInsurancePolicyByIdQuery(id);
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);

  async function remove(policyId: string): Promise<void> {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await deletePolicy(policyId).unwrap();
      showToast(INSURANCE_MESSAGES.deleted);
      router.back();
    } catch (failure) {
      showToast(policyDeleteFailure(failure), "error");
      setIsDeleting(false);
    }
  }

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
  const policyId = policy.id;
  function confirmDelete(): void {
    Alert.alert(INSURANCE_MESSAGES.deleteTitle, INSURANCE_MESSAGES.deleteBody, [
      { text: INSURANCE_MESSAGES.keep, style: "cancel" },
      { text: INSURANCE_MESSAGES.delete, style: "destructive", onPress: () => void remove(policyId) },
    ]);
  }

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
      <PolicyAttachmentsSection attachments={policy.attachments} policyId={policy.id} />
      {canWrite ? (
        <View style={{ gap: spacing.sm }}>
          <LoadingButton disabled={isDeleting} onPress={() => router.push(`/insurance/${policy.id}/edit`)} variant="secondary">
            {INSURANCE_MESSAGES.edit}
          </LoadingButton>
          <LoadingButton isLoading={isDeleting} loadingText={INSURANCE_MESSAGES.deleting} onPress={confirmDelete} variant="ghost">
            {INSURANCE_MESSAGES.delete}
          </LoadingButton>
        </View>
      ) : null}
    </ScrollView>
  );
}

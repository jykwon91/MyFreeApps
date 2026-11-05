import { useGetUtilityPlanByIdQuery } from "@mybookkeeper/api-client/store/utilityPlansApi";
import { Banner, EmptyState, LoadingButton, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { UTILITY_PLAN_MESSAGES } from "../../constants/utilityPlans";
import { useTodayIso } from "../../lib/useTodayIso";
import InquiryChip from "../inquiries/InquiryChip";
import { useOpenLink } from "../inquiries/useOpenLink";
import HiddenNumber from "../shell/HiddenNumber";
import TransactionFact from "../transactions/TransactionFact";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { planChip, planFacts, planPriceLine, planProvider, planTermNote, planTitle } from "./utilityPlanDisplay";
import UtilityPlanDetailSkeleton from "./UtilityPlanDetailSkeleton";

export default function UtilityPlanDetailScreen({ id }: { id: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const openLink = useOpenLink();
  const todayIso = useTodayIso();
  const { currentData: plan, error, isFetching, refetch } = useGetUtilityPlanByIdQuery(id);
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);

  if (!plan && (isFetching || !error)) return <UtilityPlanDetailSkeleton />;
  if (!plan) {
    const isGone = httpStatus(error) === 404;
    return (
      <EmptyState
        action={isGone ? { label: UTILITY_PLAN_MESSAGES.back, onPress: () => router.back() } : { label: UTILITY_PLAN_MESSAGES.tryAgain, onPress: refresh }}
        body={isGone ? UTILITY_PLAN_MESSAGES.maybeDeleted : UTILITY_PLAN_MESSAGES.tryAgainOffer}
        heading={isGone ? UTILITY_PLAN_MESSAGES.cantFind : UTILITY_PLAN_MESSAGES.couldntLoadOne}
      />
    );
  }

  const chip = planChip(plan, todayIso);
  const termNote = planTermNote(plan);
  const accountNumber = plan.account_number?.trim();

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" refreshControl={refreshControl}>
      {error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
          {planTitle(plan)}
        </Text>
        <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{planProvider(plan)}</Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{planPriceLine(plan)}</Text>
        {chip ? <InquiryChip label={chip} /> : null}
        {termNote ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{termNote}</Text> : null}
      </View>
      <View style={{ gap: spacing.md }}>
        {planFacts(plan).map((fact) => (
          <TransactionFact key={fact.label} label={fact.label} value={fact.value} />
        ))}
        {accountNumber ? <HiddenNumber label={UTILITY_PLAN_MESSAGES.accountNumber} value={accountNumber} /> : null}
        {plan.notes ? <TransactionFact label={UTILITY_PLAN_MESSAGES.notes} value={plan.notes} /> : null}
      </View>
      <View style={{ gap: spacing.sm }}>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{UTILITY_PLAN_MESSAGES.manageOnWebsite}</Text>
        <LoadingButton onPress={() => void openLink(`${WEB_BASE_URL}/utility-plans`)} variant="ghost">
          {UTILITY_PLAN_MESSAGES.openWebsite}
        </LoadingButton>
      </View>
    </ScrollView>
  );
}

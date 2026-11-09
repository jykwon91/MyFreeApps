import { useGetMortgageByIdQuery } from "@mybookkeeper/api-client/store/mortgagesApi";
import { Banner, EmptyState, LoadingButton, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { MORTGAGE_MESSAGES } from "../../constants/mortgages";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { useTodayIso } from "../../lib/useTodayIso";
import InquiryChip from "../inquiries/InquiryChip";
import { useCanWrite } from "../workspace/useCanWrite";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import MortgageDetailSkeleton from "./MortgageDetailSkeleton";
import { mortgageTitle, rateFixedLine } from "./mortgageDisplay";
import MortgageFacts from "./MortgageFacts";
import RemoveMortgageButton from "./RemoveMortgageButton";

export default function MortgageDetailScreen({ id }: { id: string }) {
  const { colors, spacing, fontSize } = useTheme();
  const canWrite = useCanWrite();
  const [isRemoved, setIsRemoved] = useState(false);
  const todayIso = useTodayIso();
  const { currentData: mortgage, error, isFetching, refetch } = useGetMortgageByIdQuery(id);
  const { refresh, refreshControl } = useRefresh(async () => {
    await refetch();
  }, error);

  if (isRemoved || (!mortgage && (isFetching || !error))) return <MortgageDetailSkeleton />;
  if (!mortgage) {
    const isGone = httpStatus(error) === 404;
    return (
      <EmptyState
        action={isGone ? { label: MORTGAGE_MESSAGES.back, onPress: () => router.back() } : { label: MORTGAGE_MESSAGES.tryAgain, onPress: refresh }}
        body={isGone ? MORTGAGE_MESSAGES.maybeDeleted : MORTGAGE_MESSAGES.tryAgainOffer}
        heading={isGone ? MORTGAGE_MESSAGES.cantFind : MORTGAGE_MESSAGES.couldntLoadOne}
      />
    );
  }

  const fixedLine = rateFixedLine(mortgage, todayIso);

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" refreshControl={refreshControl}>
      {error ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
          {mortgageTitle(mortgage)}
        </Text>
        {mortgage.lender ? <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{mortgage.lender}</Text> : null}
        {mortgage.rate_type === "arm" ? (
          <View style={{ flexDirection: "row" }}>
            <InquiryChip label={MORTGAGE_MESSAGES.adjustable} />
          </View>
        ) : null}
        {fixedLine ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{fixedLine}</Text> : null}
      </View>
      <MortgageFacts mortgage={mortgage} />
      <View style={{ gap: spacing.sm }}>
        <LoadingButton onPress={() => router.push("/mortgages/rates")} variant="secondary">
          {MORTGAGE_MESSAGES.checkRates}
        </LoadingButton>
        {canWrite ? (
          <>
            <LoadingButton onPress={() => router.push(`/mortgages/${id}/edit`)} variant="secondary">
              {MORTGAGE_MESSAGES.edit}
            </LoadingButton>
            <RemoveMortgageButton mortgageId={id} onRemoved={() => setIsRemoved(true)} title={mortgageTitle(mortgage)} />
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

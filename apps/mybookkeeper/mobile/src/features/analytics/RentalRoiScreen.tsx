import { RENTAL_ROI_DEFAULT_TARGET_PCT } from "@mybookkeeper/api-client/constants/rentalRoi";
import { useGetRentalRoiQuery } from "@mybookkeeper/api-client/store/analyticsApi";
import { rentalRoiHeadline } from "@mybookkeeper/api-client/utils/rentalRoi";
import { formatMoneyCents } from "@mybookkeeper/api-client/utils/mortgageFormat";
import { EmptyState, StaleDataBanner, useAnnouncement, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { RENTAL_ROI_MESSAGES as MESSAGES } from "../../constants/rentalRoi";
import RentalRoiPropertyCard from "./RentalRoiPropertyCard";
import RentalRoiSkeleton from "./RentalRoiSkeleton";
import RentalRoiTargetInput from "./RentalRoiTargetInput";
import RentalRoiTotalCard from "./RentalRoiTotalCard";

export default function RentalRoiScreen() {
  const { colors, fontSize, spacing } = useTheme();
  const [targetReturnPct, setTargetReturnPct] = useState(RENTAL_ROI_DEFAULT_TARGET_PCT);

  // Keep the last result while a new target loads so the UI shows "Updating..."
  // rather than the skeleton.
  const { currentData: data, error, isFetching, refetch } = useGetRentalRoiQuery({ targetReturnPct });
  const { refresh, refreshControl } = useRefresh(async () => { await refetch(); }, error);
  // The headline follows the target typed below, so a new one is read out once it arrives.
  const shownHeadline = data && data.properties.length > 0 && data.has_transactions ? rentalRoiHeadline(data.summary) : null;
  useAnnouncement(shownHeadline ? [shownHeadline.title, shownHeadline.coverage].filter(Boolean).join(", ") : undefined, "polite");

  if (error && !data) {
    return (
      <EmptyState
        action={{ label: MESSAGES.tryAgain, onPress: refresh }}
        body={MESSAGES.checkConnection}
        heading={MESSAGES.couldntLoad}
      />
    );
  }

  if (!data) return <RentalRoiSkeleton />;

  if (data.properties.length === 0) {
    return (
      <EmptyState
        action={{ label: MESSAGES.nonePropertiesAction, onPress: () => router.push("/properties") }}
        body=""
        heading={MESSAGES.nonePropertiesHeading}
      />
    );
  }

  if (!data.has_transactions) {
    return (
      <EmptyState
        action={{ label: MESSAGES.noneTransactionsAction, onPress: () => router.push("/transactions") }}
        body=""
        heading={MESSAGES.noneTransactionsHeading}
      />
    );
  }

  const headline = rentalRoiHeadline(data.summary);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
      testID="rental-roi-scroll"
    >
      <View style={{ gap: spacing.lg, padding: spacing.lg }}>
        <StaleDataBanner isShown={Boolean(error)} />

        <View
          accessible
          testID="rental-roi-headline"
        >
          <Text
            style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}
            testID="rental-roi-headline-title"
          >
            {headline.title}
          </Text>
          {headline.coverage ? (
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{headline.coverage}</Text>
          ) : null}

          {/* Actual avg + gap summary below headline */}
          <View style={{ flexDirection: "row", gap: spacing.xl, marginTop: spacing.sm }}>
            <View>
              <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>Actual avg</Text>
              <Text
                style={{ fontSize: fontSize.sm, fontWeight: "500", fontVariant: ["tabular-nums"], color: colors.foreground }}
                testID="rental-roi-headline-actual"
              >
                {formatMoneyCents(data.summary.total_actual_revenue_monthly_cents)}/mo
              </Text>
            </View>
            <View>
              <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{MESSAGES.gap}</Text>
              <Text
                style={{
                  fontSize: fontSize.sm,
                  fontWeight: "500",
                  fontVariant: ["tabular-nums"],
                  color: data.summary.total_gap_monthly_cents >= 0 ? colors.positiveText : colors.destructiveText,
                }}
                testID="rental-roi-headline-gap"
              >
                {data.summary.total_gap_monthly_cents >= 0
                  ? `+${formatMoneyCents(data.summary.total_gap_monthly_cents)}`
                  : `-${formatMoneyCents(Math.abs(data.summary.total_gap_monthly_cents))}`}
              </Text>
            </View>
          </View>
        </View>

        {/* Target input */}
        <RentalRoiTargetInput
          isUpdating={isFetching}
          onChange={setTargetReturnPct}
          value={targetReturnPct}
        />

        {/* Total card */}
        <RentalRoiTotalCard summary={data.summary} />

        {/* Per-property cards */}
        {data.properties.map((property) => (
          <RentalRoiPropertyCard key={property.property_id} property={property} />
        ))}

        {/* Unassigned revenue note */}
        {data.unassigned_revenue_monthly_cents > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }} testID="rental-roi-unassigned">
              {MESSAGES.unassigned(formatMoneyCents(data.unassigned_revenue_monthly_cents))}
            </Text>
            <Pressable
              accessibilityLabel={MESSAGES.assignTransactions}
              accessibilityRole="link"
              hitSlop={4}
              onPress={() => router.push("/transactions")}
              style={{ minHeight: 44, justifyContent: "center" }}
            >
              <Text style={{ fontSize: fontSize.sm, color: colors.primary, fontWeight: "500" }}>
                {MESSAGES.assignTransactions}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

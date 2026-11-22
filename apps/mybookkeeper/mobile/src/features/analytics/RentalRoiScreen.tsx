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
  const [hasChangedTarget, setHasChangedTarget] = useState(false);

  // `data` keeps the last result while a new target loads, so the screen shows "Updating..."
  // beside the target rather than the skeleton. `currentData` is only the result for this target.
  const { data, currentData, error, isFetching, refetch } = useGetRentalRoiQuery({ targetReturnPct });
  const { refresh, refreshControl } = useRefresh(async () => { await refetch(); }, error);
  const headline = data && data.properties.length > 0 && data.has_transactions ? rentalRoiHeadline(data.summary) : null;
  // The headline is simply there when the screen opens; it follows the target typed below, so once
  // the target changes, each new one is read out as it arrives.
  useAnnouncement(hasChangedTarget && currentData && headline ? [headline.title, headline.coverage].filter(Boolean).join(", ") : undefined, "polite");

  // Empty states do not depend on the target, so the input is not offered there.
  if (data && data.properties.length === 0) {
    return (
      <EmptyState
        action={{ label: MESSAGES.nonePropertiesAction, onPress: () => router.push("/properties") }}
        body=""
        heading={MESSAGES.nonePropertiesHeading}
      />
    );
  }

  if (data && !data.has_transactions) {
    return (
      <EmptyState
        action={{ label: MESSAGES.noneTransactionsAction, onPress: () => router.push("/transactions") }}
        body=""
        heading={MESSAGES.noneTransactionsHeading}
      />
    );
  }

  // A failure for the target on screen (first load, or a new target). A failed refresh of figures
  // already shown keeps them and says so via the stale banner instead.
  const loadFailed = Boolean(error) && !currentData;
  const figures = loadFailed ? null : data;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
      testID="rental-roi-scroll"
    >
      <View style={{ gap: spacing.lg, padding: spacing.lg }}>
        <StaleDataBanner isShown={Boolean(error) && !loadFailed} />

        <RentalRoiTargetInput
          isUpdating={isFetching && !loadFailed}
          onChange={(pct) => {
            setHasChangedTarget(true);
            setTargetReturnPct(pct);
          }}
          value={targetReturnPct}
        />

        {loadFailed ? (
          <EmptyState
            action={{ label: MESSAGES.tryAgain, onPress: refresh }}
            body={MESSAGES.checkConnection}
            heading={MESSAGES.couldntLoad}
          />
        ) : null}

        {!loadFailed && !figures ? <RentalRoiSkeleton /> : null}

        {figures && headline ? (
          <>
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

              <View style={{ flexDirection: "row", gap: spacing.xl, marginTop: spacing.sm }}>
                <View>
                  <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>Actual avg</Text>
                  <Text
                    style={{ fontSize: fontSize.sm, fontWeight: "500", fontVariant: ["tabular-nums"], color: colors.foreground }}
                    testID="rental-roi-headline-actual"
                  >
                    {formatMoneyCents(figures.summary.total_actual_revenue_monthly_cents)}/mo
                  </Text>
                </View>
                <View>
                  <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{MESSAGES.gap}</Text>
                  <Text
                    style={{
                      fontSize: fontSize.sm,
                      fontWeight: "500",
                      fontVariant: ["tabular-nums"],
                      color: figures.summary.total_gap_monthly_cents >= 0 ? colors.positiveText : colors.destructiveText,
                    }}
                    testID="rental-roi-headline-gap"
                  >
                    {figures.summary.total_gap_monthly_cents >= 0
                      ? `+${formatMoneyCents(figures.summary.total_gap_monthly_cents)}`
                      : `-${formatMoneyCents(Math.abs(figures.summary.total_gap_monthly_cents))}`}
                  </Text>
                </View>
              </View>
            </View>

            {/* Total card */}
            <RentalRoiTotalCard summary={figures.summary} />

            {/* Per-property cards */}
            {figures.properties.map((property) => (
              <RentalRoiPropertyCard key={property.property_id} property={property} />
            ))}

            {/* Unassigned revenue note */}
            {figures.unassigned_revenue_monthly_cents > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
                <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }} testID="rental-roi-unassigned">
                  {MESSAGES.unassigned(formatMoneyCents(figures.unassigned_revenue_monthly_cents))}
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
          </>
        ) : null}
      </View>
    </ScrollView>
  );
}

import type { UtilityOfferSearchResponse } from "@mybookkeeper/api-client/types/utility/utility-offer-search-response";
import { sortedByBiggestSaving } from "@mybookkeeper/api-client/utils/offerStats";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { UTILITY_OFFER_MESSAGES as MESSAGES } from "../../constants/utilityOffers";
import BetterPlansGroup from "./BetterPlansGroup";

/** Every property, the one with the most money on the table first, and the usage the savings assume. */
export default function BetterPlansResults({ data }: { data: UtilityOfferSearchResponse }) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.xl }} testID="better-plans-results">
      {sortedByBiggestSaving(data.groups).map((group) => (
        <BetterPlansGroup group={group} key={group.property_id} referenceAnnualKwh={data.reference_annual_kwh} />
      ))}
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.basis(data.reference_annual_kwh.toLocaleString("en-US"))}</Text>
    </View>
  );
}

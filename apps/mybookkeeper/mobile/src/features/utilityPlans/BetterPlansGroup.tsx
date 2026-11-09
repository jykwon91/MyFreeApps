import type { UtilityOfferGroup } from "@mybookkeeper/api-client/types/utility/utility-offer-group";
import { bestSavingCents } from "@mybookkeeper/api-client/utils/offerStats";
import { buildOfferTiers } from "@mybookkeeper/api-client/utils/offerTiers";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { UTILITY_OFFER_MESSAGES as MESSAGES } from "../../constants/utilityOffers";
import EquippedPlanCard from "./EquippedPlanCard";
import OfferTierCard from "./OfferTierCard";
import TimeOfUseOffers from "./TimeOfUseOffers";

interface BetterPlansGroupProps {
  group: UtilityOfferGroup;
  referenceAnnualKwh: number;
}

/** One property's comparison: what it holds now, then what it could hold instead. */
export default function BetterPlansGroup({ group, referenceAnnualKwh }: BetterPlansGroupProps) {
  const { colors, spacing, fontSize } = useTheme();
  const tiers = buildOfferTiers(group.offers);
  const maxSaving = bestSavingCents(group);
  return (
    <View style={{ gap: spacing.md }} testID={`better-plans-group-${group.property_id}`}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>
        {group.property_name ?? MESSAGES.unknownProperty}
      </Text>
      <EquippedPlanCard group={group} referenceAnnualKwh={referenceAnnualKwh} />
      {group.unavailable_reason ? <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{group.unavailable_reason}</Text> : null}
      {tiers.map((tier, index) => (
        <OfferTierCard group={group} isBest={index === 0} key={tier.key} maxSavingCents={maxSaving} referenceAnnualKwh={referenceAnnualKwh} tier={tier} />
      ))}
      {/* Named rather than silent: a shorter list with no explanation reads as the whole market. */}
      {group.withheld_low_rated_count > 0 ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.withheld(group.withheld_low_rated_count)}</Text> : null}
      <TimeOfUseOffers offers={group.time_of_use_offers} withheldLowRatedCount={group.withheld_low_rated_time_of_use_count} />
    </View>
  );
}

import type { UtilityOffer } from "@mybookkeeper/api-client/types/utility/utility-offer";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { UTILITY_OFFER_MESSAGES as MESSAGES } from "../../constants/utilityOffers";
import TimeOfUseOfferRow from "./TimeOfUseOfferRow";

interface TimeOfUseOffersProps {
  offers: UtilityOffer[];
  withheldLowRatedCount: number;
}

/** Plans priced by time of day, listed without a ranking: the comparison that would justify one needs when the household draws power. */
export default function TimeOfUseOffers({ offers, withheldLowRatedCount }: TimeOfUseOffersProps) {
  const { colors, spacing, fontSize } = useTheme();
  if (offers.length === 0 && withheldLowRatedCount === 0) return null;
  return (
    <View style={{ gap: spacing.sm, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {MESSAGES.touHeading}
      </Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.touIntro}</Text>
      {offers.map((offer) => (
        <TimeOfUseOfferRow key={offer.external_plan_id} offer={offer} />
      ))}
      {withheldLowRatedCount > 0 ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.touWithheld(withheldLowRatedCount)}</Text> : null}
    </View>
  );
}

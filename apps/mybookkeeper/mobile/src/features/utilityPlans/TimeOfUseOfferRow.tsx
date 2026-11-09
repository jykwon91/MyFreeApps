import type { UtilityOffer } from "@mybookkeeper/api-client/types/utility/utility-offer";
import { formatCancellationFeeShort, formatOfferRate, formatProviderRating, formatTerm } from "@mybookkeeper/api-client/utils/utilityOfferFormat";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { UTILITY_OFFER_MESSAGES as MESSAGES } from "../../constants/utilityOffers";
import OfferEnrollButton from "./OfferEnrollButton";
import OfferPriceDetail from "./OfferPriceDetail";

/** One time-of-use plan, as terms to read rather than a saving to take: no headline figure, no verdict, never the primary button. */
export default function TimeOfUseOfferRow({ offer }: { offer: UtilityOffer }) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View style={{ gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: 12 }} testID={`time-of-use-plan-${offer.external_plan_id}`}>
      <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {offer.provider_name} · {offer.plan_name}
      </Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{formatProviderRating(offer.provider_rating)}</Text>
      <Text style={{ fontSize: fontSize.md, color: offer.special_terms ? colors.foreground : colors.mutedForeground }}>{offer.special_terms ?? MESSAGES.touNoTerms}</Text>
      {/* "Average" is load-bearing: this is the blended disclosure price, not a rate comparable to a flat plan's. */}
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
        {MESSAGES.touLine(formatTerm(offer.term_months), formatOfferRate(offer.price_cents_per_kwh_at_1000), formatCancellationFeeShort(offer.cancellation_fee_cents, offer.cancellation_fee_is_per_remaining_month))}
      </Text>
      {offer.enroll_url ? <OfferEnrollButton isPrimary={false} providerName={offer.provider_name} url={offer.enroll_url} /> : null}
      <OfferPriceDetail offer={offer} />
    </View>
  );
}

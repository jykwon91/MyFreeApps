import type { UtilityOffer } from "@mybookkeeper/api-client/types/utility/utility-offer";
import { formatOfferRate } from "@mybookkeeper/api-client/utils/utilityOfferFormat";
import { LoadingButton, useOpenLink, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { UTILITY_OFFER_MESSAGES as MESSAGES } from "../../constants/utilityOffers";
import CollapsibleSection from "../inquiries/CollapsibleSection";

/** The fine print, folded away: the three disclosure prices a bill-credit plan is built to game, and the label that binds them. */
export default function OfferPriceDetail({ offer }: { offer: UtilityOffer }) {
  const { colors, spacing, fontSize } = useTheme();
  const openLink = useOpenLink();
  return (
    <CollapsibleSection title={MESSAGES.priceDetail}>
      <View style={{ gap: spacing.sm }}>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {MESSAGES.priceAt(formatOfferRate(offer.price_cents_per_kwh_at_500), formatOfferRate(offer.price_cents_per_kwh_at_1000), formatOfferRate(offer.price_cents_per_kwh_at_2000))}
        </Text>
        {offer.fact_sheet_url ? (
          <LoadingButton onPress={() => void openLink(offer.fact_sheet_url ?? "")} variant="ghost">
            {MESSAGES.factsLabel}
          </LoadingButton>
        ) : null}
      </View>
    </CollapsibleSection>
  );
}

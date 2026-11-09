import type { UtilityOffer } from "@mybookkeeper/api-client/types/utility/utility-offer";
import { formatCancellationFee } from "@mybookkeeper/api-client/utils/utilityOfferFormat";
import { LoadingButton, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { UTILITY_OFFER_MESSAGES as MESSAGES } from "../../constants/utilityOffers";
import { useOpenLink } from "../inquiries/useOpenLink";
import CollapsibleSection from "../inquiries/CollapsibleSection";

/** The other providers selling this same rate and term. Only the cost to leave differs, so that is what each carries. */
export default function TierProviderPicker({ alternates }: { alternates: UtilityOffer[] }) {
  const { colors, spacing, fontSize } = useTheme();
  const openLink = useOpenLink();
  if (alternates.length === 0) return null;
  return (
    <CollapsibleSection title={MESSAGES.others(alternates.length)}>
      <View style={{ gap: spacing.md }}>
        {alternates.map((offer) => (
          <View key={offer.external_plan_id} style={{ gap: spacing.xs }}>
            <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>
              {offer.provider_name} · {offer.plan_name}
            </Text>
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
              {formatCancellationFee(offer.cancellation_fee_cents, offer.cancellation_fee_is_per_remaining_month)}
            </Text>
            {offer.enroll_url ? (
              <LoadingButton accessibilityLabel={MESSAGES.alternateSignUp(offer.provider_name)} onPress={() => void openLink(offer.enroll_url ?? "")} variant="secondary">
                {MESSAGES.signUp(offer.provider_name)}
              </LoadingButton>
            ) : null}
          </View>
        ))}
      </View>
    </CollapsibleSection>
  );
}

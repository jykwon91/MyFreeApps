import { OFFER_VERDICT_LABELS } from "@mybookkeeper/api-client/constants/offerVerdictLabels";
import type { OfferTier } from "@mybookkeeper/api-client/types/utility/offer-tier";
import type { UtilityOfferGroup } from "@mybookkeeper/api-client/types/utility/utility-offer-group";
import { buildOfferStats, offerVerdict } from "@mybookkeeper/api-client/utils/offerStats";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { UTILITY_OFFER_MESSAGES as MESSAGES } from "../../constants/utilityOffers";
import InquiryChip from "../inquiries/InquiryChip";
import OfferEnrollButton from "./OfferEnrollButton";
import OfferPriceDetail from "./OfferPriceDetail";
import OfferSavingHeadline from "./OfferSavingHeadline";
import OfferStatList from "./OfferStatList";
import TierProviderPicker from "./TierProviderPicker";

interface OfferTierCardProps {
  tier: OfferTier;
  group: UtilityOfferGroup;
  referenceAnnualKwh: number;
  maxSavingCents: number;
  isBest: boolean;
}

/** One candidate plan, stated as what changes if the property switches to it. */
export default function OfferTierCard({ tier, group, referenceAnnualKwh, maxSavingCents, isBest }: OfferTierCardProps) {
  const { colors, spacing, fontSize } = useTheme();
  const offer = tier.lead;
  const verdict = offerVerdict(offer);
  return (
    <View
      style={{
        gap: spacing.sm,
        padding: spacing.md,
        borderWidth: isBest ? 2 : 1,
        borderColor: isBest ? colors.primary : colors.border,
        borderRadius: 12,
      }}
      testID={`better-plan-${offer.external_plan_id}`}
    >
      {isBest ? <Text style={{ fontSize: fontSize.xs, fontWeight: "700", color: colors.primary }}>{MESSAGES.bestValue.toUpperCase()}</Text> : null}
      <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {offer.provider_name} · {offer.plan_name}
      </Text>
      <InquiryChip label={OFFER_VERDICT_LABELS[verdict]} />
      <OfferSavingHeadline isConditional={verdict === "conditional"} maxSavingCents={maxSavingCents} savingCents={offer.annual_saving_cents} />
      <OfferStatList stats={buildOfferStats(offer, group, referenceAnnualKwh)} />
      {offer.is_teaser_priced ? <Text style={{ fontSize: fontSize.sm, color: colors.destructiveText }}>{MESSAGES.teaser}</Text> : null}
      {offer.enroll_url ? <OfferEnrollButton isPrimary={isBest} providerName={offer.provider_name} url={offer.enroll_url} /> : null}
      <OfferPriceDetail offer={offer} />
      <TierProviderPicker alternates={tier.alternates} />
    </View>
  );
}

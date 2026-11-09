import type { UtilityOfferGroup } from "@mybookkeeper/api-client/types/utility/utility-offer-group";
import { annualCostCents } from "@mybookkeeper/api-client/utils/offerStats";
import { formatOfferRate, formatWholeDollars } from "@mybookkeeper/api-client/utils/utilityOfferFormat";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { UTILITY_OFFER_MESSAGES as MESSAGES } from "../../constants/utilityOffers";
import TransactionFact from "../transactions/TransactionFact";

/** What the property is on today: the plan every figure below is measured against, and the cost of leaving it. */
export default function EquippedPlanCard({ group, referenceAnnualKwh }: { group: UtilityOfferGroup; referenceAnnualKwh: number }) {
  const { colors, spacing, fontSize } = useTheme();
  const rate = group.current_price_cents_per_kwh_at_1000;
  const yearly = rate === null ? null : annualCostCents(rate, referenceAnnualKwh);
  return (
    <View style={{ gap: spacing.xs, padding: spacing.md, borderRadius: 12, backgroundColor: colors.muted }} testID={`equipped-plan-${group.property_id}`}>
      <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{MESSAGES.currentlyOn.toUpperCase()}</Text>
      <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{group.current_provider_name ?? MESSAGES.unknownProvider}</Text>
      <TransactionFact label={MESSAGES.rate} value={rate === null ? "—" : `${formatOfferRate(rate)}/kWh`} />
      <TransactionFact label={MESSAGES.yearlyCost} value={yearly === null ? "—" : formatWholeDollars(yearly)} />
      <TransactionFact label={MESSAGES.costToLeave} value={group.switch_cost_cents === null ? MESSAGES.notRecorded : formatWholeDollars(group.switch_cost_cents)} />
      {group.switch_cost_cents === null ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.noExitFee}</Text> : null}
    </View>
  );
}

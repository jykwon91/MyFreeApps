import { savingBarPercent } from "@mybookkeeper/api-client/utils/offerStats";
import { formatWholeDollars } from "@mybookkeeper/api-client/utils/utilityOfferFormat";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { UTILITY_OFFER_MESSAGES as MESSAGES } from "../../constants/utilityOffers";

interface OfferSavingHeadlineProps {
  savingCents: number | null;
  /** The largest saving at this property: the bar's full width. */
  maxSavingCents: number;
  /** True when the figure only holds inside a narrow band of usage. */
  isConditional: boolean;
}

/** The number the card exists to deliver, with a bar so similar dollar figures rank by eye. */
export default function OfferSavingHeadline({ savingCents, maxSavingCents, isConditional }: OfferSavingHeadlineProps) {
  const { colors, spacing, fontSize } = useTheme();
  if (savingCents === null || savingCents <= 0) return null;
  // A bill-credit plan posts the biggest number only near 1,000 kWh, so the figure carries the qualification itself.
  const tone = isConditional ? colors.destructiveText : colors.primary;
  const caption = isConditional ? MESSAGES.lessPerYearConditional : MESSAGES.lessPerYear;
  return (
    <View accessible accessibilityLabel={`${formatWholeDollars(savingCents)} ${caption}`} style={{ gap: spacing.xs }}>
      <Text style={{ fontSize: fontSize.xl, fontWeight: "600", color: tone }}>
        {formatWholeDollars(savingCents)} <Text style={{ fontSize: fontSize.sm, fontWeight: "400", color: colors.mutedForeground }}>{caption}</Text>
      </Text>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.muted, overflow: "hidden" }}>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: tone, width: `${savingBarPercent(savingCents, maxSavingCents)}%` }} />
      </View>
    </View>
  );
}

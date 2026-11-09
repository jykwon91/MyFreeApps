import type { InsuranceRateFiling } from "@mybookkeeper/api-client/types/insurance/insurance-rate-filing";
import { filingChangeColor, formatChangePct, formatFilingConsequence, formatFilingDate } from "@mybookkeeper/api-client/utils/rateFilingFormat";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { RATE_WATCH_MESSAGES } from "../../constants/insuranceRateWatch";
import RateChip from "./RateChip";

/** One filing on a policy card, written as a sentence that says what it costs. */
export default function RateFilingDetail({ filing }: { filing: InsuranceRateFiling }) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View accessible style={{ gap: spacing.xs, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <RateChip label={formatChangePct(filing.percent_change)} tone={filingChangeColor(filing.percent_change)} />
      <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{formatFilingConsequence(filing)}</Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
        {`${filing.product_name ?? RATE_WATCH_MESSAGES.unnamedProgram} · ${RATE_WATCH_MESSAGES.renewalsFrom} ${formatFilingDate(filing.effective_date_renewal)}`}
      </Text>
    </View>
  );
}

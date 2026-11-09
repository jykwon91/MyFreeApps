import type { InsuranceRateFiling } from "@mybookkeeper/api-client/types/insurance/insurance-rate-filing";
import { formatFilingDate } from "@mybookkeeper/api-client/utils/rateFilingFormat";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { RATE_WATCH_MESSAGES } from "../../constants/insuranceRateWatch";
import RateFilingChips from "./RateFilingChips";

/** One carrier in the market list. Never truncated: this list exists to be read out to an agent. */
export default function RateFilingRow({ filing }: { filing: InsuranceRateFiling }) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <View accessible style={{ gap: spacing.xs, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{filing.company_name}</Text>
      <RateFilingChips filing={filing} />
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
        {`${filing.product_name ?? RATE_WATCH_MESSAGES.unnamedProgram} · ${RATE_WATCH_MESSAGES.renewalsFrom} ${formatFilingDate(filing.effective_date_renewal)}`}
      </Text>
    </View>
  );
}

import type { InsuranceRateFiling } from "@mybookkeeper/api-client/types/insurance/insurance-rate-filing";
import { filingChangeColor, filingStatusColor, formatChangePct, formatFilingStatus } from "@mybookkeeper/api-client/utils/rateFilingFormat";
import { useTheme } from "@platform/mobile";
import { View } from "react-native";
import RateChip from "./RateChip";

/** The change and where the filing stands, side by side. */
export default function RateFilingChips({ filing }: { filing: InsuranceRateFiling }) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
      <RateChip label={formatChangePct(filing.percent_change)} tone={filingChangeColor(filing.percent_change)} />
      <RateChip label={formatFilingStatus(filing)} tone={filingStatusColor(filing)} />
    </View>
  );
}

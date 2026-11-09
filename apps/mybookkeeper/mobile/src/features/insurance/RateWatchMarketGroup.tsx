import { MARKET_GROUP_PREVIEW } from "@mybookkeeper/api-client/constants/rateWatch";
import type { InsuranceRateFiling } from "@mybookkeeper/api-client/types/insurance/insurance-rate-filing";
import { LoadingButton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import { showMoreLabel } from "../../constants/insuranceRateWatch";
import RateFilingRow from "./RateFilingRow";

interface RateWatchMarketGroupProps {
  title: string;
  blurb: string;
  filings: InsuranceRateFiling[];
}

/** A short list to read out on a call, with the tail one tap away rather than a wall of carriers. */
export default function RateWatchMarketGroup({ title, blurb, filings }: RateWatchMarketGroupProps) {
  const { colors, spacing, fontSize } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  if (filings.length === 0) return null;
  const shown = isExpanded ? filings : filings.slice(0, MARKET_GROUP_PREVIEW);
  const hidden = filings.length - MARKET_GROUP_PREVIEW;
  return (
    <View style={{ gap: spacing.xs }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{title}</Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{blurb}</Text>
      {shown.map((filing) => (
        <RateFilingRow filing={filing} key={filing.serff_id} />
      ))}
      {hidden > 0 && !isExpanded ? (
        <LoadingButton onPress={() => setIsExpanded(true)} variant="ghost">
          {showMoreLabel(hidden)}
        </LoadingButton>
      ) : null}
    </View>
  );
}

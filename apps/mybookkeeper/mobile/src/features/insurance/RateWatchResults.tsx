import type { InsuranceMarketWatch } from "@mybookkeeper/api-client/types/insurance/insurance-market-watch";
import { joinWithAnd } from "@mybookkeeper/api-client/utils/formatList";
import { formatFilingDate } from "@mybookkeeper/api-client/utils/rateFilingFormat";
import { buildRateWatchAction } from "@mybookkeeper/api-client/utils/rateWatchAction";
import { formatScopeSummary } from "@mybookkeeper/api-client/utils/rateWatchScope";
import { buildRateWatchVerdict } from "@mybookkeeper/api-client/utils/rateWatchVerdict";
import { Banner, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { RATE_WATCH_MESSAGES } from "../../constants/insuranceRateWatch";
import RateWatchMarketGroup from "./RateWatchMarketGroup";
import RateWatchOutlookCard from "./RateWatchOutlookCard";

/** In reading order: the verdict, what to do about it, every policy it came from, the market, the caveat. */
export default function RateWatchResults({ data }: { data: InsuranceMarketWatch }) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const verdict = buildRateWatchVerdict(data);
  const action = buildRateWatchAction(data);
  const deadline = action?.renewalDate ? ` before ${formatFilingDate(action.renewalDate)}` : "";
  return (
    <View style={{ gap: spacing.lg }} testID="rate-watch-results">
      {data.feed_unavailable_reason ? <Banner message={data.feed_unavailable_reason} /> : null}
      {verdict ? (
        <View accessible style={{ gap: spacing.xs, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md }}>
          <Text style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>{verdict.headline}</Text>
          {verdict.detail ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{verdict.detail}</Text> : null}
        </View>
      ) : null}
      {action ? (
        <View accessible style={{ gap: spacing.xs, padding: spacing.md, backgroundColor: colors.muted, borderRadius: radius.md }}>
          <Text accessibilityRole="header" style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{RATE_WATCH_MESSAGES.whatToDo}</Text>
          <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>
            {action.carrierNames.length > 0
              ? `${RATE_WATCH_MESSAGES.askAgentNamed} ${joinWithAnd(action.carrierNames)}${deadline}. ${RATE_WATCH_MESSAGES.askAgentNamedTail}`
              : `${RATE_WATCH_MESSAGES.askAgentUnnamed}${deadline}. ${RATE_WATCH_MESSAGES.askAgentUnnamedTail}`}
          </Text>
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{RATE_WATCH_MESSAGES.cantBuyOnline}</Text>
        </View>
      ) : null}
      {data.outlooks.length > 0 ? (
        <View style={{ gap: spacing.md }}>
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{formatScopeSummary(data.outlooks)}</Text>
          {data.outlooks.map((outlook) => (
            <RateWatchOutlookCard key={outlook.policy_id} outlook={outlook} />
          ))}
        </View>
      ) : null}
      <RateWatchMarketGroup blurb={RATE_WATCH_MESSAGES.holdingFlatBlurb} filings={data.market_flat} title={RATE_WATCH_MESSAGES.holdingFlat} />
      <RateWatchMarketGroup blurb={RATE_WATCH_MESSAGES.raisingBlurb} filings={data.market_rising} title={RATE_WATCH_MESSAGES.raising} />
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{RATE_WATCH_MESSAGES.caveat}</Text>
    </View>
  );
}

import type { MortgageRateWatch } from "@mybookkeeper/api-client/types/mortgage/mortgage-rate-watch";
import { mortgageScopeSummary, mortgageSurveyLine } from "@mybookkeeper/api-client/utils/mortgageRateWatchSummary";
import { buildMortgageRateWatchVerdict } from "@mybookkeeper/api-client/utils/mortgageRateWatchVerdict";
import { Banner, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import RateOutlookCard from "./RateOutlookCard";

interface RateWatchResultsProps {
  data: MortgageRateWatch;
  onRecheck: () => void;
}

/** Verdict first, then what was compared, then every loan it came from, then the benchmark. */
export default function RateWatchResults({ data, onRecheck }: RateWatchResultsProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const verdict = buildMortgageRateWatchVerdict(data);
  const surveyLine = mortgageSurveyLine(data);
  return (
    <View style={{ gap: spacing.lg }}>
      {data.feed_unavailable_reason ? <Banner message={data.feed_unavailable_reason} /> : null}
      {verdict ? (
        <View
          accessibilityRole="summary"
          style={{
            gap: spacing.xs,
            padding: spacing.md,
            borderWidth: 2,
            borderColor: verdict.tone === "alert" ? colors.primary : colors.border,
            borderRadius: radius.md,
          }}
        >
          <Text style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>{verdict.headline}</Text>
          {verdict.detail ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{verdict.detail}</Text> : null}
        </View>
      ) : null}
      {data.outlooks.length > 0 ? (
        <>
          <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
            {mortgageScopeSummary(data.outlooks.length, data.checked_mortgage_count)}
          </Text>
          {data.outlooks.map((outlook) => (
            <RateOutlookCard key={outlook.mortgage_id} onRecheck={onRecheck} outlook={outlook} />
          ))}
        </>
      ) : null}
      {surveyLine ? <Text style={{ fontSize: fontSize.xs, color: colors.mutedForeground }}>{surveyLine}</Text> : null}
    </View>
  );
}
